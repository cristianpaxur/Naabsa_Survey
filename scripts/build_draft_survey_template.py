"""Build the clean, editable Draft Survey DOCX template from the approved Word file.

The source file is intentionally kept untouched.  This script performs only
targeted OOXML edits in ``word/document.xml`` so Word's original page setup,
headers, footers, styles, numbering, tables and drawing geometry survive.
"""

from __future__ import annotations

import copy
import hashlib
import io
import re
import sys
import zipfile
from pathlib import Path

from lxml import etree


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "tests/fixtures/reports/draft_survey/MV-PERSEUS-I.model.docx"
OUTPUT = ROOT / "templates/draft_survey.clean.docx"
EXPECTED_SHA256 = "3afd6eb8d51192f557367bd831cf275012c67d1454584901b991cd05c396a384"

NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
}
W = "{%s}" % NS["w"]
R = "{%s}" % NS["r"]
ANNOTATION_COLOURS = {"EE0000", "00B050", "E36C0A", "F79646", "00B0F0", "FFC000"}


def text_of(paragraph: etree._Element) -> str:
    return "".join(paragraph.xpath(".//w:t/text()", namespaces=NS))


def clone_rpr(run: etree._Element | None) -> etree._Element | None:
    if run is None:
        return None
    rpr = run.find("w:rPr", NS)
    if rpr is None:
        return None
    cloned = copy.deepcopy(rpr)
    for node in cloned.xpath("./w:highlight | ./w:color", namespaces=NS):
        if node.tag == W + "highlight" or node.get(W + "val", "").upper() in ANNOTATION_COLOURS:
            node.getparent().remove(node)
    return cloned


def choose_run(paragraph: etree._Element, mode: str = "normal") -> etree._Element | None:
    runs = paragraph.xpath(".//w:r", namespaces=NS)
    if not runs:
        return None
    if mode == "highlight":
        for run in runs:
            if run.find("w:rPr/w:highlight", NS) is not None:
                return run
    if mode == "courier":
        for run in runs:
            fonts = run.find("w:rPr/w:rFonts", NS)
            if fonts is not None and "Courier" in " ".join(fonts.attrib.values()):
                return run
    if mode == "bold":
        for run in runs:
            if run.find("w:rPr/w:b", NS) is not None:
                return run
    if mode == "normal":
        for run in runs:
            colour = run.find("w:rPr/w:color", NS)
            highlight = run.find("w:rPr/w:highlight", NS)
            bold = run.find("w:rPr/w:b", NS)
            if bold is None and highlight is None and (colour is None or colour.get(W + "val", "").upper() not in ANNOTATION_COLOURS):
                return run
    for run in runs:
        colour = run.find("w:rPr/w:color", NS)
        highlight = run.find("w:rPr/w:highlight", NS)
        if highlight is None and (colour is None or colour.get(W + "val", "").upper() not in ANNOTATION_COLOURS):
            return run
    return runs[0]


def make_run(text: str, style_from: etree._Element | None) -> etree._Element:
    run = etree.Element(W + "r")
    rpr = clone_rpr(style_from)
    if rpr is not None:
        run.append(rpr)
    t = etree.SubElement(run, W + "t")
    if text[:1].isspace() or text[-1:].isspace():
        t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
    t.text = text
    return run


def set_paragraph(paragraph: etree._Element, segments: list[tuple[str, str]]) -> None:
    styles = {mode: choose_run(paragraph, mode) for _, mode in segments}
    ppr = paragraph.find("w:pPr", NS)
    for child in list(paragraph):
        if child is not ppr:
            paragraph.remove(child)
    for value, mode in segments:
        paragraph.append(make_run(value, styles.get(mode)))


def remove_paragraph(paragraph: etree._Element) -> None:
    parent = paragraph.getparent()
    if parent is not None:
        parent.remove(paragraph)


def tag_paragraph_like(paragraph: etree._Element, tag: str, style: str = "normal") -> etree._Element:
    clone = copy.deepcopy(paragraph)
    set_paragraph(clone, [(tag, style)])
    return clone


def insert_before(target: etree._Element, node: etree._Element) -> None:
    target.addprevious(node)


def insert_after(target: etree._Element, node: etree._Element) -> None:
    target.addnext(node)


def add_bookmark(paragraph: etree._Element, name: str, bookmark_id: int) -> None:
    ppr = paragraph.find("w:pPr", NS)
    start_index = 1 if ppr is not None else 0
    start = etree.Element(W + "bookmarkStart")
    start.set(W + "id", str(bookmark_id))
    start.set(W + "name", name)
    end = etree.Element(W + "bookmarkEnd")
    end.set(W + "id", str(bookmark_id))
    paragraph.insert(start_index, start)
    paragraph.append(end)


def set_toc_paragraph(paragraph: etree._Element, label: str, token: str) -> None:
    """Use Word's native dot-leader tab so labels never wrap on the dots."""
    style = choose_run(paragraph, "normal")
    ppr = paragraph.find("w:pPr", NS)
    if ppr is None:
        ppr = etree.Element(W + "pPr")
        paragraph.insert(0, ppr)
    for child in list(paragraph):
        if child is not ppr:
            paragraph.remove(child)
    justification = ppr.find("w:jc", NS)
    if justification is not None:
        ppr.remove(justification)
    old_tabs = ppr.find("w:tabs", NS)
    if old_tabs is not None:
        ppr.remove(old_tabs)
    tabs = etree.Element(W + "tabs")
    tab_stop = etree.SubElement(tabs, W + "tab")
    tab_stop.set(W + "val", "right")
    tab_stop.set(W + "leader", "dot")
    tab_stop.set(W + "pos", "10150")
    ppr.append(tabs)
    paragraph.append(make_run(label, style))
    tab_run = etree.Element(W + "r")
    tab_run.append(etree.Element(W + "tab"))
    paragraph.append(tab_run)
    paragraph.append(make_run(token, style))


def build_document_xml(xml: bytes) -> bytes:
    parser = etree.XMLParser(remove_blank_text=False)
    root = etree.fromstring(xml, parser)
    paragraphs = root.xpath("//w:body//w:p", namespaces=NS)
    if len(paragraphs) != 299:
        raise RuntimeError(f"Unexpected source layout: expected 299 body paragraphs, got {len(paragraphs)}")

    original = [text_of(p) for p in paragraphs]
    checkpoints = {8: "Survey Report", 39: "Contents", 95: "Background", 143: "Initial", 285: "Photographic Report"}
    for index, expected in checkpoints.items():
        if not original[index].startswith(expected):
            raise RuntimeError(f"Source paragraph {index} changed: {original[index]!r}")

    # Cover and contact table.
    set_paragraph(paragraphs[9], [("Ref:", "normal"), ("{ref}", "highlight")])
    set_paragraph(paragraphs[14], [("“{vessel_name}”", "highlight")])
    set_paragraph(paragraphs[15], [("Flag ", "normal"), ("{flag}", "highlight"), (" – IMO ", "normal"), ("{imo}", "highlight")])
    set_paragraph(paragraphs[16], [("at ", "normal"), ("{port}", "highlight"), (" Port/Brazil – ", "normal"), ("{final_date}", "highlight")])
    set_paragraph(paragraphs[26], [("{client}", "highlight")])
    set_paragraph(paragraphs[27], [("{operator}", "highlight")])
    set_paragraph(paragraphs[30], [("{surveyor_name}", "normal")])
    set_paragraph(paragraphs[33], [("Mr. ", "normal"), ("{captain}", "highlight"), (" / Mr. ", "normal"), ("{chief_officer}", "highlight")])

    # Contents: the reference's orphan "Draft Survey" entry is removed.  Word's
    # list numbering then naturally returns to 1..7, matching the body.
    remove_paragraph(paragraphs[43])
    toc_labels = {
        41: ("Background", "{toc_s1}"), 42: ("Ship’s Particulars", "{toc_s2}"),
        44: ("Initial", "{toc_s3}"), 45: ("3.1. Draft Readings", "{toc_s3_1}"),
        46: ("3.2. Sea water density", "{toc_s3_2}"),
        47: ("3.3. Ballast water and fresh water", "{toc_s3_3}"),
        48: ("3.4. Fuel R.O.B.", "{toc_s3_4}"), 49: ("3.5. Initial Draft details", "{toc_s3_5}"),
        50: ("Intermediate", "{toc_s4}"), 51: ("4.1. Draft Readings", "{toc_s4_1}"),
        52: ("4.2. Sea water density", "{toc_s4_2}"),
        53: ("4.3. Ballast water and fresh water", "{toc_s4_3}"),
        54: ("4.4. Fuel R.O.B.", "{toc_s4_4}"), 55: ("4.5. Intermediate Draft Details", "{toc_s4_5}"),
        56: ("Final", "{toc_s5}"), 57: ("{final_no}.1. Draft Readings", "{toc_s5_1}"),
        58: ("{final_no}.2. Sea water density", "{toc_s5_2}"),
        59: ("{final_no}.3. Ballast water and fresh water", "{toc_s5_3}"),
        60: ("{final_no}.4. Fuel R.O.B.", "{toc_s5_4}"), 61: ("{final_no}.5. Final Draft details", "{toc_s5_5}"),
        62: ("Photographic Report", "{toc_s6}"), 63: ("{photo_no}.1. Initial", "{toc_s6_1}"),
        64: ("{photo_no}.2. Intermediate", "{toc_s6_2}"), 65: ("{photo_no}.{photo_final_subno}. Final", "{toc_s6_3}"),
        66: ("Attachment", "{toc_s7}"),
    }
    for index, (label, token) in toc_labels.items():
        set_toc_paragraph(paragraphs[index], label, token)

    # The source used a separate numbering definition for Attachment and a
    # literal number for Photographic Report. Put both back into the main list
    # so removing the orphan Draft Survey row yields a continuous 1..7 list.
    main_num_pr = paragraphs[41].find("w:pPr/w:numPr", NS)
    if main_num_pr is None:
        raise RuntimeError("Contents numbering definition was not found")
    for index in (62, 66):
        ppr = paragraphs[index].find("w:pPr", NS)
        if ppr is None:
            ppr = etree.Element(W + "pPr")
            paragraphs[index].insert(0, ppr)
        existing = ppr.find("w:numPr", NS)
        if existing is not None:
            ppr.remove(existing)
        pstyle = ppr.find("w:pStyle", NS)
        ppr.insert(1 if pstyle is not None else 0, copy.deepcopy(main_num_pr))

    # Conditionally remove Intermediate entries without leaving a blank line.
    insert_before(paragraphs[50], tag_paragraph_like(paragraphs[50], "{#hasIntermediate}"))
    insert_after(paragraphs[55], tag_paragraph_like(paragraphs[55], "{/hasIntermediate}"))
    insert_before(paragraphs[64], tag_paragraph_like(paragraphs[64], "{#hasIntermediate}"))
    insert_after(paragraphs[64], tag_paragraph_like(paragraphs[64], "{/hasIntermediate}"))

    # Background and ship particulars.
    set_paragraph(paragraphs[97], [("{background_1}", "normal")])
    set_paragraph(paragraphs[99], [("{background_2}", "normal")])
    particulars = {
        105: ("{flag}", ""), 108: ("{register_port}", ""), 111: ("{call_sign}", ""),
        114: ("{imo}", ""), 117: ("{vessel_type}", ""), 120: ("{delivered}", ""),
        123: ("{loa}", " m"), 126: ("{lbp}", " m"), 129: ("{depth_moulded}", " m"),
        132: ("{breadth_moulded}", " m"), 135: ("{net_tonnage}", " mt"),
        138: ("{gross_tonnage}", " mt"), 141: ("{summer_dwt}", " mt"),
    }
    for index, (token, suffix) in particulars.items():
        set_paragraph(paragraphs[index], [(token + suffix, "highlight")])

    # Phase prose and figures.
    set_paragraph(paragraphs[143], [("Initial", "normal")])
    set_paragraph(paragraphs[145], [("{initial_narrative}", "normal")])
    set_paragraph(paragraphs[147], [("Draft readings: ", "bold"), ("{initial_draft_readings}", "normal")])
    set_paragraph(paragraphs[178], [("Fuel R.O.B.: ", "bold"), ("According to the logbook – FWE.", "normal")])
    set_paragraph(paragraphs[185], [("Intermediate", "normal")])
    set_paragraph(paragraphs[187], [("{intermediate_narrative}", "normal")])
    for offset, index in enumerate(range(189, 197), 1):
        set_paragraph(paragraphs[index], [(f"{{int_figure_line_{offset}}}", "courier")])
    set_paragraph(paragraphs[198], [("Draft readings: ", "bold"), ("{intermediate_draft_readings}", "normal")])
    set_paragraph(paragraphs[237], [("{final_narrative}", "normal")])
    for offset, index in enumerate(range(239, 247), 1):
        set_paragraph(paragraphs[index], [(f"{{fin_figure_line_{offset}}}", "courier")])
    set_paragraph(paragraphs[248], [("Draft readings: ", "bold"), ("{final_draft_readings}", "normal")])

    table_values = {
        154: "{init_trim_obs} m", 156: "{init_fwd_mean} m", 157: "{init_fwd_corr} m",
        160: "{init_trim_corr} m", 162: "{init_mid_mean} m", 163: "{init_mid_corr} m",
        166: "{init_heel}° {init_heel_side}", 168: "{init_aft_mean} m", 169: "{init_aft_corr} m",
        172: "{init_deflection} cm {init_deflection_type}",
        205: "{int_trim_obs} m", 207: "{int_fwd_mean} m", 208: "{int_fwd_corr} m",
        211: "{int_trim_corr} m", 213: "{int_mid_mean} m", 214: "{int_mid_corr} m",
        217: "{int_list}° {int_list_side}", 219: "{int_aft_mean} m", 220: "{int_aft_corr} m",
        223: "{int_deflection} cm {int_deflection_type}",
        255: "{fin_trim_obs} m", 257: "{fin_fwd_mean} m", 258: "{fin_fwd_corr} m",
        261: "{fin_trim_corr} m", 263: "{fin_mid_mean} m", 264: "{fin_mid_corr} m",
        267: "{fin_list}° {fin_list_side}", 269: "{fin_aft_mean} m", 270: "{fin_aft_corr} m",
        273: "{fin_deflection} cm {fin_deflection_type}",
    }
    for index, value in table_values.items():
        set_paragraph(paragraphs[index], [(value, "highlight")])

    # Final explanatory text is normalized to the approved wording used by the app.
    set_paragraph(paragraphs[275], [("Sea water density: ", "bold"), ("A seawater sample was collected in way of the midship draft mark, on the sea side. The vessel's hydrometer was considered the official instrument for all readings.", "normal")])
    remove_paragraph(paragraphs[276])
    set_paragraph(paragraphs[278], [("Ballast water and fresh water: ", "bold"), ("All ballast water tanks were gauged individually, and the volumes were calculated by applying the applicable trim and list corrections. The fresh water quantity was provided by the Chief Officer", "normal")])

    # Replace the three original calculation-sheet drawings in their exact frames.
    drawing_paragraphs: list[etree._Element] = []
    for paragraph in paragraphs:
        if paragraph.xpath(".//w:drawing", namespaces=NS):
            drawing_paragraphs.append(paragraph)
    # The body contains cover, initial, intermediate and final drawings in order.
    if len(drawing_paragraphs) < 4:
        raise RuntimeError(f"Expected at least four body drawings, got {len(drawing_paragraphs)}")
    for paragraph, tag in zip(drawing_paragraphs[-3:], ("{%%sheetInitial}", "{%%sheetIntermediate}", "{%%sheetFinal}")):
        set_paragraph(paragraph, [(tag, "normal")])
    # Cover photo is the first inline body drawing. Header drawings live outside document.xml.
    set_paragraph(drawing_paragraphs[0], [("{%%coverPhoto}", "normal")])

    # Remove red image captions; the image paragraph itself already expresses the section.
    remove_paragraph(paragraphs[183])
    remove_paragraph(paragraphs[233])

    # Intermediate body is optional, just as its Contents block is optional.
    insert_before(paragraphs[185], tag_paragraph_like(paragraphs[185], "{#hasIntermediate}"))
    insert_after(paragraphs[232], tag_paragraph_like(paragraphs[231], "{/hasIntermediate}"))

    # Photo loops are inserted under the original 6.1/6.2/6.3 headings.
    for heading_index, collection in ((287, "photosInitial"), (289, "photosIntermediate"), (291, "photosFinal")):
        heading = paragraphs[heading_index]
        # The following source paragraph is a blank Normal paragraph.  Reusing
        # it avoids accidentally copying the heading's automatic numbering to
        # every generated photo.
        photo_base = paragraphs[heading_index + 1]
        open_tag = tag_paragraph_like(photo_base, "{#" + collection + "}")
        image_tag = tag_paragraph_like(photo_base, "{%%photo}")
        close_tag = tag_paragraph_like(photo_base, "{/" + collection + "}")
        insert_after(heading, close_tag)
        insert_after(heading, image_tag)
        insert_after(heading, open_tag)
    # Hide the entire intermediate photo heading when that phase does not exist.
    insert_before(paragraphs[289], tag_paragraph_like(paragraphs[289], "{#hasIntermediate}"))
    # The photo-loop close is currently the last node after the heading.
    intermediate_tail = paragraphs[289].getnext().getnext().getnext()
    insert_after(intermediate_tail, tag_paragraph_like(paragraphs[289], "{/hasIntermediate}"))

    # Bookmark every Contents target for the worker's existing two-pass page measurement.
    bookmark_targets = {
        "s1": 95, "s2": 101, "s3": 143, "s3_1": 147, "s3_2": 174, "s3_3": 176,
        "s3_4": 178, "s3_5": 180, "s4": 185, "s4_1": 198, "s4_2": 225,
        "s4_3": 227, "s4_4": 229, "s4_5": 231, "s5": 235, "s5_1": 248,
        "s5_2": 275, "s5_3": 278, "s5_4": 280, "s5_5": 282, "s6": 285,
        "s6_1": 287, "s6_2": 289, "s6_3": 291, "s7": 294,
    }
    for offset, (name, index) in enumerate(bookmark_targets.items(), 1000):
        add_bookmark(paragraphs[index], name, offset)

    # Finally strip every remaining review cue while retaining ordinary black/navy text.
    for highlight in root.xpath("//w:highlight", namespaces=NS):
        highlight.getparent().remove(highlight)
    for run in list(root.xpath("//w:r[w:rPr/w:color]", namespaces=NS)):
        colour = run.find("w:rPr/w:color", NS)
        if colour is not None and colour.get(W + "val", "").upper() in ANNOTATION_COLOURS:
            parent = run.getparent()
            if parent is not None:
                parent.remove(run)
    for colour in list(root.xpath("//w:color", namespaces=NS)):
        if colour.get(W + "val", "").upper() in ANNOTATION_COLOURS:
            colour.getparent().remove(colour)

    rendered_xml = etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)
    # Guard against leaving a human-review marker behind.
    if re.search(rb'<w:highlight\b', rendered_xml):
        raise RuntimeError("Highlight markup remained in the clean template")
    return rendered_xml


def main() -> int:
    if not SOURCE.exists():
        raise FileNotFoundError(SOURCE)
    digest = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise RuntimeError(f"Approved source changed (sha256={digest}); review the layout map before rebuilding")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(SOURCE, "r") as zin:
        document_xml = build_document_xml(zin.read("word/document.xml"))
        memory = io.BytesIO()
        with zipfile.ZipFile(memory, "w") as zout:
            for item in zin.infolist():
                payload = document_xml if item.filename == "word/document.xml" else zin.read(item.filename)
                zout.writestr(item, payload)
    OUTPUT.write_bytes(memory.getvalue())
    print(f"Created {OUTPUT} ({OUTPUT.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
