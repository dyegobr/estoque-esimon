import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY)

const Ctx = createContext(null)
export const useData = () => useContext(Ctx)

const TABELAS = {
  itens: () => supabase.from('itens').select('*').order('id'),
  saldo: () => supabase.from('v_saldo_item').select('*'),
  saldoLocal: () => supabase.from('v_saldo_local').select('*'),
  locais: () => supabase.from('locais').select('*').order('nome'),
  ativos: () => supabase.from('ativos').select('*').order('id'),
  servicos: () => supabase.from('servicos').select('*').order('created_at', { ascending: false }),
  necessidades: () => supabase.from('necessidades').select('*').order('id'),
  compras: () => supabase.from('compras').select('*').order('created_at', { ascending: false }),
  movs: () => supabase.from('movimentacoes').select('*').order('data_hora', { ascending: false }).limit(1000),
  equipe: () => supabase.from('equipe').select('*').order('nome'),
}

export function DataProvider({ session, children }) {
  const [db, setDb] = useState(null)
  const [erro, setErro] = useState(null)
  const timer = useRef(null)

  const load = useCallback(async () => {
    const keys = Object.keys(TABELAS)
    const res = await Promise.all(keys.map((k) => TABELAS[k]()))
    const bad = res.find((r) => r.error)
    if (bad) { setErro(bad.error.message); return }
    setDb(Object.fromEntries(keys.map((k, i) => [k, res[i].data])))
  }, [])

  useEffect(() => {
    load()
    // Tempo real: qualquer mudança de outra pessoa recarrega a tela
    const ch = supabase.channel('estoque')
    for (const t of ['movimentacoes', 'ativos', 'servicos', 'necessidades', 'compras', 'itens']) {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: t }, () => {
        clearTimeout(timer.current)
        timer.current = setTimeout(load, 400)
      })
    }
    ch.subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  const value = useMemo(() => {
    if (!db) return { db, erro, load }
    const email = session.user.email?.toLowerCase()
    const me = db.equipe.find((e) => e.email.toLowerCase() === email)
    const item = Object.fromEntries(db.itens.map((i) => [i.id, i]))
    const local = Object.fromEntries(db.locais.map((l) => [l.id, l]))
    const servico = Object.fromEntries(db.servicos.map((s) => [s.id, s]))
    const saldo = Object.fromEntries(db.saldo.map((s) => [s.item_id, s]))
    return { db, erro, load, me, item, local, servico, saldo, nomeUsuario: me?.nome || email }
  }, [db, erro, load, session])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// Regra que a equipe já usa na PLANO TCs: geral = bipartido, demais = janela, sempre o próximo tamanho acima do disjuntor
const JANELA = [100, 150, 200, 250, 300, 400]
const BIPARTIDO = [250, 300, 400, 600, 800, 1000]
export function sugerirTC(disjuntor, geral) {
  const d = Number(disjuntor) || 0
  const usarBip = geral || d > 400
  const lista = usarBip ? BIPARTIDO : JANELA
  const tam = lista.find((x) => x >= d) || lista[lista.length - 1]
  return `TC-${usarBip ? 'BIP' : 'JAN'}-${tam}`
}

export async function proximoIdServico() {
  const { data } = await supabase.from('servicos').select('id').like('id', 'SRV-%').order('id', { ascending: false }).limit(1)
  const n = data?.[0] ? parseInt(data[0].id.slice(4), 10) + 1 : 1
  return `SRV-${String(n).padStart(3, '0')}`
}

export const fmtData = (d) => (d ? new Date(d).toLocaleDateString('pt-BR') : '')
export const fmtDataHora = (d) => (d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '')
export const desde = (d) => {
  if (!d) return ''
  const dias = Math.floor((Date.now() - new Date(d)) / 86400000)
  return dias <= 0 ? 'hoje' : dias === 1 ? 'há 1 dia' : `há ${dias} dias`
}

export const ir = (pagina, param) => { window.location.hash = `/${pagina}${param ? '/' + encodeURIComponent(param) : ''}` }
