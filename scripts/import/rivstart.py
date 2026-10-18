"""Turns the Rivstart B1+B2 progress tests and their answer key into practice exercises."""

import re
import subprocess

from kit import Kit, Sheet, short_hash

SECTION_RE = re.compile(r"^(\d{1,2}) ([A-ZÅÄÖ][^_]{2,80})$")
ITEM_RE = re.compile(r"^(\d{1,2})\s+(.*\S)\s*$")
CHUNK_SPLIT = re.compile(r"\s{3,}")
CONTROL_RE = re.compile(r"[\x00-\x08\x0b-\x1f]")
TABLE_LABELS = {"en", "ett", "plural", "presens", "preteritum", "supinum", "infinitiv", "imperativ", "singular"}
# Sections that depend on page layout (underlining, matching, circling) and can't be typed.
SKIP_INSTRUCTIONS = ("Stryk under", "Kombinera")


def pdf_column(pdf, page, x, w):
    out = subprocess.run(
        ["pdftotext", "-f", str(page), "-l", str(page), "-x", str(x), "-y", "0", "-W", str(w), "-H", "842", "-layout", pdf, "-"],
        capture_output=True,
        check=True,
    )
    return out.stdout.decode("utf-8", errors="replace")


def parse_key_column(text):
    """{section number: {"title", "items": {n: answer}, "table": [[cells]]}} for one column of the key."""
    sections, current, last_item = {}, None, None
    for line in text.split("\n"):
        line = CONTROL_RE.sub("", line)
        if (
            not line.strip()
            or any(marker in line for marker in ("Kopieringsunderlag", "©", "ISBN", "fac it"))
            or line.strip().startswith(("Facit", "Kapitel"))
            or re.match(r"^\s*\d:\d\s*$", line)
        ):
            continue
        stripped = line.strip()
        m = SECTION_RE.match(stripped)
        # Headings come in order within a column and never end like a sentence (answers do).
        in_order = not sections or int(m.group(1)) == max(sections) + 1 if m else False
        if m and in_order and not CHUNK_SPLIT.search(stripped) and not stripped.endswith((".", "?", "!")) and not re.search(r"\d\s*$", stripped):
            current = {"title": m.group(2).strip(), "items": {}, "table": []}
            sections[int(m.group(1))] = current
            last_item = None
            continue
        if current is None:
            continue
        chunks = CHUNK_SPLIT.split(stripped)
        numbered = [re.match(r"^(\d{1,2})\s*(\S.*)$", c) for c in chunks]
        if all(numbered):
            for n in numbered:
                current["items"][int(n.group(1))] = n.group(2).strip()
                last_item = int(n.group(1))
        elif len(chunks) >= 3:
            current["table"].append(chunks)
        elif last_item is not None and line.startswith("   "):
            current["items"][last_item] += " " + stripped
    return sections


def parse_key(pdf, pages):
    keys = {}
    for page in range(1, pages + 1):
        left = parse_key_column(pdf_column(pdf, page, 0, 298))
        right = parse_key_column(pdf_column(pdf, page, 298, 300))
        keys[page] = {**left, **right}
    return keys


def parse_tests(text):
    """{test number: {section number: {"title", "instruction", "box", "items": [{n, text, under}]}}}."""
    tests, test, section, item = {}, None, None, None
    lines = text.split("\n")
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or "Kopieringsunderlag" in stripped or "©" in stripped or stripped.startswith("Poäng") or re.match(r"^\d:\d$", stripped):
            continue
        m = re.match(r"^Framstegstest (\d)", stripped)
        if m:
            test = tests.setdefault(int(m.group(1)), {})
            section = item = None
            continue
        if test is None or stripped.startswith("Kapitel"):
            continue
        sm = SECTION_RE.match(stripped)
        next_line = next((l.strip() for l in lines[i + 1 :] if l.strip() and not l.strip().startswith("Poäng")), "")
        if (
            sm
            and not re.match(r"^\d", next_line)
            and "_" not in stripped
            and not stripped.endswith((".", "?", "!"))
            and (section is None or int(sm.group(1)) == max(test) + 1)
        ):
            section = {"title": sm.group(2).strip(), "instruction": "", "box": "", "items": []}
            test[int(sm.group(1))] = section
            item = None
            continue
        if section is None:
            continue
        if not section["instruction"]:
            section["instruction"] = stripped
            continue
        im = ITEM_RE.match(stripped)
        expected = len(section["items"]) + 1
        if im and int(im.group(1)) == expected:
            item = {"n": expected, "text": im.group(2), "under": ""}
            section["items"].append(item)
            continue
        if item is None:
            # Words in a box between the instruction and the first item.
            section["box"] = (section["box"] + " " + CHUNK_SPLIT.sub(", ", stripped)).strip(", ")
            continue
        indent = len(line) - len(line.lstrip())
        if "_" not in stripped and indent >= 6 and not item["under"] and not stripped[:1].isupper():
            item["under"] = stripped
        elif "_" not in stripped and indent >= 6 and "/" in stripped and not item["under"]:
            item["under"] = stripped
        else:
            item["text"] += " " + stripped
    return tests


def blanks(text):
    text = CONTROL_RE.sub("", text).replace("\xad", "")
    text = re.sub(r"_+(\s*_+)*", lambda m: " ___ " * max(1, len(re.findall(r"_{3,}", m.group(0)))), text)
    text = re.sub(r"\s+", " ", text)
    return re.sub(r" ___ ([.,!?:])", r" ___\1", text).strip()


def same_title(a, b):
    norm = lambda t: re.sub(r"[^a-zåäö]", "", t.lower())
    return norm(a) == norm(b) or (len(norm(a)) >= 12 and norm(a)[:12] == norm(b)[:12])


def answer_variants(answer):
    """"Akta dig/er" → main "Akta dig", alternative "Akta er"; "Antingen … eller" → "Antingen eller"."""
    answer = CONTROL_RE.sub("", answer).replace(" … ", " ").replace("…", " ").strip()
    answer = re.sub(r"\s+", " ", answer)
    if "/" not in answer:
        return answer, ([answer.replace(",", "")] if "," in answer else [])
    # "ligger/låg/har legat" lists whole answers; "Akta dig/er" swaps one word.
    if " " not in answer.split("/")[0] and "," not in answer:
        options = [o.strip() for o in answer.split("/") if o.strip()]
        return options[0], options[1:]
    words = answer.split(" ")
    for i, w in enumerate(words):
        if "/" in w:
            options = w.split("/")
            variants = [" ".join(words[:i] + [o] + words[i + 1 :]) for o in options if o]
            return variants[0], variants[1:]
    return answer, []


def tile_order(under_chunks, solution):
    """Orders the given tiles so they spell the solution; None if they can't."""
    remaining = list(under_chunks)
    words = solution.rstrip(".!?").split()
    order = []
    pos = 0
    while pos < len(words):
        match = None
        for tile in sorted(remaining, key=lambda t: -len(t.split())):
            n = len(tile.split())
            if [w.lower() for w in words[pos : pos + n]] == [w.lower() for w in tile.split()]:
                match = tile
                break
        if match is None:
            return None
        order.append(match)
        remaining.remove(match)
        pos += len(match.split())
    return order if not remaining else None


def add_rivstart(kit: Kit, sheet: Sheet):
    test_item = kit.find("Nivåtester/Rivstart B1 B2 Framstegstest.pdf")
    key_item = kit.find("Rivstart_B1_B2_facit.pdf")
    tests = parse_tests(kit.text(test_item, layout=True))
    keys = parse_key(kit.raw_path(key_item), 6)
    sheet.used.add(key_item["sha"])
    for other in kit.items:
        if other["name"] == "Rivstart B1 B2 Framstegstest.pdf":
            sheet.used.add(other["sha"])
    made, skipped_sections = 0, []
    for t, sections in sorted(tests.items()):
        level = 4 if t <= 3 else 5
        for s, section in sorted(sections.items()):
            test_keys = keys.get(t, {})
            key = test_keys.get(s)
            if key is None or not same_title(key["title"], section["title"]):
                key = next((k for k in test_keys.values() if same_title(k["title"], section["title"])), None)
            label = f"Rivstart {t}.{s} {section['title']}"
            # Multi-part sections ("A …", "B …") number their items twice; skip rather than misalign.
            if section["instruction"].startswith(SKIP_INSTRUCTIONS) or re.match(r"^[AB] ", section["instruction"]) or key is None:
                skipped_sections.append(label)
                continue
            topic = section["title"]
            if key["table"]:
                made += add_table(sheet, t, s, section, key, level, test_item)
                continue
            before = len(sheet.rows["exercises"])
            failed = 0
            for item in section["items"]:
                raw = key["items"].get(item["n"])
                if not raw:
                    continue
                text = blanks(item["text"])
                under = ", ".join(c.strip() for c in CHUNK_SPLIT.split(CONTROL_RE.sub("", item["under"]).strip()) if c.strip())
                base_id = f"rivstart-{t}-{s}-{item['n']}"
                instruction = section["instruction"]
                box = f"\nOrd: {section['box']}" if section["box"] else ""
                if "Sortera" in instruction and "/" in under:
                    tiles = [c.strip() for c in under.split("/") if c.strip()]
                    fixed = text.split("___")
                    solution = raw
                    if len(fixed) == 2 and fixed[0].strip():
                        lead = fixed[0].strip()
                        if solution.lower().startswith(lead.lower()):
                            solution = solution[len(lead) :].strip()
                    order = tile_order(tiles, solution)
                    if order:
                        last = order[-1] + (raw[-1] if raw[-1] in ".!?" else "")
                        sheet.add(
                            "exercises",
                            {
                                "id": base_id,
                                "level": level,
                                "topic": topic,
                                "type": "order",
                                "prompt": text.replace("___", "…") if len(fixed) == 2 and fixed[0].strip() else instruction,
                                "answer": " / ".join(order[:-1] + [last]),
                                "alternatives": [],
                                "explanation": f"Rätt: {raw}",
                            },
                            test_item,
                        )
                        made += 1
                        continue
                main, alts = answer_variants(raw)
                hint = f" ({under})" if under else ""
                prompt = f"{instruction}\n{text}{hint}{box}"
                # Rewriting a whole sentence has more than one right answer, so learners check themselves.
                kind = "selfcheck" if len(main.split()) > 4 else "cloze"
                if kind == "selfcheck":
                    main, alts = CONTROL_RE.sub("", raw).strip(), []
                    # A model answer that shares almost no words with the task belongs to another task.
                    words = {w for w in re.findall(r"\w{3,}", main.lower())}
                    if words and len(words & set(re.findall(r"\w{3,}", prompt.lower()))) / len(words) < 0.3:
                        failed += 1
                        sheet.notes.append(f"Rivstart {t}.{s}.{item['n']}: model answer doesn't match the task; skipped.")
                        continue
                else:
                    parts = len([p for p in main.split(", ") if p])
                    gaps = max(1, text.count("___"))
                    two_part = re.search(r"\b(antingen|varken|både|ju)\b", main, re.I)
                    # A gap/answer mismatch means the key and the test are out of step here.
                    fits = parts == gaps or ("," not in main and len(main.split()) == gaps) or (two_part and gaps == 2)
                    if not fits or len(re.sub(r"\W", "", main)) < 2:
                        failed += 1
                        sheet.notes.append(f"Rivstart {t}.{s}.{item['n']}: {gaps} gaps but answer '{main}'; skipped.")
                        continue
                sheet.add(
                    "exercises",
                    {
                        "id": base_id,
                        "level": level,
                        "topic": topic,
                        "type": kind,
                        "prompt": prompt,
                        "answer": main,
                        "alternatives": alts,
                        "explanation": "",
                    },
                    test_item,
                )
                made += 1
            if section["items"] and failed / len(section["items"]) > 0.3:
                dropped = len(sheet.rows["exercises"]) - before
                del sheet.rows["exercises"][before:]
                made -= dropped
                skipped_sections.append(f"{label} (key out of step)")
    sheet.notes.append(f"Rivstart: {made} exercises; sections skipped (layout tasks or no key): {', '.join(skipped_sections) or 'none'}.")


def add_table(sheet, t, s, section, key, level, item):
    """Answer-key tables (noun forms, verb forms): one exercise per missing form."""
    rows = [r for r in key["table"] if not any(h in " ".join(r).lower() for h in ("obestämd", "infinitiv", "singular", "imperativ"))]
    if not rows or any(c.lower() in TABLE_LABELS for r in rows for c in r[1:]):
        sheet.notes.append(f"Rivstart {t}.{s}: answer table not understood; skipped.")
        return 0
    headers = next((r for r in key["table"] if any(h in " ".join(r).lower() for h in ("obestämd", "infinitiv", "imperativ", "presens"))), None)
    made = 0
    base_col = 0
    if headers:
        base_col = next((j for j, h in enumerate(headers) if h.lower().startswith("infinitiv")), 0)
    for row in rows:
        if len(row) <= base_col:
            continue
        base = row[base_col]
        for j, cell in enumerate(row):
            if j == base_col:
                continue
            label = headers[j] if headers and j < len(headers) else f"form {j + 1}"
            if label.lower() == "obestämd" and j >= 2:
                label = "obestämd plural"
            elif label.lower() == "bestämd":
                label = "bestämd singular" if j == 1 else "bestämd plural"
            sheet.add(
                "exercises",
                {
                    "id": f"rivstart-{t}-{s}-{short_hash(base + label)}",
                    "level": level,
                    "topic": section["title"],
                    "type": "conjugate",
                    "prompt": f"{base} → {label}",
                    "answer": cell,
                    "alternatives": [],
                    "explanation": " – ".join(row),
                },
                item,
            )
            made += 1
    return made
