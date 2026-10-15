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

// "Data de Início" → "data_de_inicio": minúsculas, sem acento, espaços viram _
const normal = (k: string) => k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[\s\-\.]+/g, '_')

// Achata objetos aninhados e chaves de formulário do Bitrix (data[FIELDS][ID]) em chaves minúsculas simples
function achatar(o: unknown, saida: Record<string, string> = {}): Record<string, string> {
  if (o && typeof o === 'object') {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      if (v && typeof v === 'object') achatar(v, saida)
      else if (v != null && v !== '') {
        const chave = normal(k.replace(/.*\[([^\]]+)\]$/, '$1'))
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
// O tipo vem do campo tipo ou, na falta dele, do nome do funil (ex.: "e-Simon Diagnóstico/SAVE")
function tipo(v: string) {
  const t = normal(v)
  if (!t) return ''
  if (t.includes('diagn') || t.includes('save')) return 'DIAGNOSTICO'
  if (t.includes('eletro') || t.includes('carreg')) return 'ELETROPOSTO'
  if (t.includes('monit')) return 'MONITORAMENTO'
  return 'OUTRO'
}
// "R$6.500", "6.500,00", "6500.00" → 6500
function valor(v: string) {
  let t = v.replace(/[^\d,.\-]/g, '')
  if (!t) return ''
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? String(n) : ''
}
// Campos técnicos do formulário (funil Monitoramento) e informações gerais do card
const FORMULARIO: Record<string, string[]> = {
  quadro_comum: ['quadro_comum'],
  quadro_geral: ['quadro_geral'],
  local_prumadas: ['local_prumadas', 'local_das_prumadas'],
  qtd_apartamentos: ['qtd_apartamentos', 'quantidade_de_apartamentos', 'apartamentos'],
  qtd_subsolos: ['qtd_subsolos', 'quantidade_de_subsolos', 'subsolos'],
  sensor_fumaca: ['sensor_fumaca', 'possui_sensor_de_fumaca', 'sensor_de_fumaca'],
  sprinklers: ['sprinklers', 'sprinkler'],
  persona: ['persona'],
  origem_lead: ['origem', 'origem_lead', 'source_id'],
  data_inicio: ['data_inicio', 'data_de_inicio'],
}
function status(v: string) {
  const t = normal(v)
  if (!t) return ''
  if (t.includes('orc')) return 'ORCAMENTO'
  if (t.includes('fila') || t.includes('aguard') || t.includes('a_agendar')) return 'FECHADO'
  if (t.includes('agendad')) return 'AGENDADO'
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

  const crmId = pegar(c, ['crm_id', 'bitrix_id', 'id_crm', 'deal_id', 'id_negocio', 'id'])
  const funil = pegar(c, ['funil', 'pipeline', 'categoria', 'category', 'category_name'])
  const formulario: Record<string, string> = {}
  for (const [campo, nomes] of Object.entries(FORMULARIO)) {
    const v = pegar(c, nomes)
    if (v) formulario[campo] = v
  }
  const p = {
    crm_id: crmId,
    cliente: pegar(c, ['cliente', 'condominio', 'nome', 'title', 'titulo', 'company_title', 'empresa']),
    endereco: pegar(c, ['endereco', 'address', 'logradouro']),
    data_prevista_campo: data(pegar(c, ['data_prevista_campo', 'data_campo', 'data_instalacao_prevista', 'data_prevista'])),
    funil,
    etapa: pegar(c, ['etapa', 'fase', 'stage', 'stage_name']),
    tipo: tipo(pegar(c, ['tipo', 'tipo_servico', 'tipo_de_servico'])) || tipo(funil),
    status: status(pegar(c, ['status', 'situacao'])),
    cnpj: pegar(c, ['cnpj']),
    contato_nome: pegar(c, ['contato_nome', 'responsavel', 'contato']),
    contato_telefone: pegar(c, ['contato_telefone', 'contato_telefonico', 'telefone', 'phone']),
    contato_email: pegar(c, ['contato_email', 'email', 'e_mail']),
    vendedor: pegar(c, ['vendedor']),
    produtos: pegar(c, ['produtos', 'produto']),
    valor: valor(pegar(c, ['valor', 'valor_e_moeda', 'total_do_negocio', 'opportunity'])),
    crm_link: pegar(c, ['crm_link', 'link']) || (/^\d+$/.test(crmId) ? `https://mtecenergia.bitrix24.com.br/crm/deal/details/${crmId}/` : ''),
    obs: pegar(c, ['obs', 'observacoes', 'observacao', 'comments', 'comentarios', 'descricao']),
    formulario,
    bruto,
  }
  if (!p.crm_id) return resp(422, { erro: 'Falta o id do negócio no CRM (campo crm_id ou id)', recebido: Object.keys(c) })

  const r = await sb.rpc('receber_servico_crm', { p })
  if (r.error) return resp(500, { erro: r.error.message })
  return resp(200, { ok: true, ...r.data })
})
