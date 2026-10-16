import { useCallback, useEffect, useRef, useState } from 'react'
import { MapPin, Phone, LogIn, CheckCircle2, MessageSquareWarning, RefreshCw, CloudOff } from 'lucide-react'
import { useData, supabase, ir, TIPOS_SERV } from '../data.jsx'
import { Modal, useToast } from '../ui.jsx'
import { Campos, Assinatura, Respostas, STATUS_VISITA, fmtHora, diaISO, faltando, posicao, enviarArquivo, AssinaturaSalva } from '../campo.jsx'

// Tela do técnico: só a própria agenda, o necessário do serviço e o material separado para ele
export default function MinhaAgenda({ param, rota = 'campo' }) {
  const [lista, setLista] = useState(null)
  const [erro, setErro] = useState(null)
  const carregar = useCallback(async () => {
    const de = new Date(); de.setDate(de.getDate() - 7); de.setHours(0, 0, 0, 0)
    const ate = new Date(); ate.setDate(ate.getDate() + 30)
    const r = await supabase.rpc('minha_agenda', { de: de.toISOString(), ate: ate.toISOString() })
    if (r.error) return setErro(r.error.message)
    setErro(null); setLista(r.data)
  }, [])
  useEffect(() => {
    carregar()
    const f = () => document.visibilityState === 'visible' && carregar()
    document.addEventListener('visibilitychange', f)
    window.addEventListener('online', carregar)
    return () => { document.removeEventListener('visibilitychange', f); window.removeEventListener('online', carregar) }
  }, [carregar])

  if (erro && !lista) return <div className="card glass"><div className="empty"><CloudOff size={18} /> Sem conexão para carregar a agenda. <button className="btn small" onClick={carregar}>Tentar de novo</button></div></div>
  if (!lista) return <div className="spin" />
  if (param) {
    const a = lista.find((x) => String(x.visita.id) === param)
    if (!a) return <div className="empty">Visita não encontrada. <button className="btn small" onClick={() => ir(rota)}>Voltar</button></div>
    return <Visita a={a} recarregar={carregar} rota={rota} />
  }

  const hoje = diaISO(new Date())
  const proximas = lista.filter((x) => diaISO(x.visita.inicio) >= hoje && x.visita.status !== 'CANCELADA')
  const anteriores = lista.filter((x) => diaISO(x.visita.inicio) < hoje && ['AGENDADA', 'EM_ANDAMENTO'].includes(x.visita.status))
  const dias = Object.entries(proximas.reduce((a, x) => { (a[diaISO(x.visita.inicio)] ||= []).push(x); return a }, {}))
  const nomeDia = (d) => {
    const amanha = new Date(); amanha.setDate(amanha.getDate() + 1)
    if (d === hoje) return 'Hoje'
    if (d === diaISO(amanha)) return 'Amanhã'
    return new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })
  }
  return (
    <>
      <div className="topbar">
        <div><img className="mobile-logo logo-img" src="/logo.png" alt="e-Simon" /><h1>Minha agenda</h1><div className="sub">Toque na visita para ver o endereço, o material e os formulários</div></div>
        <button className="btn small" onClick={carregar}><RefreshCw size={15} /> Atualizar</button>
      </div>
      {anteriores.length > 0 && (
        <div className="card glass">
          <h2>Pendentes de dias anteriores</h2>
          <div className="list">{anteriores.map((x) => <LinhaVisita key={x.visita.id} a={x} rota={rota} comData />)}</div>
        </div>
      )}
      {dias.length === 0 && <div className="card glass"><div className="empty">Nenhuma visita agendada.</div></div>}
      {dias.map(([d, vs]) => (
        <div key={d} className="card glass">
          <h2 style={{ textTransform: 'capitalize' }}>{nomeDia(d)}</h2>
          <div className="list">{vs.map((x) => <LinhaVisita key={x.visita.id} a={x} rota={rota} />)}</div>
        </div>
      ))}
    </>
  )
}

function LinhaVisita({ a, rota, comData }) {
  const { db } = useData()
  const v = a.visita
  const tipo = db.tiposVisita.find((t) => t.id === v.tipo_id)
  const [cls, txt] = STATUS_VISITA[v.status]
  return (
    <div className="row click" onClick={() => ir(rota, String(v.id))}>
      <div className="big" style={{ minWidth: 58, textAlign: 'left', fontSize: 18 }}>{fmtHora(v.inicio)}{comData && <small>{new Date(v.inicio).toLocaleDateString('pt-BR')}</small>}</div>
      <div className="grow">
        <div className="t">{a.servico?.cliente || tipo?.nome || 'Visita'}</div>
        <div className="s">{tipo?.nome}{a.servico?.endereco ? ` · ${a.servico.endereco}` : ''}</div>
        {v.mudanca_solicitada && <div className="s" style={{ color: 'var(--pill-warn)' }}>Mudança pedida, aguardando o gestor</div>}
      </div>
      <span className={`pill ${cls}`}>{txt}</span>
    </div>
  )
}

// Rascunho no aparelho: se a internet cair, nada do que foi preenchido se perde
const chaveRascunho = (vid) => `visita-${vid}`
const lerRascunho = (vid) => { try { return JSON.parse(localStorage.getItem(chaveRascunho(vid))) } catch { return null } }
const gravarRascunho = (vid, r) => { try { localStorage.setItem(chaveRascunho(vid), JSON.stringify(r)) } catch { /* sem espaço */ } }

function Visita({ a, recarregar, rota }) {
  const { db } = useData()
  const toast = useToast()
  const v = a.visita
  const s = a.servico
  const tipo = db.tiposVisita.find((t) => t.id === v.tipo_id)
  const modelos = (v.modelos || []).map((id) => db.modelos.find((m) => m.id === id)).filter(Boolean)
  const [dados, setDados] = useState(null)
  const [relato, setRelato] = useState(v.relato || '')
  const [pendente, setPendente] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [modal, setModal] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const timer = useRef()
  const aberta = ['AGENDADA', 'EM_ANDAMENTO'].includes(v.status)
  const emAndamento = v.status === 'EM_ANDAMENTO'

  useEffect(() => {
    (async () => {
      const r = await supabase.from('respostas').select('*').eq('visita_id', v.id)
      const doBanco = Object.fromEntries((r.data || []).map((x) => [x.modelo_id, x.dados]))
      const rasc = lerRascunho(v.id)
      if (rasc?.pendente && aberta) { setDados(rasc.dados); setRelato(rasc.relato ?? relato); setPendente(true) } else setDados(doBanco)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v.id])

  const enviar = useCallback(async (d, rel) => {
    setSalvando(true)
    const linhas = Object.entries(d).map(([modelo_id, dd]) => ({ visita_id: v.id, modelo_id: Number(modelo_id), dados: dd, atualizado_em: new Date().toISOString() }))
    const r1 = linhas.length ? await supabase.from('respostas').upsert(linhas, { onConflict: 'visita_id,modelo_id' }) : {}
    const r2 = rel !== (v.relato || '') ? await supabase.from('visitas').update({ relato: rel }).eq('id', v.id) : {}
    setSalvando(false)
    if (r1.error || r2.error) return false
    gravarRascunho(v.id, { dados: d, relato: rel, pendente: false }); setPendente(false)
    return true
  }, [v.id, v.relato])

  function mudou(d, rel) {
    setDados(d); setRelato(rel)
    gravarRascunho(v.id, { dados: d, relato: rel, pendente: true }); setPendente(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => enviar(d, rel), 1500)
  }
  useEffect(() => {
    const f = () => pendente && dados && enviar(dados, relato)
    window.addEventListener('online', f)
    return () => window.removeEventListener('online', f)
  }, [pendente, dados, relato, enviar])

  async function checkin() {
    setOcupado(true)
    const p = await posicao()
    const r = await supabase.from('visitas').update({ status: 'EM_ANDAMENTO', checkin_em: new Date().toISOString(), checkin_lat: p?.lat ?? null, checkin_lng: p?.lng ?? null }).eq('id', v.id)
    setOcupado(false)
    if (r.error) return toast(r.error.message, true)
    toast(p ? 'Check-in feito' : 'Check-in feito sem localização (GPS não autorizado)', !p)
    recarregar()
  }

  if (!dados) return <div className="spin" />
  return (
    <>
      <div className="topbar">
        <div>
          <button className="btn ghost small" style={{ marginLeft: -12 }} onClick={() => ir(rota)}>‹ Agenda</button>
          <h1>{s?.cliente || tipo?.nome || 'Visita'}</h1>
          <div className="sub">{new Date(v.inicio).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })} às {fmtHora(v.inicio)} · {tipo?.nome}{s ? ` · ${TIPOS_SERV[s.tipo] || ''}` : ''}</div>
        </div>
        <span className={`pill ${STATUS_VISITA[v.status][0]}`}>{STATUS_VISITA[v.status][1]}</span>
      </div>

      {v.mudanca_solicitada && aberta && <div className="card glass"><div className="tiny">Você pediu mudança em {new Date(v.mudanca_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}:</div><div>{v.mudanca_solicitada}</div><div className="tiny">Aguardando o gestor.</div></div>}

      <div className="card glass">
        <h2>Local e contato</h2>
        <div className="list">
          {s?.endereco && <a className="row click" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.endereco)}`} target="_blank" rel="noreferrer"><MapPin size={18} /><div className="grow"><div className="t" style={{ whiteSpace: 'normal' }}>{s.endereco}</div><div className="s">Abrir no mapa</div></div></a>}
          {s?.contato_nome && <div className="row"><div className="grow"><div className="s">Falar com</div><div className="t">{s.contato_nome}</div></div>{s.contato_telefone && <a className="btn small" href={`tel:${s.contato_telefone.replace(/[^\d+]/g, '')}`}><Phone size={15} /> {s.contato_telefone}</a>}</div>}
          {v.orientacao && <div className="row"><div className="grow"><div className="s">Orientação do gestor</div><div style={{ whiteSpace: 'pre-wrap' }}>{v.orientacao}</div></div></div>}
          {s?.obs && <div className="row"><div className="grow"><div className="s">Observações do serviço</div><div style={{ whiteSpace: 'pre-wrap' }}>{s.obs}</div></div></div>}
        </div>
        {aberta && (
          <div className="btns" style={{ marginTop: 14 }}>
            {v.status === 'AGENDADA' && <button className="btn primary" disabled={ocupado} onClick={checkin}><LogIn size={16} /> {ocupado ? 'Pegando localização…' : 'Cheguei (check-in)'}</button>}
            <button className="btn" onClick={() => setModal('mudanca')}><MessageSquareWarning size={16} /> Solicitar mudança</button>
          </div>
        )}
        {v.checkin_em && <div className="tiny" style={{ marginTop: 10 }}>Check-in {fmtHora(v.checkin_em)}{v.checkout_em ? ` · check-out ${fmtHora(v.checkout_em)}` : ''}</div>}
      </div>

      {a.material?.length > 0 && (
        <div className="card glass">
          <h2>Material separado para esta visita</h2>
          <div className="list">{a.material.map((m, i) => <div key={i} className="row"><div className="grow"><div className="t">{m.item}</div>{m.ponto && <div className="s">{m.ponto}</div>}</div><b>{m.qtd}</b></div>)}</div>
        </div>
      )}

      {v.status === 'AGENDADA' && modelos.length > 0 && <div className="card glass"><div className="empty">Faça o check-in ao chegar no local para preencher: {modelos.map((m) => m.nome).join(', ')}.</div></div>}

      {(emAndamento || v.status === 'CONCLUIDA') && modelos.map((m) => (
        <div key={m.id} className="card glass">
          <h2>{m.nome}</h2>
          {m.descricao && <div className="tiny" style={{ marginBottom: 10 }}>{m.descricao}</div>}
          {emAndamento
            ? <Campos campos={m.campos} dados={dados[m.id] || {}} visitaId={v.id} onChange={(d) => mudou({ ...dados, [m.id]: d }, relato)} />
            : <Respostas modelo={m} dados={dados[m.id] || {}} />}
        </div>
      ))}

      {emAndamento && (
        <div className="card glass">
          <h2>Relato de execução</h2>
          <textarea rows={3} value={relato} placeholder="O que foi feito, problemas encontrados, próximos passos" onChange={(e) => mudou(dados, e.target.value)} />
          <div className="tiny" style={{ marginTop: 8 }}>{salvando ? 'Salvando…' : pendente ? 'Guardado no aparelho. Envia sozinho quando a internet voltar.' : 'Tudo salvo.'}</div>
          <div className="btns" style={{ marginTop: 14 }}><button className="btn primary" onClick={() => setModal('concluir')}><CheckCircle2 size={16} /> Concluir com assinatura</button></div>
        </div>
      )}

      {v.status === 'CONCLUIDA' && (
        <div className="card glass">
          <h2>Encerramento</h2>
          {v.relato && <div style={{ whiteSpace: 'pre-wrap', marginBottom: 10 }}>{v.relato}</div>}
          <AssinaturaSalva v={v} />
        </div>
      )}

      {modal === 'mudanca' && <PedirMudanca v={v} onClose={() => setModal(null)} recarregar={recarregar} />}
      {modal === 'concluir' && <Concluir v={v} modelos={modelos} dados={dados} relato={relato} enviar={enviar} onClose={() => setModal(null)} recarregar={recarregar} />}
    </>
  )
}

function PedirMudanca({ v, onClose, recarregar }) {
  const toast = useToast()
  const [txt, setTxt] = useState('')
  async function enviar() {
    const r = await supabase.from('visitas').update({ mudanca_solicitada: txt.trim(), mudanca_em: new Date().toISOString() }).eq('id', v.id)
    if (r.error) return toast(r.error.message, true)
    toast('Pedido enviado ao gestor'); onClose(); recarregar()
  }
  return (
    <Modal titulo="Solicitar mudança" sub="O gestor recebe o pedido e ajusta a agenda" onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!txt.trim()} onClick={enviar}>Enviar pedido</button></>}>
      <label>O que precisa mudar?<textarea rows={4} value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Ex.: síndico pediu para remarcar para quinta à tarde" /></label>
    </Modal>
  )
}

function Concluir({ v, modelos, dados, relato, enviar, onClose, recarregar }) {
  const toast = useToast()
  const [nome, setNome] = useState('')
  const [ass, setAss] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const falta = modelos.flatMap((m) => faltando(m.campos, dados[m.id] || {}).map((f) => `${m.nome}: ${f}`))
  async function concluir() {
    setOcupado(true)
    try {
      if (!(await enviar(dados, relato))) throw new Error('Sem internet para enviar as respostas. Tente de novo quando conectar.')
      const path = await enviarArquivo(v.id, ass, 'png')
      const p = await posicao()
      const r = await supabase.from('visitas').update({ status: 'CONCLUIDA', assinatura_nome: nome.trim(), assinatura_url: path, checkout_em: new Date().toISOString(), checkout_lat: p?.lat ?? null, checkout_lng: p?.lng ?? null }).eq('id', v.id)
      if (r.error) throw r.error
      toast('Visita concluída'); onClose(); recarregar()
    } catch (e) { toast(e.message, true) }
    setOcupado(false)
  }
  return (
    <Modal titulo="Concluir visita" sub="Peça ao responsável no local para assinar" onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Voltar</button><button className="btn primary" disabled={ocupado || falta.length > 0 || !nome.trim() || !ass} onClick={concluir}>{ocupado ? 'Enviando…' : 'Concluir'}</button></>}>
      {falta.length > 0 && <div className="aviso"><b>Faltam campos obrigatórios:</b><ul>{falta.map((f) => <li key={f}>{f}</li>)}</ul></div>}
      <label style={{ marginBottom: 12 }}>Nome de quem assina<input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Maria, síndica" /></label>
      <Assinatura onChange={setAss} />
    </Modal>
  )
}
