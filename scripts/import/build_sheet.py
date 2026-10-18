"""Builds the Prata content spreadsheet from the extracted Swedish Kit.

Usage: python3 -I scripts/import/build_sheet.py <data_dir> <out.xlsx>

Run fetch_drive.py and extract_text.py first. Writes the spreadsheet (one tab per table, every
cell plain text) and <out>.report.md, listing what was imported, skipped and worth checking by hand.
"""

import os
import re
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import rivstart  # noqa: E402
import tests_parse  # noqa: E402
from kit import Kit, Sheet, clean_ocr, clean_prose, short_hash, slug, write_xlsx  # noqa: E402

MIN_CONFIDENCE = 80  # mean Tesseract word confidence for an image to be imported as text
SOURCE = "Swedish Kit"


def doc_title(item):
    return item["name"].strip()


def norm_name(name):
    name = re.sub(r"\.(png|jpe?g|heic|pdf)$", "", name, flags=re.I)
    return re.sub(r"\s+", " ", name).strip().lower()


# ---------------------------------------------------------------- lesson pages


def topic_of(filename):
    """"Restaurang2.JPG", "Målkoll 4.1 (1).PNG" → "restaurang", "målkoll"."""
    stem = re.sub(r"\.(png|jpe?g)$", "", filename, flags=re.I)
    stem = re.sub(r"\s*\(\d+\)", "", stem)
    stem = re.sub(r"\s*-\s*kopia$", "", stem, flags=re.I)
    stem = re.sub(r"[\s.]*[\d.]+$", "", stem)
    stem = re.sub(r"\s+\d+$", "", stem)
    return re.sub(r"\s+", " ", stem).strip(" .-")


def page_sort_key(filename):
    numbers = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", filename)] or [0.0]
    return (numbers, filename)


SPECIAL_PAGES = {
    "konstigt i sverige",
    "swedish particularities",
    "swedish particulairies",
    "settings",
    "placement",
    "inplaceringstest",
    "self study quick start",
    "swedish self study",
    "skärmklipp",
    "kkj",
    "skkslkj",
}


def add_lessons(kit, sheet):
    for level, folder in [(1, "Sidor Nivå 1"), (2, "Sidor Nivå 2"), (3, "Sidor Nivå 3"), (4, "Sidor nivå 4")]:
        groups = defaultdict(list)
        for item in kit.items:
            path = next((p for p in item["paths"] if f"/{folder}/" in p and "/Grammatik/" not in p), None)
            if not path or item["kind"] != "file" or not re.search(r"\.(png|jpe?g)$", path, re.I):
                continue
            name = os.path.basename(path)
            topic = topic_of(name)
            if topic.lower() in SPECIAL_PAGES:
                continue
            if item["meta"].get("confidence", 0) < MIN_CONFIDENCE - 10:
                sheet.skip(f"Lesson page with poor OCR (confidence < {MIN_CONFIDENCE - 10}%)", item)
                continue
            groups[topic.lower()].append((name, item))
        for key, pages in sorted(groups.items()):
            pages.sort(key=lambda p: page_sort_key(p[0]))
            title = topic_of(pages[0][0])
            title = title[:1].upper() + title[1:]
            if title.isupper():
                title = title.capitalize()
            body = "\n\n".join(clean_ocr(kit.text(item)) for _, item in pages)
            if len(body) < 80:
                for _, item in pages:
                    sheet.skip("Lesson page with too little text", item)
                continue
            text_id = sheet.unique_id(f"n{level}-{slug(title)}")
            sheet.add_text(text_id, level, title, f"{SOURCE} · Nivå {level}", "lektion", body)
            for _, item in pages:
                sheet.used.add(item["sha"])


# ---------------------------------------------------------------- reference images

REFERENCE_IMAGES = {
    # name (without extension, lowercase): (level, kind, title)
    "alfabetet 1": (1, "uttal", "Alfabetet"),
    "alfabetet 2": (1, "uttal", "Alfabetet 2"),
    "alfabetet": (1, "uttal", "Alfabetet"),
    "alfabetet2": (1, "uttal", "Alfabetet 2"),
    "alfabetet 3 uttala mer": (1, "uttal", "Uttala mer"),
    "uttala vokaler": (1, "uttal", "Uttala vokaler"),
    "mjuka o hårda vokaler": (1, "uttal", "Mjuka och hårda vokaler"),
    "sk-ljud": (1, "uttal", "Sj- och sk-ljud"),
    "uttala svärt": (2, "uttal", "Svåra ord att uttala"),
    "tongue twisters": (2, "uttal", "Tungvrickare"),
    "en och ett": (1, "grammatik", "En och ett"),
    "frågeord": (1, "grammatik", "Frågeord"),
    "grammatik": (1, "grammatik", "Grammatik: grunder"),
    "grammatik2": (1, "grammatik", "Grammatik: grunder 2"),
    "substantiv": (1, "grammatik", "Substantiv"),
    "substantiv (2)": (1, "grammatik", "Substantiv 2"),
    "substantiv singular": (1, "grammatik", "Substantiv i singular"),
    "substantiv singular bestämd form": (1, "grammatik", "Bestämd form singular"),
    "substantiv singular bestämd form singular": (1, "grammatik", "Bestämd form singular 2"),
    "prepositioner": (1, "grammatik", "Prepositioner"),
    "preposotioner": (1, "grammatik", "Prepositioner 2"),
    "prepositioner (2)": (1, "grammatik", "Prepositioner 3"),
    "saker prepositioner (1)": (1, "grammatik", "Saker och prepositioner"),
    "prepositioner på bordet": (1, "grammatik", "Prepositioner: på bordet"),
    "enkla prepositioner": (1, "grammatik", "Enkla prepositioner"),
    "dyrare": (2, "grammatik", "Komparativ: dyrare"),
    "var - vart": (1, "grammatik", "Var och vart"),
    "tror - tycker - tänker": (2, "grammatik", "Tror, tycker, tänker"),
    "tycka - tänka - tro": (2, "grammatik", "Tycka, tänka, tro"),
    "många - mycket": (1, "grammatik", "Många eller mycket?"),
    "reflexiva possesiva pronomen": (2, "grammatik", "Reflexiva possessiva pronomen"),
    "befintlighet - rörelse": (2, "grammatik", "Befintlighet och rörelse"),
    "enkel vs formell svenska": (3, "grammatik", "Enkel och formell svenska"),
    "sämre - värre": (2, "grammatik", "Sämre eller värre?"),
    "verbformer exempel": (2, "grammatik", "Verbformer"),
    "verbformer exempel (1)": (2, "grammatik", "Verbformer 2"),
    "ordningstal": (1, "grammatik", "Ordningstal"),
    "grundtal": (1, "grammatik", "Grundtal"),
    "räkneord": (1, "grammatik", "Räkneord"),
    "ordklasser fif b1": (3, "grammatik", "Ordklasser"),
    "obestämd- bestämd form 1": (1, "grammatik", "Obestämd och bestämd form"),
    "obestämd - bestämd form 2": (1, "grammatik", "Obestämd och bestämd form 2"),
    "obestämd - bestämd form 3": (1, "grammatik", "Obestämd och bestämd form 3"),
    "prata om alltid. ofta. aldrig. sällan. ibland.": (1, "grammatik", "Alltid, ofta, aldrig"),
    "vem var när hur etc..": (1, "grammatik", "Vem, var, när, hur"),
    "possesiva pronomen 1": (1, "grammatik", "Possessiva pronomen"),
    "possesiva pronomen 2": (1, "grammatik", "Possessiva pronomen 2"),
    "possesiva pronomen 3": (1, "grammatik", "Possessiva pronomen 3"),
    "possesiva pronomen 4": (1, "grammatik", "Possessiva pronomen 4"),
    "reflexiva pronomen": (2, "grammatik", "Reflexiva pronomen"),
    "reflexiva pronomen 1": (2, "grammatik", "Reflexiva pronomen"),
    "reflexiva pronomen 2": (2, "grammatik", "Reflexiva pronomen 2"),
    "tro-tycka-tänka": (2, "grammatik", "Tro, tycka, tänka (sida)"),
    "verbgrup 4": (3, "grammatik", "Verbgrupp 4"),
    "verrbgrupp 2": (3, "grammatik", "Verbgrupp 2"),
    "gör gjort gjorde etc": (3, "grammatik", "Göra – gjorde – gjort"),
    "hej o tjena": (1, "kultur", "Hej och tjena"),
    "nähää": (2, "kultur", "Nähää!"),
    "jag vet inte...": (2, "kultur", "Jag vet inte …"),
    "lagom": (2, "kultur", "Lagom"),
    "konstigt i sverige": (2, "kultur", "Konstigt i Sverige"),
    "swedish particularities": (2, "kultur", "Svenska egenheter"),
    "swedish particulairies": (2, "kultur", "Svenska egenheter"),
    "25 fördomar om sverige": (2, "kultur", "25 fördomar om Sverige"),
    "fördomar om sverige": (2, "kultur", "25 fördomar om Sverige"),
    "finlandssvenska": (3, "kultur", "Finlandssvenska"),
    "svensk politik": (3, "kultur", "Svensk politik"),
    "viktigaste uppfinningar": (3, "kultur", "Viktigaste uppfinningarna"),
    "uppfinningar": (3, "kultur", "Svenska uppfinningar"),
    "false friends": (1, "grammatik", "False friends"),
}


def add_reference_images(kit, sheet):
    seen_titles = set()
    for item in kit.items:
        if item["kind"] != "file" or not re.search(r"\.(png|jpe?g)$", item["name"], re.I) or item["sha"] in sheet.used:
            continue
        spec = REFERENCE_IMAGES.get(norm_name(item["name"]))
        if not spec:
            continue
        level, kind, title = spec
        if item["meta"].get("confidence", 0) < MIN_CONFIDENCE:
            sheet.skip(f"Reference image with poor OCR (confidence < {MIN_CONFIDENCE}%)", item)
            continue
        body = clean_ocr(kit.text(item))
        if len(body) < 60 or title in seen_titles:
            sheet.skip("Reference image with too little text, or a near-duplicate", item)
            continue
        seen_titles.add(title)
        sheet.add_text(sheet.unique_id(f"{kind}-{slug(title)}"), level, title, SOURCE, kind, body, item)


# ---------------------------------------------------------------- Google Docs

DOC_TEXTS = {
    "tandläkaren": (3, "dialog", "Hos tandläkaren"),
    "lakritsförgiftning": (4, "artikel", "Lakritsförgiftning"),
    "midsommar": (3, "artikel", "Midsommar"),
    "hörseln text": (4, "artikel", "Hörseln"),
    "flytta till sverige": (3, "artikel", "Flytta till Sverige"),
    "dialogue - nya bekanta_": (2, "dialog", "Nya bekanta"),
    "i mataffären": (1, "dialog", "I mataffären"),
    "intervjufrågor vid en jobbintervju": (4, "artikel", "Intervjufrågor vid en jobbintervju"),
    "hos doktorn": (2, "fraser", "Hos doktorn"),
    "text till bordsbild": (1, "beskrivning", "Saker på bordet"),
    "tro - tycka - tänka": (2, "grammatik", "Tro, tycka, tänka"),
    "tycka tänka tro": (2, "grammatik", "Tycka, tänka, tro – kort"),
    "var vart": (1, "grammatik", "Var eller vart?"),
    "före - innan": (2, "grammatik", "Före eller innan?"),
    "känna känner känt - till, på, av, det": (2, "grammatik", "Känna – känner – känt"),
    "svenska deklinationer (substantiv)": (2, "grammatik", "Substantivens deklinationer"),
    "tider": (1, "grammatik", "Tider på dygnet"),
    "årstider": (1, "fraser", "Årstider, väder och kläder"),
    "utseende. egenskaper": (1, "fraser", "Utseende och egenskaper"),
    "common (vanliga) verbs": (1, "grammatik", "Vanliga verb"),
    "verb i olika former": (1, "grammatik", "Verb i olika former"),
    "svenskt språk och kultur": (4, "kultur", "Svenskt språk och kultur: ämnen"),
}

DOC_SKIP = {
    "how to trill your rs": "Link only (YouTube)",
    "rrr.._": "Link only (YouTube)",
    "languagereactor": "Link only (tool tip)",
    "meetsaver": "Link only (tool tip)",
    "meetsaver for google meet users": "Link only (tool tip)",
    "sommarpratare 2026": "Link only (radio)",
    "digital learning links, youtube, podcast´s, tv show´s, music, etc": "List of links (TV, podcasts, YouTube)",
    "livet på lätt svensla": "Empty",
    "form i fokus b 2": "Empty",
    "form i fokus del a1": "Empty",
    "form i fokus del a2": "Empty",
    "form i fokus del b1 1": "Empty",
    "tester": "Links to Gemini quizzes",
    "preteritum. enkelt test med facit_": "Link to a private doc",
    "prata svenska!": "Tutor's note about speaking practice",
    "hon är...ung trevlig": "Duplicate of 'Utseende. Egenskaper'",
    "var vart(1)": "Duplicate of 'Var Vart'",
    "var vart(2)": "Duplicate of 'Var Vart'",
    "synonymer (väldigt + )": "Duplicate of 'Very'",
}


def docs(kit):
    """One item per distinct Google Doc (the kit holds most of them twice)."""
    seen = {}
    for item in kit.items:
        if item["kind"] != "doc":
            continue
        text = kit.text(item).strip()
        key = (norm_name(doc_title(item)), short_hash(text))
        if key in seen:
            continue
        seen[key] = item
    by_name = defaultdict(list)
    for (name, _), item in seen.items():
        by_name[name].append(item)
    return by_name


def body_of_doc(kit, item):
    text = kit.text(item)
    lines = text.split("\n")
    # The export repeats the title at the top.
    while lines and (not lines[0].strip() or lines[0].strip() == doc_title(item)):
        lines.pop(0)
    return "\n".join(lines).strip()


def add_docs(kit, sheet, docs_by_name):
    for name, items in docs_by_name.items():
        for item in items:
            sheet.used.add(item["sha"])
        if name in DOC_SKIP:
            sheet.skipped[DOC_SKIP[name]].append(items[0]["paths"][0])
            continue
        if name in DOC_TEXTS:
            level, kind, title = DOC_TEXTS[name]
            body = max((body_of_doc(kit, i) for i in items), key=len)
            sheet.add_text(sheet.unique_id(f"{kind}-{slug(title)}"), level, title, SOURCE, kind, body)


def doc_body(kit, docs_by_name, name):
    items = docs_by_name.get(name, [])
    return max((body_of_doc(kit, i) for i in items), key=len) if items else ""


def add_doc_cards(kit, sheet, docs_by_name, glossary):
    def card(deck, level, swedish, english, example="", alternatives=()):
        sheet.add(
            "cards",
            {
                "id": sheet.unique_id(f"{deck}-{slug(swedish, 32)}"),
                "deck": deck,
                "level": level,
                "swedish": swedish,
                "english": english,
                "example": example,
                "alternatives": list(alternatives),
            },
        )

    for line in doc_body(kit, docs_by_name, "common slang").split("\n"):
        m = re.match(r"^(.+?)\s*=\s*(.+)$", line.strip())
        if not m:
            continue
        words = [re.sub(r"^(att|en|ett)\s+", "", w.strip(), flags=re.I) for w in m.group(1).split("/")]
        meaning = m.group(2).strip().rstrip(".")
        card("slang", 2, words[0].lower(), meaning, "", [w.lower() for w in words[1:]])

    for line in doc_body(kit, docs_by_name, "förkortningar").split("\n"):
        m = re.match(r"^(\S[^=]*?)\s*=\s*(.+)$", line.strip())
        if m:
            abbr = m.group(1).strip()
            meaning = re.sub(r"\s+(första|sista) juli\.?$", "", m.group(2).strip().rstrip("."), flags=re.I)
            card("förkortning", 2, abbr.lower() if abbr not in ("SEK", "BB", "Obs!") else abbr, meaning.lower(), "", [abbr.lower().rstrip(".") + "."])

    for line in doc_body(kit, docs_by_name, "adjektiv").split("\n"):
        m = re.match(r"^([a-zåäö]+)\s*-\s*(.+)$", line.strip())
        if m:
            sv, en = m.group(1), re.sub(r"\s+", " ", m.group(2).strip(" ,"))
            card("ord", 1, sv, en)
            glossary.add(sv, sv, en)

    for line in doc_body(kit, docs_by_name, "utseende. egenskaper").split("\n"):
        m = re.match(r"^Hon är (\w+) = (.+?)\.?$", line.strip())
        if m:
            card("beskriv", 1, m.group(1), m.group(2).replace("“", "”"), f"Hon är {m.group(1)}.")

    # "1. Att gå — to walk" followed by the three tenses with English.
    verb_doc = doc_body(kit, docs_by_name, "verb i olika former")
    for block in re.split(r"\n(?=\d+\.\s+Att )", verb_doc):
        head = re.match(r"^\d+\.\s+Att (\w+)\s+—\s+(.+)", block.strip())
        if not head:
            continue
        lemma, english = head.group(1), head.group(2).strip()
        forms = {}
        for label, key in (("present tense", "presens"), ("past tense", "preteritum"), ("present perfect", "perfekt")):
            m = re.search(rf"{label}:\s*\w+\s+(?:har\s+)?(\w+)", block)
            if m:
                forms[key] = m.group(1)
        if len(forms) == 3:
            card("verb", 1, f"{lemma} – {forms['preteritum']} – {forms['perfekt']}", english)
            glossary.add(lemma, lemma, english)
            for form in forms.values():
                glossary.add(form, lemma, english)


# ---------------------------------------------------------------- VERB.pdf

VOCAB_SECTIONS = {
    "House and Furniture Vocabulary": ("ord", 1, True),
    "Clothes and Accessories Vocabulary": ("ord", 1, True),
    "Sports Vocabulary": ("ord", 2, False),
    "Nature Vocabulary": ("ord", 2, True),
    "Useful Words": ("ord", 1, False),
    "Question Words": ("ord", 1, False),
    "Days of the Week / Veckans dagar": ("ord", 1, False),
    "Months of the Year": ("ord", 1, False),
    "Seasons": ("ord", 1, False),
    "Directions": ("ord", 2, False),
    "Colors": ("ord", 1, False),
    "Time / Tid": ("fras", 1, False),
    "Weather / Väder": ("fras", 1, False),
    "Family / Familj": ("ord", 1, False),
    "Work Vocabulary": ("ord", 2, True),
    "Food and Meals Vocabulary": ("ord", 1, True),
    "Fruits and Vegetables": ("ord", 2, True),
    "Places and Transportation Vocabulary": ("ord", 1, True),
}
SWEDISH_FIRST = {"Subject and Object Pronouns", "Prepositions"}


# VERB.pdf marks neuter nouns with "(n)"; a few marks are missing in the source.
NEUTER_FIXES = {"flygplan"}


def with_article(word, nouns):
    """"kök (n)" → "ett kök"; plain nouns get "en"; plurals and phrases stay as they are."""
    if not nouns:
        return re.sub(r"\s*\((n|pl\.)\)", "", word).strip()
    if "(pl.)" in word or " " in word.replace(" (n)", ""):
        return re.sub(r"\s*\((n|pl\.)\)", "", word).strip()
    if word.endswith("(n)") or word.strip() in NEUTER_FIXES:
        return "ett " + word.replace("(n)", "").strip()
    return "en " + word.strip()


def add_verb_pdf(kit, sheet, glossary):
    item = kit.find("Grammatik/VERB.pdf")
    for other in kit.items:
        if other["name"] in ("VERB.pdf", "Beginner Swedish  ABC.pdf"):
            sheet.used.add(other["sha"])
    layout = kit.text(item, layout=True)
    section, cards = None, 0
    for raw in layout.split("\n"):
        line = raw.strip()
        if not line or re.search(r"\|\s*P\s*a\s*g\s*e|^\d+\|Page", line):
            continue
        m = re.match(r"^Swedish (.+)$", line)
        if m and "...." not in line and not re.search(r"\s{2,}", line):
            section = m.group(1).strip()
            continue
        cells = [c.strip() for c in re.split(r"\s{2,}", line) if c.strip()]
        if section in VOCAB_SECTIONS and len(cells) % 2 == 0:
            deck, level, nouns = VOCAB_SECTIONS[section]
            for en, sv in zip(cells[0::2], cells[1::2]):
                if en.lower() in ("english", "swedish"):
                    continue
                variants = [v.strip() for v in re.split(r"\s*/\s*|,\s*", sv) if v.strip()]
                main = with_article(variants[0] + (" (n)" if sv.endswith("(n)") and not variants[0].endswith("(n)") else ""), nouns)
                alts = [with_article(v, nouns) for v in variants[1:]]
                sheet.add(
                    "cards",
                    {
                        "id": sheet.unique_id(f"{deck}-{slug(main, 32)}"),
                        "deck": deck,
                        "level": level,
                        "swedish": main,
                        "english": en[:1].lower() + en[1:] if not en[:2].isupper() else en,
                        "example": "",
                        "alternatives": alts,
                    },
                    item,
                )
                cards += 1
                for v in variants:
                    base = re.sub(r"\s*\((n|pl\.)\)", "", v).strip()
                    if " " not in base:
                        glossary.add(base, base, en)
        elif section in SWEDISH_FIRST and len(cells) % 2 == 0:
            for sv, en in zip(cells[0::2], cells[1::2]):
                base = re.sub(r"\s*\(.*?\)", "", sv).strip()
                if base and " " not in base:
                    glossary.add(base, base, en)
        elif section == "Irregular Verbs" and len(cells) in (4, 6) and cells[0] not in ("Infinitive",):
            if len(cells) == 6:
                inf, imp, pres, past, sup, english = cells
                english = "to " + english.split(",")[0].strip()
            else:
                inf, past, sup, english = cells
                pres, imp = None, None
                english = english.split("/")[0].strip()
            past = past.split(",")[0].strip()
            add_verb(sheet, inf, pres, past, sup, imp, english, 3, "oregelbundna verb", item, glossary)
    sheet.notes.append(f"VERB.pdf: {cards} vocabulary cards.")


def add_verb(sheet, inf, pres, past, sup, imp, english, level, topic, item, glossary):
    vid = slug(inf, 24)
    if pres:
        sheet.add("exercises", exercise(f"verb-{vid}-pres", level, topic, f"{inf} → presens", pres), item)
    sheet.add("exercises", exercise(f"verb-{vid}-pret", level, topic, f"{inf} → preteritum", past), item)
    sheet.add("exercises", exercise(f"verb-{vid}-sup", level, topic, f"{inf} → supinum (jag har …)", sup), item)
    if english:
        sheet.add(
            "cards",
            {
                "id": sheet.unique_id(f"verb-{vid}"),
                "deck": "verb",
                "level": level,
                "swedish": f"{inf} – {past} – {sup}",
                "english": english,
                "example": "",
                "alternatives": [inf],
            },
            item,
        )
    for form in filter(None, (inf, pres, past, sup, imp)):
        glossary.add(form.rstrip("!"), inf, english)


def exercise(eid, level, topic, prompt, answer, kind="conjugate", alternatives=(), explanation=""):
    return {
        "id": eid,
        "level": level,
        "topic": topic,
        "type": kind,
        "prompt": prompt,
        "answer": answer,
        "alternatives": list(alternatives),
        "explanation": explanation,
    }


# ---------------------------------------------------------------- Verbgrupper (rule-based forms)

SPECIAL_VERBS = {"trivs": ("trivas", "trivs", "trivdes", "trivts")}
# Regular group 3 verbs; other short verbs (gå, se, få, stå …) are irregular and come from VERB.pdf.
GROUP3 = {"bo", "ro", "tro", "sy", "må", "nå", "gro", "klä", "bre", "ske", "strö", "fly", "spå"}
TABLE_WORDS = {"infinitiv", "imperativ", "presens", "preteritum", "supinum", "futurum", "pluskvamperfekt", "perfekt", "översättning"}


def infinitive_from(imperative, group):
    if group in ("1", "3"):
        return imperative
    if re.search(r"[aeiouyåäö]m$", imperative):
        return imperative + "ma"
    return imperative + "a"


def conjugate(inf, imperative, group):
    """Regular Swedish conjugation by group. Returns (presens, preteritum, supinum)."""
    if group == "1":
        return inf + "r", inf + "de", inf + "t"
    if group == "3":
        return inf + "r", inf + "dde", inf + "tt"
    stem = imperative or inf[:-1]
    present = inf[:-1] if inf[:-1].endswith("r") else inf[:-1] + "er"
    if group == "2a":
        if stem.endswith("d"):
            return present, stem + "e", stem[:-1] + "t"
        return present, stem + "de", stem + "t"
    # 2b: voiceless stem
    if stem.endswith("t"):
        return present, stem + "te", stem + "t"
    return present, stem + "te", stem + "t"


def add_verbgrupper(kit, sheet, glossary):
    item = kit.find("Verbövningar/Verbgrupper och verbövningar.pdf")
    group, made = None, 0
    for raw in kit.text(item, layout=True).split("\n"):
        line = raw.strip()
        m = re.match(r"^Grupp (1|2a|2 a|2b|2 b|3|4)\b", line)
        if m:
            group = m.group(1).replace(" ", "")
            continue
        if re.match(r"^(Grupp 4|Verbgrupp 4|Oregelbundna|Starka verb)", line, re.I):
            group = "4"
        if group not in ("1", "2a", "2b", "3"):
            continue
        cells = [c for c in re.split(r"\s{2,}", line) if c]
        if not cells:
            continue
        imperative = cells[0].rstrip("!") if cells[0].endswith("!") else None
        inf = cells[1] if len(cells) > 1 and re.fullmatch(r"[a-zåäö]+", cells[1]) else None
        if cells[0] == "-" and len(cells) > 1:
            inf, imperative = cells[1], None
        if not imperative and not inf:
            continue
        if (imperative or "").lower() in TABLE_WORDS or (inf or "").lower() in TABLE_WORDS:
            continue
        if group == "3" and (inf or imperative) not in GROUP3:
            # The list after group 3 holds the irregular verbs, which don't follow any rule.
            group = "4"
            continue
        if imperative in SPECIAL_VERBS:
            inf, pres, past, sup = SPECIAL_VERBS[imperative]
        else:
            if not re.fullmatch(r"[a-zåäö]+", imperative or inf or ""):
                continue
            inf = inf or infinitive_from(imperative, group)
            pres, past, sup = conjugate(inf, imperative, group)
        level = 1 if group == "1" else 2
        topic = f"verbgrupp {group}"
        vid = slug(inf, 24)
        for suffix, prompt, answer in (
            ("pres", f"{inf} → presens", pres),
            ("pret", f"{inf} → preteritum", past),
            ("sup", f"{inf} → supinum (jag har …)", sup),
        ):
            sheet.add("exercises", exercise(f"vg-{vid}-{suffix}", level, topic, prompt, answer, explanation=f"Grupp {group}: {inf} – {pres} – {past} – {sup}"), item)
            made += 1
        if imperative and group != "1":
            sheet.add("exercises", exercise(f"vg-{vid}-imp", level, topic, f"{inf} → imperativ", imperative + "!", alternatives=[imperative]), item)
            made += 1
        for form in (inf, pres, past, sup):
            glossary.add(form, inf, "")
    sheet.notes.append(f"Verbgrupper: {made} conjugation exercises generated by the regular group rules.")


# ---------------------------------------------------------------- prepositions homework

def add_preposition_cloze(kit, sheet, docs_by_name):
    task = doc_body(kit, docs_by_name, "prepositioner")
    # Two docs share the name: the gap-fill (with X) and the answer sheet.
    bodies = [body_of_doc(kit, i) for i in docs_by_name.get("prepositioner", [])]
    gaps = next((b for b in bodies if " X " in b), "")
    answers = next((b for b in bodies if " X " not in b), "")
    answer_sentences = [l.strip() for l in answers.split("\n") if l.strip().endswith(".")]
    used, made = set(), 0
    for line in gaps.split("\n"):
        sentence = line.strip()
        if " X " not in sentence:
            continue
        pattern = re.compile("^" + re.escape(sentence.rstrip(".")).replace("X", r"(\S+)") + r"\.?$")
        hits = [(i, pattern.match(a)) for i, a in enumerate(answer_sentences)]
        hits = [(i, m.group(1)) for i, m in hits if m]
        if not hits:
            continue
        fresh = [h for h in hits if h[0] not in used] or hits
        used.add(fresh[0][0])
        words = sorted({w for _, w in hits})
        main = fresh[0][1]
        sheet.add(
            "exercises",
            exercise(
                f"prep-{short_hash(sentence)}",
                1,
                "prepositioner",
                sentence.replace("X", "___"),
                main,
                kind="cloze",
                alternatives=[w for w in words if w != main],
            ),
        )
        made += 1
    sheet.notes.append(f"Prepositions: {made} gap-fill sentences, answers from the kit's answer sheet.")
    return task


# ---------------------------------------------------------------- long texts

def add_culture_essays(kit, sheet, glossary_local):
    """28 essays: heading "N. Title", prose, a numbered glossary ("Ord (klass) - förklaring"), discussion questions."""
    item = kit.find("Svenskt Språk & Kultur.pdf")
    lines = [l.rstrip() for l in kit.text(item).replace("\f", "\n").split("\n")]
    essays, current, expected = [], None, 1
    for i, line in enumerate(lines):
        s_ = line.strip()
        m = re.match(r"^(\d{1,2})\.\s+(.+)$", s_)
        nxt = next((l.strip() for l in lines[i + 1 :] if l.strip()), "")
        # The PDF's own numbering skips and repeats a few numbers, so allow a little slack.
        close = m is not None and expected - 1 <= int(m.group(1)) <= expected + 2
        after_glossary = current is None or bool(current["glossary"] or current["questions"]) or len("".join(current["prose"])) > 1500
        if m and close and after_glossary and len(m.group(2)) < 60 and " - " not in s_ and not s_.endswith("?") and not re.match(r"^\d", nxt):
            current = {"title": m.group(2).strip(), "prose": [], "glossary": [], "questions": []}
            essays.append(current)
            expected = int(m.group(1)) + 1
            continue
        if current is None or not s_:
            if current is not None:
                current["prose"].append("")
            continue
        s_ = s_.replace("\u200b", "")
        g = re.match(r"^\d{1,2}\.\s+(.+?)\s*(?:\((\w+)\))?\s+-\s+(.+)$", s_)
        bullet = re.match(r"^[●•]\s*([^:]{2,40}):\s+(.+)$", s_)
        q = re.match(r"^\d{1,2}\.\s+(.+)$", s_)
        if re.match(r"^Diskussionsfrågor", s_):
            current["in_questions"] = True
        elif g:
            current["glossary"].append([g.group(1), g.group(2) or "", g.group(3)])
        elif bullet and len(bullet.group(1).split()) <= 4:
            current["glossary"].append([bullet.group(1), "", bullet.group(2)])
        elif q and (current["glossary"] or current.get("in_questions")):
            current["questions"].append(q.group(1))
        elif current["questions"]:
            current["questions"][-1] += " " + s_
        elif current["glossary"] and (not current["glossary"][-1][2].rstrip().endswith(".") or s_[:1].islower()):
            current["glossary"][-1][2] += " " + s_
        else:
            current["prose"].append(line)
    for essay in essays:
        title = essay["title"]
        text_id = sheet.unique_id(f"kultur-{slug(title)}")
        sheet.add_text(text_id, 4, title, "Svenskt språk & kultur", "essä", clean_prose("\n".join(essay["prose"])), item)
        for word, cls, definition in essay["glossary"]:
            word, definition = word.strip(), definition.strip()
            glossary_local.append({"text_id": text_id, "form": word.lower(), "lemma": word.lower(), "english": f"({cls}) {definition}" if cls else definition})
            if " " not in word:
                sheet.add(
                    "cards",
                    {
                        "id": sheet.unique_id(f"ord-{slug(word, 32)}"),
                        "deck": "ord",
                        "level": 4,
                        "swedish": word.lower(),
                        "english": definition,
                        "example": "",
                        "alternatives": [],
                    },
                )
        if essay["questions"]:
            sheet.add(
                "prompts",
                {
                    "id": f"diskutera-{slug(title, 40)}",
                    "level": 4,
                    "title": f"Diskutera: {title}",
                    "task": f"Läs texten ”{title}” i Läs. Välj två av frågorna och skriv vad du tycker.",
                    "hints": essay["questions"],
                    "checklist": [],
                },
            )
    sheet.notes.append(f"Svenskt språk & kultur: {len(essays)} essays.")


def split_by_titles(text, titles):
    """Splits running text at each heading in `titles` (taken from the table of contents)."""
    positions = []
    start = 0
    for title in titles:
        m = re.search(r"(?m)^\s*" + re.escape(title) + r"\s*$", text[start:])
        if m:
            positions.append((start + m.start(), title))
            start = start + m.end()
    chunks = []
    for (pos, title), nxt in zip(positions, positions[1:] + [(len(text), None)]):
        chunks.append((title, text[pos + len(title) : nxt[0]].strip()))
    return chunks


def toc_titles(text, pattern):
    return [re.sub(r"\s+", " ", m.group(1)).strip() for m in re.finditer(pattern, text)]


def add_sverige_i_fokus(kit, sheet):
    item = kit.find("Sverige i Fokus.pdf")
    text = kit.text(item).replace("\f", "\n")
    titles = toc_titles(text[:6000], r"(?m)^\s*([A-ZÅÄÖ][^\n.]{2,70}?)\s*\.{4,}\s*\d+\s*$")
    body = text[text.find(titles[-1]) + len(titles[-1]) :] if titles else text
    chunks = split_by_titles(body, titles[1:]) if titles else []
    count = 0
    for title, chunk in chunks:
        prose = clean_prose(chunk)
        if len(prose) < 300:
            continue
        sheet.add_text(sheet.unique_id(f"fokus-{slug(title)}"), 4, title, "Sverige i fokus (medborgarskap)", "samhälle", prose, item)
        count += 1
    sheet.notes.append(f"Sverige i fokus: {count} sections.")
    if not count:
        sheet.skip("Couldn't split into sections", item)


def add_dags_att_rosta(kit, sheet):
    item = kit.find("DAGS ATT RÖSTA.pdf")
    text = kit.text(item).replace("\f", "\n")
    toc_start = text.find("Innehåll")
    toc = text[toc_start : toc_start + 4000]
    titles = [t for t in toc_titles(toc, r"(?m)^\s*([A-ZÅÄÖ][^\n\d]{3,60}?)\s+\d{1,3}\s*$") if t != "Innehåll"]
    body = text[toc_start + len(toc) // 2 :]
    chunks = split_by_titles(body, titles)
    count = 0
    for title, chunk in chunks:
        prose = clean_prose(chunk)
        if len(prose) < 200:
            continue
        sheet.add_text(sheet.unique_id(f"val-{slug(title)}"), 3, title, "Dags att rösta – 8 Sidor", "lättläst", prose, item)
        count += 1
    sheet.notes.append(f"Dags att rösta: {count} chapters.")


def add_novels(kit, sheet):
    item = kit.find("Hundraåringen_som_klev_ut_genom_fönstret_och_försvann_by_Jonas_Jonasson.pdf")
    text = kit.text(item).replace("\f", "\n")
    parts = re.split(r"\n\s*(?=Kapitel \d+)", text)
    count = 0
    for part in parts[1:]:
        m = re.match(r"^(Kapitel (\d+))[^\n]*\n(.*)$", part.strip(), re.S)
        if not m:
            continue
        sheet.add_text(
            f"hundraaringen-{int(m.group(2)):02d}",
            5,
            f"Hundraåringen – kapitel {m.group(2)}",
            "Jonas Jonasson: Hundraåringen som klev ut genom fönstret och försvann",
            "roman",
            clean_prose(m.group(3)),
            item,
        )
        count += 1
    item2 = kit.find("Det_goda_inom_dig_by_Olsson__Linda_(z-lib.org).pdf")
    text2 = kit.text(item2).replace("\f", "\n")
    parts2 = re.split(r"\n\s*(?=\d{1,2}\.\s*\n)", text2)
    count2 = 0
    for part in parts2[1:]:
        m = re.match(r"^(\d{1,2})\.\s*\n(.*)$", part.strip(), re.S)
        if not m or len(m.group(2)) < 1500:
            continue
        sheet.add_text(
            f"det-goda-{int(m.group(1)):02d}",
            5,
            f"Det goda inom dig – kapitel {m.group(1)}",
            "Linda Olsson: Det goda inom dig",
            "roman",
            clean_prose(m.group(2)),
            item2,
        )
        count2 += 1
    sheet.notes.append(f"Novels: Hundraåringen {count} chapters, Det goda inom dig {count2} chapters.")


def add_small_pdfs(kit, sheet):
    for name, level, kind, title in [
        ("Komplimanger.docx.pdf", 2, "dialog", "Komplimanger"),
        ("ORDKLASSER.pdf", 2, "grammatik", "Ordklasser"),
    ]:
        item = kit.find(name)
        sheet.add_text(sheet.unique_id(f"{kind}-{slug(title)}"), level, title, SOURCE, kind, clean_prose(kit.text(item)), item)
    item = kit.find("Exempel-på-sambandsmarkörer.pdf")
    # Shown in Skriv as the linking-words helper.
    sheet.add_text("samband", 1, "Sambandsord", SOURCE, "hjälp", clean_prose(kit.text(item)), item)


def add_textbook(kit, sheet, name, level, title, source, pages_per_text=4):
    """Scanned textbooks: OCR'd pages grouped into short readings; poor pages are left out."""
    item = kit.find(name)
    pages = kit.text(item).split("\f")
    good, chunk_no, kept = [], 0, 0
    for i, page in enumerate(pages, start=1):
        cleaned = clean_ocr(page)
        words = re.findall(r"[A-Za-zÅÄÖåäö]{2,}", cleaned)
        if len(words) < 40:
            continue
        good.append((i, cleaned))
        if len(good) == pages_per_text:
            chunk_no += 1
            first, last = good[0][0], good[-1][0]
            sheet.add_text(f"{slug(title)}-{chunk_no:02d}", level, f"{title}, s. {first}–{last}", source, "lärobok", "\n\n".join(p for _, p in good), item)
            kept += len(good)
            good = []
    if good:
        chunk_no += 1
        sheet.add_text(f"{slug(title)}-{chunk_no:02d}", level, f"{title}, s. {good[0][0]}–{good[-1][0]}", source, "lärobok", "\n\n".join(p for _, p in good), item)
        kept += len(good)
    sheet.notes.append(f"{title}: {kept} of {len(pages)} scanned pages kept (OCR confidence {item['meta'].get('confidence')}%).")


def add_np_lasa(kit, sheet):
    for name, title in [("Kurs B/np-lasa.pdf", "Nationella provet: läsa (exempel)")]:
        item = kit.find(name)
        sheet.add_text(sheet.unique_id(f"np-{slug(title)}"), 3, title, "Nationella provet sfi", "läsförståelse", clean_prose(kit.text(item)), item)
    other = kit.find("Exempel på Nationella Provet B-C-D/Nationella provet-läsa.pdf")
    sheet.add_text("np-lasa-bcd", 3, "Nationella provet: läsa (kurs B–D)", "Nationella provet sfi", "läsförståelse", clean_prose(kit.text(other)), other)


# ---------------------------------------------------------------- questions and prompts

def add_horseln_questions(kit, sheet, docs_by_name):
    body = doc_body(kit, docs_by_name, "hörseln frågor")
    text_id = next((r["id"] for r in sheet.rows["texts"] if r["title"] == "Hörseln"), None)
    if not text_id:
        return
    blocks = re.split(r"\n\s*\n(?=[A-ZÅÄÖ][^\n]*\?\s*\n)", "\n" + body)
    for block in blocks:
        lines = [l.strip() for l in block.strip().split("\n") if l.strip()]
        if not lines or not lines[0].endswith("?"):
            continue
        options = [re.sub(r"^[A-D]\s+", "", l) for l in lines[1:] if re.match(r"^[A-D]\s+", l)]
        if options:
            sheet.add("questions", {"text_id": text_id, "question": lines[0], "options": options, "answer": ""})


PROMPTS = [
    # (id, level, title, task, hints)
    ("semester", 2, "En semesterresa", "Skriv om en semesterresa du har gjort: vart, när och vad du gjorde. Ett par stycken räcker.", ["Börja med när och vart du reste", "Berätta om två eller tre saker du gjorde", "Avsluta med vad du tyckte om resan"]),
    ("forsta-motet", 1, "Två personer träffas", "Skriv en dialog mellan två personer som träffas för första gången.", ["Hälsa och presentera er", "Var bor ni och vad jobbar ni med?", "Familj och fritidsintressen"]),
    ("recept", 2, "Ett recept", "Skriv ett recept på en fruktsallad eller din favoriträtt.", ["Ingredienser", "Först … sedan … till sist …"]),
    ("beundrar", 2, "En person du beundrar", "Skriv om en person du beundrar. Vem är det och varför?", ["Hur ser personen ut?", "Vad har personen gjort?", "Varför beundrar du hen?"]),
    ("hit-dit", 2, "Hit, här, dit, där", "Skriv en kort text där du använder hit – här, dit – där, hem – hemma och härifrån.", ["Hit/dit/hem: rörelse", "Här/där/hemma: befintlighet"]),
    ("bocker", 2, "Du och böcker", "Skriv om dig och läsning.", ["Vilka böcker läser du? Var och när läser du?", "Lyssnar du på e-böcker? Går du till biblioteket?", "Vilken bok tycker du att alla ska läsa?", "Vilka är dina favoritförfattare?"]),
    ("jag-tycker", 1, "Jag tycker att det är …", "Skriv fem meningar om vad du tycker är roligt, tråkigt, dyrt, spännande eller intressant – och varför.", ["Jag tycker att det är roligt att … därför att …", "Det är dyrt att …"]),
    ("vanliga-verb", 1, "De vanligaste verben", "Skriv tio meningar med några av de vanligaste verben: vara, ha, göra, gå, säga, få, se, ta, komma, kunna, äta, dricka, läsa, bo, känna, vilja, ge, sitta.", ["Skriv om vad du brukar göra och tycker om att göra"]),
    ("adjektiv", 1, "En text med adjektiv", "Skriv en kort text om din dag eller ditt hem och använd minst fem adjektiv (t.ex. varm, lugn, stor, billig, ren).", ["Adjektivet böjs: en varm dag, ett varmt rum, varma dagar"]),
    ("undvik-valdigt", 3, "Undvik ”väldigt”", "Skriv en kort text om en dag som inte blev som du tänkt dig. Använd inte ordet ”väldigt” – välj starkare ord (förbannad, livrädd, jättegammal …).", ["arg → förbannad, ilsken, rasande", "rädd, gammal, smutsig, vacker, stor, kall …"]),
    ("brev-van", 3, "Ett brev till en vän", "Skriv ett brev till en vän och berätta om en resa du har gjort.", ["Berätta vart du reste och vad du gjorde", "Vad var bra och vad var inte bra med resan?", "Tänk på hur du börjar och slutar brevet"]),
    ("insandare", 4, "Svara på en insändare", "Dennis skriver i tidningen: ”Förbjud mobiltelefoner! Folk pratar i mobilen överallt – i bussen, i skolan, i affärer.” Skriv ett svar till tidningen. Håller du med Dennis?", ["Ska man förbjuda mobiltelefoner i skolan och på allmänna platser?", "Finns det andra tillfällen då det borde vara förbjudet?", "Fördelar och nackdelar med att ha mobilen med sig överallt", "Inled och avsluta insändaren på ett passande sätt"]),
    ("bra-pa", 2, "Något du är bra på", "Berätta om något som du är bra på eller duktig på.", ["Vad är det du vet att du kan?", "Har du alltid varit bra på det?", "Hur lärde du dig det?"]),
    ("ode-o", 2, "Fem saker på en öde ö", "Du och en kompis måste simma till en öde ö och får bara ta med en låda med fem saker. Vilka fem saker tar ni med – och varför?", ["Först … sedan … eftersom …"]),
    ("uppfinningar", 3, "Viktiga uppfinningar", "Vilka fem uppfinningar är viktigast för dig – och för världen? Rangordna dem och motivera varför.", ["Den viktigaste är … eftersom …", "Utan … skulle vi inte kunna …"]),
    ("fordomar", 3, "Fördomar om Sverige", "Välj tre fördomar om Sverige (t.ex. att det alltid är kallt, att svenskar är tysta). Finns det någon sanning i dem? Vad tycker du?", ["Jag tycker att … stämmer, men …", "Enligt min erfarenhet …"]),
    ("inbjudan", 2, "Svara på en inbjudan", "En kompis har bjudit dig på fest för att fira att hen är klar med sin utbildning. Skriv ett mejl och svara.", ["Tacka för inbjudan", "Kommer du? Om inte – varför?", "Fråga något om festen"]),
    ("fler-detaljer", 2, "Fler detaljer", "Skriv om de här meningarna med fler detaljer: ”Jag slutade skolan. Sedan var jag på biblioteket.” Skriv sedan fem egna meningar om din dag – med detaljer.", ["När? Hur? Med vem? Varför?", "Exempel: Jag slutade skolan klockan fyra. Sedan cyklade jag till biblioteket och lånade två böcker."]),
]

ACTIVITY_PROMPTS_FROM = "tell ask describe and compare activities and things_"


def add_prompts(kit, sheet, docs_by_name):
    for pid, level, title, task, hints in PROMPTS:
        sheet.add("prompts", {"id": pid, "level": level, "title": title, "task": task, "hints": hints, "checklist": []})
    for line in doc_body(kit, docs_by_name, ACTIVITY_PROMPTS_FROM).split("\n"):
        topic = line.strip(" ·•").strip()
        if len(topic) < 8:
            continue
        level = 2 if topic.startswith(("Berätta", "Beskriva", "Prata")) else 3
        sheet.add("prompts", {"id": f"uppgift-{slug(topic, 40)}", "level": level, "title": topic, "task": f"{topic}. Skriv minst fem meningar.", "hints": [], "checklist": []})
    # Writing tasks that came from these docs and images are now prompts.
    for name in ("hemläxa", "write about a holiday trip", "bokfokus", "jag tycker att det är.._", "olika verb att göra meningar med", "verb i meningar", "very", ACTIVITY_PROMPTS_FROM, "hörseln frågor", "prepositioner"):
        for item in docs_by_name.get(name, []):
            sheet.used.add(item["sha"])
    for item in kit.items:
        if norm_name(item["name"]) in (
            "berätta om något du är bra på", "vad är du bra eller duktig på", "öde ö - vad tar du med dig", "uppfinningar - frågor",
            "mejl till en kompis", "meningar med mer delaljer", "skriv om meningar",
        ):
            sheet.used.add(item["sha"])
    for name in ("np-skriva.pdf",):
        for item in kit.items:
            if item["name"] == name:
                sheet.used.add(item["sha"])


# ---------------------------------------------------------------- glossary

class Glossary:
    def __init__(self):
        self.entries = {}

    def add(self, form, lemma, english):
        form = form.strip().lower()
        if not form or " " in form or len(form) < 2:
            return
        current = self.entries.get(form)
        if current is None or (not current[1] and english):
            self.entries[form] = (lemma.strip().lower(), english.strip())

    def rows(self):
        return [{"text_id": "", "form": f, "lemma": l, "english": e} for f, (l, e) in sorted(self.entries.items())]


# ---------------------------------------------------------------- report

def write_report(kit, sheet, path):
    counts = {tab: len(rows) for tab, rows in sheet.rows.items()}
    text_ids = {r["id"] for r in sheet.rows["texts"]}
    by_kind = Counter()
    by_level = Counter()
    seen = set()
    for r in sheet.rows["texts"]:
        if r["id"] in seen:
            continue
        seen.add(r["id"])
        by_kind[r["kind"]] += 1
        by_level[r["level"]] += 1
    unused = [i for i in kit.items if i["sha"] not in sheet.used]
    lines = ["# Swedish Kit → Prata Sheet: import report", ""]
    lines.append(f"{sum(len(i['paths']) for i in kit.items)} files in the kit, {len(kit.items)} after removing exact duplicates.")
    lines.append("")
    lines.append("## Rows per tab")
    lines.append("")
    lines.append("| Tab | Rows |")
    lines.append("| --- | --- |")
    for tab, n in counts.items():
        extra = f" ({len(text_ids)} texts)" if tab == "texts" else ""
        lines.append(f"| {tab} | {n}{extra} |")
    lines.append("")
    lines.append("Texts by kind: " + ", ".join(f"{k} {v}" for k, v in by_kind.most_common()))
    lines.append("")
    lines.append("Texts by level: " + ", ".join(f"{k}: {v}" for k, v in sorted(by_level.items())))
    tests = Counter(r["test_id"] for r in sheet.rows["tests"])
    lines.append("")
    lines.append("Tests: " + ", ".join(f"{k} ({v} questions)" for k, v in sorted(tests.items())))
    lines.append("")
    lines.append("## Notes")
    lines.append("")
    for note in sheet.notes:
        if "skipped" in note and note.startswith(("Rivstart 1.", "Rivstart 2.", "Rivstart 3.", "Rivstart 4.", "Rivstart 5.", "Rivstart 6.", "Berlitz")) and ":" in note.split(" ")[1]:
            continue
        lines.append(f"- {note}")
    lines.append("")
    lines.append("## Not imported")
    lines.append("")
    for reason, paths in sorted(sheet.skipped.items()):
        lines.append(f"### {reason} ({len(paths)})")
        for p in sorted(paths):
            lines.append(f"- {p}")
        lines.append("")
    lines.append(f"### Not used by any rule ({len(unused)})")
    lines.append("")
    lines.append("Mostly worksheet photos without answer keys, whose OCR is too noisy to split into exercises.")
    lines.append("")
    for item in sorted(unused, key=lambda i: i["paths"][0]):
        conf = item["meta"].get("confidence")
        lines.append(f"- {item['paths'][0]}" + (f" (OCR {conf}%)" if conf is not None else ""))
    lines.append("")
    lines.append("## Worth checking by hand")
    lines.append("")
    lines.append("- Lesson pages and reference images are OCR'd; spot-check a few against the screenshots.")
    lines.append("- Questions for 'Hörseln' and the Tisus/np texts have no answer key in the kit; add answers in the `questions` tab if you know them.")
    lines.append("- Verbgrupper conjugations are generated from the regular group rules — check any verb that looks odd.")
    lines.append("- Noun articles (en/ett) on the VERB.pdf word cards follow that PDF's (n) markers, which miss a few neuter nouns.")
    lines.append("- Tap-to-translate only covers words that appear in the kit's own word lists. A full dictionary (Folkets lexikon) would cover every word.")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    data_dir, out = sys.argv[1], sys.argv[2]
    kit = Kit(data_dir)
    sheet = Sheet()
    glossary = Glossary()
    local_glossary = []

    tests_parse.add_lund(kit, sheet)
    tests_parse.add_berlitz(kit, sheet, os.path.join(data_dir, "berlitz"))
    rivstart.add_rivstart(kit, sheet)

    docs_by_name = docs(kit)
    add_docs(kit, sheet, docs_by_name)
    add_doc_cards(kit, sheet, docs_by_name, glossary)
    add_preposition_cloze(kit, sheet, docs_by_name)
    add_horseln_questions(kit, sheet, docs_by_name)
    add_prompts(kit, sheet, docs_by_name)

    add_verb_pdf(kit, sheet, glossary)
    add_verbgrupper(kit, sheet, glossary)

    add_lessons(kit, sheet)
    add_reference_images(kit, sheet)
    add_small_pdfs(kit, sheet)
    add_culture_essays(kit, sheet, local_glossary)
    add_sverige_i_fokus(kit, sheet)
    add_dags_att_rosta(kit, sheet)
    add_np_lasa(kit, sheet)
    add_novels(kit, sheet)
    if kit.find("Mål 1 Lärobok och övningar.pdf")["meta"]:
        add_textbook(kit, sheet, "Mål 1 Lärobok och övningar.pdf", 1, "Mål 1", "Mål 1 – lärobok och övningar")
    if kit.find("Eckerbom Torun, Källsäter Eva. - På tapeten.pdf")["meta"]:
        add_textbook(kit, sheet, "Eckerbom Torun, Källsäter Eva. - På tapeten.pdf", 4, "På tapeten", "Eckerbom & Källsäter: På tapeten")

    sheet.rows["glossary"] = local_glossary + glossary.rows()
    # Exercise ids must be unique: drop exact repeats (e.g. a verb in two sources).
    seen, exercises = set(), []
    for row in sheet.rows["exercises"]:
        if row["id"] in seen:
            continue
        seen.add(row["id"])
        exercises.append(row)
    sheet.rows["exercises"] = exercises

    for name, reason in [
        ("Svenska skrivregler.pdf", "Reference book (Språkrådet's style guide), not reading practice"),
        ("progress tree.pdf", "Picture without text"),
        ("AI Kenneth.mp4", "Video"),
        ("250 Vanliga svenska ord.pdf", "Word list without translations (needs a dictionary)"),
        ("idiomer.pdf", "Idiom list without explanations"),
        ("Small talk all Questions.pdf", "Text layer has lost å/ä/ö"),
        ("Reflexiva Possessiva pronomen.pdf", "Worksheet without answers"),
        ("np-tala.pdf", "Speaking test"),
    ]:
        for item in kit.items:
            if item["name"] == name:
                sheet.skip(reason, item)

    write_xlsx(sheet, out)
    write_report(kit, sheet, os.path.splitext(out)[0] + ".report.md")
    print({tab: len(rows) for tab, rows in sheet.rows.items()})


if __name__ == "__main__":
    main()
