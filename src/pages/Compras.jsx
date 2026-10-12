import { useState } from 'react'
import { Copy } from 'lucide-react'
import { useData, supabase, fmtData } from '../data.jsx'
import { Modal, Status, useToast } from '../ui.jsx'

export default function Compras() {
  const { db, item, load, nomeUsuario } = useData()
  const toast = useToast()
  const sugestoes = db.saldo.filter((s) => s.comprar > 0).sort((a, b) => b.comprar - a.comprar)
  const [qtd, setQtd] = useState({})
  const [receber, setReceber] = useState(null)
  const pedidos = db.compras.filter((c) => c.status === 'PEDIDA')
  const recebidas = db.compras.filter((c) => c.status === 'RECEBIDA').slice(0, 15)

  async function pedir(s) {
    const q = Number(qtd[s.item_id] ?? s.comprar)
    if (!(q > 0)) return
    const r = await supabase.from('compras').insert({ item_id: s.item_id, qtd: q, fornecedor: item[s.item_id]?.fornecedor || '', obs: `Pedido por ${nomeUsuario}` })
    if (r.error) return toast(r.error.message, true)
    toast('Pedido registrado'); await load()
  }
  async function cancelar(c) {
    const r = await supabase.from('compras').update({ status: 'CANCELADA' }).eq('id', c.id)
    if (r.error) return toast(r.error.message, true)
    await load()
  }
  function copiarLista() {
    const txt = 'Lista de compra e-Simon\n' + sugestoes.map((s) => `• ${qtd[s.item_id] ?? s.comprar} × ${s.descricao}`).join('\n')
    navigator.clipboard.writeText(txt).then(() => toast('Lista copiada'))
  }

  return (
    <>
      <div className="topbar">
        <div><img className="mobile-logo" src="/logo.png" alt="e-Simon" /><h1>Compras</h1><div className="sub">Necessidade dos serviços fechados + estoque mínimo − o que tem − o que já foi pedido</div></div>
      </div>
      <div className="card glass">
        <h2>Comprar agora {sugestoes.length > 0 && <button className="btn small" onClick={copiarLista}><Copy size={15} /> Copiar lista</button>}</h2>
        {sugestoes.length === 0 ? <div className="empty">Nada a comprar: o estoque cobre os serviços fechados.</div> : (
          <div className="list">
            {sugestoes.map((s) => (
              <div key={s.item_id} className="row" style={{ flexWrap: 'wrap' }}>
                <div className="grow" style={{ minWidth: 180 }}>
                  <div className="t">{s.descricao}</div>
                  <div className="s">tem {s.no_estoque + s.com_tecnicos} · reservado {s.reservado}{s.estoque_minimo ? ` · mínimo ${s.estoque_minimo}` : ''}{s.a_caminho ? ` · ${s.a_caminho} a caminho` : ''}</div>
                </div>
                <input className="qty" type="number" min="1" value={qtd[s.item_id] ?? s.comprar} onChange={(e) => setQtd({ ...qtd, [s.item_id]: e.target.value })} />
                <button className="btn primary small" onClick={() => pedir(s)}>Pedido feito</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card glass">
        <h2>A caminho</h2>
        {pedidos.length === 0 ? <div className="empty">Nenhum pedido aberto.</div> : (
          <div className="list">
            {pedidos.map((c) => (
              <div key={c.id} className="row">
                <div className="grow"><div className="t">{c.qtd} × {item[c.item_id]?.descricao}</div><div className="s">pedido em {fmtData(c.data_pedido)}{c.fornecedor ? ' · ' + c.fornecedor : ''}{c.previsao_entrega ? ' · chega ' + fmtData(c.previsao_entrega) : ''}</div></div>
                <button className="btn small" onClick={() => cancelar(c)}>Cancelar</button>
                <button className="btn primary small" onClick={() => setReceber(c)}>Recebido</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {recebidas.length > 0 && (
        <div className="card glass">
          <h2>Recebidas</h2>
          <div className="list">
            {recebidas.map((c) => <div key={c.id} className="row"><div className="grow"><div className="t">{c.qtd} × {item[c.item_id]?.descricao}</div><div className="s">pedido em {fmtData(c.data_pedido)}</div></div><Status v={c.status} /></div>)}
          </div>
        </div>
      )}
      {receber && <Receber c={receber} onClose={() => setReceber(null)} />}
    </>
  )
}

function Receber({ c, onClose }) {
  const { db, item, load, nomeUsuario } = useData()
  const toast = useToast()
  const [q, setQ] = useState(c.qtd)
  const [destino, setDestino] = useState('ARMARIO')
  async function salvar() {
    let r = await supabase.from('movimentacoes').insert({ tipo: 'ENTRADA_COMPRA', item_id: c.item_id, qtd: Number(q), destino, responsavel: nomeUsuario, obs: `Compra #${c.id}${c.fornecedor ? ' · ' + c.fornecedor : ''}` })
    if (!r.error) r = await supabase.from('compras').update({ status: 'RECEBIDA', qtd: Number(q) }).eq('id', c.id)
    if (r.error) return toast(r.error.message, true)
    toast('Entrada registrada'); await load(); onClose()
  }
  return (
    <Modal titulo="Receber compra" sub={item[c.item_id]?.descricao} onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!(q > 0)} onClick={salvar}>Dar entrada</button></>}>
      <div className="form">
        <label>Quantidade recebida<input type="number" min="1" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <label>Guardar em<select value={destino} onChange={(e) => setDestino(e.target.value)}>{db.locais.filter((l) => ['ESTOQUE', 'TECNICO'].includes(l.tipo)).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
      </div>
    </Modal>
  )
}
