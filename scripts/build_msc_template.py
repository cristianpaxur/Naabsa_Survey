"""Derive the MSC template by replacing source text nodes in place.

All package parts except word/document.xml and three explicitly sanitized
nonvisual template-metadata parts remain byte-identical. Source
drawings stay in the template as geometry prototypes; report builders must
replace/remove them and prune unused example media.  --example-output and
--sanitized-output produce optional QA copies with equal visible content.
"""

from __future__ import annotations

import argparse
import copy
import hashlib
import io
import json
import re
import zipfile
from pathlib import Path

from lxml import etree


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("C:/Users/CristianPaxur/Downloads/MSC Report - revisado.docx")
OUTPUT = ROOT / "templates/msc.clean.docx"
ARTIFACT = ROOT / "templates/msc.artifact.md"
EXPECTED_SHA256 = "837c43da11ec830b2d11d26c5a2c2b533c8a7d7a05fc2e5b264a9a933fe7fcd0"
NS = {
    "w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "wp": "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
}
W = "{" + NS["w"] + "}"
GENERATED_MARKER = "\n<!-- generated-source-evidence -->\n"
EDITABLE_PARTS = {
    "word/document.xml", "docProps/app.xml", "word/settings.xml",
    "word/_rels/settings.xml.rels",
}
TOC = {
    26: "s1", 27: "s2", 28: "s3", 29: "s3_1", 30: "s3_2",
    31: "s3_3", 32: "s3_4", 33: "s3_5", 34: "s3_6", 35: "s3_7",
    36: "s3_8", 37: "s4", 38: "s5", 39: "s5_1", 40: "s5_2",
    41: "s5_3", 42: "s5_4", 43: "s6",
}
HEADINGS = {
    82: "s1", 100: "s2", 108: "s3", 115: "s3_1", 122: "s3_2",
    131: "s3_3", 139: "s3_4", 148: "s3_5", 155: "s3_6", 163: "s3_7",
    172: "s3_8", 175: "s4", 178: "s5", 180: "s5_1", 184: "s5_2",
    186: "s5_3", 193: "s5_4", 197: "s6",
}
GALLERIES = {
    "vessel": [181, 183], "engine_room": [185],
    "survey_attendance": [187, 188, 189, 190, 191], "ecr": [194],
}
HISTORY_FIELDS = [
    "date", "grade_1_surveyor", "grade_1_vrs", "grade_1_difference",
    "grade_3_surveyor", "grade_3_vrs", "grade_3_difference",
    "sludge_surveyor", "sludge_berthing", "sludge_difference",
    "sludge_disposed", "consumption_chief", "flowmeter_total",
    "flowmeter_difference", "sludge_generated_chief", "sludge_rate_chief",
]


def text_of(node: etree._Element) -> str:
    return "".join(node.xpath(".//w:t/text()", namespaces=NS))


def xml_bytes(root: etree._Element) -> bytes:
    return etree.tostring(root, xml_declaration=True, encoding="UTF-8", standalone=True)


def canonical(node: etree._Element) -> bytes:
    return etree.tostring(node, method="c14n")


def sanitize(root: etree._Element) -> None:
    """Remove map notes while retaining actual conditional/historical content."""
    body = root.find("w:body", NS)
    history = body[174]
    for run in list(root.xpath('//w:r[w:rPr/w:color[@w:val="EE0000"]]', namespaces=NS)):
        # The historical discharge example is also red but is a value, not a
        # mapping note; do not delete it.  Every other EE0000 run is editorial.
        if history not in run.iterancestors():
            run.getparent().remove(run)
    for prop in list(root.xpath('//w:highlight | //w:color[@w:val="EE0000" or @w:val="FF0000"]', namespaces=NS)):
        prop.getparent().remove(prop)


class SlotMap:
    def __init__(self) -> None:
        self.examples: dict[str, str] = {}
        self.fragment_examples: dict[str, str] = {}
        self.slots: list[dict[str, str]] = []

    def replace(self, node: etree._Element, source: str, tag: str, location: str, occurrence: int = 0) -> None:
        """Change only the exact character span; retain every existing run."""
        texts = node.xpath(".//w:t", namespaces=NS)
        visible = "".join(t.text or "" for t in texts)
        existing_tags = [(m.start(), m.end()) for m in re.finditer(r"\{[a-z0-9_:]+\}", visible)]
        positions = [m.start() for m in re.finditer(re.escape(source), visible)
                     if not any(a <= m.start() < b for a, b in existing_tags)]
        if not source or len(positions) <= occurrence:
            raise RuntimeError(f"Missing slot {location}: {source!r} in {visible!r}")
        start, end = positions[occurrence], positions[occurrence] + len(source)
        cursor = 0
        fragments = []
        for t in texts:
            old = t.text or ""
            node_start, node_end = cursor, cursor + len(old)
            cursor = node_end
            if node_end <= start or node_start >= end:
                continue
            local_start, local_end = max(0, start - node_start), min(len(old), end - node_start)
            fragments.append((t, old[:local_start], old[local_start:local_end], old[local_end:], max(node_start, start)-start))
        # Keeping text in its original runs preserves Word's per-run rounding,
        # inherited mixed fonts and line-height behavior.  A whole-value tag
        # in the first run is insufficient for a source-identical baseline.
        self.record_example(tag, source)
        for index, (t, prefix, value, suffix, offset) in enumerate(fragments):
            token = tag if len(fragments) == 1 else f"{tag}:{offset}:" + (str(len(value)) if index < len(fragments)-1 else "")
            t.text = prefix + "{" + token + "}" + suffix
            t.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
            self.record(token, value, location)

    def record_example(self, tag: str, source: str) -> None:
        if tag in self.examples and self.examples[tag] != source:
            raise RuntimeError(f"Conflicting exemplar for {tag}")
        self.examples[tag] = source

    def record(self, tag: str, source: str, location: str) -> None:
        if ":" in tag:
            if tag in self.fragment_examples and self.fragment_examples[tag] != source:
                raise RuntimeError(f"Conflicting source fragment for {tag}")
            self.fragment_examples[tag] = source
        else:
            self.record_example(tag, source)
        self.slots.append({"tag": tag, "part": "word/document.xml", "locator": location})

    def example_value(self, token: str) -> str:
        field, *bounds = token.split(":")
        value = self.examples[field]
        if not bounds:
            return value
        start = int(bounds[0])
        return value[start:start + int(bounds[1])] if bounds[1] else value[start:]

    def cell(self, cell: etree._Element, tag: str, location: str) -> None:
        original = text_of(cell)
        if original:
            self.replace(cell, original, tag, location)
            return
        p = cell.find("w:p", NS)
        if p is None:
            raise RuntimeError(f"Missing cell paragraph: {location}")
        r = etree.SubElement(p, W + "r")
        rpr = p.find("w:pPr/w:rPr", NS)
        if rpr is not None:
            r.append(copy.deepcopy(rpr))
        etree.SubElement(r, W + "t").text = "{" + tag + "}"
        self.record(tag, "", location)


def add_bookmark(p: etree._Element, name: str, bookmark_id: int) -> None:
    start = etree.Element(W + "bookmarkStart", {W + "id": str(bookmark_id), W + "name": name})
    end = etree.Element(W + "bookmarkEnd", {W + "id": str(bookmark_id)})
    p.insert(1 if p.find("w:pPr", NS) is not None else 0, start)
    p.append(end)


def build_document_xml(source_xml: bytes) -> tuple[bytes, bytes, SlotMap]:
    root = etree.fromstring(source_xml, etree.XMLParser(remove_blank_text=False))
    body = root.find("w:body", NS)
    if len(body) != 206 or len(root.xpath('//w:body//w:p', namespaces=NS)) != 351:
        raise RuntimeError("Approved MSC source structure changed")
    for index, expected in {4: "Survey Report", 24: "Contents", 82: "Vessel´s details", 108: "Found at Survey", 175: "Time log", 193: "ECR"}.items():
        if not text_of(body[index]).startswith(expected):
            raise RuntimeError(f"MSC source checkpoint {index} changed")
    sanitize(root)
    sanitized = xml_bytes(root)
    slots = SlotMap()
    def swap(index: int, source: str, tag: str, occurrence: int = 0) -> None:
        slots.replace(body[index], source, tag, f"body[{index}]", occurrence)
    replacements = {
        5: [("616 S", "voy")], 8: [("ROB + Sludge Survey", "appointed_service")],
        9: [("MSC YAMUNA VI", "vessel_name")],
        10: [("Portugal", "flag"), ("9288409", "imo")], 11: [("Paranagua", "port")],
        84: [("MSC SHIPMANAGEMENT LTD", "manager")], 85: [("MSC YAMUNA VI", "vessel_name")],
        86: [("Portugal", "flag")], 87: [("Madeira", "port_registry")], 88: [("CRXT", "call_sign")],
        89: [("9288409", "imo")], 90: [("Container carrier", "type")], 91: [("2004", "delivered")],
        92: [("280.54", "loa")], 93: [("262.00", "lbp")], 94: [("40.00", "breadth")],
        95: [("24.00", "depth")], 96: [("25,614", "net_tonnage")],
        97: [("66,462", "gross_tonnage")], 98: [("24,241", "light_ship")],
        102: [("MSC YAMUNA VI", "vessel_name"), ("TCP PARANAGUA", "terminal")],
        113: [("3", "surveyed_by"), ("rd", "surveyed_by_ordinal"), (" engineer", "surveyed_by_role")],
        118: [("98", "purifier_temp")],
        119: [("1 x 3,0", "purifier_flow")], 120: [("60", "purifier_bowl_freq")],
        124: [("Infrared thermometer", "temp_storage_infrared")],
        125: [("Glass thermometer fixed outside tanks", "temp_service")],
        126: [("Infrared thermometer", "temp_do")],
        128: [("28", "temp_engine_room")], 129: [("21", "temp_sea_water")],
        142: [(text_of(body[142]), "records_updated_sentence")],
        150: [("33.04", "sludge_berthing")], 151: [("32.95", "sludge_surveyor")],
        152: [("28.73", "sludge_disposed")],
        153: [("4.22", "retained_chief"), ("4.31", "retained_after_discharge")],
        158: [("3,40", "retained_after_last_discharge")],
        159: [("29.55", "sludge_generated_chief"), ("28.73", "sludge_generated_surveyor")],
        160: [("1,021.460", "consumption_chief"), ("947.665", "consumption_surveyor")],
        161: [("2,893", "sludge_rate_chief"), ("3,128", "sludge_rate_surveyor")],
        168: [("1,021.460", "flowmeter_logbook_total"), ("981.008", "flowmeter_soundings")],
        169: [("1,689.099", "flowmeter_total"), ("1,689.099", "flowmeter_total")],
        170: [("667.639", "flowmeter_difference"), ("39.5", "flowmeter_accuracy"),
              ("708.091", "consumption_flowmeter_difference"), ("41.9", "consumption_flowmeter_percentage")],
    }
    for index, items in replacements.items():
        for source, tag in items:
            swap(index, source, tag)
    # Dates remain segmented so native superscript ordinal runs survive.
    for index, prefix, month, day, ordinal in [(11, "cover_date", "May", "21", "st"), (110, "survey_date", "May", "21", "st"), (157, "last_discharge_date", "March", "28", "th"), (157, "survey_date", "May", "21", "st")]:
        for source, suffix in [(month, "month"), (day, "day"), (ordinal, "ordinal"), ("2026", "year")]:
            swap(index, source, prefix + "_" + suffix)
    command = body[21].findall("w:tr", NS)[2].findall("w:tc", NS)[1]
    for source, tag in [("MSC YAMUNA VI", "vessel_name"), ("XXXXXXX", "captain"), ("XXXXXX", "chief_engineer")]:
        slots.replace(command, source, tag, "body[21]/tr[2]/tc[1]")
    surveyor = body[21].findall("w:tr", NS)[1].findall("w:tc", NS)[1]
    slots.replace(surveyor, "Mr. Wagner de Abreu", "surveyors", "body[21]/tr[1]/tc[1]")
    manager_contact = body[21].findall("w:tr", NS)[0].findall("w:tc", NS)[1]
    for source, tag in [("Mediterranean Shipping Company S.A.", "contact_manager_company"), ("Capt. Robert Masse", "contact_manager_name")]:
        slots.replace(manager_contact, source, tag, "body[21]/tr[0]/tc[1]")
    for index, target in TOC.items():
        match = re.search(r"\d+(?=\s*$)", text_of(body[index]))
        if match is None:
            raise RuntimeError(f"Missing Contents page in block {index}")
        swap(index, match.group(), "toc_" + target)
    grade_rows = body[144].findall("w:tr", NS)
    for number, row in enumerate(grade_rows[1:], 1):
        for col, suffix in enumerate(["", "_surveyor", "_vrs", "_difference", "_percentage"]):
            cell = row.findall("w:tc", NS)[col]
            slots.replace(cell, text_of(cell).strip(), f"grade_{number}" + suffix, f"body[144]/tr[{number}]/tc[{col}]")
    history_rows = body[174].findall("w:tr", NS)
    for row_index, field in enumerate(HISTORY_FIELDS):
        for column in [1, 2]:
            cell = history_rows[row_index].findall("w:tc", NS)[column]
            tag = f"last_attendance_{column}_{field}"
            visible = text_of(cell)
            value = visible.strip() if row_index == 0 else re.search(r"[+-]?\s*\d[\d,]*(?:\.\d+)?", visible).group().strip()
            slots.replace(cell, value, tag, f"body[174]/tr[{row_index}]/tc[{column}]")
    log_rows = body[176].findall("w:tr", NS)
    for index, row in enumerate(log_rows[1:], 1):
        for column, field in enumerate(["event", "date", "start", "flag", "end"]):
            slots.cell(row.findall("w:tc", NS)[column], f"time_log_{index}_{field}", f"body[176]/tr[{index}]/tc[{column}]")
    markers = [(body[index], name) for index, name in HEADINGS.items()]
    markers += [(body[13], "msc_cover")]
    for gallery, indexes in GALLERIES.items():
        markers += [(body[index], "msc_photos_" + gallery + (f"_{n}" if n > 1 else "")) for n, index in enumerate(indexes, 1)]
    for index, name in [(144, "msc_grade_rows"), (174, "msc_last_attendances"), (176, "msc_time_log")]:
        markers.append((body[index].find("w:tr/w:tc/w:p", NS), name))
    for index, name in [(105, "msc_background_sludge_disposal"), (106, "msc_background_sludge_rate"), (110, "msc_found_survey"), (113, "msc_sounding_actor"), (128, "msc_temp_engine_room"), (129, "msc_temp_sea_water"), (142, "msc_records_updated")]:
        markers.append((body[index], name))
    used_ids = [int(x) for x in root.xpath('//w:bookmarkStart/@w:id', namespaces=NS) if x.isdigit()]
    first_id = max([1000] + used_ids) + 1
    for bookmark_id, (paragraph, name) in enumerate(markers, first_id):
        add_bookmark(paragraph, name, bookmark_id)
    if len(body) != 206 or len(root.xpath('//w:body//w:p', namespaces=NS)) != 351:
        raise RuntimeError("Template changed source pagination components")
    return xml_bytes(root), sanitized, slots


def sanitize_metadata(part: str, payload: bytes) -> bytes:
    """Blank stale template identity without serializing unaffected XML."""
    if part == "docProps/app.xml":
        return payload.replace(b"<Template>MSC ZEBRA - REPORT 1</Template>", b"<Template></Template>")
    if part == "word/settings.xml":
        return re.sub(rb'<w:attachedTemplate\b[^>]*/>', b"", payload)
    if part == "word/_rels/settings.xml.rels":
        return re.sub(rb'<Relationship\b[^>]*\bType="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate"[^>]*/>', b"", payload)
    return payload


def package(source: zipfile.ZipFile, document_xml: bytes) -> bytes:
    memory = io.BytesIO()
    with zipfile.ZipFile(memory, "w") as output:
        for item in source.infolist():
            payload = document_xml if item.filename == "word/document.xml" else sanitize_metadata(item.filename, source.read(item.filename))
            output.writestr(copy.copy(item), payload)
    return memory.getvalue()


def verify_geometry(original_xml: bytes, template_xml: bytes) -> dict[str, int]:
    original, template = etree.fromstring(original_xml), etree.fromstring(template_xml)
    summary = {}
    for name, xpath in {
        "section_properties": "//w:sectPr", "drawings": "//w:drawing",
        "table_geometry": "//w:tblPr | //w:tblGrid | //w:trPr | //w:tcPr",
        "numbering_references": "//w:numPr",
    }.items():
        a, b = original.xpath(xpath, namespaces=NS), template.xpath(xpath, namespaces=NS)
        if [canonical(x) for x in a] != [canonical(x) for x in b]:
            raise RuntimeError(f"Source {name} changed")
        summary[name] = len(a)
    return summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--sanitized-output", type=Path)
    parser.add_argument("--example-output", type=Path)
    args = parser.parse_args()
    if any(p is not None and p.resolve() == args.source.resolve() for p in [args.output, args.sanitized_output, args.example_output]):
        raise RuntimeError("The retained source may not be overwritten")
    source_bytes = args.source.read_bytes()
    if hashlib.sha256(source_bytes).hexdigest() != EXPECTED_SHA256:
        raise RuntimeError("Approved MSC source SHA256 changed; review before rebuilding")
    if not ARTIFACT.exists():
        raise RuntimeError("Distilled artifact.md must exist before template authoring")
    with zipfile.ZipFile(io.BytesIO(source_bytes)) as original:
        original_xml = original.read("word/document.xml")
        document_xml, sanitized, slots = build_document_xml(original_xml)
        geometry = verify_geometry(original_xml, document_xml)
        output_bytes = package(original, document_xml)
        with zipfile.ZipFile(io.BytesIO(output_bytes)) as output:
            manifest = []
            for info in original.infolist():
                before, after = original.read(info.filename), output.read(info.filename)
                editable = info.filename in EDITABLE_PARTS
                if not editable and before != after:
                    raise RuntimeError(f"Preserve-only part changed: {info.filename}")
                manifest.append({"part": info.filename, "size": len(before), "sha256": hashlib.sha256(before).hexdigest(), "mode": "editable" if editable else "preserve-only", "unchanged": before == after})
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_bytes(output_bytes)
        for path, xml in [(args.sanitized_output, sanitized), (args.example_output, document_xml)]:
            if path is None:
                continue
            if path == args.example_output:
                example = etree.fromstring(xml)
                for t in example.xpath('//w:t', namespaces=NS):
                    t.text = re.sub(r"\{([a-z0-9_:]+)\}", lambda m: slots.example_value(m.group(1)), t.text or "")
                xml = xml_bytes(example)
                # The equal-content baseline is stricter than a layout sample.
                reference = etree.fromstring(sanitized)
                if example.xpath('//w:t/text()', namespaces=NS) != reference.xpath('//w:t/text()', namespaces=NS):
                    # Substring replacements can consolidate split source runs;
                    # compare text per paragraph, including all table cells.
                    a = [text_of(p) for p in reference.xpath('//w:body//w:p', namespaces=NS)]
                    b = [text_of(p) for p in example.xpath('//w:body//w:p', namespaces=NS)]
                    if a != b:
                        raise RuntimeError("Filled exemplar differs from sanitized source content")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(package(original, xml))
    contract = ARTIFACT.read_text(encoding="utf-8").split(GENERATED_MARKER)[0].rstrip()
    evidence = {"source_sha256": EXPECTED_SHA256, "template_sha256": hashlib.sha256(output_bytes).hexdigest(), "body_blocks": 206, "body_paragraphs": 351, "geometry_verified": geometry, "intentional_metadata_deviations": ["Blank docProps/app.xml Template identifying MSC ZEBRA", "Remove word/settings.xml attachedTemplate", "Remove the related external template relationship containing a physical source-author path; retain its empty relationship part", "docProps/core.xml title was already empty and remains byte-identical"], "slots": slots.slots, "examples": slots.examples, "fragment_examples": slots.fragment_examples, "package_preservation": manifest}
    ARTIFACT.write_text(contract + GENERATED_MARKER + "\n```json\n" + json.dumps(evidence, ensure_ascii=False, indent=2) + "\n```\n", encoding="utf-8")
    if hashlib.sha256(args.source.read_bytes()).hexdigest() != EXPECTED_SHA256:
        raise RuntimeError("Retained source changed during template build")
    preserved = sum(part["mode"] == "preserve-only" for part in manifest)
    print(f"Created {args.output}: {len(output_bytes)} bytes; {len(slots.examples)} fields; {preserved} preserve-only parts unchanged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
