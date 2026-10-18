"""Parsers for the kit's placement and level tests (Lund and Berlitz)."""

import os
import re
import subprocess

from kit import Kit, Sheet

OCR_ENV = {**os.environ, "OMP_THREAD_LIMIT": "1"}
INSTRUCTION_RE = re.compile(r"^(Välj|Markera|Sätt|Skriv|Komplettera|Vilket)\b")
QUESTION_RE = re.compile(r"^(\d{1,2})\s*[.:]?\s*(.*)$")
OPTION_RE = re.compile(r"^([abcABC])\s*[)}\]]\s*(.*)$")
KEY_RE = re.compile(r"(\d{1,2})\s*[.:]\s*([^\n]+?)(?=\s+\d{1,2}\s*[.:]|\s*$)")


def tidy(text):
    text = re.sub(r"\s+", " ", text).strip()
    return re.sub(r"\s+([.,!?])", r"\1", text)


def blanks(text):
    """Underscore runs of any length become a spaced "___"."""
    text = re.sub(r"[ \t]*_{3,}[ \t]*", " ___ ", text)
    text = re.sub(r" ___ ([.,!?:])", r" ___\1", text)
    return "\n".join(l.strip() for l in text.split("\n"))


def expand_answer(raw):
    """Turns a key like "större (annan)" or "Han (hon) undrar …" into "main|alt|…"."""
    raw = raw.strip().rstrip(".") if raw.strip().count(" ") == 0 else raw.strip()
    parens = re.findall(r"\(([^)]*)\)", raw)
    main = tidy(re.sub(r"\([^)]*\)", " ", raw))
    alts = []
    for p in parens:
        p = p.strip()
        if not p:
            continue
        if len(p.split()) > 3:
            alts.append(p)
        elif "," in p:
            alts.extend(a.strip() for a in p.split(",") if a.strip())
        elif len(main.split()) <= 2:
            alts.append(p)
    # Sentences with swapped words: "Han (hon) undrar vem hon (han) …" → also accept the swap.
    swaps = re.findall(r"(\S+)\s*\(([^)\s]+)\s*\)", raw)
    if len(main.split()) > 3 and swaps and all(len(s[1].split()) == 1 for s in swaps):
        swapped = raw
        for word, other in swaps:
            swapped = re.sub(rf"{re.escape(word)}\s*\({re.escape(other)}\s*\)", f" {other} ", swapped, count=1)
        swapped = tidy(re.sub(r"\([^)]*\)", " ", swapped))
        swapped = swapped[0].upper() + swapped[1:]
        if swapped != main:
            alts.append(swapped)
    return "|".join([main] + [a for a in alts if a and a != main])


def parse_numbered_test(text, expected):
    """Questions numbered 1..expected with a)–c) options, section instructions in between."""
    text = text.replace("\f", "\n")
    body, _, key_text = text.partition("Facit")
    lines = [l.rstrip() for l in body.split("\n")]
    questions, section, current, number = [], "", None, 0
    for line in lines:
        s = line.strip()
        if not s:
            continue
        m = QUESTION_RE.match(s)
        if m and int(m.group(1)) == number + 1:
            number += 1
            current = {"number": str(number), "section": section, "lines": [m.group(2)] if m.group(2) else [], "options": []}
            questions.append(current)
            continue
        o = OPTION_RE.match(s)
        if current and o:
            current["options"].append(o.group(2).strip())
            continue
        if INSTRUCTION_RE.match(s):
            section = s
            continue
        if current and not current["options"]:
            current["lines"].append(s)
    keys = {}
    for line in key_text.split("\n"):
        m = re.match(r"^\s*(\d{1,2})\s*\.\s*(.+?)\s*$", line)
        if m:
            keys[m.group(1)] = m.group(2)
        elif keys and line.strip().startswith("("):
            last = max(keys, key=int)
            keys[last] += " " + line.strip()
        elif keys and line.strip() and not re.match(r"^\d", line.strip()):
            last = max(keys, key=int)
            if keys[last].count("(") > keys[last].count(")"):
                keys[last] += " " + line.strip()
    for q in questions:
        q["question"] = "\n".join(q["lines"]).strip()
        raw = keys.get(q["number"], "")
        q["answer"] = raw.strip().rstrip(".").strip() if q["options"] else expand_answer(raw)
    if len(questions) != expected:
        raise ValueError(f"expected {expected} questions, parsed {len(questions)}")
    return questions


def add_lund(kit: Kit, sheet: Sheet):
    for n, name in [(1, "Inplaceringstest_1 Lund.pdf"), (2, "Inplaceringstest_2 Lund.pdf")]:
        item = kit.find(name)
        questions = parse_numbered_test(kit.text(item), 40)
        for q in questions:
            sheet.add(
                "tests",
                {
                    "test_id": f"lund-{n}",
                    "title": f"Lunds universitet: inplaceringstest {n}",
                    "level": n,
                    "section": q["section"],
                    "number": q["number"],
                    "question": blanks(q["question"]),
                    "options": q["options"],
                    "answer": q["answer"],
                },
                item,
            )
        # The unnamed copies of the same tests in other folders.
        for other in kit.items:
            if other["name"] == f"Inplaceringstest_{n}.pdf":
                sheet.used.add(other["sha"])


# ---------------------------------------------------------------- Berlitz


def column_split(img):
    """The x position of a blank vertical gutter in the middle of the page, or None."""
    import numpy as np

    a = np.asarray(img)
    h, w = a.shape
    body = a[int(h * 0.1) : int(h * 0.9), :]
    ink = (body < 140).sum(axis=0)
    lo, hi = int(w * 0.3), int(w * 0.7)
    clean = ink[lo:hi] <= 2
    best_start, best_len, start = 0, 0, None
    for x, ok in enumerate(list(clean) + [False]):
        if ok and start is None:
            start = x
        elif not ok and start is not None:
            if x - start > best_len:
                best_start, best_len = start, x - start
            start = None
    # The gutter must be wide, and both sides must actually hold text.
    if best_len < w * 0.015:
        return None
    split = lo + best_start + best_len // 2
    if ink[:split].sum() < 1000 or ink[split:].sum() < 1000:
        return None
    return split


def ocr_page_columns(pdf, page, workdir):
    """OCRs one page, splitting two-column pages, and marks wide word gaps as blanks."""
    from PIL import Image

    base = os.path.join(workdir, f"p{page}")
    if not os.path.exists(base + ".png"):
        subprocess.run(
            ["pdftoppm", "-r", "300", "-gray", "-png", "-f", str(page), "-l", str(page), "-singlefile", pdf, base],
            check=True,
            capture_output=True,
        )
    img = Image.open(base + ".png").convert("L")
    w, h = img.size
    split = column_split(img)
    halves = [(0, 0, split, h), (split, 0, w, h)] if split else [(0, 0, w, h)]
    texts = []
    for i, box in enumerate(halves):
        part = f"{base}-{i}.png"
        img.crop(box).save(part)
        tsv = subprocess.run(
            ["tesseract", part, "-", "-l", "swe", "--psm", "6", "tsv"], check=True, capture_output=True, env=OCR_ENV
        ).stdout.decode("utf-8")
        texts.append(tsv_to_text(tsv))
    return "\n".join(texts)


MARKER_RE = re.compile(r"^(\d{1,2}[.,]|[a-cA-C][)}]|[AB]:)$")


def tsv_to_text(tsv):
    lines = {}
    for row in tsv.splitlines()[1:]:
        cols = row.split("\t")
        if len(cols) != 12 or not cols[11].strip():
            continue
        key = (int(cols[2]), int(cols[3]), int(cols[4]))
        lines.setdefault(key, []).append((int(cols[6]), int(cols[8]), int(cols[9]), cols[11]))
    out = []
    for key in sorted(lines):
        words = sorted(lines[key])
        height = max(wd[2] for wd in words) or 30
        text = words[0][3]
        for prev, word in zip(words, words[1:]):
            gap = word[0] - (prev[0] + prev[1])
            # A wide gap is an underscore blank, except after a question number or option letter.
            if gap > height * 6 and MARKER_RE.match(word[3]):
                text += " ⟂ "  # a second column on the same row
            elif gap > height * 1.6 and not MARKER_RE.match(prev[3]):
                text += " ___ "
            else:
                text += " "
            text += word[3]
        out.append(text)
    return unweave("\n".join(out))


def unweave(text):
    """Rows holding two side-by-side questions ("x ⟂ 32. y") are split, left column first."""
    out, left, right = [], [], []
    for line in text.split("\n"):
        if " ⟂ " in line:
            a, b = line.split(" ⟂ ", 1)
            left.append(a)
            right.append(b.replace(" ⟂ ", " "))
        elif left and re.match(r"^[abcABC]\s*[)}]", line.strip()) is None and not line.strip():
            continue
        else:
            out.extend(left + right)
            left, right = [], []
            out.append(line)
    out.extend(left + right)
    return "\n".join(out)


SHORT_WORDS = {"i", "på", "en", "du", "om", "av", "ut", "är", "jag", "vi", "ni", "de", "ja", "nej", "att", "och"}


def tidy_blanks(text):
    """Blanks show up as runs of dashes, '=' or '...'; make them all "___" and drop OCR crumbs."""
    text = re.sub(r"(?<=\w)\.\.\.(?=\s|$)", " ___", text)
    tokens = []
    for tok in text.split(" "):
        if re.fullmatch(r"[—–\-=_…|]+[:;]?|[:;][—–\-=_…|]+", tok) or tok == "___":
            if tokens and tokens[-1] == "___":
                continue
            tokens.append("___")
        else:
            tokens.append(tok)
    # Crumbs after a final blank ("Varifrån ___ Cd", "Anna ___ :") are misread underscores.
    while len(tokens) >= 2 and tokens[-2] == "___" and len(tokens[-1]) <= 2 and tokens[-1].lower() not in SHORT_WORDS and tokens[-1] not in ("?", ".", "!"):
        tokens.pop()
    if tokens and tokens[0] == "___" and len(tokens) > 1 and not tokens[1][:1].isupper():
        pass
    elif tokens and tokens[0] == "___" and len(tokens) > 1:
        # A leading blank before a capitalised word is usually a misplaced gap, not a blank.
        tokens = tokens[1:] if not text.strip().startswith(("_", "—", "–", "-", "=")) else tokens
    return " ".join(tokens).replace(" ___ ?", " ___?").replace(" ___ .", " ___.").strip()


def parse_berlitz(text, key):
    """Berlitz pages: numbered questions with options, grouped under Sektion/Del/Samtal headers."""
    questions, number, section, samtal = [], 0, "", ""
    current, passage = None, []
    for raw in text.split("\n"):
        s = raw.strip()
        if not s or "Level Test" in s or s.startswith(("SVENSKA NIVÅTEST", "BERLITZ")):
            continue
        if len(s) <= 4 and not re.match(r"^[abcABC]\s*[)}]", s):
            continue
        s = re.sub(r"^[Cc]c\)", "c)", s)
        m = re.match(r"^(Sektion \d|Part \d|Del \d)\s*[—–-]+\s*(.*)$", s)
        if m:
            section = f"{m.group(1)} – {m.group(2).strip(' —–-')}".split("Anvisning")[0].strip(" –")
            passage = []
            continue
        if re.match(r"^Samtal \d", s):
            samtal = " ".join(s.split()[:2])
            continue
        if s.startswith("Anvisning"):
            continue
        q = re.match(r"^(\d{1,2})\s*[.,]\s*(.*)$", s)
        if q and int(q.group(1)) == number + 1:
            number += 1
            rest = q.group(2)
            current = {"number": number, "section": section, "samtal": samtal, "lines": [], "options": []}
            # A reading passage sits between the previous question's options and this question.
            if len(" ".join(passage).split()) >= 12:
                current["passage"] = "\n".join(passage)
            passage = []
            o = re.match(r"^([abcABC])\s*[)}]\s*(.*)$", rest)
            if o:
                current["options"].append(o.group(2).strip())
            elif rest:
                current["lines"].append(rest)
            questions.append(current)
            continue
        o = re.match(r"^([abcABC])\s*[)}]\s*(.*)$", s)
        if current and o and len(current["options"]) < 3:
            current["options"].append(o.group(2).strip())
            continue
        if current and not current["options"]:
            current["lines"].append(s)
        else:
            passage.append(s)
    for q in questions:
        q["question"] = tidy_blanks(re.sub(r"\s+", " ", " ".join(q["lines"])))
        # Swedish sentences start with a capital, so a lowercase start means the blank came first.
        if q["question"][:1].islower():
            q["question"] = "___ " + q["question"]
        q["question"] = re.sub(r"\s*(B:)", r"\n\1", q["question"]) if q["question"].startswith("A:") else q["question"]
        if q.get("passage"):
            q["question"] = q["passage"].replace(" ___ ", " ") + "\n\n" + q["question"]
        q["options"] = [tidy_blanks(o) for o in q["options"]]
        q["answer"] = key.get(q["number"], "")
    return questions


def parse_key(text):
    """Answer keys: "1. a 2. c …", possibly in two interleaved columns. A token whose number OCR
    garbled (a repeat, or out of range) fills the gap between its neighbours ("24. c 20: GC 26. a" → 25 = c)."""
    tokens = [(int(m.group(1)), m.group(2).lower()[-1]) for m in re.finditer(r"(?<!\d)(\d{1,2})\s*[.,:;]\s*([A-Za-z]{1,2})\b", text)]
    tokens = [t for t in tokens if t[1] in "abc"]
    keys, owner = {}, {}
    for i, (num, letter) in enumerate(tokens):
        if 1 <= num <= 40 and num not in keys:
            keys[num], owner[num] = letter, i
    for i, (num, letter) in enumerate(tokens):
        if owner.get(num) == i or not (0 < i < len(tokens) - 1):
            continue
        before, after = tokens[i - 1][0], tokens[i + 1][0]
        if after - before == 2 and before + 1 not in keys:
            keys[before + 1] = letter
    return keys


def manus_prompts(text):
    """The listening script: the five questions of Del 1 and the two conversations."""
    text = text.replace("\f", "\n")
    asked = {int(m.group(1)): m.group(2).strip() for m in re.finditer(r"”(\d)\.\s*(.+?)”", text)}
    convs = re.findall(r"”Samtal (\d)”\s*(.*?)(?=\(vänta)", text, re.S)
    conversations = {}
    for n, body in convs:
        body = body.replace("”", "").replace("“", "")
        conversations[f"Samtal {n}"] = "\n".join(l.strip() for l in body.strip().split("\n") if l.strip())
    return asked, conversations


def add_berlitz(kit: Kit, sheet: Sheet, workdir):
    os.makedirs(workdir, exist_ok=True)
    sets = [
        (1, "BERLITZ Svenska Level Test 12.pdf", "BERLITZ Svenska Nivå 1 answer key.pdf", "Manus nivå 1.pdf"),
        (2, "SVENSKA NIVÅTEST 2.pdf", "Swedish Level Test 2 answer key.pdf", "Manus nivå 2.pdf"),
        (3, "BERLITZ Svenska Level Test 3.pdf", "Berlitz Swenska Level Test 3 answer key.pdf", "Manus nivå 3.pdf"),
    ]
    for level, test_name, key_name, manus_name in sets:
        test, key_item, manus = kit.find(test_name), kit.find(key_name), kit.find(manus_name)
        pdf = kit.raw_path(test)
        cache = os.path.join(workdir, f"berlitz-{level}.txt")
        if not os.path.exists(cache):
            pages = int(re.search(r"Pages:\s+(\d+)", subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout).group(1))
            page_dir = os.path.join(workdir, f"b{level}")
            os.makedirs(page_dir, exist_ok=True)
            with open(cache, "w", encoding="utf-8") as f:
                f.write("\n".join(ocr_page_columns(pdf, p, page_dir) for p in range(1, pages + 1)))
        key_text = kit.text(key_item, layout=True) or kit.text(key_item)
        if len(parse_key(key_text)) < 38:
            key_cache = os.path.join(workdir, f"key-{level}.txt")
            if not os.path.exists(key_cache):
                page_dir = os.path.join(workdir, f"k{level}")
                os.makedirs(page_dir, exist_ok=True)
                with open(key_cache, "w", encoding="utf-8") as f:
                    f.write(ocr_page_columns(kit.raw_path(key_item), 1, page_dir))
            key_text = open(key_cache, encoding="utf-8").read()
        key = parse_key(key_text)
        questions = parse_berlitz(open(cache, encoding="utf-8").read(), key)
        asked, conversations = manus_prompts(kit.text(manus))
        shown_samtal = set()
        carried = ""
        for q in questions:
            n = q["number"]
            question = q["question"]
            section = q["section"]
            if n <= 5 and n in asked:
                section = "Del 1 – Frågor och svar (läs i stället för att lyssna)"
                question = f"Någon säger: ”{asked[n]}” Vad svarar du?"
            elif 6 <= n <= 10 and q["samtal"] in conversations:
                section = "Del 2 – Samtal (läs i stället för att lyssna)"
                if q["samtal"] not in shown_samtal:
                    shown_samtal.add(q["samtal"])
                    question = f"{q['samtal']}:\n{conversations[q['samtal']]}\n\n{question}"
            elif n <= 10:
                sheet.notes.append(f"Berlitz {level}: listening question {n} has no script line; skipped.")
                continue
            if not question.strip() or (q.get("passage") and question.rstrip() == q["passage"].replace(" ___ ", " ").rstrip()):
                question = (question.rstrip() + "\n\n" if question.strip() else "") + f"Lucka ({n}) i texten ovan."
            if carried and not question.startswith(carried[:40]):
                question = carried + "\n\n" + question
            carried = ""
            garbled = (
                len(q["options"]) != 3
                or not q["answer"]
                or any(re.search(r"[abc]\)|___", o) for o in q["options"])
                or re.search(r"(^|\n)\s*([abc]\)|\d{2}\.)", question)
            )
            if garbled:
                if q.get("passage"):
                    carried = q["passage"]
                sheet.notes.append(f"Berlitz {level}: question {n} didn't parse cleanly; skipped.")
                continue
            sheet.add(
                "tests",
                {
                    "test_id": f"berlitz-{level}",
                    "title": f"Berlitz nivåtest {level}",
                    "level": level,
                    "section": section,
                    "number": str(n),
                    "question": question,
                    "options": q["options"],
                    "answer": q["answer"],
                },
                test,
            )
        for item in (key_item, manus):
            sheet.used.add(item["sha"])
        count = sum(1 for r in sheet.rows["tests"] if r["test_id"] == f"berlitz-{level}")
        sheet.notes.append(f"Berlitz {level}: {count} of 40 questions imported.")
    # Duplicates of the level 2 test, and the slide copies.
    for name in ("SVENSKA NIVÅTEST 2 PDF.pdf",):
        sheet.used.add(kit.find(name)["sha"])
