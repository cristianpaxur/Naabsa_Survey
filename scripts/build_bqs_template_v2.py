"""Patch the retained BQS Word package; never reconstruct its design.

Usage: bundled-python scripts/build_bqs_template_v2.py --source private.docx
The input is deliberately not distributed. All unchanged package parts retain
their exact bytes. Private embedded objects and demonstration content are removed.
"""
import argparse
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import zipfile
from lxml import etree as E

ROOT = Path(__file__).resolve().parents[1]
SOURCE_SHA256 = '1fbc24ca016577e097c12a4451ce08d6cc028d264b9daabbb5fc50f76e78a4b9'
W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
NS = {'w': W}
def el(tag, **attrs):
    n = E.Element('{'+W+'}'+tag)
    for k, v in attrs.items(): n.set('{'+W+'}'+k, str(v))
    return n
def write_text(p, value):
    props = p.find('w:pPr', NS)
    old = p.find('.//w:rPr', NS)
    rp = deepcopy(old) if old is not None else None
    for c in list(p):
        if c is not props: p.remove(c)
    r = el('r')
    if rp is not None: r.append(rp)
    t = el('t'); t.text = value; t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve'); r.append(t); p.append(r)
def manual(p, name):
    s = el('sdt'); pr = el('sdtPr'); pr.append(el('tag', val='bqs_manual_'+name)); s.append(pr)
    content = el('sdtContent'); r = el('r'); t = el('t'); t.text = '—'; r.append(t); content.append(r); s.append(content); p.append(s)
def xml(n): return E.tostring(n, encoding='UTF-8', xml_declaration=True, standalone=True)

def build(source, output, evidence=None):
    raw = source.read_bytes()
    if hashlib.sha256(raw).hexdigest() != SOURCE_SHA256: raise ValueError('Unrecognized source Word SHA-256; re-inventory required')
    with zipfile.ZipFile(source) as z: parts = {n:z.read(n) for n in z.namelist()}
    d = E.fromstring(parts['word/document.xml']); body = d.find('w:body', NS); nodes = list(body)
    if len(nodes) != 232 or len(body.findall('w:tbl', NS)) != 4: raise ValueError('Source Word structure changed')
    with zipfile.ZipFile(ROOT/'templates/bqs.clean.docx') as z: v1 = E.fromstring(z.read('word/document.xml'))
    vbody = list(v1.find('w:body', NS))
    photos = {s.find('w:sdtPr/w:tag', NS).get('{'+W+'}val'):s for s in v1.findall('.//w:sdt', NS) if s.find('w:sdtPr/w:tag', NS) is not None}
    headings = [(82,'s1'),(88,'s2'),(98,'s3'),(102,'s4'),(104,'s4_1'),(121,'s4_2'),(124,'s4_3'),(131,'s4_4'),(136,'s4_5'),(148,'s4_6'),(151,'s4_7'),(154,'s4_8'),(159,'s5'),(161,'s5_1'),(173,'s5_2'),(192,'s6'),(197,'s7'),(199,'s7_1'),(215,'s7_2'),(221,'s7_3'),(226,'s8')]
    # Slots are stable original body indexes, validated by the structure and hash.
    replacements = {
      4:'Ref: {report_reference}',9:'{cover_vessel_name}',10:'Flag {vessel_flag} – IMO {vessel_imo}',11:'at {cover_port} / Brazil – {report_date}',
      84:'The vessel {cover_vessel_name} called {cover_port}. Cargo: {cargo}. Discharging port: {discharging_port}. Operation: ',
      86:'Complying with the appointment from {client}, we attended to carry out a Bunker Quantity Survey to ascertain the quantity of {fuel_grade} delivered by {barge_name}.',
      90:'Flag: {vessel_flag}',91:'Port registry: {vessel_register_port}',92:'Call sign: {vessel_call_sign}',93:'IMO number: {vessel_imo}',94:'Type: {vessel_type}',95:'Delivered: {vessel_delivered}',96:'LOA: {vessel_loa} m',
      100:'The undersigned surveyor boarded the vessel on {arrival_date} at {arrival_start} local time. The initial meeting was recorded from {meeting_start} to {meeting_end}.',
      105:'Opening soundings of the vessel’s tanks were carried out by {sounding_person} on {vessel_open_date} from {vessel_open_start} to {vessel_open_end} local time.',
      110:'Logbook ({fuel_grade}): {vessel_logbook} mt',111:'NAABSA opening figures (IN AIR): {vessel_open_air} mt',112:'Difference (logbook minus opening): {cover_logbook_difference} mt',
      125:'FO storage tanks: {temperature_fo_storage}',126:'DO storage tanks: {temperature_do_storage}',127:'FO service and settling tanks: {temperature_fo_service_settling}',128:'DO service and settling tanks: {temperature_do_service_settling}',129:'Engine room: {engine_room_temperature} °C / Sea water: {sea_water_temperature} °C',
      137:'Opening soundings of the barge’s tanks were recorded on {barge_open_date} from {barge_open_start} to {barge_open_end} local time.',
      141:'Barge inspector opening figures (mt): ',142:'Surveyor opening figures (IN AIR): {barge_open_air} mt',143:'Opening difference (mt): ',144:'Opening flowmeter reading: {barge_open_flowmeter}',145:'Flowmeter calibration date: {barge_flowmeter_calibration}',146:'Flowmeter seal: {barge_flowmeter_seal}',
      152:'Thermometer: {barge_thermometer}. Thermometer number: ',
      162:'Closing soundings of the vessel’s tanks were recorded on {vessel_close_date} from {vessel_close_start} to {vessel_close_end} local time.',
      169:'Initial quantity (IN AIR): {vessel_open_air} mt',170:'Final quantity (IN AIR): {vessel_close_air} mt',171:'Quantity received: {vessel_received} mt',
      174:'Closing soundings of the barge’s tanks were recorded on {barge_close_date} from {barge_close_start} to {barge_close_end} local time.',
      176:'Barge inspector closing figures (mt): ',177:'Surveyor closing figures (IN AIR): {barge_close_air} mt',178:'Closing difference (mt): ',179:'Closing flowmeter reading: {barge_close_flowmeter}',
      193:'BDN quantity: {bdn_quantity} mt',194:'Surveyor vessel tanks: {vessel_received} mt',195:'Difference (vessel minus BDN): {delivery_difference} mt / {delivery_difference_pct}%. Barge declared delivered: {barge_declared_delivered} mt; surveyor delivered: {barge_delivered} mt; difference: {barge_delivery_difference} mt.',
      228:'Attachment references: ',229:'',230:'',
    }
    for i, value in replacements.items(): write_text(nodes[i],value)
    for i,name in [(84,'operation'),(141,'barge_inspector_open'),(143,'barge_open_difference'),(152,'thermometer_number'),(176,'barge_inspector_close'),(178,'barge_close_difference'),(228,'attachments')]: manual(nodes[i],name)
    # Native contact and density tables retain original grids, row and cell properties.
    values = [['Client','{client}\n{operator}'],['Undersigned surveyor','NAABSA Marine Surveyors\n{surveyor}'],['Vessel’s command','Master: {captain}\nChief Engineer: {cover_chief_engineer}'],['Suppliers','{supplier}\n{barge_inspector}']]
    for tr, row in zip(nodes[19].findall('w:tr',NS),values):
        for tc,value in zip(tr.findall('w:tc',NS),row):
            ps=tc.findall('w:p',NS); write_text(ps[0],value)
            for p in ps[1:]: tc.remove(p)
    for index, fields in [(134,['{bunker_reference_temperature}','{specific_gravity}']),(157,['15','{bdn_density_15}','20','{bdn_density_20}'])]:
        ps=nodes[index].findall('w:tr',NS)[1:]
        for p,value in zip([tc.find('w:p',NS) for tr in ps for tc in tr.findall('w:tc',NS)],fields): write_text(p,value)
    # Remove all drawing/OLE content before introducing safe native components.
    for n in list(d.xpath('//w:drawing|//w:pict|//w:object|//w:commentRangeStart|//w:commentRangeEnd|//w:commentReference|//w:highlight',namespaces=NS)):
        n.getparent().remove(n)
    # Original headings mix automatic numbering and typed prefixes. Keep the native numPr.
    for number,(i,name) in enumerate(headings,1):
        p=nodes[i]; value=''.join(p.xpath('.//w:t/text()',namespaces=NS))
        if p.find('w:pPr/w:numPr',NS) is not None:
            value=re.sub(r'^\s*\d+(?:\.\d+)*\.?\s*','',value)
        write_text(p,value.strip()); p.insert(1,el('bookmarkStart',id=100+number,name='bqs_'+name));p.append(el('bookmarkEnd',id=100+number))
        hp=p.find('w:pPr',NS)
        if hp is not None and hp.find('w:keepNext',NS) is None:hp.append(el('keepNext'))
        section_number=name[1:].replace('_','.')
        label=re.sub(r'^\s*\d+(?:\.\d+)*\.?\s*','',value).strip()
        toc=nodes[23+number];write_text(toc,section_number+'. '+label+'\t')
        pr=toc.find('w:pPr',NS)
        if pr is not None:
            for n in pr.findall('w:numPr',NS): pr.remove(n)
            for n in pr.findall('w:tabs',NS): pr.remove(n)
            tabs=el('tabs');tabs.append(el('tab',val='right',leader='dot',pos='10000'));pr.append(tabs)
        link=el('hyperlink',anchor='bqs_'+name)
        for n in list(toc):
            if n.tag!='{'+W+'}pPr':link.append(n)
        f=el('fldSimple',instr=' PAGEREF bqs_'+name+' \\h ');r=el('r');t=el('t');t.text='{toc_'+name+'}';r.append(t);f.append(r);link.append(f);toc.append(link)
    for i in [22,82]:
        pr=nodes[i].find('w:pPr',NS)
        if pr is None: pr=el('pPr');nodes[i].insert(0,pr)
        pr.append(el('pageBreakBefore'))
    # Keep the three final quantities and their editable remarks together.
    for i in [193,194,195]:
        pr=nodes[i].find('w:pPr',NS)
        if pr is None:pr=el('pPr');nodes[i].insert(0,pr)
        if pr.find('w:keepNext',NS) is None:pr.append(el('keepNext'))
    # Keep the vessel receipt caption with its three figures across renderers.
    # The tank measurement table remains free to paginate independently.
    for i in [167,169,170]:
        pr=nodes[i].find('w:pPr',NS)
        if pr is None:pr=el('pPr');nodes[i].insert(0,pr)
        if pr.find('w:keepNext',NS) is None:pr.append(el('keepNext'))
    # Reuse four native editable table components, keeping 13-column runtime tags.
    for i,prefix in [(106,'vessel_open'),(139,'barge_open'),(164,'vessel_close'),(190,'barge_close')]:
        start=next(j for j,p in enumerate(vbody) if '{'+prefix+'_fore}' in ''.join(p.xpath('.//w:t/text()',namespaces=NS)))
        for component in vbody[start:start+2]:
            native=deepcopy(component)
            for fonts in native.findall('.//w:rFonts',NS):
                for attr in ['ascii','hAnsi','cs']:fonts.set('{'+W+'}'+attr,'Tahoma')
            nodes[i].addprevious(native)
    for i,slot in [(15,'cover'),(123,'sounding_tables'),(200,'vessel_tanks'),(216,'barge_tanks'),(222,'sampling')]: nodes[i].addprevious(deepcopy(photos['bqs_photos_'+slot]))
    remark=el('p');write_text(remark,'Surveyor’s final remarks: ');manual(remark,'final_remarks');nodes[196].addprevious(remark)
    # Truly blank spacer sequences are replaced by natural flow; section boundaries stay.
    for p in list(body):
        if p.tag=='{'+W+'}p' and not ''.join(p.xpath('.//w:t/text()',namespaces=NS)).strip() and not p.xpath('.//w:sectPr|.//w:br|.//w:bookmarkStart|.//w:sdt',namespaces=NS): body.remove(p)
    parts['word/document.xml']=xml(d)
    # The source cover footer has a literal sample page number. Replace just it
    # with a native PAGE field, keeping the existing run typography and chrome.
    footer=E.fromstring(parts['word/footer2.xml'])
    for t in footer.findall('.//w:t',NS):
        if t.text and re.search(r'\s4$',t.text):
            t.text=t.text[:-1]
            run=t.getparent();field=el('fldSimple',instr=' PAGE ')
            fr=el('r');rp=run.find('w:rPr',NS)
            if rp is not None:fr.append(deepcopy(rp))
            ft=el('t');ft.text='1';fr.append(ft);field.append(fr);run.addnext(field)
    parts['word/footer2.xml']=xml(footer)
    # Preserve header text/design except opaque OLE objects, which can contain private data.
    for n in list(parts):
        if re.match(r'word/header\d+\.xml$',n):
            h=E.fromstring(parts[n]); objects=h.findall('.//w:object',NS)
            if objects:
                for obj in objects:obj.getparent().remove(obj)
                parts[n]=xml(h)
    removed={n for n in parts if n.startswith(('customXml/','word/embeddings/','docProps/')) or 'comments' in n or (n.startswith('word/media/') and n!='word/media/image3.jpg')}
    for n in removed:del parts[n]
    # Drop relationships to removed content and private external hyperlinks.
    relns='http://schemas.openxmlformats.org/package/2006/relationships'
    import posixpath
    for n in list(parts):
        if n.endswith('.rels'):
            root=E.fromstring(parts[n]); changed=False
            base='' if n=='_rels/.rels' else posixpath.dirname(n).removesuffix('/_rels')
            for rel in list(root):
                target=posixpath.normpath(posixpath.join(base,rel.get('Target','')))
                if target in removed or (rel.get('TargetMode')=='External' and rel.get('Target') not in ['mailto:surveyors@naabsa.com','https://www.naabsa.com','http://www.naabsa.com']):root.remove(rel);changed=True
            if changed:parts[n]=xml(root)
    ct=E.fromstring(parts['[Content_Types].xml'])
    for c in list(ct):
        if c.get('PartName','').lstrip('/') in removed:ct.remove(c)
    parts['[Content_Types].xml']=xml(ct)
    # Remove only personal session metadata; formatting/theme/numbering are opaque.
    settings=E.fromstring(parts['word/settings.xml'])
    for n in settings.findall('w:docVars',NS):settings.remove(n)
    uf=settings.find('w:updateFields',NS)
    if uf is None:uf=el('updateFields');settings.append(uf)
    uf.set('{'+W+'}val','true');parts['word/settings.xml']=xml(settings)
    output.parent.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output,'w',zipfile.ZIP_DEFLATED) as z:
        for n,b in parts.items():
            zi=zipfile.ZipInfo(n,(2026,1,1,0,0,0));zi.compress_type=zipfile.ZIP_DEFLATED;z.writestr(zi,b)
    if evidence:
        with zipfile.ZipFile(source) as z:
            inventory=[{'part':n,'bytes':len(z.read(n)),'source_sha256':hashlib.sha256(z.read(n)).hexdigest(),'status':'removed' if n not in parts else 'preserved' if z.read(n)==parts[n] else 'edited','output_sha256':hashlib.sha256(parts[n]).hexdigest() if n in parts else None} for n in z.namelist()]
        evidence.write_text(json.dumps(inventory,indent=2),encoding='utf-8')
    print(output)

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,default=ROOT/'templates/bqs.v2.clean.docx');p.add_argument('--manifest',type=Path);a=p.parse_args();build(a.source,a.output,a.manifest)
