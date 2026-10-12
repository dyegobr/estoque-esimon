import { useState } from 'react'
import { useData, fmtDataHora } from '../data.jsx'
import { TIPOS_MOV } from '../ui.jsx'

export default function Historico() {
  const { db, item, local, servico } = useData()
  const [busca, setBusca] = useState('')
  const [tipo, setTipo] = useState('')
  const b = busca.toLowerCase()
  const lista = db.movs.filter((m) => (!tipo || m.tipo === tipo) && (!b || [item[m.item_id]?.descricao, m.ativo_id, m.responsavel, servico[m.servico_id]?.cliente, m.obs].join(' ').toLowerCase().includes(b))).slice(0, 300)
  return (
    <>
      <div className="topbar"><div><h1>Histórico</h1><div className="sub">Tudo o que entrou, saiu, foi instalado ou mudou de lugar</div></div></div>
      <div className="card glass">
        <div className="toolbar" style={{ marginBottom: 10 }}>
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} style={{ maxWidth: 240 }}>
            <option value="">Todos os tipos</option>{Object.entries(TIPOS_MOV).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <input placeholder="Buscar item, técnico, serviço" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        <div className="tbl-wrap"><table>
          <thead><tr><th>Quando</th><th>Tipo</th><th>Item</th><th className="n">Qtd</th><th>De → Para</th><th>Serviço</th><th>Quem</th></tr></thead>
          <tbody>{lista.map((m) => (
            <tr key={m.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{fmtDataHora(m.data_hora)}</td>
              <td>{TIPOS_MOV[m.tipo]}</td>
              <td>{item[m.item_id]?.descricao}{m.ativo_id ? <span className="tiny"> · {m.ativo_id}</span> : ''}{m.obs ? <div className="tiny">{m.obs}</div> : ''}</td>
              <td className="n">{m.qtd}</td>
              <td className="tiny" style={{ whiteSpace: 'nowrap' }}>{local[m.origem]?.nome || '—'} → {local[m.destino]?.nome || '—'}</td>
              <td>{servico[m.servico_id]?.cliente || ''}</td>
              <td>{m.responsavel}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </div>
    </>
  )
}
