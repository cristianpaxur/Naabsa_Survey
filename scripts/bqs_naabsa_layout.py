"""Apply the retained MSC document's shared Naabsa design to BQS content.

This is a build-time package patch. Existing reports and their saved revisions
are never rewritten. Data tags, native BQS numbering and editor anchors survive.
"""
from copy import deepcopy
from pathlib import Path
import posixpath
import re
from zipfile import ZipFile
from lxml import etree as E

W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
CT = 'http://schemas.openxmlformats.org/package/2006/content-types'
NS = {'w': W, 'r': R}
PROPERTY_ORDER = {
    'pPr': 'pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange',
    'rPr': 'rStyle rFonts b bCs i iCs caps smallCaps strike dstrike outline shadow emboss imprint noProof snapToGrid vanish webHidden color spacing w kern position sz szCs highlight u effect bdr shd fitText vertAlign rtl cs em lang eastAsianLayout specVanish oMath rPrChange',
    'sectPr': 'headerReference footerReference footnotePr endnotePr type pgSz pgMar paperSrc pgBorders lnNumType pgNumType cols formProt vAlign noEndnote titlePg textDirection bidi rtlGutter docGrid printerSettings sectPrChange',
    'tblPr': 'tblStyle tblpPr tblOverlap bidiVisual tblStyleRowBandSize tblStyleColBandSize tblW jc tblCellSpacing tblInd tblBorders shd tblLayout tblCellMar tblLook tblCaption tblDescription tblPrChange',
    'tcPr': 'cnfStyle tcW gridSpan hMerge vMerge tcBorders shd noWrap tcMar textDirection tcFitText vAlign hideMark headers cellIns cellDel cellMerge tcPrChange',
    'styles': 'docDefaults latentStyles style',
}


def order_properties(root):
    """OOXML property sequences are ordered, especially section margins/columns."""
    for node in root.iter():
        sequence = PROPERTY_ORDER.get(E.QName(node).localname)
        if sequence:
            ranks = {name: i for i, name in enumerate(sequence.split())}
            node[:] = sorted(node, key=lambda child: ranks.get(E.QName(child).localname, len(ranks)))


def el(tag, **attrs):
    node = E.Element('{' + W + '}' + tag)
    for key, value in attrs.items():
        node.set('{' + W + '}' + key, str(value))
    return node


def xml(node):
    return E.tostring(node, encoding='UTF-8', xml_declaration=True, standalone=True)


def text(node):
    return ''.join(node.xpath('.//w:t/text()', namespaces=NS))


def prop(node, tag):
    found = node.find('w:' + tag, NS)
    if found is None:
        found = el(tag)
        node.insert(0, found)
    return found


def replace_prop(node, tag, source):
    for old in node.findall('w:' + tag, NS):
        node.remove(old)
    if source is not None:
        node.insert(0, deepcopy(source))


def paragraph(source, value, bold=None, size=None):
    out = deepcopy(source)
    ppr = out.find('w:pPr', NS)
    rpr = source.find('w:r/w:rPr', NS)
    for child in list(out):
        if child is not ppr:
            out.remove(child)
    run = el('r')
    rp = deepcopy(rpr) if rpr is not None else el('rPr')
    if bold is not None:
        for old in rp.findall('w:b', NS) + rp.findall('w:bCs', NS):
            rp.remove(old)
        if bold:
            rp.extend([el('b'), el('bCs')])
    if size is not None:
        for tag in ['sz', 'szCs']:
            replace_prop(rp, tag, el(tag, val=size))
    run.append(rp)
    t = el('t')
    t.text = value
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    run.append(t)
    out.append(run)
    return out


def font(paragraph_node, name, size):
    for parent in [prop(paragraph_node, 'pPr'), *paragraph_node.findall('.//w:r', NS)]:
        rp = prop(parent, 'rPr')
        replace_prop(rp, 'rFonts', el('rFonts', ascii=name, hAnsi=name, cs=name, eastAsia=name))
        for tag in ['sz', 'szCs']:
            replace_prop(rp, tag, el(tag, val=size))


def apply_naabsa_layout(parts, reference_path: Path):
    with ZipFile(reference_path) as z:
        reference = {name: z.read(name) for name in z.namelist()}
    doc = E.fromstring(parts['word/document.xml'])
    body = doc.find('w:body', NS)
    donor = E.fromstring(reference['word/document.xml'])
    source = list(donor.find('w:body', NS))
    if text(source[4]) != 'Survey Report' or '{appointed_service}' not in text(source[8]):
        raise ValueError('MSC shared layout contract changed; review source components')
    if text(source[19]) != 'PERSON / COMPANIES CONTACTED':
        raise ValueError('MSC contact heading changed')

    # Preserve BQS-only styles while using the actual shared style definitions.
    styles = E.fromstring(parts['word/styles.xml'])
    reference_styles = E.fromstring(reference['word/styles.xml'])
    for item in reference_styles:
        if item.tag == '{' + W + '}style':
            sid = item.get('{' + W + '}styleId')
            matches = styles.xpath('w:style[@w:styleId=$sid]', namespaces=NS, sid=sid)
        else:
            matches = styles.findall(item.tag)
        for old in matches:
            styles.remove(old)
        styles.append(deepcopy(item))
    order_properties(styles)
    parts['word/styles.xml'] = xml(styles)

    cover = doc.xpath('//w:sdt[w:sdtPr/w:tag[@w:val="bqs_photos_cover"]]', namespaces=NS)
    if len(cover) != 1:
        raise ValueError('BQS cover photo anchor missing or ambiguous')
    cover_photo = deepcopy(cover[0])
    for p in cover_photo.findall('w:sdtContent/w:p', NS):
        replace_prop(p, 'pPr', source[13].find('w:pPr', NS))
    new_cover = [deepcopy(node) for node in source[:22]]
    for index, value, size in [
        (5, 'Ref: {report_reference}', 20),
        (8, 'Bunker Quantity Survey', 22),
        (9, '“{cover_vessel_name}”', 40),
        (10, 'Flag {vessel_flag} – IMO {vessel_imo}', 21),
        (11, 'at {cover_port} / Brazil – {report_date}', 21),
    ]:
        new_cover[index] = paragraph(source[index], value, size=size)
    new_cover[13] = cover_photo

    table = deepcopy(source[21])
    donor_rows = source[21].findall('w:tr', NS)
    for row in table.findall('w:tr', NS):
        table.remove(row)
    values = [
        ('Client', '{client}', '{operator}'),
        ('Undersigned surveyor', 'NAABSA Marine Surveyors', '{surveyor}'),
        ('Vessel’s command', '{cover_vessel_name}', 'Master: {captain} / Chief Engineer: {cover_chief_engineer}'),
        ('Suppliers', '{supplier}', '{barge_inspector}'),
    ]
    for i, (label, company, person) in enumerate(values):
        row = deepcopy(donor_rows[0 if i == 0 else 2 if i == 3 else 1])
        for cell, lines in zip(row.findall('w:tc', NS), [[label], [company, person]]):
            prototype = cell.find('w:p', NS)
            paragraphs = [paragraph(prototype, value, bold=(j == 0 and len(lines) == 2), size=20)
                          for j, value in enumerate(lines)]
            for child in list(cell):
                if child.tag != '{' + W + '}tcPr':
                    cell.remove(child)
            cell.extend(paragraphs)
        prop(row, 'trPr').append(el('cantSplit'))
        table.append(row)
    new_cover[21] = table
    contents = next(n for n in body if text(n) == 'Contents')
    for node in list(body):
        if node is contents:
            break
        body.remove(node)
    for index, node in enumerate(new_cover):
        body.insert(index, node)

    # Source styles govern role typography; BQS numbering/bookmarks remain native.
    content_started = False
    for node in list(body):
        if node is contents:
            content_started = True
            continue
        if not content_started or node.tag != '{' + W + '}p':
            continue
        headings = node.xpath('w:bookmarkStart[starts-with(@w:name,"bqs_s")]', namespaces=NS)
        if headings:
            main = '_' not in headings[0].get('{' + W + '}name').removeprefix('bqs_')
            model = source[82 if main else 115]
            old = node.find('w:pPr', NS)
            native_num = deepcopy(old.find('w:numPr', NS)) if old is not None and old.find('w:numPr', NS) is not None else None
            breaks = [deepcopy(n) for n in old if E.QName(n).localname in ['pageBreakBefore', 'sectPr']] if old is not None else []
            replace_prop(node, 'pPr', model.find('w:pPr', NS))
            pp = prop(node, 'pPr')
            replace_prop(pp, 'numPr', native_num)
            pp.extend(breaks)
            if pp.find('w:keepNext', NS) is None:
                pp.append(el('keepNext'))
            # The reference separates headings with blank Calibri lines. Use
            # equivalent spacing so BQS's variable tables can paginate naturally.
            replace_prop(pp, 'spacing', el('spacing', before=220, after=100))
            # BQS subsections already own their numbering, including typed labels.
            if not main and native_num is None:
                for ind in pp.findall('w:ind', NS):
                    pp.remove(ind)
            for run in node.findall('.//w:r', NS):
                replace_prop(run, 'rPr', model.find('w:r/w:rPr', NS))
                rp = prop(run, 'rPr')
                replace_prop(rp, 'b', el('b'))
            font(node, 'Calibri', 24 if main else 22)
            if main and native_num is None:
                # Typed BQS main numbers use the same hanging tab as MSC's
                # automatic main headings, rather than a single narrow space.
                first = node.find('w:r/w:t', NS)
                match = re.match(r'^(\d+\.)\s+(.+)$', first.text or '') if first is not None else None
                if match:
                    first.text = match[1]
                    tab = el('tab'); tail = el('t'); tail.text = match[2]
                    first.addnext(tail); first.addnext(tab)
                    tabs = el('tabs'); tabs.append(el('tab', val='left', pos='426'))
                    replace_prop(pp, 'tabs', tabs)
        elif node.find('w:hyperlink', NS) is not None:
            font(node, 'Calibri', 20)
            pp = prop(node, 'pPr')
            for old in pp.findall('w:ind', NS):
                pp.remove(old)
            for tab in pp.findall('w:tabs/w:tab', NS):
                tab.set('{' + W + '}pos', '9923')
        elif text(node).strip():
            font(node, 'Calibri', 22)
            pp = prop(node, 'pPr')
            replace_prop(pp, 'spacing', source[110].find('w:pPr/w:spacing', NS))

    # Dense measurement tables have their own readable 7pt size; other data
    # tables use the same Calibri family. No changes to values or column order.
    for table_node in list(body)[len(new_cover):]:
        for t in ([table_node] if table_node.tag == '{' + W + '}tbl' else table_node.findall('.//w:tbl', NS)):
            cols = t.findall('w:tblGrid/w:gridCol', NS)
            width = sum(int(c.get('{' + W + '}w')) for c in cols)
            if width > 9923:
                widths = [round(int(c.get('{' + W + '}w')) * 9923 / width) for c in cols]
                widths[-1] += 9923 - sum(widths)
                for col, val in zip(cols, widths):
                    col.set('{' + W + '}w', str(val))
                for row in t.findall('w:tr', NS):
                    offset = 0
                    for cell in row.findall('w:tc', NS):
                        span = cell.find('w:tcPr/w:gridSpan', NS)
                        count = int(span.get('{' + W + '}val')) if span is not None else 1
                        replace_prop(prop(cell, 'tcPr'), 'tcW', el('tcW', w=sum(widths[offset:offset+count]), type='dxa'))
                        offset += count
                replace_prop(prop(t, 'tblPr'), 'tblW', el('tblW', w=9923, type='dxa'))
            for p in t.findall('.//w:p', NS):
                font(p, 'Calibri', 14 if len(cols) == 13 else 20)

    # Import the exact header/footer XML and their logo/link relationships.
    rels = E.fromstring(parts['word/_rels/document.xml.rels'])
    ctypes = E.fromstring(parts['[Content_Types].xml'])
    source_ctypes = E.fromstring(reference['[Content_Types].xml'])
    # The MSC package already carries the actual Office typefaces. Reuse these
    # document-embedded fonts so Collabora does not silently substitute them.
    fonts = E.fromstring(parts['word/fontTable.xml'])
    font_links = E.Element('{' + REL + '}Relationships', nsmap={None: REL})
    donor_fonts = E.fromstring(reference['word/fontTable.xml'])
    donor_font_links = E.fromstring(reference['word/_rels/fontTable.xml.rels'])
    for family in ['Tahoma', 'Calibri', 'Times New Roman', 'Cambria', 'GeoSlab703 Md BT']:
        entries = donor_fonts.xpath('w:font[@w:name=$family]', namespaces=NS, family=family)
        if len(entries) != 1:
            raise ValueError('Shared layout font missing: ' + family)
        entry = deepcopy(entries[0])
        embedded = [n for n in entry if E.QName(n).localname.startswith('embed')]
        if not embedded:
            raise ValueError('Shared layout font has no embedded payload: ' + family)
        for n in embedded:
            rid = n.get('{' + R + '}id')
            link = deepcopy(donor_font_links.xpath('*[@Id=$rid]', rid=rid)[0])
            target = link.get('Target')
            if not target.startswith('fonts/msc-') or '..' in target:
                raise ValueError('Unexpected embedded font path')
            parts['word/' + target] = reference['word/' + target]
            new_id = 'naabsaFont' + str(len(font_links) + 1)
            link.set('Id', new_id)
            n.set('{' + R + '}id', new_id)
            font_links.append(link)
        for old in fonts.xpath('w:font[@w:name=$family]', namespaces=NS, family=family):
            fonts.remove(old)
        fonts.append(entry)
    parts['word/fontTable.xml'] = xml(fonts)
    parts['word/_rels/fontTable.xml.rels'] = xml(font_links)
    if ctypes.find("{" + CT + "}Default[@Extension='odttf']") is None:
        entry = E.SubElement(ctypes, '{' + CT + '}Default')
        entry.set('Extension', 'odttf')
        entry.set('ContentType', 'application/vnd.openxmlformats-officedocument.obfuscatedFont')
    settings = E.fromstring(parts['word/settings.xml'])
    for name, value in [('embedTrueTypeFonts', '1'), ('doNotEmbedSystemFonts', '0'), ('saveSubsetFonts', '0')]:
        replace_prop(settings, name, el(name, val=value))
    parts['word/settings.xml'] = xml(settings)
    for part in ['header1.xml', 'header2.xml', 'footer1.xml']:
        target = 'word/naabsa-' + part
        parts[target] = reference['word/' + part]
        source_rel = 'word/_rels/' + part + '.rels'
        if source_rel in reference:
            related = E.fromstring(reference[source_rel])
            for rel in related:
                if rel.get('TargetMode') == 'External':
                    if rel.get('Target') != 'mailto:surveyors@naabsa.com':
                        raise ValueError('Unexpected external header/footer relationship')
                    continue
                original = posixpath.normpath(posixpath.join('word', rel.get('Target')))
                if original != 'word/media/image2.jpg':
                    raise ValueError('Unexpected shared layout dependency: ' + original)
                parts['word/media/naabsa-logo.jpg'] = reference[original]
                rel.set('Target', 'media/naabsa-logo.jpg')
            parts['word/_rels/naabsa-' + part + '.rels'] = xml(related)
        refct = source_ctypes.find("{" + CT + "}Override[@PartName='/word/" + part + "']")
        entry = deepcopy(refct)
        entry.set('PartName', '/' + target)
        ctypes.append(entry)
        rel = E.SubElement(rels, '{' + REL + '}Relationship')
        rel.set('Id', 'rIdNaabsa' + part.replace('.xml', ''))
        rel.set('Type', R + ('/header' if part.startswith('header') else '/footer'))
        rel.set('Target', 'naabsa-' + part)

    # The address table's mail/website links are the only cover relationships.
    source_rels = E.fromstring(reference['word/_rels/document.xml.rels'])
    for node in new_cover:
        for item in node.iter():
            for attr in list(item.attrib):
                if not attr.startswith('{' + R + '}'):
                    continue
                rid = item.get(attr)
                matches = source_rels.xpath('*[@Id=$rid]', rid=rid)
                if len(matches) != 1 or matches[0].get('TargetMode') != 'External' or not re.match(r'^(mailto:surveyors@naabsa\.com|https?://(www\.)?naabsa\.com/?)$', matches[0].get('Target', '')):
                    raise ValueError('Unexpected cover relationship: ' + rid)
                new_id = 'rIdNaabsaCover' + rid
                if not rels.xpath('*[@Id=$rid]', rid=new_id):
                    rel = deepcopy(matches[0]); rel.set('Id', new_id); rels.append(rel)
                item.set(attr, new_id)

    source_sections = donor.findall('.//w:sectPr', NS)
    for i, section in enumerate(doc.findall('.//w:sectPr', NS)):
        donor_section = source_sections[0 if i == 0 else -1]
        for tag in ['pgSz', 'pgMar', 'cols']:
            replace_prop(section, tag, donor_section.find('w:' + tag, NS))
        for n in section.findall('w:headerReference', NS) + section.findall('w:footerReference', NS):
            section.remove(n)
        for kind, mode, part in [('header', 'default', 'header1'), ('header', 'first', 'header2'), ('footer', 'default', 'footer1')]:
            n = el(kind + 'Reference', type=mode)
            n.set('{' + R + '}id', 'rIdNaabsa' + part)
            section.insert(0, n)
    order_properties(doc)
    parts['word/document.xml'] = xml(doc)
    parts['word/_rels/document.xml.rels'] = xml(rels)
    parts['[Content_Types].xml'] = xml(ctypes)
