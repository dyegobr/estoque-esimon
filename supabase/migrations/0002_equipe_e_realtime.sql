-- Acesso restrito à equipe cadastrada + realtime
create table public.equipe (
  email text primary key,
  nome text not null,
  papel text not null default 'TECNICO' check (papel in ('ADMIN','TECNICO')),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.equipe enable row level security;

create or replace function public.is_equipe() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.equipe e where lower(e.email) = lower(coalesce(auth.jwt()->>'email','')) and e.ativo)
$fn$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $fn$
  select exists (select 1 from public.equipe e where lower(e.email) = lower(coalesce(auth.jwt()->>'email','')) and e.ativo and e.papel = 'ADMIN')
$fn$;
revoke execute on function public.is_equipe() from anon, public;
revoke execute on function public.is_admin() from anon, public;
grant execute on function public.is_equipe() to authenticated;
grant execute on function public.is_admin() to authenticated;

create policy equipe_le on public.equipe for select to authenticated using (public.is_equipe());
create policy admin_insere on public.equipe for insert to authenticated with check (public.is_admin());
create policy admin_altera on public.equipe for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Todas as tabelas: só quem está na equipe
alter policy equipe_le on public.locais using (public.is_equipe());
alter policy equipe_le on public.itens using (public.is_equipe());
alter policy equipe_le on public.servicos using (public.is_equipe());
alter policy equipe_le on public.ativos using (public.is_equipe());
alter policy equipe_le on public.necessidades using (public.is_equipe());
alter policy equipe_le on public.movimentacoes using (public.is_equipe());
alter policy equipe_le on public.compras using (public.is_equipe());
alter policy equipe_insere on public.locais with check (public.is_equipe());
alter policy equipe_insere on public.itens with check (public.is_equipe());
alter policy equipe_insere on public.servicos with check (public.is_equipe());
alter policy equipe_insere on public.ativos with check (public.is_equipe());
alter policy equipe_insere on public.necessidades with check (public.is_equipe());
alter policy equipe_insere on public.movimentacoes with check (public.is_equipe());
alter policy equipe_insere on public.compras with check (public.is_equipe());
alter policy equipe_altera on public.locais using (public.is_equipe()) with check (public.is_equipe());
alter policy equipe_altera on public.itens using (public.is_equipe()) with check (public.is_equipe());
alter policy equipe_altera on public.servicos using (public.is_equipe()) with check (public.is_equipe());
alter policy equipe_altera on public.ativos using (public.is_equipe()) with check (public.is_equipe());
alter policy equipe_altera on public.necessidades using (public.is_equipe()) with check (public.is_equipe());
alter policy equipe_altera on public.compras using (public.is_equipe()) with check (public.is_equipe());
alter policy equipe_apaga on public.necessidades using (public.is_equipe());

alter publication supabase_realtime add table public.movimentacoes, public.ativos, public.servicos, public.necessidades, public.compras, public.itens;
