"""Shared helpers for building the Prata Sheet from the extracted Swedish Kit."""

import hashlib
import json
import os
import re
import unicodedata
from collections import defaultdict

# Columns per tab, in the order the app documents them (cards has an extra optional column).
COLUMNS = {
    "texts": ["id", "level", "title", "source", "kind", "part", "body"],
    "glossary": ["text_id", "form", "lemma", "english"],
    "questions": ["text_id", "question", "options", "answer"],
    "cards": ["id", "deck", "level", "swedish", "english", "example", "alternatives"],
    "exercises": ["id", "level", "topic", "type", "prompt", "answer", "alternatives", "explanation"],
    "tests": ["test_id", "title", "level", "section", "number", "question", "options", "answer"],
    "prompts": ["id", "level", "title", "task", "hints", "checklist"],
}

# Google Sheets allows 50,000 characters per cell; stay well below it.
MAX_CELL = 20000


class Kit:
    """The deduplicated files of the kit and their extracted text."""

    def __init__(self, data_dir):
        self.dir = data_dir
        self.items = [json.loads(l) for l in open(os.path.join(data_dir, "unique.jsonl"), encoding="utf-8")]
        for item in self.items:
            meta_path = os.path.join(data_dir, "text", item["sha"] + ".json")
            item["meta"] = json.load(open(meta_path, encoding="utf-8")) if os.path.exists(meta_path) else {}
            item["name"] = os.path.basename(item["paths"][0])

    def text(self, item, layout=False):
        path = os.path.join(self.dir, "text", item["sha"] + (".layout.txt" if layout else ".txt"))
        return open(path, encoding="utf-8").read() if os.path.exists(path) else ""

    def raw_path(self, item):
        return os.path.join(self.dir, item["file"])

    def find(self, suffix):
        """The one item whose path ends with `suffix` (a filename, or folder/filename)."""
        hits = [i for i in self.items if any(p.endswith(suffix) for p in i["paths"])]
        if not hits:
            raise KeyError(suffix)
        return hits[0]

    def in_folder(self, folder):
        return [i for i in self.items if any(f"/{folder}/" in p for p in i["paths"])]


class Sheet:
    """Rows for every tab, plus a record of what was used and skipped for the report."""

    def __init__(self):
        self.rows = {tab: [] for tab in COLUMNS}
        self.used = set()
        self.skipped = defaultdict(list)
        self.notes = []
        self._ids = set()

    def unique_id(self, base):
        candidate, n = base, 2
        while candidate in self._ids:
            candidate = f"{base}-{n}"
            n += 1
        self._ids.add(candidate)
        return candidate

    def add_text(self, text_id, level, title, source, kind, body, item=None):
        for part, chunk in enumerate(split_body(body), start=1):
            self.rows["texts"].append(
                {"id": text_id, "level": level, "title": title, "source": source, "kind": kind, "part": part, "body": chunk}
            )
        if item:
            self.used.add(item["sha"])

    def add(self, tab, row, item=None):
        self.rows[tab].append(row)
        if item:
            self.used.add(item["sha"])

    def skip(self, reason, item):
        self.skipped[reason].append(item["paths"][0])
        self.used.add(item["sha"])


def split_body(body, limit=MAX_CELL):
    """Splits at paragraph breaks so each part fits in a cell."""
    body = body.strip()
    if len(body) <= limit:
        return [body]
    parts, current = [], ""
    for para in body.split("\n\n"):
        if current and len(current) + len(para) + 2 > limit:
            parts.append(current)
            current = ""
        while len(para) > limit:
            cut = para.rfind(". ", 0, limit) + 1 or limit
            parts.append((current + "\n\n" if current else "") + para[:cut].strip())
            current, para = "", para[cut:].strip()
        current = f"{current}\n\n{para}" if current else para
    if current:
        parts.append(current)
    return parts


def slug(value, max_len=48):
    value = value.lower().replace("å", "a").replace("ä", "a").replace("ö", "o")
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:max_len].strip("-") or "x"


def short_hash(value):
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:8]


HEADING_RE = re.compile(r"^(\d+[.)]?\s+)?[A-ZÅÄÖÉ0-9][A-ZÅÄÖÉ0-9 ,:;/&()–—'’!?.\-]{3,}$")
END_PUNCT = tuple(".!?:;…\"”»)")


def is_heading(line):
    letters = [c for c in line if c.isalpha()]
    return len(letters) >= 4 and HEADING_RE.match(line) is not None and sum(c.isupper() for c in letters) / len(letters) > 0.8


def junk_line(line):
    """OCR noise: lines with few letters or mostly stray symbols."""
    stripped = line.strip()
    if not stripped:
        return True
    letters = sum(c.isalpha() for c in stripped)
    if letters < 2 and not re.match(r"^\d+[.)]?$", stripped):
        return True
    if len(stripped) >= 6 and letters / len(stripped) < 0.5:
        return True
    words = re.findall(r"[A-Za-zÅÄÖåäöÉé]+", stripped)
    # Strings of one- and two-letter fragments ("SS fr AEA a 4 i vt") are image noise.
    if len(words) >= 4 and sum(len(w) <= 2 for w in words) / len(words) > 0.7:
        return True
    # Sideways print read as text ("Teve opueyRB 490 Bej 154v9") has capitals inside words.
    if sum(1 for w in words if re.search(r"[a-zåäö][A-ZÅÄÖ]", w)) >= 2:
        return True
    return False


def clean_ocr(text):
    """Turns Tesseract's one-line-per-paragraph output into readable text."""
    text = text.replace("\f", "\n\n").replace("\u00ad", "")
    text = re.sub(r"[|¦]", " ", text)
    text = text.replace("«", "").replace("»", "•").replace("—>", "→").replace("->", "→")
    lines = [re.sub(r"\s+", " ", l).strip() for l in text.split("\n")]
    lines = [l for l in lines if not junk_line(l)]
    out = []
    for line in lines:
        if out and not is_heading(line) and not is_heading(out[-1]):
            prev = out[-1]
            # A wrapped sentence: previous line runs on and this one continues in lowercase.
            if not prev.endswith(END_PUNCT) and line[:1].islower():
                out[-1] = f"{prev} {line}"
                continue
        if is_heading(line) and out:
            out.append("")
        out.append(line)
        if is_heading(line):
            out.append("")
    body = "\n".join(out)
    return re.sub(r"\n{3,}", "\n\n", body).strip()


CONTROL_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f]")
# Running headers, footers and page numbers in the PDFs.
FOOTER_RE = re.compile(r"^(\d{1,3}|\d{1,3}\s+kapitel \d+\b.*|kapitel \d+\b.*\s\d{1,3}|[A-ZÅÄÖ0-9 &–\-:]{18,})$")


def clean_prose(text):
    """For text-layer PDFs: rejoin hard-wrapped lines into paragraphs."""
    text = text.replace("\u00ad", "").replace("\f", "\n\n")
    text = "\n".join(l for l in text.split("\n") if not FOOTER_RE.match(l.strip()))
    paras = re.split(r"\n\s*\n", text)
    result = []
    for para in paras:
        lines = [l.strip() for l in para.split("\n") if l.strip()]
        if not lines:
            continue
        joined = lines[0]
        for line in lines[1:]:
            if joined.endswith("-") and line[:1].islower():
                joined = joined[:-1] + line
            elif joined.endswith(END_PUNCT) and (line[:1].isupper() or line[:1] in "–-•\"”"):
                joined += "\n" + line
            else:
                joined += " " + line
        result.append(joined)
    return "\n\n".join(result)


def write_xlsx(sheet, path):
    from openpyxl import Workbook
    from openpyxl.styles import Font

    wb = Workbook()
    wb.remove(wb.active)
    for tab, columns in COLUMNS.items():
        ws = wb.create_sheet(tab)
        ws.append(columns)
        for cell in ws[1]:
            cell.font = Font(bold=True)
        for row in sheet.rows[tab]:
            values = []
            for col in columns:
                value = row.get(col, "")
                if isinstance(value, (list, tuple)):
                    value = " | ".join(v for v in value if v)
                values.append("" if value is None else CONTROL_RE.sub("", str(value)))
            ws.append(values)
        # Everything as plain text, so Google doesn't turn "1" or "1/2" into numbers or dates.
        for row in ws.iter_rows():
            for cell in row:
                cell.number_format = "@"
                cell.data_type = "s"
        ws.freeze_panes = "A2"
        for i, col in enumerate(columns):
            ws.column_dimensions[ws.cell(1, i + 1).column_letter].width = 60 if col in ("body", "prompt", "task", "question") else 18
    wb.save(path)
