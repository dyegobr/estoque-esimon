-- Cada funil do Bitrix24 é um tipo de serviço: Diagnóstico/SAVE e Monitoramento (Eletroposto e Outro continuam)
alter table public.servicos drop constraint servicos_tipo_check;
alter table public.servicos add constraint servicos_tipo_check check (tipo in ('MONITORAMENTO','DIAGNOSTICO','ELETROPOSTO','OUTRO'));

alter table public.servicos
  add column funil text default '',
  add column etapa text default '',
  add column cnpj text default '',
  add column contato_nome text default '',
  add column contato_telefone text default '',
  add column contato_email text default '',
  add column vendedor text default '',
  add column produtos text default '',
  add column valor numeric,
  add column crm_link text default '',
  add column formulario jsonb;

create or replace function public.receber_servico_crm(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_id text;
  v_novo boolean := false;
  n int;
begin
  perform pg_advisory_xact_lock(4242);
  select id into v_id from servicos where crm_id = p->>'crm_id';
  if v_id is null then
    select coalesce(max(substring(id from 5)::int), 0) + 1 into n from servicos where id ~ '^SRV-[0-9]+$';
    v_id := 'SRV-' || lpad(n::text, 3, '0');
    insert into servicos (id, cliente, status, tipo, endereco, data_prevista_campo, obs, data_fechamento, origem, crm_id, recebido_em, dados_crm,
                          funil, etapa, cnpj, contato_nome, contato_telefone, contato_email, vendedor, produtos, valor, crm_link, formulario)
    values (v_id, coalesce(nullif(p->>'cliente',''), 'Sem nome (CRM ' || (p->>'crm_id') || ')'),
            coalesce(nullif(p->>'status',''), 'FECHADO'), coalesce(nullif(p->>'tipo',''), 'MONITORAMENTO'),
            coalesce(p->>'endereco',''), nullif(p->>'data_prevista_campo','')::date, coalesce(p->>'obs',''),
            current_date, 'CRM', p->>'crm_id', now(), p->'bruto',
            coalesce(p->>'funil',''), coalesce(p->>'etapa',''), coalesce(p->>'cnpj',''), coalesce(p->>'contato_nome',''),
            coalesce(p->>'contato_telefone',''), coalesce(p->>'contato_email',''), coalesce(p->>'vendedor',''),
            coalesce(p->>'produtos',''), nullif(p->>'valor','')::numeric, coalesce(p->>'crm_link',''), nullif(p->'formulario', '{}'::jsonb));
    v_novo := true;
  else
    update servicos set
      cliente = coalesce(nullif(p->>'cliente',''), cliente),
      endereco = coalesce(nullif(p->>'endereco',''), endereco),
      data_prevista_campo = coalesce(nullif(p->>'data_prevista_campo','')::date, data_prevista_campo),
      tipo = coalesce(nullif(p->>'tipo',''), tipo),
      obs = coalesce(nullif(p->>'obs',''), obs),
      funil = coalesce(nullif(p->>'funil',''), funil),
      etapa = coalesce(nullif(p->>'etapa',''), etapa),
      cnpj = coalesce(nullif(p->>'cnpj',''), cnpj),
      contato_nome = coalesce(nullif(p->>'contato_nome',''), contato_nome),
      contato_telefone = coalesce(nullif(p->>'contato_telefone',''), contato_telefone),
      contato_email = coalesce(nullif(p->>'contato_email',''), contato_email),
      vendedor = coalesce(nullif(p->>'vendedor',''), vendedor),
      produtos = coalesce(nullif(p->>'produtos',''), produtos),
      valor = coalesce(nullif(p->>'valor','')::numeric, valor),
      crm_link = coalesce(nullif(p->>'crm_link',''), crm_link),
      formulario = coalesce(formulario, '{}'::jsonb) || coalesce(p->'formulario', '{}'::jsonb),
      recebido_em = now(), dados_crm = p->'bruto'
    where id = v_id;
  end if;
  return jsonb_build_object('servico_id', v_id, 'novo', v_novo);
end $fn$;
revoke all on function public.receber_servico_crm(jsonb) from public, anon, authenticated;
