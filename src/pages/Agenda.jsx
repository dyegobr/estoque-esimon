import { useEffect, useMemo, useState } from 'react'
import { Plus, ChevronLeft, ChevronRight, MapPin, MessageSquareWarning } from 'lucide-react'
import { useData, supabase, ir, fmtData, TIPOS_SERV } from '../data.jsx'
import { Modal, Status, useToast } from '../ui.jsx'
import { Respostas, AssinaturaSalva, STATUS_VISITA, fmtHora, diaISO, mapa } from '../campo.jsx'

const ABERTOS = ['ORCAMENTO', 'FECHADO', 'AGENDADO', 'EM_CAMPO']
const ATIVA = ['AGENDADA', 'EM_ANDAMENTO']
const segunda = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

export const tecnicos = (db) => db.equipe.filter((p) => p.ativo).sort((a, b) => (a.papel === 'ADMIN') - (b.papel === 'ADMIN') || a.nome.localeCompare(b.nome))

export default function Agenda() {
  const { db } = useData()
  const [aba, setAba] = useState('agenda')
  const [modo, setModo] = useState(() => (window.innerWidth < 700 ? 'dia' : 'semana'))
  const [data, setData] = useState(() => new Date())
  const [modal, setModal] = useState(null)

  const fila = db.servicos.filter((s) => ABERTOS.includes(s.status) && !db.visitas.some((v) => v.servico_id === s.id && ATIVA.includes(v.status)))
  const pedidos = db.visitas.filter((v) => v.mudanca_solicitada && ATIVA.includes(v.status))
  const pessoas = tecnicos(db)

  const ini = modo === 'dia' ? new Date(new Date(data).setHours(0, 0, 0, 0)) : segunda(data)
  const dias = Array.from({ length: modo === 'dia' ? 1 : 7 }, (_, i) => somaDias(ini, i))
  const daSemana = db.visitas.filter((v) => v.status !== 'CANCELADA' && new Date(v.inicio) >= ini && new Date(v.inicio) < somaDias(ini, dias.length))
  const titulo = modo === 'dia'
    ? data.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
    : `${ini.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} a ${somaDias(ini, 6).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`

  return (
    <>
      <div className="topbar">
        <div><img className="mobile-logo logo-img" src="/logo.png" alt="e-Simon" /><h1>Agenda</h1><div className="sub">Programação de visitas de cada técnico</div></div>
        <button className="btn primary" onClick={() => setModal({ novo: {} })}><Plus size={17} /> Visita</button>
      </div>

      <div className="seg" style={{ marginBottom: 14 }}>
        <button className={aba === 'agenda' ? 'on' : ''} onClick={() => setAba('agenda')}>Agenda</button>
        <button className={aba === 'fila' ? 'on' : ''} onClick={() => setAba('fila')}>Aguardando técnico{fila.length ? ` (${fila.length})` : ''}</button>
        <button className={aba === 'pedidos' ? 'on' : ''} onClick={() => setAba('pedidos')}>Pedidos de mudança{pedidos.length ? ` (${pedidos.length})` : ''}</button>
      </div>

      {aba === 'agenda' && (
        <div className="card glass">
          <div className="toolbar" style={{ marginBottom: 12 }}>
            <div className="btns" style={{ alignItems: 'center' }}>
              <button className="btn small" aria-label="Anterior" onClick={() => setData(somaDias(data, modo === 'dia' ? -1 : -7))}><ChevronLeft size={16} /></button>
              <button className="btn small" onClick={() => setData(new Date())}>Hoje</button>
              <button className="btn small" aria-label="Próximo" onClick={() => setData(somaDias(data, modo === 'dia' ? 1 : 7))}><ChevronRight size={16} /></button>
              <b style={{ textTransform: 'capitalize', marginLeft: 6 }}>{titulo}</b>
            </div>
            <div className="seg">
              <button className={modo === 'dia' ? 'on' : ''} onClick={() => setModo('dia')}>Dia</button>
              <button className={modo === 'semana' ? 'on' : ''} onClick={() => setModo('semana')}>Semana</button>
            </div>
          </div>
          {modo === 'semana' ? (
            <div className="tbl-wrap">
              <table className="agenda">
                <thead><tr><th>Técnico</th>{dias.map((d) => <th key={d} className={diaISO(d) === diaISO(new Date()) ? 'hoje' : ''}>{d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' })}</th>)}</tr></thead>
                <tbody>
                  {pessoas.map((p) => (
                    <tr key={p.email}>
                      <td className="quem">{p.nome}<div className="tiny">{p.papel === 'EXTERNO' ? 'externo' : p.papel === 'ADMIN' ? 'gestor' : 'interno'}</div></td>
                      {dias.map((d) => {
                        const vs = daSemana.filter((v) => v.tecnico_email.toLowerCase() === p.email.toLowerCase() && diaISO(v.inicio) === diaISO(d)).sort((a, b) => a.inicio.localeCompare(b.inicio))
                        return (
                          <td key={d} onClick={(e) => e.target === e.currentTarget && setModal({ novo: { tecnico_email: p.email, dia: diaISO(d) } })}>
                            {vs.map((v) => <Chip key={v.id} v={v} onClick={() => setModal({ visita: v })} />)}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="tiny" style={{ marginTop: 8 }}>Toque num espaço vazio para agendar naquele dia para aquele técnico.</div>
            </div>
          ) : (
            <div className="list">
              {pessoas.map((p) => {
                const vs = daSemana.filter((v) => v.tecnico_email.toLowerCase() === p.email.toLowerCase()).sort((a, b) => a.inicio.localeCompare(b.inicio))
                return (
                  <div key={p.email} style={{ padding: '8px 0', borderBottom: '1px solid var(--line)' }}>
                    <div className="toolbar"><b>{p.nome}</b><button className="btn ghost small" onClick={() => setModal({ novo: { tecnico_email: p.email, dia: diaISO(data) } })}><Plus size={14} /> agendar</button></div>
                    {vs.length === 0 ? <div className="tiny">Livre</div> : vs.map((v) => <LinhaVisita key={v.id} v={v} onClick={() => setModal({ visita: v })} />)}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {aba === 'fila' && (
        <div className="card glass">
          <h2>Serviços sem visita marcada</h2>
          <div className="tiny" style={{ marginBottom: 8 }}>Serviços em aberto (inclusive os que chegam do CRM) ficam aqui até alguém ser escalado.</div>
          <div className="list">
            {fila.length === 0 && <div className="empty">Todos os serviços em aberto têm técnico.</div>}
            {fila.map((s) => {
              const ult = db.visitas.filter((v) => v.servico_id === s.id && v.status === 'CONCLUIDA').sort((a, b) => b.inicio.localeCompare(a.inicio))[0]
              return (
                <div key={s.id} className="row">
                  <div className="grow click" style={{ cursor: 'pointer' }} onClick={() => ir('servicos', s.id)}>
                    <div className="t">{s.cliente}</div>
                    <div className="s">{s.id} · {TIPOS_SERV[s.tipo] || 'Monitoramento'}{s.origem === 'CRM' ? ' · CRM' : ''}{s.data_prevista_campo ? ` · campo previsto ${fmtData(s.data_prevista_campo)}` : ''}{ult ? ` · última visita ${fmtData(ult.inicio)}` : ''}</div>
                  </div>
                  <Status v={s.status} />
                  <button className="btn small primary" onClick={() => setModal({ novo: { servico_id: s.id, dia: s.data_prevista_campo || '' } })}>Agendar</button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {aba === 'pedidos' && (
        <div className="card glass">
          <h2>Pedidos de mudança dos técnicos</h2>
          <div className="list">
            {pedidos.length === 0 && <div className="empty">Nenhum pedido.</div>}
            {pedidos.map((v) => <LinhaVisita key={v.id} v={v} comData comPedido onClick={() => setModal({ visita: v })} />)}
          </div>
        </div>
      )}

      {modal?.novo && <EditarVisita inicial={modal.novo} onClose={() => setModal(null)} />}
      {modal?.visita && <EditarVisita visita={modal.visita} onClose={() => setModal(null)} />}
    </>
  )
}

function Chip({ v, onClick }) {
  const { servico, db } = useData()
  const s = servico[v.servico_id]
  const tipo = db.tiposVisita.find((t) => t.id === v.tipo_id)
  return (
    <button className={`chip ${STATUS_VISITA[v.status][0]}`} onClick={onClick} title={`${s?.cliente || ''} ${tipo?.nome || ''}`}>
      <b>{fmtHora(v.inicio)}</b> {s?.cliente || tipo?.nome || 'Visita'}{v.mudanca_solicitada && ' ⚠'}
    </button>
  )
}

export function LinhaVisita({ v, onClick, comData, comPedido, semCliente }) {
  const { servico, db } = useData()
  const s = servico[v.servico_id]
  const tipo = db.tiposVisita.find((t) => t.id === v.tipo_id)
  const tec = db.equipe.find((p) => p.email.toLowerCase() === v.tecnico_email.toLowerCase())
  const [cls, txt] = STATUS_VISITA[v.status]
  return (
    <div className="row click" onClick={onClick}>
      <div className="big" style={{ minWidth: 54, textAlign: 'left', fontSize: 17 }}>{fmtHora(v.inicio)}{comData && <small>{new Date(v.inicio).toLocaleDateString('pt-BR')}</small>}</div>
      <div className="grow">
        <div className="t">{semCliente ? tipo?.nome || 'Visita' : s?.cliente || tipo?.nome || 'Visita'}</div>
        <div className="s">{semCliente ? tec?.nome || v.tecnico_email : [tipo?.nome, comData || semCliente ? tec?.nome : null].filter(Boolean).join(' · ')}</div>
        {v.mudanca_solicitada && <div className="s" style={{ color: 'var(--pill-warn)' }}><MessageSquareWarning size={12} /> {comPedido ? v.mudanca_solicitada : 'Técnico pediu mudança'}</div>}
      </div>
      <span className={`pill ${cls}`}>{txt}</span>
    </div>
  )
}

const localISO = (d) => { const x = new Date(d); return `${diaISO(x)}T${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}` }

export function EditarVisita({ visita, inicial = {}, onClose }) {
  const { db, servico, load } = useData()
  const toast = useToast()
  const v = visita
  const ativos = db.tiposVisita.filter((t) => t.ativo)
  const [f, setF] = useState(() => v
    ? { servico_id: v.servico_id || '', tipo_id: v.tipo_id || '', tecnico_email: v.tecnico_email, quando: localISO(v.inicio), duracao_min: v.duracao_min, modelos: v.modelos || [], orientacao: v.orientacao || '' }
    : { servico_id: inicial.servico_id || '', tipo_id: '', tecnico_email: inicial.tecnico_email || '', quando: `${inicial.dia || diaISO(new Date())}T08:00`, duracao_min: 60, modelos: [], orientacao: '' })
  const [ocupado, setOcupado] = useState(false)
  const editavel = !v || ATIVA.includes(v.status)
  const set = (k, val) => setF((x) => ({ ...x, [k]: val }))
  function escolherTipo(id) {
    const t = db.tiposVisita.find((x) => x.id === Number(id))
    setF((x) => ({ ...x, tipo_id: id, ...(t ? { modelos: t.modelos, duracao_min: t.duracao_min } : {}) }))
  }
  // Sugere o tipo de visita pelo tipo do serviço, quando ainda não foi escolhido
  useEffect(() => {
    if (v || f.tipo_id || !f.servico_id) return
    const s = servico[f.servico_id]
    const alvo = s?.tipo === 'DIAGNOSTICO' ? /diagn/i : s?.tipo === 'MONITORAMENTO' ? /planej/i : null
    const t = alvo && ativos.find((x) => alvo.test(x.nome))
    if (t) escolherTipo(String(t.id))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.servico_id])

  const conflito = useMemo(() => {
    if (!f.tecnico_email || !f.quando) return null
    const ini = new Date(f.quando), fim = new Date(ini.getTime() + f.duracao_min * 60000)
    return db.visitas.find((x) => x.id !== v?.id && ATIVA.includes(x.status) && x.tecnico_email.toLowerCase() === f.tecnico_email.toLowerCase()
      && new Date(x.inicio) < fim && new Date(new Date(x.inicio).getTime() + x.duracao_min * 60000) > ini)
  }, [f.tecnico_email, f.quando, f.duracao_min, db.visitas, v])

  async function salvar() {
    setOcupado(true)
    const reg = { servico_id: f.servico_id || null, tipo_id: f.tipo_id ? Number(f.tipo_id) : null, tecnico_email: f.tecnico_email, inicio: new Date(f.quando).toISOString(), duracao_min: Number(f.duracao_min) || 60, modelos: f.modelos, orientacao: f.orientacao || null }
    const r = v
      ? await supabase.from('visitas').update({ ...reg, mudanca_solicitada: null, mudanca_em: null }).eq('id', v.id)
      : await supabase.from('visitas').insert(reg)
    if (!r.error && reg.servico_id) {
      const s = servico[reg.servico_id]
      if (['ORCAMENTO', 'FECHADO'].includes(s?.status) || !s?.data_prevista_campo) {
        await supabase.from('servicos').update({ status: ['ORCAMENTO', 'FECHADO'].includes(s.status) ? 'AGENDADO' : s.status, data_prevista_campo: s.data_prevista_campo || diaISO(reg.inicio) }).eq('id', reg.servico_id)
      }
    }
    setOcupado(false)
    if (r.error) return toast(r.error.message, true)
    toast(v ? 'Visita atualizada' : 'Visita agendada'); await load(); onClose()
  }
  async function cancelar() {
    if (!confirm('Cancelar esta visita? O técnico deixa de vê-la como pendente.')) return
    const r = await supabase.from('visitas').update({ status: 'CANCELADA' }).eq('id', v.id)
    if (r.error) return toast(r.error.message, true)
    toast('Visita cancelada'); await load(); onClose()
  }

  const opcoesServ = db.servicos.filter((s) => ABERTOS.includes(s.status) || s.id === f.servico_id)
  return (
    <Modal titulo={v ? 'Visita' : 'Agendar visita'} sub={v ? `${STATUS_VISITA[v.status][1]}${v.checkin_em ? ` · check-in ${fmtHora(v.checkin_em)}` : ''}` : 'O técnico vê a visita na agenda dele assim que salvar'} onClose={onClose}
      acoes={<>
        {v && editavel && <button className="btn ghost" style={{ marginRight: 'auto', color: 'var(--bad)' }} onClick={cancelar}>Cancelar visita</button>}
        <button className="btn" onClick={onClose}>Fechar</button>
        {editavel && <button className="btn primary" disabled={ocupado || !f.tecnico_email || !f.quando} onClick={salvar}>{v ? (v.mudanca_solicitada ? 'Salvar e atender pedido' : 'Salvar') : 'Agendar'}</button>}
      </>}>
      {v?.mudanca_solicitada && <div className="aviso"><b>Pedido do técnico</b> ({new Date(v.mudanca_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}): {v.mudanca_solicitada}</div>}
      <div className="form">
        <label className="full">Serviço
          <select disabled={!editavel} value={f.servico_id} onChange={(e) => set('servico_id', e.target.value)}>
            <option value="">Sem serviço (visita avulsa)</option>
            {opcoesServ.map((s) => <option key={s.id} value={s.id}>{s.cliente} · {s.id}</option>)}
          </select>
        </label>
        <label>Tipo de visita
          <select disabled={!editavel} value={f.tipo_id} onChange={(e) => escolherTipo(e.target.value)}>
            <option value="">Escolha</option>
            {ativos.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
          </select>
        </label>
        <label>Técnico
          <select disabled={!editavel} value={f.tecnico_email} onChange={(e) => set('tecnico_email', e.target.value)}>
            <option value="">Escolha</option>
            {tecnicos(db).map((p) => <option key={p.email} value={p.email}>{p.nome}{p.papel === 'EXTERNO' ? ' (externo)' : ''}</option>)}
          </select>
        </label>
        <label>Data e hora<input disabled={!editavel} type="datetime-local" value={f.quando} onChange={(e) => set('quando', e.target.value)} /></label>
        <label>Duração (min)<input disabled={!editavel} type="number" min="15" step="15" value={f.duracao_min} onChange={(e) => set('duracao_min', e.target.value)} /></label>
        {conflito && <div className="full aviso">Esse técnico já tem visita às {fmtHora(conflito.inicio)} ({servico[conflito.servico_id]?.cliente || 'visita'}).</div>}
        <div className="full campo"><span>Formulários que o técnico vai preencher</span>
          <div className="seg escolhas">
            {db.modelos.filter((m) => m.ativo || f.modelos.includes(m.id)).map((m) => (
              <button type="button" key={m.id} disabled={!editavel} className={f.modelos.includes(m.id) ? 'on' : ''} onClick={() => set('modelos', f.modelos.includes(m.id) ? f.modelos.filter((x) => x !== m.id) : [...f.modelos, m.id])}>{m.nome}</button>
            ))}
          </div>
        </div>
        <label className="full">Orientação para o técnico<textarea disabled={!editavel} rows={2} value={f.orientacao} onChange={(e) => set('orientacao', e.target.value)} placeholder="Ex.: ver se precisa algo para instalação dos medidores" /></label>
      </div>
      {v && v.status !== 'AGENDADA' && <div style={{ marginTop: 16 }}><ResultadoVisita v={v} /></div>}
    </Modal>
  )
}

// O que o técnico registrou: formulários, relato, localização e assinatura
export function ResultadoVisita({ v }) {
  const { db } = useData()
  const [resp, setResp] = useState(null)
  useEffect(() => {
    supabase.from('respostas').select('*').eq('visita_id', v.id).then(({ data }) => setResp(data || []))
  }, [v.id, v.status])
  if (!resp) return <div className="spin" />
  const gps = [['Check-in', v.checkin_em, v.checkin_lat, v.checkin_lng], ['Check-out', v.checkout_em, v.checkout_lat, v.checkout_lng]].filter((x) => x[1])
  return (
    <div className="resultado">
      {gps.length > 0 && (
        <div className="btns" style={{ marginBottom: 10 }}>
          {gps.map(([n, t, la, lo]) => mapa(la, lo)
            ? <a key={n} className="btn small" href={mapa(la, lo)} target="_blank" rel="noreferrer"><MapPin size={14} /> {n} {fmtHora(t)}</a>
            : <span key={n} className="pill">{n} {fmtHora(t)} · sem GPS</span>)}
        </div>
      )}
      {resp.length === 0 && <div className="tiny">Nenhum formulário preenchido ainda.</div>}
      {resp.map((r) => {
        const m = db.modelos.find((x) => x.id === r.modelo_id)
        return m && <div key={r.id} style={{ marginBottom: 12 }}><div className="secao-tit">{m.nome}</div><Respostas modelo={m} dados={r.dados} /></div>
      })}
      {v.relato && <div className="resp"><div className="s">Relato de execução</div><div style={{ whiteSpace: 'pre-wrap' }}>{v.relato}</div></div>}
      <AssinaturaSalva v={v} />
    </div>
  )
}
