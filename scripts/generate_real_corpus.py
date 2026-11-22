#!/usr/bin/env python3
"""Generate ORIGINAL, license-clear academic inputs with actual document authoring libraries.

No user data or online document corpus is used. This is deterministic functional
regression coverage, not representative manual testing of externally authored files.
Requires python-docx, python-pptx, Pillow and reportlab (test-only dependencies).
"""
from __future__ import annotations
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED, ZIP_STORED
from xml.sax.saxutils import escape
import hashlib
import json

from docx import Document
from docx.shared import Inches as WordInches
from pptx import Presentation
from pptx.util import Inches, Pt
from PIL import Image, ImageDraw
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parents[1] / "quality" / "generated"
ROOT.mkdir(parents=True, exist_ok=True)

def picture() -> Path:
    file = ROOT / "academic-figure.png"
    im = Image.new("RGB", (320, 180), "white")
    draw = ImageDraw.Draw(im)
    draw.rectangle((10, 15, 310, 165), outline="#306c57", width=4)
    draw.ellipse((80, 38, 235, 145), outline="#306c57", width=5)
    draw.text((100, 75), "CELL", fill="#1c4336")
    im.save(file)
    return file

def make_docx(figure: Path) -> None:
    doc = Document()
    doc.add_heading("Molecular Biology Workbook", level=1)
    doc.add_paragraph("This original lesson introduces cellular metabolism and study skills.")
    doc.add_heading("Cell structure", level=2)
    doc.add_paragraph("Mitochondria convert fuel into usable cellular energy.")
    table = doc.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Organelle"
    table.rows[0].cells[1].text = "Function"
    for organelle, description in [
        ("Mitochondria", "Energy conversion"),
        ("Ribosome", "Protein synthesis"),
        ("Nucleus", "Genetic information"),
    ]:
        row = table.add_row().cells
        row[0].text, row[1].text = organelle, description
    doc.add_paragraph("A cell diagram follows.")
    image = doc.add_picture(str(figure), width=WordInches(2.5))
    image._inline.docPr.set("descr", "Diagram showing a labeled schematic cell outline")
    doc.add_heading("Summary", level=2)
    doc.add_paragraph("Students compare organelle functions using accessible tables.")
    doc.save(ROOT / "molecular-biology.docx")

def make_pptx(figure: Path) -> None:
    presentation = Presentation()
    first = presentation.slides.add_slide(presentation.slide_layouts[1])
    first.shapes.title.text = "Accessible Science Lecture"
    first.placeholders[1].text = "Learning outcomes:\nExplain cell structure\nCompare energy pathways"
    second = presentation.slides.add_slide(presentation.slide_layouts[1])
    second.shapes.title.text = "Cell Metabolism Case Study"
    second.placeholders[1].text = "A practical lab exercise about cellular ATP."
    second.shapes.add_picture(str(figure), Inches(6.8), Inches(1.65), width=Inches(2.2))
    presentation.save(ROOT / "science-lecture.pptx")

def make_xlsx() -> None:
    # Complete minimal OOXML workbook, including content-types and relationship
    # manifests, unlike the bare XML-in-ZIP stubs in the fast unit-test fixtures.
    ct = ('<?xml version="1.0" encoding="UTF-8"?>'
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
          '<Default Extension="xml" ContentType="application/xml"/>'
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
          '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
          '</Types>')
    root_rel = ('<?xml version="1.0"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>')
    workbook = ('<?xml version="1.0"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Assessment Results" sheetId="1" r:id="rId2"/>'
        '<sheet name="Lab Attendance" sheetId="2" r:id="rId1"/></sheets></workbook>')
    rels = ('<?xml version="1.0"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '</Relationships>')
    def row(number, cells):
        return '<row r="%d">%s</row>' % (number, ''.join(cells))
    def string(ref, value):
        return '<c r="%s" t="inlineStr"><is><t>%s</t></is></c>' % (ref, escape(value))
    def number(ref, value):
        return '<c r="%s"><v>%s</v></c>' % (ref, value)
    assessment = [
        row(1, [string("A1", "Learner"), string("B1", "Score")]),
        row(2, [string("A2", "Amara"), number("B2", 88)]),
        row(3, [string("A3", "Noah"), number("B3", 92)]),
        row(4, [string("A4", "Mean score"),
                '<c r="B4"><f>AVERAGE(B2:B3)</f><v>90</v></c>']),
    ]
    attendance = [
        row(1, [string("A1", "Practical"), string("B1", "Present")]),
        row(2, [string("A2", "Microscopy"), string("B2", "Yes")]),
        row(3, [string("A3", "Titration"), string("B3", "No")]),
    ]
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    worksheet = lambda rows: ('<?xml version="1.0"?>'
                               '<worksheet xmlns="%s"><sheetData>%s</sheetData></worksheet>') % (ns, ''.join(rows))
    styles = ('<?xml version="1.0"?>'
              '<styleSheet xmlns="%s"><fonts count="1"><font><sz val="11"/></font></fonts>'
              '<fills count="1"><fill><patternFill patternType="none"/></fill></fills>'
              '<borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs>'
              '<cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>') % ns
    with ZipFile(ROOT / "assessment.xlsx", "w", ZIP_DEFLATED) as zipfile:
        for filename, content in {
            "[Content_Types].xml": ct,
            "_rels/.rels": root_rel,
            "xl/workbook.xml": workbook,
            "xl/_rels/workbook.xml.rels": rels,
            "xl/worksheets/sheet1.xml": worksheet(assessment),
            "xl/worksheets/sheet2.xml": worksheet(attendance),
            "xl/styles.xml": styles,
        }.items():
            zipfile.writestr(filename, content)

def make_epub() -> None:
    container = ('<?xml version="1.0" encoding="UTF-8"?>'
                 '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
                 '<rootfiles><rootfile full-path="EPUB/book.opf" media-type="application/oebps-package+xml"/>'
                 '</rootfiles></container>')
    opf = ('<?xml version="1.0" encoding="UTF-8"?>'
           '<package version="3.0" unique-identifier="uid" xmlns="http://www.idpf.org/2007/opf">'
           '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
           '<dc:identifier id="uid">courseaccess-original-corpus-2026</dc:identifier>'
           '<dc:title>Inclusive Biology Reader</dc:title><dc:language>en</dc:language></metadata>'
           '<manifest>'
           '<item id="intro" href="chapter-intro.xhtml" media-type="application/xhtml+xml"/>'
           '<item id="lesson" href="chapter-lesson.xhtml" media-type="application/xhtml+xml"/>'
           '</manifest><spine><itemref idref="intro"/><itemref idref="lesson"/></spine></package>')
    intro = ('<?xml version="1.0" encoding="UTF-8"?>'
             '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Introduction</title></head>'
             '<body><main><h2>Accessible Book Introduction</h2>'
             '<p>Teaching laboratory techniques begins with clear explanations.</p>'
             '</main></body></html>')
    lesson = ('<?xml version="1.0" encoding="UTF-8"?>'
              '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Cellular pathways</title></head>'
              '<body><main><h2>Cellular Pathways Chapter</h2>'
              '<table><tr><th>Pathway</th><th>Purpose</th></tr>'
              '<tr><td>Glycolysis</td><td>Energy release</td></tr></table>'
              '</main></body></html>')
    with ZipFile(ROOT / "biology-reader.epub", "w") as z:
        z.writestr("mimetype", "application/epub+zip", compress_type=ZIP_STORED)
        for filename, content in {
            "META-INF/container.xml": container,
            "EPUB/book.opf": opf,
            "EPUB/chapter-intro.xhtml": intro,
            "EPUB/chapter-lesson.xhtml": lesson,
        }.items():
            z.writestr(filename, content, compress_type=ZIP_DEFLATED)

def make_ods() -> None:
    xml = ('<?xml version="1.0" encoding="UTF-8"?>'
        '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" '
        'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" '
        'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0">'
        '<office:body><office:spreadsheet><table:table table:name="Practical Log">'
        '<table:table-row><table:table-cell><text:p>Activity</text:p></table:table-cell>'
        '<table:table-cell><text:p>Completed</text:p></table:table-cell></table:table-row>'
        '<table:table-row table:number-rows-repeated="2">'
        '<table:table-cell><text:p>Microscope Setup</text:p></table:table-cell>'
        '<table:table-cell><text:p>Yes</text:p></table:table-cell></table:table-row>'
        '<table:table-row table:number-rows-repeated="1000000">'
        '<table:table-cell/><table:table-cell/></table:table-row>'
        '</table:table></office:spreadsheet></office:body></office:document-content>')
    with ZipFile(ROOT / "practical-log.ods", "w", ZIP_DEFLATED) as z:
        z.writestr("mimetype", "application/vnd.oasis.opendocument.spreadsheet", compress_type=ZIP_STORED)
        z.writestr("content.xml", xml)

def make_pdf() -> None:
    path = ROOT / "academic-handout.pdf"
    doc = canvas.Canvas(str(path), pagesize=(612, 792), pageCompression=1)
    doc.setTitle("CourseAccess Academic PDF Corpus")
    doc.setFont("Helvetica-Bold", 16)
    doc.drawString(55, 730, "Research Methods Seminar")
    doc.setFont("Helvetica", 11)
    doc.drawString(55, 702, "Original course handout with two content columns.")
    doc.drawString(55, 668, "Left column: study design and ethics.")
    doc.drawString(315, 668, "Right column: analysis and reporting.")
    doc.drawString(55, 638, "Figure: schematic cell illustration.")
    doc.rect(58, 525, 190, 84)
    doc.drawString(67, 564, "Original research process")
    doc.drawString(55, 493, "Equation note: confidence intervals require review.")
    doc.drawString(55, 452, "Footnote: examples are synthetic and license-clear.")
    doc.showPage()
    doc.setFont("Helvetica-Bold", 15)
    doc.drawString(55, 730, "Academic Handout Appendix")
    doc.setFont("Helvetica", 11)
    doc.drawString(55, 700, "Second page supports multi-page export regression.")
    doc.save()

def main() -> None:
    image = picture()
    make_docx(image)
    make_pptx(image)
    make_xlsx()
    make_epub()
    make_ods()
    make_pdf()
    files = [p for p in ROOT.iterdir() if p.is_file() and p.name != "manifest.json"]
    summary = {
        "originalContent": "No external or copyrighted documents, students or personal data",
        "status": "Authoring-library-generated integration corpus; manual field corpus still required",
        "files": {p.name:{"bytes":p.stat().st_size,"sha256":hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(files)}
    }
    (ROOT / "manifest.json").write_text(json.dumps(summary,indent=2),encoding="utf-8")
    print(json.dumps({"files":len(files),"totalBytes":sum(p.stat().st_size for p in files)},indent=2))

if __name__ == "__main__":
    main()
