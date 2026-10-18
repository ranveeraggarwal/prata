"""Remove duplicate downloads and extract text from every unique file.

Usage: python3 -I scripts/import/extract_text.py <data_dir> [--workers N]

Reads <data_dir>/tree.jsonl and <data_dir>/raw/, writes:
  <data_dir>/unique.jsonl       one row per distinct file (by SHA-256) with every path it appears at
  <data_dir>/text/<sha>.txt     extracted text (pages separated by form feeds for PDFs)
  <data_dir>/text/<sha>.json    how it was extracted, plus mean OCR confidence where OCR was used

Docs are converted from their HTML, PDFs with pdftotext (falling back to OCR for scanned pages),
and images (PNG, JPEG, HEIC) with Tesseract's Swedish model. Re-running skips finished files.
"""

import argparse
import hashlib
import html
import json
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ProcessPoolExecutor, as_completed
from html.parser import HTMLParser

IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".heic"}
# A PDF page with less text than this is treated as a scan and OCR'd.
MIN_PAGE_CHARS = 40


class DocText(HTMLParser):
    BLOCK = {"p", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "div", "table"}

    def __init__(self):
        super().__init__()
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "head"):
            self.skip += 1
        elif tag in self.BLOCK:
            self.parts.append("\n")
        elif tag == "td":
            self.parts.append("\t")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "head"):
            self.skip -= 1
        elif tag in ("p", "li", "h1", "h2", "h3", "h4", "h5", "h6"):
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def doc_text(path):
    parser = DocText()
    parser.feed(open(path, encoding="utf-8", errors="replace").read())
    text = html.unescape("".join(parser.parts)).replace("\xa0", " ")
    text = re.sub(r"[ \t]+\n", "\n", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


# Tesseract's own threads fight each other when several OCR jobs run in parallel
# (a one-second page takes minutes), so each job gets a single thread.
OCR_ENV = {**os.environ, "OMP_THREAD_LIMIT": "1"}


def run(cmd, **kw):
    return subprocess.run(cmd, capture_output=True, check=True, env=OCR_ENV, **kw)


def is_image(path):
    """Some files in the kit have an image name but hold an HTML page."""
    head = open(path, "rb").read(16)
    return (
        head.startswith(b"\x89PNG")
        or head.startswith(b"\xff\xd8")
        or head[4:12] in (b"ftypheic", b"ftypmif1", b"ftypheix", b"ftyphevc")
    )


def ocr_image(path, workdir):
    """Returns (text, mean word confidence 0-100)."""
    src = path
    if path.lower().endswith(".heic"):
        src = os.path.join(workdir, "heic.jpg")
        run(["heif-convert", "-q", "92", path, src])
    # Screenshots in the kit are small; upscaling and greyscale help Tesseract a lot.
    prepped = os.path.join(workdir, "prepped.png")
    run(["convert", src + "[0]", "-auto-orient", "-colorspace", "Gray", "-resize", "200%<", "-resize", "4000x4000>", prepped])
    base = os.path.join(workdir, "ocr")
    run(["tesseract", prepped, base, "-l", "swe", "--psm", "3", "txt", "tsv"])
    text = open(base + ".txt", encoding="utf-8").read()
    confs = []
    for line in open(base + ".tsv", encoding="utf-8").read().splitlines()[1:]:
        cols = line.split("\t")
        if len(cols) == 12 and cols[11].strip():
            try:
                conf = float(cols[10])
            except ValueError:
                continue
            if conf >= 0:
                confs.append(conf)
    return text.strip(), (sum(confs) / len(confs) if confs else 0.0)


def pdf_pages(path):
    out = run(["pdfinfo", path]).stdout.decode(errors="replace")
    m = re.search(r"^Pages:\s+(\d+)", out, re.M)
    return int(m.group(1)) if m else 0


def pdf_text(path, workdir):
    pages = pdf_pages(path)
    texts, methods, confs = [], [], []
    for page in range(1, pages + 1):
        txt = run(["pdftotext", "-f", str(page), "-l", str(page), path, "-"]).stdout.decode("utf-8", errors="replace")
        if len(txt.strip()) >= MIN_PAGE_CHARS:
            texts.append(txt.strip())
            methods.append("text")
            continue
        img_base = os.path.join(workdir, f"p{page}")
        run(["pdftoppm", "-r", "220", "-gray", "-png", "-f", str(page), "-l", str(page), "-singlefile", path, img_base])
        txt, conf = ocr_image(img_base + ".png", workdir)
        texts.append(txt)
        methods.append("ocr")
        confs.append(conf)
        os.remove(img_base + ".png")
    layout = run(["pdftotext", "-layout", path, "-"]).stdout.decode("utf-8", errors="replace")
    return "\f".join(texts), {
        "pages": pages,
        "ocr_pages": methods.count("ocr"),
        "confidence": round(sum(confs) / len(confs), 1) if confs else None,
        "layout": layout,
    }


def extract(item, data_dir):
    sha, file = item["sha"], item["file"]
    out_txt = os.path.join(data_dir, "text", sha + ".txt")
    out_meta = os.path.join(data_dir, "text", sha + ".json")
    if os.path.exists(out_meta):
        return sha, "skipped"
    path = os.path.join(data_dir, file)
    ext = os.path.splitext(file)[1].lower()
    meta = {"sha": sha, "ext": ext}
    with tempfile.TemporaryDirectory() as workdir:
        if ext == ".html":
            text = doc_text(path)
            meta["method"] = "doc"
        elif ext == ".pdf":
            text, info = pdf_text(path, workdir)
            layout = info.pop("layout")
            if layout.strip():
                with open(os.path.join(data_dir, "text", sha + ".layout.txt"), "w", encoding="utf-8") as f:
                    f.write(layout)
            meta.update(info)
            meta["method"] = "ocr" if info["ocr_pages"] == info["pages"] else "pdf"
        elif ext in IMAGE_EXTS and is_image(path):
            text, conf = ocr_image(path, workdir)
            meta.update(method="ocr", confidence=round(conf, 1))
        elif ext in IMAGE_EXTS:
            text = ""
            meta.update(method="none", note="not an image (the file in the kit holds a web page)")
        else:
            text = ""
            meta["method"] = "none"
    with open(out_txt, "w", encoding="utf-8") as f:
        f.write(text)
    with open(out_meta, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False)
    return sha, meta["method"]


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("data_dir")
    ap.add_argument("--workers", type=int, default=os.cpu_count() or 2)
    args = ap.parse_args()
    data_dir = args.data_dir
    os.makedirs(os.path.join(data_dir, "text"), exist_ok=True)

    rows = [json.loads(l) for l in open(os.path.join(data_dir, "tree.jsonl"), encoding="utf-8")]
    unique = {}
    for row in rows:
        if row["kind"] == "folder" or not row.get("file"):
            continue
        sha = sha256(os.path.join(data_dir, row["file"]))
        item = unique.setdefault(sha, {"sha": sha, "file": row["file"], "kind": row["kind"], "paths": [], "ids": []})
        item["paths"].append(row["path"])
        item["ids"].append(row["id"])
    for item in unique.values():
        item["paths"].sort(key=lambda p: (p.count("/"), p))
    with open(os.path.join(data_dir, "unique.jsonl"), "w", encoding="utf-8") as out:
        for item in unique.values():
            out.write(json.dumps(item, ensure_ascii=False) + "\n")
    files = sum(len(i["paths"]) for i in unique.values())
    print(f"{files} files, {len(unique)} unique", flush=True)

    # Big scans last so the quick files finish first.
    order = sorted(unique.values(), key=lambda i: os.path.getsize(os.path.join(data_dir, i["file"])))
    done = 0
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(extract, item, data_dir): item for item in order}
        for fut in as_completed(futures):
            item = futures[fut]
            done += 1
            try:
                fut.result()
            except subprocess.CalledProcessError as err:
                print("FAILED", item["paths"][0], err.stderr.decode(errors="replace")[:300], file=sys.stderr, flush=True)
            if done % 50 == 0:
                print(f"{done}/{len(order)}", flush=True)
    print("done", flush=True)


if __name__ == "__main__":
    main()
