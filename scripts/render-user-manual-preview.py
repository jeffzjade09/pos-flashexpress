from __future__ import annotations

from html import escape
from pathlib import Path

from docx import Document
from docx.table import Table
from docx.text.paragraph import Paragraph


ROOT = Path(__file__).resolve().parents[1]
DOCX = ROOT / "docs" / "FlashPOS-User-Manual.docx"
OUT = ROOT / ".artifacts" / "manual-preview.html"
NUM_KIND: dict[int, str] = {}
NUM_COUNTS: dict[int, int] = {}


def iter_blocks(doc):
    for child in doc.element.body.iterchildren():
        if child.tag.endswith("}p"):
            yield Paragraph(child, doc)
        elif child.tag.endswith("}tbl"):
            yield Table(child, doc)


def paragraph_html(p: Paragraph) -> str:
    xml = p._p.xml
    page_class = " new-page" if p.paragraph_format.page_break_before is True else ""
    if 'w:type="page"' in xml:
        before = escape(p.text.strip())
        return (f"<p>{before}</p>" if before else "") + '<div class="page-break"></div>'
    text = escape(p.text).replace("\n", "<br>")
    if not text:
        return '<div class="spacer"></div>'
    style = p.style.name if p.style else "Normal"
    if style == "Title":
        return f"<h1 class=\"cover-title{page_class}\">{text}</h1>"
    if style == "Subtitle":
        return f"<p class=\"subtitle\">{text}</p>"
    if style.startswith("Heading 1"):
        return f"<h1 class=\"{page_class.strip()}\">{text}</h1>"
    if style.startswith("Heading 2"):
        return f"<h2>{text}</h2>"
    if style.startswith("Heading 3"):
        return f"<h3>{text}</h3>"
    if "w:numPr" in xml and p._p.pPr.numPr.numId is not None:
        num_id = int(p._p.pPr.numPr.numId.val)
        cls = NUM_KIND.get(num_id, "numbered")
        NUM_COUNTS[num_id] = NUM_COUNTS.get(num_id, 0) + 1
        marker = "•" if cls == "bullet" else f"{NUM_COUNTS[num_id]}."
        return f"<p class=\"list\"><b>{marker}</b> {text}</p>"
    return f"<p>{text}</p>"


def table_html(table: Table) -> str:
    rows = []
    for ridx, row in enumerate(table.rows):
        cells = []
        for cell in row.cells:
            text = "<br>".join(escape(p.text) for p in cell.paragraphs)
            tag = "th" if ridx == 0 and len(table.rows) > 1 else "td"
            cells.append(f"<{tag}>{text}</{tag}>")
        rows.append("<tr>" + "".join(cells) + "</tr>")
    cls = "callout" if len(table.rows) == 1 and len(table.columns) == 1 else ""
    return f'<table class="{cls}">' + "".join(rows) + "</table>"


def main() -> None:
    doc = Document(DOCX)
    numbering = doc.part.numbering_part.element
    abstracts = {}
    for abstract in numbering.findall("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}abstractNum"):
        abstract_id = int(abstract.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}abstractNumId"))
        fmt = abstract.find(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}numFmt")
        abstracts[abstract_id] = "bullet" if fmt is not None and fmt.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val") == "bullet" else "numbered"
    for num in numbering.findall("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}num"):
        num_id = int(num.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}numId"))
        abstract_ref = num.find("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}abstractNumId")
        if abstract_ref is not None:
            NUM_KIND[num_id] = abstracts.get(int(abstract_ref.get("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val")), "numbered")
    body = []
    for block in iter_blocks(doc):
        body.append(paragraph_html(block) if isinstance(block, Paragraph) else table_html(block))
    html = """<!doctype html>
<html><head><meta charset="utf-8"><title>FlashPOS User Manual proof</title>
<style>
@page { size: Letter; margin: .78in 1in .72in; }
* { box-sizing: border-box; }
body { margin: 0; color: #17251f; font-family: Calibri, Arial, sans-serif; font-size: 10.5pt; line-height: 1.18; }
p { margin: 0 0 6pt; }
h1 { color: #0f6b4f; font-size: 17pt; margin: 18pt 0 9pt; break-after: avoid; }
h2 { color: #0f6b4f; font-size: 13pt; margin: 13pt 0 6pt; break-after: avoid; }
h3 { color: #1f4d78; font-size: 11.5pt; margin: 9pt 0 4pt; break-after: avoid; }
.cover-title { font-size: 30pt; margin: 72pt 0 12pt; line-height: 1.05; }
.subtitle { color: #61706a; font-size: 14pt; margin-bottom: 28pt; }
.page-break { break-after: page; height: 0; }
.new-page { break-before: page; }
.spacer { height: 5pt; }
.list { margin-left: 22pt; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 3pt 0 8pt; break-inside: auto; font-size: 9pt; }
tr { break-inside: avoid; }
th, td { border: 1px solid #d7e1dc; padding: 5pt 7pt; text-align: left; vertical-align: middle; overflow-wrap: anywhere; }
th { background: #e8eef5; color: #0f6b4f; font-weight: 700; }
.callout td { background: #e9f4ef; border-color: #cbded5; padding: 9pt 11pt; }
</style></head><body>""" + "".join(body) + "</body></html>"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(OUT)


if __name__ == "__main__":
    main()
