import { useState } from 'react'
import { useData, supabase } from '../data.jsx'
import { TIPOS_MOV, useToast } from '../ui.jsx'

// Entrada, transferência, ajuste de contagem e baixa de materiais avulsos
const TIPOS = ['ENTRADA_COMPRA', 'TRANSFERENCIA', 'AJUSTE_INVENTARIO', 'BAIXA', 'ENVIO_MANUTENCAO', 'RETORNO_MANUTENCAO']

export default function Movimentar() {
  const { db, load, nomeUsuario } = useData()
  const toast = useToast()
  const vazio = { tipo: 'TRANSFERENCIA', item_id: '', qtd: 1, origem: 'ARMARIO', destino: '', servico_id: '', responsavel: nomeUsuario, obs: '', contagem: '' }
  const [f, setF] = useState(vazio)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const materiais = db.itens.filter((i) => i.controle === 'QTD')
  const saldoNoLocal = (item, loc) => db.saldoLocal.find((s) => s.item_id === item && s.local_id === loc)?.qtd || 0
  const usaOrigem = !['ENTRADA_COMPRA'].includes(f.tipo)
  const usaDestino = !['BAIXA'].includes(f.tipo)
  const ajuste = f.tipo === 'AJUSTE_INVENTARIO'
  const atual = ajuste && f.item_id && f.destino ? saldoNoLocal(f.item_id, f.destino) : null

  async function salvar() {
    let mov = { tipo: f.tipo, item_id: f.item_id, qtd: Number(f.qtd), servico_id: f.servico_id || null, responsavel: f.responsavel, obs: f.obs }
    if (ajuste) {
      // Ajuste pela contagem física: lança só a diferença
      const dif = Number(f.contagem) - atual
      if (!dif) return toast('A contagem já bate com o sistema.')
      mov = { ...mov, qtd: Math.abs(dif), origem: dif < 0 ? f.destino : null, destino: dif > 0 ? f.destino : null, obs: `Contagem ${f.contagem} (sistema ${atual})${f.obs ? ' · ' + f.obs : ''}` }
    } else {
      mov.origem = usaOrigem ? f.origem : null
      mov.destino = usaDestino ? f.destino : f.tipo === 'BAIXA' ? 'BAIXA' : null
    }
    const r = await supabase.from('movimentacoes').insert(mov)
    if (r.error) return toast(r.error.message, true)
    toast('Movimentação registrada'); setF({ ...vazio, tipo: f.tipo }); await load()
  }

  const ok = f.item_id && (ajuste ? f.destino && f.contagem !== '' : Number(f.qtd) > 0 && (!usaOrigem || f.origem) && (!usaDestino || f.destino))
  return (
    <>
      <div className="topbar"><div><h1>Movimentar</h1><div className="sub">Entradas, transferências, contagem e baixas de materiais</div></div></div>
      <div className="card glass">
        <div className="seg" style={{ marginBottom: 16 }}>
          {TIPOS.map((t) => <button key={t} className={f.tipo === t ? 'on' : ''} onClick={() => setF({ ...f, tipo: t })}>{TIPOS_MOV[t]}</button>)}
        </div>
        <div className="form">
          <label className="full">Item<select value={f.item_id} onChange={set('item_id')}><option value="">Escolha</option>{materiais.map((i) => <option key={i.id} value={i.id}>{i.descricao}</option>)}</select></label>
          {ajuste ? <>
            <label>Local contado<select value={f.destino} onChange={set('destino')}><option value="">Escolha</option>{db.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
            <label>Quantidade contada{atual !== null && <span className="tiny">sistema diz {atual}</span>}<input type="number" min="0" value={f.contagem} onChange={set('contagem')} /></label>
          </> : <>
            <label>Quantidade<input type="number" min="1" value={f.qtd} onChange={set('qtd')} /></label>
            {usaOrigem && <label>De<select value={f.origem} onChange={set('origem')}><option value="">Escolha</option>{db.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}{f.item_id ? ` (${saldoNoLocal(f.item_id, l.id)})` : ''}</option>)}</select></label>}
            {usaDestino && <label>Para<select value={f.destino} onChange={set('destino')}><option value="">Escolha</option>{db.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>}
          </>}
          <label>Responsável<input value={f.responsavel} onChange={set('responsavel')} /></label>
          <label>Serviço (opcional)<select value={f.servico_id} onChange={set('servico_id')}><option value="">Nenhum</option>{db.servicos.map((s) => <option key={s.id} value={s.id}>{s.cliente}</option>)}</select></label>
          <label className="full">Observação<input value={f.obs} onChange={set('obs')} /></label>
        </div>
        <div className="btns" style={{ marginTop: 16, justifyContent: 'flex-end' }}>
          <button className="btn primary" disabled={!ok} onClick={salvar}>Registrar</button>
        </div>
      </div>
    </>
  )
}
