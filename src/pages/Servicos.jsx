import { useMemo, useState } from 'react'
import { Plus, Trash2, CheckCircle2, AlertTriangle, Truck, Undo2, Printer, Pencil } from 'lucide-react'
import { useData, ir, supabase, sugerirTC, proximoIdServico, fmtData, desde } from '../data.jsx'
import { Modal, Status, useToast } from '../ui.jsx'

const ABERTOS = ['ORCAMENTO', 'FECHADO', 'AGENDADO', 'EM_CAMPO']
const PENDENTE = ['PLANEJADO', 'RESERVADO', 'SEPARADO']
export const TIPOS_SERV = { MONITORAMENTO: 'Monitoramento', ELETROPOSTO: 'Eletroposto', OUTRO: 'Outro' }
const hoje = () => new Date().toISOString().slice(0, 10)

export default function Servicos({ param }) {
  const { db } = useData()
  const [aba, setAba] = useState('abertos')
  const [novo, setNovo] = useState(false)
  if (param) return <DetalheServico id={param} />
  const lista = db.servicos.filter((s) => (aba === 'abertos' ? ABERTOS.includes(s.status) : !ABERTOS.includes(s.status)))
  return (
    <>
      <div className="topbar">
        <div><img className="mobile-logo logo-img" src="/logo.png" alt="e-Simon" /><h1>Serviços</h1><div className="sub">Cada serviço fechado reserva o material que vai usar</div></div>
        <button className="btn primary" onClick={() => setNovo(true)}><Plus size={17} /> Serviço</button>
      </div>
      <div className="card glass">
        <div className="seg" style={{ marginBottom: 8 }}>
          <button className={aba === 'abertos' ? 'on' : ''} onClick={() => setAba('abertos')}>Em aberto</button>
          <button className={aba === 'fechados' ? 'on' : ''} onClick={() => setAba('fechados')}>Concluídos</button>
        </div>
        <div className="list">
          {lista.length === 0 && <div className="empty">Nada aqui.</div>}
          {lista.map((s) => <LinhaServico key={s.id} s={s} />)}
        </div>
      </div>
      {novo && <NovoServico onClose={() => setNovo(false)} />}
    </>
  )
}

function LinhaServico({ s }) {
  const { db } = useData()
  const chk = checagem(db, s.id)
  const faltam = chk.filter((c) => c.falta > 0).length
  return (
    <div className="row click" onClick={() => ir('servicos', s.id)}>
      <div className="grow">
        <div className="t">{s.cliente}</div>
        <div className="s">{s.id}{s.tipo && s.tipo !== 'MONITORAMENTO' ? ` · ${TIPOS_SERV[s.tipo]}` : ''}{s.data_instalacao ? ` · instalado em ${fmtData(s.data_instalacao)}` : s.data_prevista_campo ? ` · campo ${fmtData(s.data_prevista_campo)}` : ''} · {chk.length} itens{ABERTOS.includes(s.status) && chk.length ? (faltam ? ` · faltam ${faltam}` : ' · material ok') : ''}</div>
      </div>
      {ABERTOS.includes(s.status) && chk.length > 0 && (faltam ? <AlertTriangle size={18} color="#f87171" /> : <CheckCircle2 size={18} color="#34d399" />)}
      <Status v={s.status} />
    </div>
  )
}

// Para cada item do serviço: quanto falta levar, quanto tem em mãos e onde
function checagem(db, id) {
  const nec = db.necessidades.filter((n) => n.servico_id === id && PENDENTE.includes(n.status))
  const porItem = {}
  for (const n of nec) {
    porItem[n.item_id] ||= { item_id: n.item_id, precisa: 0, separado: 0 }
    porItem[n.item_id].precisa += n.qtd
    if (n.status === 'SEPARADO') porItem[n.item_id].separado += n.qtd
  }
  return Object.values(porItem).map((p) => {
    const s = db.saldo.find((x) => x.item_id === p.item_id) || {}
    const emMaos = (s.no_estoque || 0) + (s.com_tecnicos || 0)
    const aLevar = p.precisa - p.separado
    return { ...p, aLevar, emMaos, outros: Math.max(0, (s.reservado || 0) - p.precisa), falta: Math.max(0, aLevar - emMaos) }
  })
}

function emCampoDoServico(db, id) {
  const r = {}
  for (const m of db.movs) {
    if (m.servico_id !== id || m.ativo_id) continue
    if (m.destino === 'EM_CAMPO') r[m.item_id] = (r[m.item_id] || 0) + m.qtd
    if (m.origem === 'EM_CAMPO') r[m.item_id] = (r[m.item_id] || 0) - m.qtd
  }
  return Object.entries(r).filter(([, q]) => q > 0).map(([item_id, qtd]) => ({ item_id, qtd }))
}

function DetalheServico({ id }) {
  const { db, item, local, load } = useData()
  const toast = useToast()
  const [modal, setModal] = useState(null)
  const s = db.servicos.find((x) => x.id === id)
  if (!s) return <div className="empty">Serviço não encontrado.</div>
  const chk = checagem(db, id)
  const nec = db.necessidades.filter((n) => n.servico_id === id)
  const pontos = Object.values(nec.reduce((a, n) => { (a[n.ponto] ||= { ponto: n.ponto, disj: n.disjuntor_a, linhas: [] }).linhas.push(n); return a }, {}))
  const campo = emCampoDoServico(db, id)
  const equipCampo = db.ativos.filter((a) => a.servico_id === id && a.status === 'EM_CAMPO')
  const faltam = chk.filter((c) => c.falta > 0)

  async function mudarStatus(st) {
    const r = await supabase.from('servicos').update({ status: st, ...(st === 'CONCLUIDO' && !s.data_instalacao ? { data_instalacao: hoje() } : {}) }).eq('id', id)
    if (r.error) return toast(r.error.message, true)
    await load()
  }
  async function apagarLinha(n) {
    const r = await supabase.from('necessidades').delete().eq('id', n.id)
    if (r.error) return toast(r.error.message, true)
    await load()
  }

  return (
    <>
      <div className="topbar">
        <div>
          <button className="btn ghost small" style={{ marginLeft: -12 }} onClick={() => ir('servicos')}>‹ Serviços</button>
          <h1>{s.cliente}</h1>
          <div className="sub">{s.id} · {TIPOS_SERV[s.tipo] || 'Monitoramento'}{s.endereco ? ` · ${s.endereco}` : ''}{s.data_prevista_campo ? ` · campo ${fmtData(s.data_prevista_campo)}` : ''}{s.data_instalacao ? ` · instalado em ${fmtData(s.data_instalacao)}` : ''}</div>
        </div>
        <div className="btns">
          <button className="btn small" onClick={() => setModal('editar')}><Pencil size={15} /> Editar</button>
          <button className="btn small" onClick={() => window.print()}><Printer size={15} /> Imprimir lista</button>
          <select value={s.status} onChange={(e) => mudarStatus(e.target.value)} style={{ width: 'auto' }}>
            {['ORCAMENTO', 'FECHADO', 'AGENDADO', 'EM_CAMPO', 'CONCLUIDO', 'CANCELADO'].map((x) => <option key={x} value={x}>{{ ORCAMENTO: 'Orçamento', FECHADO: 'Fechado', AGENDADO: 'Agendado', EM_CAMPO: 'Em campo', CONCLUIDO: 'Concluído', CANCELADO: 'Cancelado' }[x]}</option>)}
          </select>
        </div>
      </div>

      <ListaImpressao s={s} nec={nec} equip={db.ativos.filter((a) => a.servico_id === id)} />

      <div className="card glass">
        <h2 style={{ flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>Checagem antes de sair {chk.length > 0 && (faltam.length ? <span className="pill bad">{faltam.length === 1 ? 'falta 1 item' : `faltam ${faltam.length} itens`}</span> : <span className="pill ok">tudo disponível</span>)}</span>
          <span className="btns">
            {chk.some((c) => c.aLevar > 0) && <button className="btn primary small" onClick={() => setModal('saida')}><Truck size={15} /> Registrar saída</button>}
            {(campo.length > 0 || equipCampo.length > 0) && <button className="btn small" onClick={() => setModal('retorno')}><Undo2 size={15} /> Registrar retorno</button>}
          </span>
        </h2>
        {chk.length === 0 ? <div className="empty">Nenhum material pendente para este serviço.</div> : (
          <div className="list">
            {chk.map((c) => {
              const onde = db.saldoLocal.filter((l) => l.item_id === c.item_id && ['ESTOQUE', 'TECNICO'].includes(local[l.local_id]?.tipo))
              return (
                <div key={c.item_id} className="row">
                  <div className="grow">
                    <div className="t">{item[c.item_id]?.descricao}</div>
                    <div className="s">precisa {c.precisa}{c.separado ? ` · separado ${c.separado}` : ''} · em mãos {c.emMaos}{c.outros > 0 ? ` · outros serviços reservam ${c.outros}` : ''}</div>
                    <div className="tiny">{onde.map((l) => `${local[l.local_id]?.nome}: ${l.qtd}`).join(' · ') || 'nenhum em estoque'}</div>
                  </div>
                  {c.falta > 0 ? <span className="pill bad">falta {c.falta}</span> : c.aLevar > 0 ? <span className="pill ok">ok</span> : <span className="pill info">separado</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {(campo.length > 0 || equipCampo.length > 0) && (
        <div className="card glass">
          <h2>Em campo neste serviço</h2>
          <div className="list">
            {campo.map((c) => <div key={c.item_id} className="row"><div className="grow t">{item[c.item_id]?.descricao}</div><span className="num">{c.qtd}</span></div>)}
            {equipCampo.map((a) => <div key={a.id} className="row"><div className="grow"><div className="t">{item[a.item_id]?.descricao} · {a.numero_serie || a.id}</div><div className="s">{a.responsavel} · {desde(a.desde)}</div></div></div>)}
          </div>
        </div>
      )}

      <div className="card glass">
        <h2>{s.tipo === 'ELETROPOSTO' || s.tipo === 'OUTRO' ? 'Materiais do serviço' : 'Pontos de medição'} <button className="btn small" onClick={() => setModal('linha')}><Plus size={15} /> Material</button></h2>
        <div className="list">
          {pontos.length === 0 && <div className="empty">Sem pontos cadastrados.</div>}
          {pontos.map((p) => (
            <div key={p.ponto} className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="t">{p.ponto || 'Geral'}{p.disj ? <span className="muted"> · disjuntor {p.disj} A</span> : ''}</div>
                {p.linhas.map((n) => (
                  <div key={n.id} className="s" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                    <span>{n.qtd} × {item[n.item_id]?.descricao}</span><Status v={n.status} />
                    {n.obs && <span className="tiny">{n.obs}</span>}
                    {n.status === 'PLANEJADO' && <button className="btn ghost small" style={{ padding: 4 }} onClick={() => apagarLinha(n)} aria-label="Remover"><Trash2 size={14} /></button>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {modal === 'saida' && <Saida s={s} chk={chk} onClose={() => setModal(null)} />}
      {modal === 'retorno' && <Retorno s={s} campo={campo} equip={equipCampo} onClose={() => setModal(null)} />}
      {modal === 'linha' && <NovaLinha s={s} onClose={() => setModal(null)} />}
      {modal === 'editar' && <EditarServico s={s} onClose={() => setModal(null)} />}
    </>
  )
}

function Saida({ s, chk, onClose }) {
  const { db, item, local, load, nomeUsuario } = useData()
  const toast = useToast()
  const [resp, setResp] = useState(nomeUsuario)
  const [qtd, setQtd] = useState(Object.fromEntries(chk.filter((c) => c.aLevar > 0).map((c) => [c.item_id, Math.min(c.aLevar, c.emMaos)])))
  const disponiveis = db.ativos.filter((a) => a.status === 'DISPONIVEL')
  const [equip, setEquip] = useState([])
  const [ocupado, setOcupado] = useState(false)

  // Tira primeiro do armário, depois do que está com técnicos
  function origens(itemId, q) {
    const fontes = db.saldoLocal
      .filter((l) => l.item_id === itemId && l.qtd > 0 && ['ESTOQUE', 'TECNICO'].includes(local[l.local_id]?.tipo))
      .sort((a, b) => (local[a.local_id].tipo === 'ESTOQUE' ? 0 : 1) - (local[b.local_id].tipo === 'ESTOQUE' ? 0 : 1))
    const r = []
    let resto = q
    for (const f of fontes) {
      if (resto <= 0) break
      const n = Math.min(resto, f.qtd)
      r.push({ local_id: f.local_id, qtd: n }); resto -= n
    }
    return { partes: r, semSaldo: resto }
  }

  const plano = Object.entries(qtd).map(([itemId, q]) => ({ itemId, ...origens(itemId, Number(q) || 0) }))
  const invalido = plano.some((p) => p.semSaldo > 0)

  async function salvar() {
    setOcupado(true)
    const movs = []
    for (const p of plano) for (const o of p.partes) {
      movs.push({ tipo: 'SAIDA_CAMPO', item_id: p.itemId, ativo_id: null, qtd: o.qtd, origem: o.local_id, destino: 'EM_CAMPO', servico_id: s.id, responsavel: resp })
    }
    for (const id of equip) {
      const a = db.ativos.find((x) => x.id === id)
      movs.push({ tipo: 'SAIDA_CAMPO', item_id: a.item_id, ativo_id: a.id, qtd: 1, origem: a.local_id, destino: 'EM_CAMPO', servico_id: s.id, responsavel: resp })
    }
    if (!movs.length) { setOcupado(false); return toast('Nada selecionado para sair.', true) }
    let r = await supabase.from('movimentacoes').insert(movs)
    if (!r.error) {
      const levados = plano.filter((p) => p.partes.length).map((p) => p.itemId)
      const ids = db.necessidades.filter((n) => n.servico_id === s.id && ['PLANEJADO', 'RESERVADO'].includes(n.status) && levados.includes(n.item_id)).map((n) => n.id)
      if (ids.length) r = await supabase.from('necessidades').update({ status: 'SEPARADO' }).in('id', ids)
      if (!r.error) r = await supabase.from('servicos').update({ status: 'EM_CAMPO' }).eq('id', s.id)
    }
    setOcupado(false)
    if (r.error) return toast(r.error.message, true)
    toast('Saída registrada'); await load(); onClose()
  }

  return (
    <Modal titulo="Saída a campo" sub={s.cliente} onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={ocupado || invalido} onClick={salvar}>Confirmar saída</button></>}>
      <div className="form" style={{ marginBottom: 14 }}>
        <label className="full">Técnico<input value={resp} onChange={(e) => setResp(e.target.value)} list="equipe-s" /></label>
        <datalist id="equipe-s">{db.equipe.map((e) => <option key={e.email} value={e.nome} />)}</datalist>
      </div>
      <h4 className="muted" style={{ margin: '0 0 4px' }}>Materiais</h4>
      <div className="list">
        {chk.filter((c) => c.aLevar > 0).map((c) => {
          const p = plano.find((x) => x.itemId === c.item_id)
          return (
            <div key={c.item_id} className="row">
              <div className="grow">
                <div className="t">{item[c.item_id]?.descricao}</div>
                <div className="s">precisa {c.aLevar} · em mãos {c.emMaos}</div>
                <div className="tiny" style={{ color: p?.semSaldo ? 'var(--bad)' : undefined }}>
                  {p?.semSaldo ? `só há ${c.emMaos} em mãos` : p?.partes.length ? 'sai de ' + p.partes.map((o) => `${local[o.local_id]?.nome} (${o.qtd})`).join(', ') : 'não vai levar'}
                </div>
              </div>
              <input className="qty" type="number" min="0" value={qtd[c.item_id] ?? 0} onChange={(e) => setQtd({ ...qtd, [c.item_id]: e.target.value })} />
            </div>
          )
        })}
      </div>
      <h4 className="muted" style={{ margin: '14px 0 4px' }}>Equipamentos (do armário)</h4>
      <div className="list">
        {disponiveis.length === 0 && <div className="empty">Nenhum equipamento disponível no armário.</div>}
        {disponiveis.map((a) => (
          <label key={a.id} className="row" style={{ flexDirection: 'row', cursor: 'pointer', color: 'var(--text)' }}>
            <input type="checkbox" style={{ width: 20, height: 20 }} checked={equip.includes(a.id)} onChange={(e) => setEquip(e.target.checked ? [...equip, a.id] : equip.filter((x) => x !== a.id))} />
            <div className="grow"><div className="t">{item[a.item_id]?.descricao}</div><div className="s">{a.id}{a.numero_serie ? ' · ' + a.numero_serie : ''}</div></div>
          </label>
        ))}
      </div>
    </Modal>
  )
}

function Retorno({ s, campo, equip, onClose }) {
  const { db, item, load, nomeUsuario } = useData()
  const toast = useToast()
  const [inst, setInst] = useState(Object.fromEntries(campo.map((c) => [c.item_id, c.qtd])))
  const [volta, setVolta] = useState(equip.map((a) => a.id))
  const [concluir, setConcluir] = useState(true)
  const [dataInst, setDataInst] = useState(hoje())
  const [ocupado, setOcupado] = useState(false)

  async function salvar() {
    setOcupado(true)
    const movs = []
    for (const c of campo) {
      const i = Math.min(Number(inst[c.item_id]) || 0, c.qtd)
      if (i > 0) movs.push({ tipo: 'INSTALACAO', item_id: c.item_id, qtd: i, origem: 'EM_CAMPO', destino: 'BAIXA', servico_id: s.id, responsavel: nomeUsuario })
      if (c.qtd - i > 0) movs.push({ tipo: 'DEVOLUCAO', item_id: c.item_id, qtd: c.qtd - i, origem: 'EM_CAMPO', destino: 'ARMARIO', servico_id: s.id, responsavel: nomeUsuario, obs: 'Sobra do serviço' })
    }
    for (const id of volta) {
      const a = db.ativos.find((x) => x.id === id)
      movs.push({ tipo: 'DEVOLUCAO', item_id: a.item_id, ativo_id: a.id, qtd: 1, origem: 'EM_CAMPO', destino: 'ARMARIO', servico_id: s.id, responsavel: nomeUsuario })
    }
    let r = movs.length ? await supabase.from('movimentacoes').insert(movs) : {}
    if (!r.error) {
      const instalados = Object.keys(inst).filter((k) => Number(inst[k]) > 0)
      if (instalados.length) r = await supabase.from('necessidades').update({ status: 'INSTALADO' }).eq('servico_id', s.id).eq('status', 'SEPARADO').in('item_id', instalados)
      if (!r.error && concluir) r = await supabase.from('servicos').update({ status: 'CONCLUIDO', data_instalacao: dataInst || null }).eq('id', s.id)
    }
    setOcupado(false)
    if (r.error) return toast(r.error.message, true)
    toast('Retorno registrado'); await load(); onClose()
  }

  return (
    <Modal titulo="Retorno do campo" sub={`${s.cliente} · o que não foi instalado volta para o armário`} onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={ocupado} onClick={salvar}>Confirmar retorno</button></>}>
      {campo.length > 0 && <h4 className="muted" style={{ margin: '0 0 4px' }}>Quanto foi instalado</h4>}
      <div className="list">
        {campo.map((c) => (
          <div key={c.item_id} className="row">
            <div className="grow"><div className="t">{item[c.item_id]?.descricao}</div><div className="s">levou {c.qtd} · volta {Math.max(0, c.qtd - (Number(inst[c.item_id]) || 0))}</div></div>
            <input className="qty" type="number" min="0" max={c.qtd} value={inst[c.item_id]} onChange={(e) => setInst({ ...inst, [c.item_id]: e.target.value })} />
          </div>
        ))}
      </div>
      {equip.length > 0 && <>
        <h4 className="muted" style={{ margin: '14px 0 4px' }}>Equipamentos que voltaram</h4>
        <div className="list">
          {equip.map((a) => (
            <label key={a.id} className="row" style={{ flexDirection: 'row', cursor: 'pointer', color: 'var(--text)' }}>
              <input type="checkbox" style={{ width: 20, height: 20 }} checked={volta.includes(a.id)} onChange={(e) => setVolta(e.target.checked ? [...volta, a.id] : volta.filter((x) => x !== a.id))} />
              <div className="grow t">{item[a.item_id]?.descricao} · {a.numero_serie || a.id}</div>
            </label>
          ))}
        </div>
      </>}
      <label className="row" style={{ flexDirection: 'row', cursor: 'pointer', color: 'var(--text)', marginTop: 10 }}>
        <input type="checkbox" style={{ width: 20, height: 20 }} checked={concluir} onChange={(e) => setConcluir(e.target.checked)} />
        <span>Marcar serviço como concluído</span>
      </label>
      {concluir && <div className="form" style={{ marginTop: 8 }}><label>Data da instalação<input type="date" value={dataInst} onChange={(e) => setDataInst(e.target.value)} /></label></div>}
    </Modal>
  )
}

function NovaLinha({ s, onClose }) {
  const { db, load } = useData()
  const toast = useToast()
  const [f, setF] = useState({ ponto: '', item_id: '', qtd: 1 })
  async function salvar() {
    const r = await supabase.from('necessidades').insert({ servico_id: s.id, ponto: f.ponto, item_id: f.item_id, qtd: Number(f.qtd) })
    if (r.error) return toast(r.error.message, true)
    await load(); onClose()
  }
  return (
    <Modal titulo="Adicionar material" sub={s.cliente} onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!f.item_id || !(f.qtd > 0)} onClick={salvar}>Adicionar</button></>}>
      <div className="form">
        <label className="full">Item<select value={f.item_id} onChange={(e) => setF({ ...f, item_id: e.target.value })}><option value="">Escolha</option>{db.itens.filter((i) => i.controle === 'QTD').map((i) => <option key={i.id} value={i.id}>{i.descricao}</option>)}</select></label>
        <label>Ponto<input value={f.ponto} onChange={(e) => setF({ ...f, ponto: e.target.value })} placeholder="ex.: GERAL" /></label>
        <label>Quantidade<input type="number" min="1" value={f.qtd} onChange={(e) => setF({ ...f, qtd: e.target.value })} /></label>
      </div>
    </Modal>
  )
}

function EditarServico({ s, onClose }) {
  const { load } = useData()
  const toast = useToast()
  const [f, setF] = useState({ cliente: s.cliente || '', endereco: s.endereco || '', tipo: s.tipo || 'MONITORAMENTO', data_prevista_campo: s.data_prevista_campo || '', data_instalacao: s.data_instalacao || '' })
  async function salvar() {
    const r = await supabase.from('servicos').update({ ...f, data_prevista_campo: f.data_prevista_campo || null, data_instalacao: f.data_instalacao || null }).eq('id', s.id)
    if (r.error) return toast(r.error.message, true)
    toast('Serviço atualizado'); await load(); onClose()
  }
  return (
    <Modal titulo="Editar serviço" sub={s.id} onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!f.cliente} onClick={salvar}>Salvar</button></>}>
      <div className="form">
        <label>Cliente / condomínio<input value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} /></label>
        <label>Tipo<select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS_SERV).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
        <label className="full">Endereço<input value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} /></label>
        <label>Data prevista de campo<input type="date" value={f.data_prevista_campo} onChange={(e) => setF({ ...f, data_prevista_campo: e.target.value })} /></label>
        <label>Data da instalação<input type="date" value={f.data_instalacao} onChange={(e) => setF({ ...f, data_instalacao: e.target.value })} /></label>
      </div>
    </Modal>
  )
}

// Só aparece na impressão: checklist de materiais e equipamentos para conferir na saída e no retorno
function ListaImpressao({ s, nec, equip }) {
  const { item } = useData()
  const porItem = {}
  for (const n of nec.filter((x) => x.status !== 'CANCELADO')) porItem[n.item_id] = (porItem[n.item_id] || 0) + n.qtd
  return (
    <div className="print-area">
      <img src="/logo-dark.png" alt="e-Simon" style={{ height: 36 }} />
      <h2>Lista de materiais e equipamentos</h2>
      <p><b>{s.cliente}</b> · {s.id} · {TIPOS_SERV[s.tipo] || 'Monitoramento'}<br />
        {s.endereco}{s.data_prevista_campo ? ` · campo ${fmtData(s.data_prevista_campo)}` : ''}{s.data_instalacao ? ` · instalado em ${fmtData(s.data_instalacao)}` : ''}</p>
      <table>
        <thead><tr><th>Material</th><th>Qtd</th><th>Saiu</th><th>Instalado</th><th>Voltou</th></tr></thead>
        <tbody>
          {Object.entries(porItem).map(([id, q]) => <tr key={id}><td>{item[id]?.descricao || id}</td><td>{q}</td><td>☐</td><td>____</td><td>____</td></tr>)}
          {Object.keys(porItem).length === 0 && <tr><td colSpan={5}>Nenhum material cadastrado.</td></tr>}
        </tbody>
      </table>
      <table>
        <thead><tr><th>Equipamento</th><th>Nº de série</th><th>Saiu</th><th>Voltou</th></tr></thead>
        <tbody>
          {equip.map((a) => <tr key={a.id}><td>{item[a.item_id]?.descricao}</td><td>{a.numero_serie || a.id}</td><td>☐</td><td>☐</td></tr>)}
          {[0, 1, 2].map((k) => <tr key={'v' + k}><td>&nbsp;</td><td></td><td>☐</td><td>☐</td></tr>)}
        </tbody>
      </table>
      <p className="assina">Técnico: ______________________ &nbsp; Data: ___/___/_____ &nbsp; Conferido por: ______________________</p>
    </div>
  )
}

function NovoServico({ onClose }) {
  const { db, item, load } = useData()
  const toast = useToast()
  const [f, setF] = useState({ cliente: '', endereco: '', data_prevista_campo: '', status: 'FECHADO', tipo: 'MONITORAMENTO' })
  const [pontos, setPontos] = useState([{ ponto: 'GERAL', disj: '', geral: true, tc: '', ie: true, dj: false, reset: false }])
  const [extras, setExtras] = useState([])
  const [ocupado, setOcupado] = useState(false)
  const tcs = db.itens.filter((i) => i.categoria === 'TC')
  const materiais = db.itens.filter((i) => i.controle === 'QTD' && i.ativo !== false)
  const comPontos = f.tipo === 'MONITORAMENTO'

  const linhas = useMemo(() => (comPontos ? pontos : []).map((p) => ({ ...p, tcFinal: p.tc || (p.disj ? sugerirTC(p.disj, p.geral) : '') })), [pontos, comPontos])
  const resumo = useMemo(() => {
    const r = {}
    const soma = (id, q) => { if (id && q > 0) r[id] = (r[id] || 0) + q }
    for (const p of linhas) {
      if (p.tcFinal) soma(p.tcFinal, 3)
      if (p.ie) soma('MED-IE-SM3W', 1)
      if (p.dj) soma('DISJ', 1)
      if (p.reset) soma('RESET', 1)
    }
    for (const e of extras) soma(e.item_id, Number(e.qtd))
    return Object.entries(r).map(([id, q]) => {
      const s = db.saldo.find((x) => x.item_id === id)
      return { id, q, livre: s ? s.disponivel : 0 }
    })
  }, [linhas, extras, db.saldo])

  const setP = (i, k, v) => setPontos(pontos.map((p, j) => (j === i ? { ...p, [k]: v, ...(k === 'disj' || k === 'geral' ? { tc: '' } : {}) } : p)))
  const setE = (i, k, v) => setExtras(extras.map((e, j) => (j === i ? { ...e, [k]: v } : e)))

  async function salvar() {
    setOcupado(true)
    const id = await proximoIdServico()
    let r = await supabase.from('servicos').insert({ id, ...f, data_prevista_campo: f.data_prevista_campo || null, data_fechamento: hoje() })
    if (!r.error) {
      const nec = []
      for (const p of linhas) {
        const base = { servico_id: id, ponto: p.ponto, disjuntor_a: Number(p.disj) || null }
        if (p.tcFinal) nec.push({ ...base, item_id: p.tcFinal, qtd: 3 })
        if (p.ie) nec.push({ ...base, item_id: 'MED-IE-SM3W', qtd: 1 })
        if (p.dj) nec.push({ ...base, item_id: 'DISJ', qtd: 1 })
        if (p.reset) nec.push({ ...base, item_id: 'RESET', qtd: 1 })
      }
      for (const e of extras) if (e.item_id && Number(e.qtd) > 0) nec.push({ servico_id: id, ponto: comPontos ? 'GERAL' : f.tipo, item_id: e.item_id, qtd: Number(e.qtd) })
      if (nec.length) r = await supabase.from('necessidades').insert(nec)
    }
    setOcupado(false)
    if (r.error) return toast(r.error.message, true)
    toast('Serviço criado'); await load(); onClose(); ir('servicos', id)
  }

  const chk = (p, i, k, txt) => <label style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><input type="checkbox" style={{ width: 18, height: 18 }} checked={!!p[k]} onChange={(e) => setP(i, k, e.target.checked)} />{txt}</label>

  return (
    <Modal titulo="Novo serviço" sub={comPontos ? 'O TC é sugerido pelo disjuntor: geral usa bipartido, os demais janela, sempre o próximo tamanho acima.' : 'Liste o material que o serviço vai usar.'} onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!f.cliente || ocupado} onClick={salvar}>Criar serviço</button></>}>
      <div className="form">
        <label>Cliente / condomínio<input value={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.value })} /></label>
        <label>Tipo de serviço<select value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>{Object.entries(TIPOS_SERV).map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select></label>
        <label>Data prevista de campo<input type="date" value={f.data_prevista_campo} onChange={(e) => setF({ ...f, data_prevista_campo: e.target.value })} /></label>
        <label>Situação<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="ORCAMENTO">Orçamento (não reserva)</option><option value="FECHADO">Fechado</option><option value="AGENDADO">Agendado</option></select></label>
        <label className="full">Endereço<input value={f.endereco} onChange={(e) => setF({ ...f, endereco: e.target.value })} /></label>
      </div>
      {comPontos && <>
        <h4 className="muted" style={{ margin: '16px 0 4px' }}>Pontos de medição</h4>
        <div className="list">
          {linhas.map((p, i) => (
            <div key={i} className="row" style={{ flexWrap: 'wrap' }}>
              <input style={{ flex: '1 1 120px' }} value={p.ponto} placeholder="Ponto" onChange={(e) => setP(i, 'ponto', e.target.value)} />
              <input style={{ width: 96 }} type="number" placeholder="Disj. A" value={p.disj} onChange={(e) => setP(i, 'disj', e.target.value)} />
              <select style={{ flex: '1 1 170px' }} value={p.tcFinal} onChange={(e) => setP(i, 'tc', e.target.value)}>
                <option value="">TC</option>{tcs.map((t) => <option key={t.id} value={t.id}>{t.descricao}</option>)}
              </select>
              {chk(p, i, 'geral', 'Geral')}
              {chk(p, i, 'ie', 'Medidor IE')}
              {chk(p, i, 'dj', 'Disjuntor')}
              {chk(p, i, 'reset', 'Reset')}
              <button className="btn ghost small" onClick={() => setPontos(pontos.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 size={15} /></button>
            </div>
          ))}
        </div>
        <div className="btns" style={{ marginTop: 8 }}>
          <button className="btn small" onClick={() => setPontos([...pontos, { ponto: `MED-${pontos.length}`, disj: pontos.at(-1)?.geral ? '' : pontos.at(-1)?.disj || '', geral: false, tc: '', ie: true, dj: false, reset: false }])}><Plus size={15} /> Ponto</button>
        </div>
      </>}
      <h4 className="muted" style={{ margin: '16px 0 4px' }}>{comPontos ? 'Outros materiais' : 'Materiais'}</h4>
      <div className="list">
        {extras.map((e, i) => (
          <div key={i} className="row">
            <select className="grow" value={e.item_id} onChange={(ev) => setE(i, 'item_id', ev.target.value)}><option value="">Escolha o material</option>{materiais.map((m) => <option key={m.id} value={m.id}>{m.descricao}</option>)}</select>
            <input className="qty" type="number" min="1" value={e.qtd} onChange={(ev) => setE(i, 'qtd', ev.target.value)} />
            <button className="btn ghost small" onClick={() => setExtras(extras.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <div className="btns" style={{ marginTop: 8 }}>
        <button className="btn small" onClick={() => setExtras([...extras, { item_id: '', qtd: 1 }])}><Plus size={15} /> Material</button>
      </div>
      {resumo.length > 0 && <>
        <h4 className="muted" style={{ margin: '16px 0 4px' }}>Material necessário</h4>
        <div className="list">
          {resumo.map((r) => (
            <div key={r.id} className="row">
              <div className="grow t">{item[r.id]?.descricao || r.id}</div>
              <span className="num">{r.q}</span>
              {r.livre >= r.q ? <span className="pill ok">tem</span> : <span className="pill bad">comprar {r.q - Math.max(0, r.livre)}</span>}
            </div>
          ))}
        </div>
      </>}
    </Modal>
  )
}
