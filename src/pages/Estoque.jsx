import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useData, ir, supabase, fmtDataHora } from '../data.jsx'
import { Modal, TIPOS_MOV, useToast } from '../ui.jsx'

export default function Estoque({ param }) {
  const { db } = useData()
  const [busca, setBusca] = useState('')
  const [grupo, setGrupo] = useState('MATERIAL')
  const [novo, setNovo] = useState(false)
  const lista = db.saldo
    .filter((s) => grupo === 'TODOS' || s.grupo === grupo)
    .filter((s) => (s.descricao + s.item_id + s.categoria).toLowerCase().includes(busca.toLowerCase()))
    .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.descricao.localeCompare(b.descricao, 'pt-BR', { numeric: true }))

  return (
    <>
      <div className="topbar">
        <div><img className="mobile-logo" src="/logo.png" alt="e-Simon" /><h1>Materiais</h1><div className="sub">Saldo por item, reservado para serviços e o que comprar</div></div>
        <button className="btn primary" onClick={() => setNovo(true)}><Plus size={17} /> Item</button>
      </div>
      <div className="card glass">
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <div className="seg">
            {[['MATERIAL', 'Materiais'], ['EQUIPAMENTO', 'Equipamentos'], ['TODOS', 'Todos']].map(([v, t]) => (
              <button key={v} className={grupo === v ? 'on' : ''} onClick={() => setGrupo(v)}>{t}</button>
            ))}
          </div>
          <input placeholder="Buscar item" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="list only-mob">
          {lista.map((s) => (
            <div key={s.item_id} className="row click" onClick={() => ir('estoque', s.item_id)}>
              <div className="grow">
                <div className="t">{s.descricao}</div>
                <div className="s">armário {s.no_estoque}{s.com_tecnicos ? ` · técnicos ${s.com_tecnicos}` : ''}{s.em_campo ? ` · campo ${s.em_campo}` : ''}{s.reservado ? ` · reservado ${s.reservado}` : ''}</div>
              </div>
              {s.comprar > 0 && <span className="pill bad">comprar {s.comprar}</span>}
              <div className="big" style={{ color: s.disponivel < 0 ? 'var(--bad)' : undefined }}>{s.disponivel}<small>livre</small></div>
            </div>
          ))}
        </div>
        <div className="tbl-wrap only-desk">
          <table>
            <thead><tr><th>Item</th><th className="n">Armário</th><th className="n">Técnicos</th><th className="n">Em campo</th><th className="n">Reservado</th><th className="n">Disponível</th><th className="n">Comprar</th></tr></thead>
            <tbody>
              {lista.map((s) => (
                <tr key={s.item_id} className="click" onClick={() => ir('estoque', s.item_id)}>
                  <td><div style={{ fontWeight: 550 }}>{s.descricao}</div><div className="tiny">{s.item_id} · {s.categoria}</div></td>
                  <td className="n">{s.no_estoque}</td>
                  <td className="n">{s.com_tecnicos || ''}</td>
                  <td className="n">{s.em_campo || ''}</td>
                  <td className="n">{s.reservado || ''}</td>
                  <td className="n" style={{ color: s.disponivel < 0 ? 'var(--bad)' : undefined, fontWeight: 650 }}>{s.disponivel}</td>
                  <td className="n">{s.comprar ? <span className="pill bad">{s.comprar}</span> : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {param && <DetalheItem id={param} onClose={() => ir('estoque')} />}
      {novo && <EditarItem onClose={() => setNovo(false)} />}
    </>
  )
}

function DetalheItem({ id, onClose }) {
  const { db, item, local, servico } = useData()
  const [editar, setEditar] = useState(false)
  const it = item[id]
  const s = db.saldo.find((x) => x.item_id === id)
  if (!it) return null
  const locais = db.saldoLocal.filter((x) => x.item_id === id)
  const nec = db.necessidades.filter((n) => n.item_id === id && ['PLANEJADO', 'RESERVADO', 'SEPARADO'].includes(n.status))
  const porServico = Object.values(nec.reduce((a, n) => {
    a[n.servico_id] ||= { id: n.servico_id, qtd: 0 }
    a[n.servico_id].qtd += n.qtd
    return a
  }, {})).filter((x) => ['FECHADO', 'AGENDADO', 'EM_CAMPO'].includes(servico[x.id]?.status))
  const movs = db.movs.filter((m) => m.item_id === id).slice(0, 30)

  if (editar) return <EditarItem it={it} onClose={() => setEditar(false)} />
  return (
    <Modal titulo={it.descricao} sub={`${it.id} · ${it.marca || ''} ${it.modelo || ''}`} onClose={onClose}
      acoes={<><button className="btn" onClick={() => setEditar(true)}>Editar</button><button className="btn primary" onClick={onClose}>Fechar</button></>}>
      {s && (
        <div className="grid kpis" style={{ marginBottom: 14 }}>
          <div className="card glass kpi"><div className="v">{s.no_estoque + s.com_tecnicos}</div><div className="l">em mãos</div></div>
          <div className="card glass kpi"><div className="v">{s.reservado}</div><div className="l">reservado</div></div>
          <div className={`card glass kpi ${s.disponivel < 0 ? 'bad' : 'ok'}`}><div className="v">{s.disponivel}</div><div className="l">disponível</div></div>
          <div className={`card glass kpi ${s.comprar ? 'bad' : ''}`}><div className="v">{s.comprar}</div><div className="l">comprar</div></div>
        </div>
      )}
      <h4 className="muted" style={{ margin: '6px 0' }}>Onde está</h4>
      <div className="list">
        {locais.length === 0 && <div className="empty">Sem saldo em nenhum local.</div>}
        {locais.map((l) => <div key={l.local_id} className="row"><div className="grow t">{local[l.local_id]?.nome}</div><span className="num">{l.qtd}</span></div>)}
      </div>
      {porServico.length > 0 && <>
        <h4 className="muted" style={{ margin: '14px 0 6px' }}>Serviços que vão usar</h4>
        <div className="list">
          {porServico.map((p) => <div key={p.id} className="row click" onClick={() => ir('servicos', p.id)}><div className="grow t">{servico[p.id]?.cliente}</div><span className="num">{p.qtd}</span></div>)}
        </div>
      </>}
      <h4 className="muted" style={{ margin: '14px 0 6px' }}>Histórico</h4>
      <div className="list">
        {movs.map((m) => (
          <div key={m.id} className="row">
            <div className="grow"><div className="t">{TIPOS_MOV[m.tipo]}{m.servico_id ? ' · ' + (servico[m.servico_id]?.cliente || '') : ''}</div>
              <div className="s">{fmtDataHora(m.data_hora)} · {local[m.origem]?.nome || '—'} → {local[m.destino]?.nome || '—'} · {m.responsavel}</div></div>
            <span className="num">{m.qtd}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

export function EditarItem({ it, onClose }) {
  const { load } = useData()
  const toast = useToast()
  const [f, setF] = useState(it || { id: '', grupo: 'MATERIAL', categoria: '', descricao: '', marca: '', modelo: '', especificacao: '', unidade: 'un', controle: 'QTD', estoque_minimo: 0, fornecedor: '', prazo_compra_dias: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function salvar() {
    const dados = { ...f, id: f.id.trim().toUpperCase(), estoque_minimo: Number(f.estoque_minimo) || 0, prazo_compra_dias: f.prazo_compra_dias === '' ? null : Number(f.prazo_compra_dias), controle: f.grupo === 'EQUIPAMENTO' ? 'SERIAL' : 'QTD' }
    delete dados.created_at
    const r = it ? await supabase.from('itens').update(dados).eq('id', it.id) : await supabase.from('itens').insert(dados)
    if (r.error) return toast(r.error.message, true)
    toast('Item salvo'); await load(); onClose()
  }
  return (
    <Modal titulo={it ? 'Editar item' : 'Novo item'} onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={salvar} disabled={!f.id || !f.descricao}>Salvar</button></>}>
      <div className="form">
        <label>Código<input value={f.id} onChange={set('id')} disabled={!!it} placeholder="ex.: CABO-PP-2X1,5" /></label>
        <label>Grupo<select value={f.grupo} onChange={set('grupo')} disabled={!!it}><option value="MATERIAL">Material (consumível)</option><option value="EQUIPAMENTO">Equipamento (reutilizável)</option></select></label>
        <label className="full">Descrição<input value={f.descricao} onChange={set('descricao')} /></label>
        <label>Categoria<input value={f.categoria} onChange={set('categoria')} placeholder="TC, Cabo, Conector…" /></label>
        <label>Unidade<input value={f.unidade} onChange={set('unidade')} /></label>
        <label>Marca<input value={f.marca || ''} onChange={set('marca')} /></label>
        <label>Modelo<input value={f.modelo || ''} onChange={set('modelo')} /></label>
        <label>Estoque mínimo<input type="number" min="0" value={f.estoque_minimo} onChange={set('estoque_minimo')} /></label>
        <label>Prazo de compra (dias)<input type="number" min="0" value={f.prazo_compra_dias ?? ''} onChange={set('prazo_compra_dias')} /></label>
        <label className="full">Fornecedor<input value={f.fornecedor || ''} onChange={set('fornecedor')} /></label>
      </div>
    </Modal>
  )
}
