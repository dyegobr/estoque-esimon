# Estoque e-Simon

App web de controle de estoque da e-Simon: equipamentos reutilizáveis (analisadores, ferramentas) e materiais consumíveis (TCs, medidores, cabos, conectores).

- **Painel**: o que comprar, serviços em aberto, equipamentos fora do armário.
- **Serviços**: cada serviço fechado reserva o material. A checagem mostra, antes de sair a campo, o que falta e onde está o que existe. Saída e retorno são registrados por aqui.
- **Materiais / Equipamentos**: saldo por local, com quem está, desde quando e histórico.
- **Compras**: previsão (reservado + mínimo − em mãos − a caminho), pedido e recebimento.
- **Ajustes**: equipe, locais e backup em Excel para guardar no OneDrive.

## Stack

React + Vite, hospedado na Vercel. Banco Supabase (Postgres) com login por e-mail e acesso liberado só para quem está na tabela `equipe`.

O saldo nunca é digitado: toda entrada, saída, instalação ou devolução é uma linha em `movimentacoes`, e as views `v_saldo_local` e `v_saldo_item` calculam o resto.

## Rodar local

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Banco

- `supabase/migrations/`: esquema, views, regras de acesso e realtime.
- `supabase/seed.sql`: dados migrados das planilhas (inventário de 08/09/2026, PLANO TCs e ficha manual).
