// Recebe da plataforma Maker os negócios do Bitrix24 e cria (ou atualiza) o serviço no app.
// Autenticação: token da tabela integracao, enviado em "x-token", "Authorization: Bearer" ou ?token=.
import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-token, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const resp = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Achata objetos aninhados e chaves de formulário do Bitrix (data[FIELDS][ID]) em chaves minúsculas simples
function achatar(o: unknown, saida: Record<string, string> = {}): Record<string, string> {
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (v && typeof v === 'object') achatar(v, saida)
      else if (v != null && v !== '') {
        const chave = k.replace(/.*\[([^\]]+)\]$/, '$1').toLowerCase()
        saida[chave] ??= String(v)
      }
    }
  }
  return saida
}
const pegar = (c: Record<string, string>, nomes: string[]) => nomes.map((n) => c[n]).find((v) => v && v.trim())?.trim() || ''

function data(v: string) {
  if (!v) return ''
  const br = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/)
  if (br) return `${br[3]}-${br[2]}-${br[1]}`
  const iso = v.match(/^(\d{4}-\d{2}-\d{2})/)
  return iso ? iso[1] : ''
}
function tipo(v: string) {
  const t = v.toLowerCase()
  if (!t) return ''
  if (t.includes('eletro') || t.includes('carreg')) return 'ELETROPOSTO'
  if (t.includes('monit') || t.includes('medi')) return 'MONITORAMENTO'
  return 'OUTRO'
}
function status(v: string) {
  const t = v.toLowerCase()
  if (!t) return ''
  if (t.includes('orc') || t.includes('orç')) return 'ORCAMENTO'
  if (t.includes('agend')) return 'AGENDADO'
  return 'FECHADO'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return resp(405, { erro: 'Use POST' })

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const url = new URL(req.url)
  const enviado = req.headers.get('x-token') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('token') || ''
  const { data: cfg } = await sb.from('integracao').select('token').eq('id', 1).single()
  if (!cfg || !enviado || enviado !== cfg.token) return resp(401, { erro: 'Token inválido' })

  let bruto: unknown
  const tipoConteudo = req.headers.get('content-type') || ''
  try {
    if (tipoConteudo.includes('json')) bruto = await req.json()
    else bruto = Object.fromEntries(new URLSearchParams(await req.text()))
  } catch {
    return resp(400, { erro: 'Corpo inválido: envie JSON ou formulário' })
  }
  const c = achatar(bruto)

  const p = {
    crm_id: pegar(c, ['crm_id', 'bitrix_id', 'id_crm', 'deal_id', 'id_negocio', 'id']),
    cliente: pegar(c, ['cliente', 'condominio', 'condomínio', 'nome', 'title', 'titulo', 'título', 'company_title', 'empresa']),
    endereco: pegar(c, ['endereco', 'endereço', 'address', 'logradouro']),
    data_prevista_campo: data(pegar(c, ['data_prevista_campo', 'data_campo', 'data_instalacao_prevista', 'data_prevista', 'data'])),
    tipo: tipo(pegar(c, ['tipo', 'tipo_servico', 'tipo_de_servico', 'servico', 'serviço'])),
    status: status(pegar(c, ['status', 'situacao', 'situação', 'etapa', 'stage_id'])),
    obs: pegar(c, ['obs', 'observacao', 'observação', 'comments', 'comentarios', 'descricao']),
    bruto,
  }
  if (!p.crm_id) return resp(422, { erro: 'Falta o id do negócio no CRM (campo crm_id ou id)', recebido: Object.keys(c) })

  const r = await sb.rpc('receber_servico_crm', { p })
  if (r.error) return resp(500, { erro: r.error.message })
  return resp(200, { ok: true, ...r.data })
})
