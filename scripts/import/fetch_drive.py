"""Download every file in a public Google Drive folder tree.

Usage: python3 -I scripts/import/fetch_drive.py <folder_id> <data_dir>

Writes <data_dir>/tree.jsonl (one row per file or folder) and the files to
<data_dir>/raw/<id><ext>. Google Docs are saved as their /mobilebasic HTML
(the plain-text export redirects to a host the sandbox blocks). Files that
already exist are skipped, so the script can be re-run after a failure.
"""

import html
import json
import os
import re
import subprocess
import sys

ENTRY_RE = re.compile(
    r'<div class="flip-entry" id="entry-([^"]+)".*?<a href="([^"]+)".*?'
    r'<div class="flip-entry-title">(.*?)</div>.*?'
    r'<div class="flip-entry-last-modified"><div>(.*?)</div>',
    re.S,
)


def curl(url, dest=None, timeout=180):
    cmd = ["curl", "-sS", "-L", "--fail", "--max-time", str(timeout)]
    if dest:
        cmd += ["-o", dest]
    cmd.append(url)
    result = subprocess.run(cmd, capture_output=True)
    if result.returncode != 0:
        raise RuntimeError(f"{url}: {result.stderr.decode(errors='replace').strip()}")
    return result.stdout


def kind_of(href, name):
    if "/folders/" in href:
        return "folder"
    if "docs.google.com/document" in href:
        return "doc"
    if "docs.google.com/presentation" in href:
        return "slides"
    return "file"


def walk(folder_id, path, rows, seen):
    if folder_id in seen:
        return
    seen.add(folder_id)
    page = curl(f"https://drive.google.com/embeddedfolderview?id={folder_id}").decode("utf-8")
    for m in ENTRY_RE.finditer(page):
        entry_id, href, name, modified = m.group(1), m.group(2), html.unescape(m.group(3)), m.group(4)
        row = {
            "id": entry_id,
            "path": f"{path}/{name}",
            "name": name,
            "kind": kind_of(href, name),
            "modified": modified,
        }
        rows.append(row)
        if row["kind"] == "folder":
            walk(entry_id, row["path"], rows, seen)


def download(row, raw_dir):
    ext = os.path.splitext(row["name"])[1].lower()
    if row["kind"] == "doc":
        url, ext = f"https://docs.google.com/document/d/{row['id']}/mobilebasic", ".html"
    elif row["kind"] == "slides":
        # Slides in this kit are image-only and duplicate PDFs in the same folder.
        return None
    else:
        url = f"https://drive.usercontent.google.com/download?id={row['id']}&export=download&confirm=t"
    dest = os.path.join(raw_dir, row["id"] + ext)
    if not (os.path.exists(dest) and os.path.getsize(dest) > 0):
        curl(url, dest + ".part")
        os.replace(dest + ".part", dest)
    return dest


def main():
    folder_id, data_dir = sys.argv[1], sys.argv[2]
    raw_dir = os.path.join(data_dir, "raw")
    os.makedirs(raw_dir, exist_ok=True)

    rows = []
    walk(folder_id, "", rows, set())
    failures = 0
    for row in rows:
        if row["kind"] == "folder":
            continue
        try:
            dest = download(row, raw_dir)
            row["file"] = os.path.relpath(dest, data_dir) if dest else None
        except RuntimeError as err:
            failures += 1
            row["error"] = str(err)
            print("FAILED", row["path"], err, file=sys.stderr)

    with open(os.path.join(data_dir, "tree.jsonl"), "w", encoding="utf-8") as out:
        for row in rows:
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
    files = sum(1 for r in rows if r["kind"] != "folder")
    print(f"{len(rows) - files} folders, {files} files, {failures} failed")


if __name__ == "__main__":
    main()
