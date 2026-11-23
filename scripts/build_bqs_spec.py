"""Reproduce the BQS v1 cell contract. Does not modify client workbooks."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
fields = {}


def field(name, sheet, cell, label, section, kind='string', required=False, decimals=None, anchor=None):
    item = dict(sheet=sheet, cell=cell, type=kind, label=label, section=section)
    if required:
        item['required'] = True
    if decimals is not None:
        item['decimals'] = decimals
    if kind == 'date':
        item['format'] = 'DD/MM/YYYY'
    if anchor:
        item['row_anchor'] = dict(range='A16:A40', expect=anchor)
    fields[name] = item


for name, cell, label in [
    ('vessel_name', 'C8', 'Navio'), ('fuel_grade', 'I8', 'Combustível'),
    ('survey_location', 'I9', 'Local'), ('barge_name', 'C10', 'Barcaça'),
    ('survey_start_text', 'I10', 'Início informado na capa'),
    ('survey_end_text', 'I11', 'Fim informado na capa'),
    ('chief_engineer', 'D74', 'Chefe de máquinas'), ('surveyor', 'K74', 'Surveyor'),
    ('vessel_thermometer', 'C57', 'Temperatura: método do navio'),
    ('line_condition', 'C58', 'Condição da linha'), ('water_detection', 'C60', 'Detecção de água'),
]:
    field(name, 'Vessel Ullage', cell, label, 'Identificação', required=name in ['vessel_name', 'fuel_grade', 'survey_location', 'surveyor'])

for prefix, sheet, row, cols in [
    ('vessel_open', 'Vessel Ullage', 18, ('B','E','H','K')),
    ('vessel_close', 'Vessel Ullage', 38, ('B','E','H','K')),
    ('barge_open', 'Sounding Barge', 17, ('C','F','I','L')),
    ('barge_close', 'Sounding Barge', 34, ('C','F','I','L')),
]:
    for suffix, col, label in zip(['fore','aft','list','trim_corrected'], cols, ['Calado proa','Calado popa','Banda','Correção de trim aplicada']):
        kind = 'string' if suffix == 'trim_corrected' else 'number'
        field(f'{prefix}_{suffix}', sheet, f'{col}{row}', label, prefix, kind, decimals=2 if kind == 'number' else None)

for name, sheet, cell, label, decimals in [
    ('vessel_open_air','Vessel Ullage','M33','Navio antes IN AIR',3),
    ('vessel_close_air','Vessel Ullage','M53','Navio depois IN AIR',3),
    ('vessel_open_vac','Vessel Ullage','L33','Navio antes IN VAC',3),
    ('vessel_close_vac','Vessel Ullage','L53','Navio depois IN VAC',3),
    ('vessel_logbook','Vessel Ullage','K35','Logbook antes',3),
    ('vessel_logbook_difference','Vessel Ullage','M35','Navio menos logbook',3),
    ('bdn_quantity','Vessel Ullage','L58','Quantidade BDN',3),
    ('vessel_received','Vessel Ullage','L59','Recebido pelo navio',3),
    ('delivery_difference','Vessel Ullage','L60','Navio menos BDN',3),
    ('delivery_difference_pct','Vessel Ullage','L61','Diferença percentual (já em %)',3),
    ('barge_open_air','Sounding Barge','N30','Barcaça antes IN AIR',3),
    ('barge_close_air','Sounding Barge','N47','Barcaça depois IN AIR',3),
    ('barge_open_vac','Sounding Barge','M30','Barcaça antes IN VAC',3),
    ('barge_close_vac','Sounding Barge','M47','Barcaça depois IN VAC',3),
    ('barge_delivered','Sounding Barge','M49','Fornecido pela barcaça IN AIR',3),
    ('bdn_density_15','Sounding Barge','B51','Densidade BDN a 15 °C',4),
    ('bdn_density_20','Sounding Barge','E51','Densidade BDN a 20 °C',4),
]:
    field(name,sheet,cell,label,'Quantidades e densidades','number',True,decimals)

for name, cell, label in [
    ('barge_open_flowmeter','K16','Leitura inicial do fluxômetro'),
    ('barge_close_flowmeter','K33','Leitura final do fluxômetro'),
    ('barge_flowmeter_quantity','M51','Quantidade pelo fluxômetro'),
    ('barge_thermometer','D58','Termômetro da barcaça'),
    ('barge_flowmeter_type','D54','Tipo de fluxômetro'),
    ('barge_flowmeter_seal','D56','Lacre do fluxômetro'),
]:
    field(name,'Sounding Barge',cell,label,'Instrumentos')
field('barge_flowmeter_calibration','Sounding Barge','D55','Calibração do fluxômetro','Instrumentos','date')

events = [
    ('arrival',18,'Surveyor onboard'), ('meeting',19,'Meeting between C/E and surveyor'),
    ('vessel_open',20,'Initial Soundings/Ullage - Vessel'), ('barge_arrival',22,'Bunker Barge arrived'),
    ('barge_open',24,'Initial Soundings/Ullage - Barge'), ('bunkering',26,'Bunkering operation'),
    ('barge_close',27,'Final Soundings/Ullage - Barge'), ('vessel_close',28,'Final Soundings/Ullage - Vessel'),
    ('departure',32,'Surveyor off board'),
]
field('survey_date','Time Log','D18','Data da vistoria','Cronologia','date',True,anchor='Surveyor onboard')
for prefix,row,label in events:
    for suffix,col,kind in [('date','D','date'),('start','E','time'),('end','F','time')]:
        field(f'{prefix}_{suffix}','Time Log',f'{col}{row}',f'{label} — {suffix}','Cronologia',kind,suffix != 'end',anchor=label)

for name,cell,label in [('sampling_tanks','D21','Tanques amostrados'),('sampling_method','D22','Método'),('sample_vessel_point','D23','Ponto no navio'),('sample_barge_point','F23','Ponto na barcaça'),('sample_vessel_quantity','D24','Frascos do navio'),('sample_barge_quantity','F24','Frascos da barcaça')]:
    field(name,'Sample Report',cell,label,'Amostragem')
for party,col in [('vessel','D'),('barge','F')]:
    for suffix,row in [('chief',26),('supplier',27),('laboratory',28),('marpol',29),('surveyor',30)]:
        field(f'sample_{party}_{suffix}','Sample Report',f'{col}{row}',f'Lacre {party} — {suffix}','Amostragem')

spec = dict(report_type='bqs',version=1,contract=2,variants=[],source=dict(
    fingerprint=dict(sheet='Vessel Ullage',cell='A6',expect='VESSEL´S SOUNDING/ULLAGE REPORT'),
    ignore_sheets=['VacuoAr','Letter of Protest (2)'], common=dict(fields=fields),
    tables=[dict(id=name,label=label,sheet=sheet,range=area) for name,label,sheet,area in [
        ('vessel_open','Tanques do navio antes','Vessel Ullage','A21:M32'),
        ('vessel_close','Tanques do navio depois','Vessel Ullage','A41:M52'),
        ('barge_open','Tanques da barcaça antes','Sounding Barge','B20:N29'),
        ('barge_close','Tanques da barcaça depois','Sounding Barge','B37:N46'),
    ]]), photo_slots=[dict(id=name,label=label,aspect='4:3',required=False,**({'max':1} if name=='cover' else {})) for name,label in [
        ('cover','Capa'),('sounding_tables','Tabelas de sondagem'),('vessel_tanks','Tanques do navio'),('barge_tanks','Tanques da barcaça'),('sampling','Amostragem')]])
spec['_meta'] = dict(sources=['Planilha BQS e PDF de referência privados (não distribuídos)'],notes=[
    'PDF de outro navio, com anotações e inconsistências: referência de estrutura, não dados nem baseline raster.',
    'bqs é um identificador novo explícito; não modifica bunker_surveyor nem suas variantes legadas.',
    'Horários inválidos exigem override explícito; não corrigir silenciosamente o arquivo de origem.',
    'Campos ausentes ficam em controles de conteúdo editáveis no Word. Não associar células vazias arbitrárias.',
    'L61 já contém pontos percentuais: não multiplicar novamente por 100.',
    'A presença da aba Letter of Protest (2) não demonstra emissão/assinatura. Não declarar protesto automaticamente.',
    'Tabelas mantêm inclusive linhas numéricas zeradas: confirmar se são reservas antes de removê-las.',
])
(ROOT/'tests/fixtures/specs/bqs.v1.json').write_text(json.dumps(spec,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(ROOT/'packages/db/migrations/0029_register_bqs.sql').write_text(
    '-- Generated by scripts/build_bqs_spec.py. Registers BQS without activating it.\n'
    '-- Apply and activate only after acceptance in the destination editor/converter.\n'
    "insert into public.report_types(slug,name,variants) values ('bqs','BQS — Bunker Quantity Survey',array[]::text[]) on conflict(slug) do nothing;\n\n"
    'insert into public.report_specs(report_type_id,version,spec)\n'
    "select id,1,$bqs_spec$"+json.dumps(spec,ensure_ascii=False,indent=2)+"$bqs_spec$::jsonb\n"
    "from public.report_types where slug='bqs'\n"
    'on conflict(report_type_id,version) do nothing;\n'
    '-- active_spec_id is deliberately unchanged. Existing bunker_surveyor records are untouched.\n',encoding='utf-8')
print(f'BQS spec: {len(fields)} fields; 4 tank tables; 5 photo slots')
