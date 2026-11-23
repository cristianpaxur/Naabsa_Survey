-- Gerado por scripts/generate-spec-repair.mjs. Não editar o SQL manualmente.
-- 015/C10/C11: corrige valores conhecidos, preserva customizações e relatórios históricos.
create or replace function public.repair_spec_text_015(value jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $repair$
declare result jsonb; text_value text;
  dictionary constant jsonb := $dictionary${"Contrato v2: campos com `sheet` por campo, fingerprint com `sheet`, `variant_source` (Capa!L4) e `tables` (range-based). O validateSpec/extractor atuais (contrato v1, aba Ãºnica) precisam ser estendidos antes de validar/extrair este spec â€” ver implementation/003 T-013..T-016.":"Contrato v2: campos com `sheet` por campo, fingerprint com `sheet`, `variant_source` (Capa!L4) e `tables` (range-based). O validateSpec/extractor atuais (contrato v1, aba única) precisam ser estendidos antes de validar/extrair este spec — ver implementation/003 T-013..T-016.","DATAS (2026-06-23): os mirrors Capa!L7/L8/L9 sÃ£o fÃ³rmulas dynamic-array LET que o ExcelJS NÃƒO avalia (result=Invalid Date â†’ NaN). Lemos as datas direto das cÃ©lulas-fonte avaliÃ¡veis Inicial!C7, Intermediario!C5, final!C5 (type=date â†’ ISO; o builder formata em inglÃªs 'Month Dth, YYYY'). Horas (M/N) seguem na Capa, que o ExcelJS avalia.":"DATAS (2026-06-23): os mirrors Capa!L7/L8/L9 são fórmulas dynamic-array LET que o ExcelJS NÃO avalia (result=Invalid Date → NaN). Lemos as datas direto das células-fonte avaliáveis Inicial!C7, Intermediario!C5, final!C5 (type=date → ISO; o builder formata em inglês 'Month Dth, YYYY'). Horas (M/N) seguem na Capa, que o ExcelJS avalia.","ServiÃ§o":"Serviço","ArmazÃ©m (shed)":"Armazém (shed)","AgÃªncia":"Agência","Lado de atracaÃ§Ã£o":"Lado de atracação","OperaÃ§Ã£o":"Operação","Data â€” Inicial":"Data — Inicial","InÃ­cio â€” Inicial":"Início — Inicial","Fim â€” Inicial":"Fim — Inicial","Data â€” IntermediÃ¡rio":"Data — Intermediário","InÃ­cio â€” IntermediÃ¡rio":"Início — Intermediário","Fim â€” IntermediÃ¡rio":"Fim — Intermediário","Data â€” Final":"Data — Final","InÃ­cio â€” Final":"Início — Final","Fim â€” Final":"Fim — Final","AV (Fwd) mÃ©dio":"AV (Fwd) médio","Calados â€” Inicial":"Calados — Inicial","MN (Ms) mÃ©dio":"MN (Ms) médio","AR (Aft) mÃ©dio":"AR (Aft) médio","Â°":"°","Heel â€” lado":"Heel — lado","Deflection â€” tipo":"Deflection — tipo","Calados â€” IntermediÃ¡rio":"Calados — Intermediário","List â€” lado":"List — lado","Calados â€” Final":"Calados — Final","Figures â€” IntermediÃ¡rio":"Figures — Intermediário","DiferenÃ§a (MT)":"Diferença (MT)","DiferenÃ§a (%)":"Diferença (%)","Figures â€” Final":"Figures — Final","Initial â€” Draft marks & corrections":"Initial — Draft marks & corrections","Initial â€” Displacement corrections":"Initial — Displacement corrections","Initial â€” Ballast water":"Initial — Ballast water","Initial â€” Fresh water & bunkers":"Initial — Fresh water & bunkers","Intermediate â€” Draft marks & corrections":"Intermediate — Draft marks & corrections","Intermediate â€” Displacement corrections":"Intermediate — Displacement corrections","Intermediate â€” Ballast water":"Intermediate — Ballast water","Intermediate â€” Fresh water & bunkers":"Intermediate — Fresh water & bunkers","Final â€” Draft marks & corrections":"Final — Draft marks & corrections","Final â€” Displacement corrections":"Final — Displacement corrections","Final â€” Ballast water":"Final — Ballast water","Final â€” Fresh water & bunkers":"Final — Fresh water & bunkers","Intermediate â€” Acting as / figures":"Intermediate — Acting as / figures","Final â€” Acting as / figures":"Final — Acting as / figures","LOA fora do intervalo usual (50â€“400 m) â€” confira a cÃ©lula Capa!C20.":"LOA fora do intervalo usual (50–400 m) — confira a célula Capa!C20.","Summer DWT fora do intervalo usual â€” confira a cÃ©lula Capa!C26.":"Summer DWT fora do intervalo usual — confira a célula Capa!C26.","DiferenÃ§a final acima de 0,5% entre figuras â€” revisar antes de aprovar.":"Diferença final acima de 0,5% entre figuras — revisar antes de aprovar.","Photographic Report â€” Initial":"Photographic Report — Initial","Photographic Report â€” Intermediate":"Photographic Report — Intermediate","Photographic Report â€” Final":"Photographic Report — Final","MSC Report - revisado.docx (modelo Word do cliente, instruÃ§Ãµes em vermelho)":"MSC Report - revisado.docx (modelo Word do cliente, instruções em vermelho)","Variantes vazias (msc Ã© um tipo Ãºnico, sem loading/discharge).":"Variantes vazias (msc é um tipo único, sem loading/discharge).","Planilha SABRINA tem 8 abas; sÃ³ Summary/Time Log/Sludge/Qtt Sumary/LOG Audit estÃ£o no escopo da spec v1. LNG, VacuoAr, Vessel Ullage ficam em ignore_sheets (a tabela de Ullage Ã© input do operador, nÃ£o sai no relatÃ³rio).":"Planilha SABRINA tem 8 abas; só Summary/Time Log/Sludge/Qtt Sumary/LOG Audit estão no escopo da spec v1. LNG, VacuoAr, Vessel Ullage ficam em ignore_sheets (a tabela de Ullage é input do operador, não sai no relatório).","Time Log: cabeÃ§alho em linha 4 (Date/Time/x/Time2), dados 5â€“16. Colunas usadas: B (evento), F (data), G (hora), H (flag), I (hora fim). Range: Time Log!B4:I16.":"Time Log: cabeçalho em linha 4 (Date/Time/x/Time2), dados 5–16. Colunas usadas: B (evento), F (data), G (hora), H (flag), I (hora fim). Range: Time Log!B4:I16.","Qtt Sumary: cÃ©lulas F11..F19 guardam totais por grade (R HS, R VLS, DISTILLATES). Para v1 o builder sÃ³ lÃª os valores disponÃ­veis; ausentes viram 'â€”' no DOCX.":"Qtt Sumary: células F11..F19 guardam totais por grade (R HS, R VLS, DISTILLATES). Para v1 o builder só lê os valores disponíveis; ausentes viram '—' no DOCX.","Foto slots: vessel / engine_room / survey_attendance (mÃ­n. 1 cada, obrigatÃ³rios). Capa nÃ£o tem slot dedicado â€” vem do slot vessel[0] se presente.":"Foto slots: vessel / engine_room / survey_attendance (mín. 1 cada, obrigatórios). Capa não tem slot dedicado — vem do slot vessel[0] se presente.","IdentificaÃ§Ã£o":"Identificação","Grade 1 â€” presente?":"Grade 1 — presente?","Grade 2 â€” presente?":"Grade 2 — presente?","Grade 3 â€” presente?":"Grade 3 — presente?","Grade 4 â€” presente?":"Grade 4 — presente?","CapitÃ£o":"Capitão","Chefe de mÃ¡quinas":"Chefe de máquinas","Â°C":"°C","Temperatura purificador (Â°C)":"Temperatura purificador (°C)","FrequÃªncia de descarga (min)":"Frequência de descarga (min)","Engine room (Â°C)":"Engine room (°C)","Sea water (Â°C)":"Sea water (°C)","Sludge â€” miscellaneous":"Sludge — miscellaneous","LOA fora do intervalo usual (50â€“400 m) â€” confira Summary!B31.":"LOA fora do intervalo usual (50–400 m) — confira Summary!B31.","GRT fora do intervalo usual â€” confira Summary!B24.":"GRT fora do intervalo usual — confira Summary!B24."}$dictionary$::jsonb;
begin
  case jsonb_typeof(value)
    when 'object' then
      select coalesce(jsonb_object_agg(key, public.repair_spec_text_015(val)), '{}'::jsonb)
        into result from jsonb_each(value) as fields(key, val);
    when 'array' then
      select coalesce(jsonb_agg(public.repair_spec_text_015(val) order by ord), '[]'::jsonb)
        into result from jsonb_array_elements(value) with ordinality as items(val, ord);
    when 'string' then
      text_value := value #>> '{}';
      result := to_jsonb(coalesce(dictionary ->> text_value, text_value));
    else result := value;
  end case;
  return result;
end;
$repair$;
revoke all on function public.repair_spec_text_015(jsonb) from public, anon, authenticated;

do $migration$
declare rt record; previous public.report_specs%rowtype; corrected jsonb;
  validations jsonb; next_version integer; new_id uuid;
begin
  for rt in select * from public.report_types where slug in ('draft_survey', 'msc') for update loop
    select * into previous from public.report_specs where id = rt.active_spec_id;
    if not found then continue; end if;
    corrected := public.repair_spec_text_015(previous.spec);
    if rt.slug = 'draft_survey' and jsonb_typeof(corrected -> 'validations') = 'array' then
      select jsonb_agg(case
        when rule ->> 'field' = 'fin_fig_diff_pct' and rule ->> 'rule' = 'range'
          and rule -> 'min' = '-0.05'::jsonb and rule -> 'max' = '0.05'::jsonb
          and rule ->> 'message' = 'Diferença final acima de 0,5% entre figuras — revisar antes de aprovar.'
        then rule || '{"min":-0.005,"max":0.005}'::jsonb else rule end order by ord)
        into validations from jsonb_array_elements(corrected -> 'validations') with ordinality as items(rule, ord);
      corrected := jsonb_set(corrected, '{validations}', coalesce(validations, '[]'::jsonb));
    end if;
    if corrected = previous.spec then continue; end if;
    select coalesce(max(version), 0) + 1 into next_version from public.report_specs where report_type_id = rt.id;
    corrected := jsonb_set(corrected, '{version}', to_jsonb(next_version));
    insert into public.report_specs (report_type_id, version, spec) values (rt.id, next_version, corrected) returning id into new_id;
    update public.report_types set active_spec_id = new_id where id = rt.id;
    insert into public.audit_log (action, payload) values ('spec_corrected', jsonb_build_object(
      'report_type', rt.slug, 'previous_spec_id', previous.id, 'spec_id', new_id, 'version', next_version,
      'reason', '015: correção de textos e limite percentual; relatórios existentes preservados'));
  end loop;
end;
$migration$;
drop function public.repair_spec_text_015(jsonb);
