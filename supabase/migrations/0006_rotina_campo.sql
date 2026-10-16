-- Rotina de campo: agenda de visitas por técnico, formulários criados pelo gestor,
-- respostas ligadas ao serviço e acesso restrito para técnico externo (terceiro).

-- 1) Papel de técnico externo. Ele NÃO conta como "equipe": não vê estoque, compras nem valores do CRM.
alter table public.equipe drop constraint if exists equipe_papel_check;
alter table public.equipe add constraint equipe_papel_check check (papel in ('ADMIN','TECNICO','EXTERNO'));

create or replace function public.is_equipe() returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.equipe e where lower(e.email) = lower(coalesce(auth.jwt()->>'email','')) and e.ativo and e.papel in ('ADMIN','TECNICO'))
$$;

create or replace function public.is_externo() returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.equipe e where lower(e.email) = lower(coalesce(auth.jwt()->>'email','')) and e.ativo and e.papel = 'EXTERNO')
$$;

create or replace function public.meu_email() returns text
language sql stable as $$ select lower(coalesce(auth.jwt()->>'email','')) $$;

-- Cada pessoa sempre enxerga o próprio cadastro (o externo precisa disso para entrar)
create policy proprio_le on public.equipe for select using (lower(email) = public.meu_email());

-- 2) Modelos de formulário e tipos de visita
create table public.modelos_formulario (
  id bigserial primary key,
  nome text not null,
  descricao text,
  -- [{id, tipo: texto|paragrafo|numero|simnao|lista|multipla|data|foto|secao, rotulo, obrigatorio, opcoes[], ajuda, repetivel, campos[]}]
  campos jsonb not null default '[]',
  ativo boolean not null default true,
  atualizado_em timestamptz not null default now()
);

create table public.tipos_visita (
  id bigserial primary key,
  nome text not null,
  modelos bigint[] not null default '{}',
  duracao_min int not null default 60,
  ativo boolean not null default true
);

-- 3) Visitas (agenda)
create table public.visitas (
  id bigserial primary key,
  servico_id text references public.servicos(id),
  tipo_id bigint references public.tipos_visita(id),
  tecnico_email text not null,
  inicio timestamptz not null,
  duracao_min int not null default 60,
  status text not null default 'AGENDADA' check (status in ('AGENDADA','EM_ANDAMENTO','CONCLUIDA','CANCELADA')),
  orientacao text,
  modelos bigint[] not null default '{}',
  checkin_em timestamptz, checkin_lat double precision, checkin_lng double precision,
  checkout_em timestamptz, checkout_lat double precision, checkout_lng double precision,
  relato text,
  assinatura_nome text,
  assinatura_url text,
  mudanca_solicitada text,
  mudanca_em timestamptz,
  criado_por text default public.meu_email(),
  created_at timestamptz not null default now()
);
create index visitas_tecnico_inicio on public.visitas (tecnico_email, inicio);
create index visitas_servico on public.visitas (servico_id);

create table public.respostas (
  id bigserial primary key,
  visita_id bigint not null references public.visitas(id) on delete cascade,
  modelo_id bigint not null references public.modelos_formulario(id),
  dados jsonb not null default '{}',
  atualizado_em timestamptz not null default now(),
  unique (visita_id, modelo_id)
);

-- O externo só mexe na execução da própria visita, nunca no agendamento
create or replace function public.visita_guarda() returns trigger
language plpgsql security definer set search_path to '' as $$
begin
  if not public.is_externo() then return new; end if;
  if old.status in ('CONCLUIDA','CANCELADA') then raise exception 'Visita já encerrada'; end if;
  if new.tecnico_email is distinct from old.tecnico_email or new.inicio is distinct from old.inicio
     or new.servico_id is distinct from old.servico_id or new.tipo_id is distinct from old.tipo_id
     or new.modelos is distinct from old.modelos or new.orientacao is distinct from old.orientacao
     or new.duracao_min is distinct from old.duracao_min or new.criado_por is distinct from old.criado_por then
    raise exception 'Somente o gestor altera o agendamento. Use "Solicitar mudança".';
  end if;
  if new.status = 'CANCELADA' then raise exception 'Somente o gestor cancela visitas'; end if;
  if new.status = 'CONCLUIDA' and (new.assinatura_url is null or coalesce(new.assinatura_nome,'') = '') then
    raise exception 'A visita só pode ser concluída com a assinatura do responsável';
  end if;
  return new;
end $$;
create trigger visita_guarda before update on public.visitas for each row execute function public.visita_guarda();

create or replace function public.minha_visita_aberta(v bigint) returns boolean
language sql stable security definer set search_path to '' as $$
  select exists (select 1 from public.visitas x where x.id = v and lower(x.tecnico_email) = public.meu_email() and x.status in ('AGENDADA','EM_ANDAMENTO'))
$$;

alter table public.modelos_formulario enable row level security;
alter table public.tipos_visita enable row level security;
alter table public.visitas enable row level security;
alter table public.respostas enable row level security;

create policy equipe_tudo on public.modelos_formulario for all using (public.is_equipe()) with check (public.is_equipe());
create policy campo_le on public.modelos_formulario for select using (public.is_externo());
create policy equipe_tudo on public.tipos_visita for all using (public.is_equipe()) with check (public.is_equipe());
create policy campo_le on public.tipos_visita for select using (public.is_externo());

create policy equipe_tudo on public.visitas for all using (public.is_equipe()) with check (public.is_equipe());
create policy tecnico_le on public.visitas for select using (lower(tecnico_email) = public.meu_email() and (public.is_externo() or public.is_equipe()));
create policy tecnico_executa on public.visitas for update using (lower(tecnico_email) = public.meu_email() and public.is_externo())
  with check (lower(tecnico_email) = public.meu_email());

create policy equipe_tudo on public.respostas for all using (public.is_equipe()) with check (public.is_equipe());
create policy tecnico_le on public.respostas for select using (public.is_externo() and exists (select 1 from public.visitas x where x.id = visita_id and lower(x.tecnico_email) = public.meu_email()));
create policy tecnico_insere on public.respostas for insert with check (public.is_externo() and public.minha_visita_aberta(visita_id));
create policy tecnico_altera on public.respostas for update using (public.is_externo() and public.minha_visita_aberta(visita_id)) with check (public.minha_visita_aberta(visita_id));

-- 4) Agenda do técnico: só o necessário do serviço (sem valores do CRM) e o material separado para ele
create or replace function public.minha_agenda(de timestamptz, ate timestamptz) returns jsonb
language sql stable security definer set search_path to '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'visita', to_jsonb(v),
    'servico', case when s.id is null then null else jsonb_build_object(
      'id', s.id, 'cliente', s.cliente, 'endereco', s.endereco, 'tipo', s.tipo, 'obs', s.obs,
      'contato_nome', s.contato_nome, 'contato_telefone', s.contato_telefone, 'contato_email', s.contato_email) end,
    'material', coalesce((select jsonb_agg(jsonb_build_object('item', i.descricao, 'ponto', n.ponto, 'qtd', n.qtd, 'status', n.status) order by n.ponto, i.descricao)
                 from public.necessidades n join public.itens i on i.id = n.item_id
                 where n.servico_id = s.id and n.status in ('RESERVADO','SEPARADO','PLANEJADO')), '[]'::jsonb)
  ) order by v.inicio), '[]'::jsonb)
  from public.visitas v left join public.servicos s on s.id = v.servico_id
  where lower(v.tecnico_email) = public.meu_email() and v.inicio >= de and v.inicio < ate
    and (public.is_externo() or public.is_equipe())
$$;
grant execute on function public.minha_agenda(timestamptz, timestamptz) to authenticated;

-- 5) Fotos e assinaturas (privado): campo/visitas/{id}/...
insert into storage.buckets (id, name, public) values ('campo', 'campo', false) on conflict (id) do nothing;

create policy campo_equipe on storage.objects for all
  using (bucket_id = 'campo' and public.is_equipe()) with check (bucket_id = 'campo' and public.is_equipe());
create policy campo_tecnico_le on storage.objects for select
  using (bucket_id = 'campo' and public.is_externo() and exists (
    select 1 from public.visitas x where x.id::text = (storage.foldername(name))[2] and lower(x.tecnico_email) = public.meu_email()));
create policy campo_tecnico_envia on storage.objects for insert
  with check (bucket_id = 'campo' and public.is_externo() and (storage.foldername(name))[1] = 'visitas'
    and public.minha_visita_aberta(((storage.foldername(name))[2])::bigint));

alter publication supabase_realtime add table public.visitas;

-- 6) Modelos iniciais (os dois formulários usados hoje)
insert into public.modelos_formulario (nome, descricao, campos) values
('Monitoramento - Planejamento', 'Levantamento antes da instalação dos medidores', '[
 {"id":"local_sala","tipo":"texto","rotulo":"Local da sala da Neoenergia","obrigatorio":true},
 {"id":"qtd_dj_geral","tipo":"numero","rotulo":"Quantidade de disjuntor geral"},
 {"id":"qtd_dj_comum","tipo":"numero","rotulo":"Quantidade de disjuntor área comum"},
 {"id":"qtd_dj_prumadas","tipo":"numero","rotulo":"Quantidade de disjuntores para prumadas"},
 {"id":"foto_sala","tipo":"foto","rotulo":"Foto da sala Neoenergia (visão de espaço)"},
 {"id":"foto_quadro_ext","tipo":"foto","rotulo":"Vista EXTERNA do quadro/rack principal"},
 {"id":"foto_quadro_int","tipo":"foto","rotulo":"Vista INTERNA do quadro/rack principal"},
 {"id":"lacre","tipo":"simnao","rotulo":"Tem lacre?"},
 {"id":"internet","tipo":"simnao","rotulo":"Tem internet 2.4 GHz com sinal > 60%?"},
 {"id":"wifi","tipo":"texto","rotulo":"ID da rede e senha da internet"},
 {"id":"espaco_medidores","tipo":"simnao","rotulo":"Tem espaço para colocar medidores e-Simon?"},
 {"id":"posicao_medidores","tipo":"texto","rotulo":"Posição no quadro para medidores e proteção","ajuda":"Parte superior/inferior, lado direito/esquerdo, etc."},
 {"id":"foto_local_medidores","tipo":"foto","rotulo":"Foto do local para medidores"},
 {"id":"espaco_tcs","tipo":"simnao","rotulo":"Tem espaço para colocar TCs?"},
 {"id":"foto_local_tcs","tipo":"foto","rotulo":"Foto dos locais para TCs"},
 {"id":"distancia_tc","tipo":"texto","rotulo":"Distância entre TC da proteção e trilho DIN e-Simon"},
 {"id":"obs_montagem","tipo":"paragrafo","rotulo":"Observações para montagem do quadro"},
 {"id":"vaga_tomada","tipo":"simnao","rotulo":"Vaga de morador já tem tomada?"},
 {"id":"foto_vaga","tipo":"foto","rotulo":"Foto da vaga de morador"}
]'),
('Monitoramento - Proteções', 'Uma ficha por quadro/proteção', '[
 {"id":"quadros","tipo":"secao","rotulo":"Quadro","repetivel":true,"campos":[
  {"id":"tipo_protecao","tipo":"lista","rotulo":"Tipo da proteção","opcoes":["Geral","Comum","Prumada"],"obrigatorio":true},
  {"id":"nome_quadro","tipo":"texto","rotulo":"Nome do quadro","obrigatorio":true},
  {"id":"protecao_sem_ajuste","tipo":"numero","rotulo":"Valor da proteção SEM ajuste (A)"},
  {"id":"protecao_com_ajuste","tipo":"numero","rotulo":"Valor da proteção COM ajuste (A)"},
  {"id":"foto_protecao","tipo":"foto","rotulo":"Foto da proteção"},
  {"id":"foto_barramento","tipo":"foto","rotulo":"Foto do barramento da proteção"},
  {"id":"largura_barramento","tipo":"numero","rotulo":"Largura do barramento/cabo da proteção (cm)"},
  {"id":"tipo_quadro_save","tipo":"lista","rotulo":"Tipo do quadro SAVE na sala da Neoenergia","opcoes":["Coletivo","Individual"]},
  {"id":"foto_quadro_save","tipo":"foto","rotulo":"Foto do quadro SAVE (comum ou grupo de individuais)"},
  {"id":"qtd_apartamentos","tipo":"numero","rotulo":"Quantidade de apartamentos do quadro"},
  {"id":"apartamentos","tipo":"texto","rotulo":"Apartamentos do conjunto medidor","ajuda":"Números dos apartamentos ligados no quadro. Se for o quadro geral, escreva \"Geral\"."},
  {"id":"foto_relogios","tipo":"foto","rotulo":"Foto dos relógios ligados no conjunto","ajuda":"Foto que permita identificar os apartamentos. Se geral, foto do quadro geral."}
 ]}
]');

insert into public.tipos_visita (nome, modelos, duracao_min)
select 'Planejamento de monitoramento', array_agg(id order by id), 90 from public.modelos_formulario;
insert into public.tipos_visita (nome, modelos, duracao_min) values ('Instalação de monitoramento', '{}', 240), ('Diagnóstico/SAVE', '{}', 120);
