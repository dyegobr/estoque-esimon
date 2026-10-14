-- Feedback de uso: dados da compra (NF, entrada, garantia), nº de série/garantia no equipamento,
-- tipo de serviço (eletroposto) e data de instalação
alter table public.compras add column nota_fiscal text default '', add column data_nf date, add column data_entrada date, add column garantia_meses integer;
alter table public.ativos add column fornecedor text default '', add column nota_fiscal text default '', add column data_compra date, add column garantia_ate date, add column compra_id bigint references public.compras(id);
create index on public.ativos (compra_id);
alter table public.servicos add column tipo text not null default 'MONITORAMENTO' check (tipo in ('MONITORAMENTO','ELETROPOSTO','OUTRO')), add column data_instalacao date;
insert into public.itens(id,grupo,categoria,descricao,unidade,controle) values
 ('DISJ','MATERIAL','Disjuntor','Disjuntor (modelo a definir)','un','QTD'),
 ('RESET','MATERIAL','Reset','Reset (modelo a definir)','un','QTD');
