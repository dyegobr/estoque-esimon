import { useState } from 'react'
import { Copy, PackagePlus } from 'lucide-react'
import { useData, supabase, fmtData } from '../data.jsx'
import { Modal, Status, useToast } from '../ui.jsx'

const hoje = () => new Date().toISOString().slice(0, 10)
export const garantiaAte = (data, meses) => {
  if (!data || !meses) return null
  const d = new Date(data + 'T12:00:00')
  d.setMonth(d.getMonth() + Number(meses))
  return d.toISOString().slice(0, 10)
}

export default function Compras() {
  const { db, item, load } = useData()
  const toast = useToast()
  const sugestoes = db.saldo.filter((s) => s.comprar > 0).sort((a, b) => b.comprar - a.comprar)
  const [qtd, setQtd] = useState({})
  const [pedir, setPedir] = useState(null)
  const [receber, setReceber] = useState(null)
  const pedidos = db.compras.filter((c) => c.status === 'PEDIDA')
  const recebidas = db.compras.filter((c) => c.status === 'RECEBIDA').slice(0, 30)

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
        <div><img className="mobile-logo logo-img" src="/logo.png" alt="e-Simon" /><h1>Compras</h1><div className="sub">Necessidade dos serviços fechados + estoque mínimo − o que tem − o que já foi pedido</div></div>
        <button className="btn primary" onClick={() => setReceber({})}><PackagePlus size={17} /> Entrada de compra</button>
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
                <button className="btn primary small" onClick={() => setPedir({ item_id: s.item_id, qtd: Number(qtd[s.item_id] ?? s.comprar) })}>Pedido feito</button>
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
              <div key={c.id} className="row" style={{ flexWrap: 'wrap' }}>
                <div className="grow" style={{ minWidth: 180 }}><div className="t">{c.qtd} × {item[c.item_id]?.descricao}</div><div className="s">pedido em {fmtData(c.data_pedido)}{c.fornecedor ? ' · ' + c.fornecedor : ''}{c.previsao_entrega ? ' · chega ' + fmtData(c.previsao_entrega) : ''}</div></div>
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
            {recebidas.map((c) => (
              <div key={c.id} className="row">
                <div className="grow">
                  <div className="t">{c.qtd} × {item[c.item_id]?.descricao}</div>
                  <div className="s">{[c.fornecedor, c.nota_fiscal && `NF ${c.nota_fiscal}${c.data_nf ? ' de ' + fmtData(c.data_nf) : ''}`, c.data_entrada && `entrada ${fmtData(c.data_entrada)}`, c.garantia_meses && `garantia até ${fmtData(garantiaAte(c.data_entrada || c.data_nf, c.garantia_meses))}`].filter(Boolean).join(' · ') || `pedido em ${fmtData(c.data_pedido)}`}</div>
                </div>
                <Status v={c.status} />
              </div>
            ))}
          </div>
        </div>
      )}
      {pedir && <Pedir p={pedir} onClose={() => setPedir(null)} />}
      {receber && <Recebimento compra={receber.id ? receber : null} onClose={() => setReceber(null)} />}
    </>
  )
}

function Pedir({ p, onClose }) {
  const { item, load, nomeUsuario } = useData()
  const toast = useToast()
  const [f, setF] = useState({ qtd: p.qtd, fornecedor: item[p.item_id]?.fornecedor || '', previsao_entrega: '' })
  async function salvar() {
    const r = await supabase.from('compras').insert({ item_id: p.item_id, qtd: Number(f.qtd), fornecedor: f.fornecedor, previsao_entrega: f.previsao_entrega || null, obs: `Pedido por ${nomeUsuario}` })
    if (r.error) return toast(r.error.message, true)
    toast('Pedido registrado'); await load(); onClose()
  }
  return (
    <Modal titulo="Pedido feito" sub={item[p.item_id]?.descricao} onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!(f.qtd > 0)} onClick={salvar}>Registrar pedido</button></>}>
      <div className="form">
        <label>Quantidade<input type="number" min="1" value={f.qtd} onChange={(e) => setF({ ...f, qtd: e.target.value })} /></label>
        <label>Previsão de entrega<input type="date" value={f.previsao_entrega} onChange={(e) => setF({ ...f, previsao_entrega: e.target.value })} /></label>
        <label className="full">Fornecedor<input value={f.fornecedor} onChange={(e) => setF({ ...f, fornecedor: e.target.value })} /></label>
      </div>
    </Modal>
  )
}

// Entrada de compra: com pedido (compra) ou direta. Equipamentos ganham nº de série e garantia, um a um.
function Recebimento({ compra, onClose }) {
  const { db, item, load, nomeUsuario } = useData()
  const toast = useToast()
  const [f, setF] = useState({
    item_id: compra?.item_id || '', qtd: compra?.qtd || 1, fornecedor: compra?.fornecedor || '',
    nota_fiscal: '', data_nf: '', data_entrada: hoje(), garantia_meses: '', destino: 'ARMARIO',
  })
  const [series, setSeries] = useState([])
  const [ocupado, setOcupado] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const it = item[f.item_id]
  const serial = it?.controle === 'SERIAL'
  const n = Math.max(0, Math.min(50, Number(f.qtd) || 0))

  async function salvar() {
    setOcupado(true)
    const dados = {
      item_id: f.item_id, qtd: n, fornecedor: f.fornecedor, nota_fiscal: f.nota_fiscal, data_nf: f.data_nf || null,
      data_entrada: f.data_entrada || null, garantia_meses: f.garantia_meses ? Number(f.garantia_meses) : null, status: 'RECEBIDA',
    }
    let r = compra
      ? await supabase.from('compras').update(dados).eq('id', compra.id).select().single()
      : await supabase.from('compras').insert({ ...dados, data_pedido: f.data_nf || f.data_entrada || hoje(), obs: `Entrada por ${nomeUsuario}` }).select().single()
    const compraId = r.data?.id
    const obs = `Compra #${compraId}${f.fornecedor ? ' · ' + f.fornecedor : ''}${f.nota_fiscal ? ' · NF ' + f.nota_fiscal : ''}`
    if (!r.error && serial) {
      const prefixo = f.item_id.replace(/^EQ-/, '')
      const novos = Array.from({ length: n }, (_, i) => {
        const sn = (series[i] || '').trim()
        return {
          id: `${prefixo}-${sn || `${compraId}-${i + 1}`}`.toUpperCase().replace(/\s+/g, ''), item_id: f.item_id, numero_serie: sn, status: 'VERIFICAR',
          fornecedor: f.fornecedor, nota_fiscal: f.nota_fiscal, data_compra: f.data_nf || f.data_entrada || null,
          garantia_ate: garantiaAte(f.data_entrada || f.data_nf, f.garantia_meses), compra_id: compraId,
        }
      })
      r = await supabase.from('ativos').insert(novos)
      if (!r.error) r = await supabase.from('movimentacoes').insert(novos.map((a) => ({ tipo: 'ENTRADA_COMPRA', item_id: a.item_id, ativo_id: a.id, qtd: 1, origem: null, destino: f.destino, responsavel: nomeUsuario, obs })))
    } else if (!r.error) {
      r = await supabase.from('movimentacoes').insert({ tipo: 'ENTRADA_COMPRA', item_id: f.item_id, qtd: n, destino: f.destino, responsavel: nomeUsuario, obs })
    }
    setOcupado(false)
    if (r.error) return toast(r.error.message, true)
    toast('Entrada registrada'); await load(); onClose()
  }

  return (
    <Modal titulo="Entrada de compra" sub={compra ? item[compra.item_id]?.descricao : 'Material ou equipamento que chegou'} onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={ocupado || !f.item_id || !n} onClick={salvar}>Dar entrada</button></>}>
      <div className="form">
        {!compra && (
          <label className="full">Item<select value={f.item_id} onChange={set('item_id')}>
            <option value="">Escolha</option>
            <optgroup label="Equipamentos">{db.itens.filter((i) => i.grupo === 'EQUIPAMENTO').map((i) => <option key={i.id} value={i.id}>{i.descricao}</option>)}</optgroup>
            <optgroup label="Materiais">{db.itens.filter((i) => i.grupo === 'MATERIAL').map((i) => <option key={i.id} value={i.id}>{i.descricao}</option>)}</optgroup>
          </select></label>
        )}
        <label>Quantidade recebida<input type="number" min="1" max={serial ? 50 : undefined} value={f.qtd} onChange={set('qtd')} /></label>
        <label>Data de entrada<input type="date" value={f.data_entrada} onChange={set('data_entrada')} /></label>
        <label className="full">Fornecedor<input value={f.fornecedor} onChange={set('fornecedor')} /></label>
        <label>Nº da nota fiscal<input value={f.nota_fiscal} onChange={set('nota_fiscal')} /></label>
        <label>Data da nota fiscal<input type="date" value={f.data_nf} onChange={set('data_nf')} /></label>
        <label>Garantia (meses)<input type="number" min="0" value={f.garantia_meses} onChange={set('garantia_meses')} placeholder="ex.: 12" /></label>
        <label>Guardar em<select value={f.destino} onChange={set('destino')}>{db.locais.filter((l) => ['ESTOQUE', 'TECNICO'].includes(l.tipo)).map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
      </div>
      {f.garantia_meses && f.data_entrada && <div className="tiny" style={{ marginTop: 8 }}>Garantia até {fmtData(garantiaAte(f.data_entrada, f.garantia_meses))}</div>}
      {serial && n > 0 && <>
        <h4 className="muted" style={{ margin: '16px 0 6px' }}>Nº de série de cada unidade</h4>
        <div className="form">
          {Array.from({ length: n }, (_, i) => (
            <label key={i}>Unidade {i + 1}<input value={series[i] || ''} onChange={(e) => { const s = [...series]; s[i] = e.target.value; setSeries(s) }} /></label>
          ))}
        </div>
      </>}
    </Modal>
  )
}
