-- Estoque e-Simon: esquema inicial
create table public.locais (
  id text primary key,
  nome text not null,
  tipo text not null check (tipo in ('ESTOQUE','TECNICO','CAMPO','CLIENTE','MANUTENCAO','FORNECEDOR','BAIXA')),
  ativo boolean not null default true
);

create table public.itens (
  id text primary key,
  grupo text not null check (grupo in ('EQUIPAMENTO','MATERIAL')),
  categoria text not null default '',
  descricao text not null,
  marca text default '',
  modelo text default '',
  especificacao text default '',
  unidade text not null default 'un',
  controle text not null default 'QTD' check (controle in ('QTD','SERIAL')),
  estoque_minimo integer not null default 0,
  prazo_compra_dias integer,
  fornecedor text default '',
  custo_unit numeric(12,2),
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.servicos (
  id text primary key,
  cliente text not null,
  status text not null default 'FECHADO' check (status in ('ORCAMENTO','FECHADO','AGENDADO','EM_CAMPO','CONCLUIDO','CANCELADO')),
  endereco text default '',
  data_fechamento date,
  data_prevista_campo date,
  responsavel text default '',
  obs text default '',
  created_at timestamptz not null default now()
);

create table public.ativos (
  id text primary key,
  item_id text not null references public.itens(id),
  numero_serie text default '',
  status text not null default 'VERIFICAR' check (status in ('DISPONIVEL','EM_CAMPO','MANUTENCAO','BAIXADO','VERIFICAR')),
  local_id text references public.locais(id),
  responsavel text default '',
  servico_id text references public.servicos(id),
  desde timestamptz,
  calibracao_validade date,
  obs text default ''
);

create table public.necessidades (
  id bigint generated always as identity primary key,
  servico_id text not null references public.servicos(id) on delete cascade,
  ponto text default '',
  disjuntor_a numeric,
  item_id text not null references public.itens(id),
  qtd integer not null check (qtd > 0),
  status text not null default 'PLANEJADO' check (status in ('PLANEJADO','RESERVADO','SEPARADO','INSTALADO','CANCELADO')),
  obs text default ''
);

create table public.movimentacoes (
  id bigint generated always as identity primary key,
  data_hora timestamptz not null default now(),
  tipo text not null check (tipo in ('ENTRADA_COMPRA','SAIDA_CAMPO','DEVOLUCAO','INSTALACAO','TRANSFERENCIA','ENVIO_MANUTENCAO','RETORNO_MANUTENCAO','AJUSTE_INVENTARIO','BAIXA')),
  item_id text not null references public.itens(id),
  ativo_id text references public.ativos(id),
  qtd integer not null check (qtd > 0),
  origem text references public.locais(id),
  destino text references public.locais(id),
  servico_id text references public.servicos(id),
  responsavel text default '',
  obs text default '',
  criado_por uuid default auth.uid(),
  check (origem is not null or destino is not null)
);

create table public.compras (
  id bigint generated always as identity primary key,
  data_pedido date not null default current_date,
  item_id text not null references public.itens(id),
  qtd integer not null check (qtd > 0),
  fornecedor text default '',
  previsao_entrega date,
  status text not null default 'PEDIDA' check (status in ('SUGERIDA','PEDIDA','RECEBIDA','CANCELADA')),
  servico_id text references public.servicos(id),
  obs text default '',
  created_at timestamptz not null default now()
);

create index on public.movimentacoes (item_id);
create index on public.movimentacoes (ativo_id);
create index on public.movimentacoes (servico_id);
create index on public.movimentacoes (origem);
create index on public.movimentacoes (destino);
create index on public.necessidades (servico_id);
create index on public.necessidades (item_id);
create index on public.ativos (item_id);
create index on public.ativos (local_id);
create index on public.ativos (servico_id);
create index on public.compras (item_id);
create index on public.compras (servico_id);

-- Movimentar um equipamento atualiza onde ele está
create or replace function public.atualiza_ativo_por_mov() returns trigger
language plpgsql security invoker set search_path = '' as $fn$
declare t text;
begin
  if new.ativo_id is null or new.destino is null then return new; end if;
  select tipo into t from public.locais where id = new.destino;
  update public.ativos set
    local_id = new.destino,
    servico_id = case when t in ('CAMPO','CLIENTE') then new.servico_id else null end,
    responsavel = new.responsavel,
    desde = new.data_hora,
    status = case t when 'ESTOQUE' then 'DISPONIVEL' when 'MANUTENCAO' then 'MANUTENCAO'
                    when 'BAIXA' then 'BAIXADO' when 'FORNECEDOR' then 'MANUTENCAO' else 'EM_CAMPO' end
  where id = new.ativo_id;
  return new;
end $fn$;

create trigger trg_mov_ativo after insert on public.movimentacoes
for each row execute function public.atualiza_ativo_por_mov();

-- Saldo por item e local (materiais)
create view public.v_saldo_local with (security_invoker = on) as
select item_id, local_id, sum(q)::int as qtd from (
  select item_id, destino as local_id, qtd as q from public.movimentacoes where destino is not null and ativo_id is null
  union all
  select item_id, origem, -qtd from public.movimentacoes where origem is not null and ativo_id is null
) x group by item_id, local_id having sum(q) <> 0;

-- Visão consolidada por item: em mãos, em campo, reservado, a caminho, comprar
create view public.v_saldo_item with (security_invoker = on) as
with mat as (
  select s.item_id,
    sum(s.qtd) filter (where l.tipo = 'ESTOQUE')::int as no_estoque,
    sum(s.qtd) filter (where l.tipo = 'TECNICO')::int as com_tecnicos,
    sum(s.qtd) filter (where l.tipo in ('CAMPO','CLIENTE'))::int as em_campo,
    sum(s.qtd) filter (where l.tipo in ('MANUTENCAO','FORNECEDOR'))::int as manutencao
  from public.v_saldo_local s join public.locais l on l.id = s.local_id group by s.item_id
), eq as (
  select item_id,
    count(*) filter (where status = 'DISPONIVEL')::int as no_estoque,
    count(*) filter (where status = 'EM_CAMPO')::int as em_campo,
    count(*) filter (where status = 'MANUTENCAO')::int as manutencao,
    count(*) filter (where status = 'VERIFICAR')::int as verificar
  from public.ativos group by item_id
), res as (
  select n.item_id, sum(n.qtd)::int as reservado
  from public.necessidades n join public.servicos sv on sv.id = n.servico_id
  where n.status in ('PLANEJADO','RESERVADO','SEPARADO') and sv.status in ('FECHADO','AGENDADO','EM_CAMPO')
  group by n.item_id
), cam as (
  select item_id, sum(qtd)::int as a_caminho from public.compras where status = 'PEDIDA' group by item_id
), base as (
  select i.*,
    case when i.controle = 'SERIAL' then coalesce(eq.no_estoque,0) else coalesce(mat.no_estoque,0) end as no_estoque,
    case when i.controle = 'SERIAL' then 0 else coalesce(mat.com_tecnicos,0) end as com_tecnicos,
    case when i.controle = 'SERIAL' then coalesce(eq.em_campo,0) else coalesce(mat.em_campo,0) end as em_campo,
    case when i.controle = 'SERIAL' then coalesce(eq.manutencao,0) else coalesce(mat.manutencao,0) end as manutencao,
    coalesce(eq.verificar,0) as verificar,
    coalesce(res.reservado,0) as reservado,
    coalesce(cam.a_caminho,0) as a_caminho
  from public.itens i
  left join mat on mat.item_id = i.id
  left join eq on eq.item_id = i.id
  left join res on res.item_id = i.id
  left join cam on cam.item_id = i.id
  where i.ativo
)
select id as item_id, grupo, categoria, descricao, marca, modelo, controle, unidade, estoque_minimo,
  no_estoque, com_tecnicos, em_campo, manutencao, verificar, reservado, a_caminho,
  no_estoque + com_tecnicos - reservado as disponivel,
  greatest(0, reservado + estoque_minimo - no_estoque - com_tecnicos - verificar - a_caminho) as comprar
from base;

-- Segurança: só usuários logados leem e gravam (refinado em 0002 para só a equipe)
alter table public.locais enable row level security;
alter table public.itens enable row level security;
alter table public.servicos enable row level security;
alter table public.ativos enable row level security;
alter table public.necessidades enable row level security;
alter table public.movimentacoes enable row level security;
alter table public.compras enable row level security;
create policy equipe_le on public.locais for select to authenticated using (true);
create policy equipe_le on public.itens for select to authenticated using (true);
create policy equipe_le on public.servicos for select to authenticated using (true);
create policy equipe_le on public.ativos for select to authenticated using (true);
create policy equipe_le on public.necessidades for select to authenticated using (true);
create policy equipe_le on public.movimentacoes for select to authenticated using (true);
create policy equipe_le on public.compras for select to authenticated using (true);
create policy equipe_insere on public.locais for insert to authenticated with check (true);
create policy equipe_insere on public.itens for insert to authenticated with check (true);
create policy equipe_insere on public.servicos for insert to authenticated with check (true);
create policy equipe_insere on public.ativos for insert to authenticated with check (true);
create policy equipe_insere on public.necessidades for insert to authenticated with check (true);
create policy equipe_insere on public.movimentacoes for insert to authenticated with check (true);
create policy equipe_insere on public.compras for insert to authenticated with check (true);
create policy equipe_altera on public.locais for update to authenticated using (true) with check (true);
create policy equipe_altera on public.itens for update to authenticated using (true) with check (true);
create policy equipe_altera on public.servicos for update to authenticated using (true) with check (true);
create policy equipe_altera on public.ativos for update to authenticated using (true) with check (true);
create policy equipe_altera on public.necessidades for update to authenticated using (true) with check (true);
create policy equipe_altera on public.compras for update to authenticated using (true) with check (true);
-- Movimentações são histórico: o app não altera nem apaga
create policy equipe_apaga on public.necessidades for delete to authenticated using (true);
