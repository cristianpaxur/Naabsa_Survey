"""Build immutable BQS v2 from the reviewed cell contract, never customer data."""
import copy
import json
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
spec = copy.deepcopy(json.loads((ROOT/'tests/fixtures/specs/bqs.v1.json').read_text(encoding='utf-8')))
spec['version'] = 2
src = spec['source']; src['fingerprint']['sheet'] = 'Vessel'
src['ignore_sheets'] = ['VacuoAr', 'Letter of Protest']
f = src['common']['fields']
for item in f.values():
    item['sheet'] = {'Vessel Ullage':'Vessel','Sounding Barge':'Barge'}.get(item['sheet'],item['sheet'])
moves = {'chief_engineer':'D93','surveyor':'K93','vessel_thermometer':'C76','line_condition':'C77','water_detection':'C79','vessel_open_air':'M45','vessel_close_air':'M72','vessel_open_vac':'L45','vessel_close_vac':'L72','bdn_quantity':'L77','vessel_received':'L78','delivery_difference':'L79','delivery_difference_pct':'L80','barge_open_air':'N28','barge_close_air':'N43','barge_open_vac':'M28','barge_close_vac':'M43','barge_delivered':'M46','bdn_density_15':'B47','bdn_density_20':'E47','barge_close_flowmeter':'K31','barge_flowmeter_quantity':'M50','barge_thermometer':'D54','barge_flowmeter_type':'D50','barge_flowmeter_seal':'D52','barge_flowmeter_calibration':'D51'}
for name, cell in moves.items(): f[name]['cell']=cell
# A calibration marked N/A must remain a reviewable invalid date, not disappear.
f['vessel_logbook'].update(sheet='Capa',cell='C28')
del f['vessel_logbook_difference']  # No same-sign cell exists in this workbook.
for p,row in [('vessel_open',17),('vessel_close',50),('barge_open',17),('barge_close',32)]:
    for suffix in ['fore','aft','list','trim_corrected']:
        item=f[p+'_'+suffix]; item['cell']=''.join(c for c in item['cell'] if c.isalpha())+str(row)
for name,row,label in [('arrival',20,'Surveyor embarked'),('meeting',21,'Meeting between Chief Engineer and Surveyor'),('vessel_open',22,'Initial soundings / Ullage - Vessel'),('barge_arrival',19,'Bunker Barge arrived'),('barge_open',24,'Initial soundings / Ullage - Barge'),('bunkering',26,'Bunkering operation'),('barge_close',27,'Final soundings / Ullage - Barge'),('vessel_close',28,'Final soundings / Ullage - Vessel'),('departure',32,'Surveyor disembarked')]:
    for suffix,col in [('date','D'),('start','E'),('end','F')]:
        item=f[name+'_'+suffix];item['cell']=col+str(row);item['row_anchor']={'range':'A16:A34','expect':label}
f['survey_date'].update(cell='D20',row_anchor={'range':'A16:A34','expect':'Surveyor embarked'})
def add(name,cell,label,kind='string',sheet='Capa',decimals=None):
    item=dict(sheet=sheet,cell=cell,type=kind,label=label,section='Capa' if sheet=='Capa' else 'Quantidades e densidades')
    if kind=='date': item['format']='DD/MM/YYYY'
    if decimals is not None:item['decimals']=decimals
    f[name]=item
for name,cell,label in [('report_reference','C10','Referência'),('cover_port','C11','Porto da capa'),('terminal','C12','Terminal'),('cover_vessel_name','C14','Navio da capa'),('vessel_flag','C15','Bandeira'),('vessel_register_port','C16','Porto de registro'),('vessel_call_sign','C17','Indicativo'),('vessel_imo','C18','IMO'),('vessel_type','C19','Tipo do navio'),('vessel_delivered','C20','Ano de entrega'),('captain','C25','Comandante'),('cover_chief_engineer','C26','Chefe de máquinas da capa'),('sounding_person','C27','Responsável pela sondagem'),('client','C30','Cliente'),('operator','C31','Operador'),('cargo','C33','Carga'),('discharging_port','C34','Porto de descarga'),('supplier','C36','Fornecedor'),('barge_inspector','C37','Inspetor'),('temperature_fo_storage','C40','Temperatura FO armazenagem'),('temperature_do_storage','C41','Temperatura DO armazenagem'),('temperature_fo_service_settling','C42','Temperatura FO serviço e decantação'),('temperature_do_service_settling','C43','Temperatura DO serviço e decantação'),('cover_thermometer','C46','Termômetro da capa'),('bunker_reference_temperature','C48','Temperatura de referência do combustível'),('specific_gravity','C49','Densidade específica'),('company_contact','E4','Contato da empresa')]: add(name,cell,label)
for name,cell,label in [('vessel_loa','C21','Comprimento LOA (m)'),('engine_room_temperature','C44','Temperatura praça máquinas (°C)'),('sea_water_temperature','C45','Temperatura água do mar (°C)'),('cover_logbook_difference','E28','Logbook menos abertura (mt)')]:add(name,cell,label,'number',decimals=3)
add('report_date','C23','Data de término','date')
add('barge_declared_delivered','M45','Fornecido declarado pela barcaça','number','Barge',3)
add('barge_delivery_difference','M47','Surveyor menos declarado barcaça','number','Barge',3)
for table,sheet,area in zip(src['tables'],['Vessel','Vessel','Barge','Barge'],['A20:M44','A53:M71','B20:N27','B35:N42']):table.update(sheet=sheet,range=area)
spec['_meta']={'sources':['Private workbook and original Word reference; no customer values distributed.'],'notes':['V2 uses explicit sheet names and preserves all 13 tank columns and cached values.','Capa identity differs from operational sheets: review and explicit override required before generation.','cover_logbook_difference is logbook minus vessel opening; no same-semantics vessel_logbook_difference source exists.','delivery_difference_pct uses received quantity denominator (L79/L78)*100; already percentage points.','Time Log textual dates and N/A calibration require explicit review if coercion rejects them.','Presence of Letter of Protest does not establish issuance or signature.','Blank source cells stay blank; overrides take precedence. Formula caches are not recalculated.']}
encoded=json.dumps(spec,ensure_ascii=False,indent=2)+'\n'
(ROOT/'tests/fixtures/specs/bqs.v2.json').write_text(encoded,encoding='utf-8')
(ROOT/'packages/db/migrations/0030_register_bqs_v2.sql').write_text('-- Generated by scripts/build_bqs_spec_v2.py. Register inactive v2; never changes active_spec_id.\ninsert into public.report_specs(report_type_id,version,spec)\nselect id,2,$bqs_spec$'+encoded+'$bqs_spec$::jsonb\nfrom public.report_types where slug=\'bqs\'\non conflict(report_type_id,version) do nothing;\n',encoding='utf-8')
print(f'BQS v2: {len(f)} fields')
