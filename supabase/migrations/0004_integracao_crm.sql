-- Serviços vindos do Bitrix24 (via plataforma Maker)
alter table public.servicos
  add column origem text not null default 'APP',
  add column crm_id text unique,
  add column recebido_em timestamptz,
  add column dados_crm jsonb;

-- Token que a plataforma Maker envia para provar que pode criar serviços. Só administradores leem/trocam.
create table public.integracao (
  id int primary key default 1 check (id = 1),
  token text not null default encode(gen_random_bytes(24), 'hex'),
  atualizado_em timestamptz not null default now()
);
alter table public.integracao enable row level security;
create policy integracao_admin_le on public.integracao for select using (public.is_admin());
create policy integracao_admin_troca on public.integracao for update using (public.is_admin()) with check (public.is_admin());
insert into public.integracao (id) values (1);

-- Cria ou atualiza um serviço pelo id do CRM. Chamada apenas pela função receber-servico (service role).
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
    insert into servicos (id, cliente, status, tipo, endereco, data_prevista_campo, obs, data_fechamento, origem, crm_id, recebido_em, dados_crm)
    values (v_id, coalesce(nullif(p->>'cliente',''), 'Sem nome (CRM ' || (p->>'crm_id') || ')'),
            coalesce(nullif(p->>'status',''), 'FECHADO'), coalesce(nullif(p->>'tipo',''), 'MONITORAMENTO'),
            coalesce(p->>'endereco',''), nullif(p->>'data_prevista_campo','')::date, coalesce(p->>'obs',''),
            current_date, 'CRM', p->>'crm_id', now(), p->'bruto');
    v_novo := true;
  else
    update servicos set
      cliente = coalesce(nullif(p->>'cliente',''), cliente),
      endereco = coalesce(nullif(p->>'endereco',''), endereco),
      data_prevista_campo = coalesce(nullif(p->>'data_prevista_campo','')::date, data_prevista_campo),
      tipo = coalesce(nullif(p->>'tipo',''), tipo),
      obs = coalesce(nullif(p->>'obs',''), obs),
      recebido_em = now(), dados_crm = p->'bruto'
    where id = v_id;
  end if;
  return jsonb_build_object('servico_id', v_id, 'novo', v_novo);
end $fn$;
revoke all on function public.receber_servico_crm(jsonb) from public, anon, authenticated;
