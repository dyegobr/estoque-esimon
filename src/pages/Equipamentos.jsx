import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useData, ir, supabase, desde, fmtData, fmtDataHora } from '../data.jsx'
import { Modal, Status, TIPOS_MOV, useToast } from '../ui.jsx'

export default function Equipamentos({ param }) {
  const { db, item, local, servico } = useData()
  const [filtro, setFiltro] = useState('TODOS')
  const [novo, setNovo] = useState(false)
  const lista = db.ativos.filter((a) => a.status !== 'BAIXADO' && (filtro === 'TODOS' || a.status === filtro))

  return (
    <>
      <div className="topbar">
        <div><img className="mobile-logo" src="/logo.png" alt="e-Simon" /><h1>Equipamentos</h1><div className="sub">Onde está cada analisador e ferramenta, com quem e desde quando</div></div>
        <button className="btn primary" onClick={() => setNovo(true)}><Plus size={17} /> Equipamento</button>
      </div>
      <div className="card glass">
        <div className="toolbar" style={{ marginBottom: 6 }}>
          <div className="seg">
            {[['TODOS', 'Todos'], ['DISPONIVEL', 'No armário'], ['EM_CAMPO', 'Em campo'], ['MANUTENCAO', 'Manutenção'], ['VERIFICAR', 'Sem local']].map(([v, t]) => (
              <button key={v} className={filtro === v ? 'on' : ''} onClick={() => setFiltro(v)}>{t}</button>
            ))}
          </div>
        </div>
        <div className="list">
          {lista.length === 0 && <div className="empty">Nenhum equipamento aqui.</div>}
          {lista.map((a) => (
            <div key={a.id} className="row click" onClick={() => ir('equipamentos', a.id)}>
              <div className="grow">
                <div className="t">{item[a.item_id]?.descricao}{a.numero_serie ? ` · ${a.numero_serie}` : ''}</div>
                <div className="s">
                  {a.status === 'VERIFICAR' ? 'Local não informado, toque para registrar' :
                    [local[a.local_id]?.nome, servico[a.servico_id]?.cliente, a.responsavel, desde(a.desde)].filter(Boolean).join(' · ')}
                  {a.calibracao_validade && ` · calibração até ${fmtData(a.calibracao_validade)}`}
                </div>
              </div>
              <Status v={a.status} />
            </div>
          ))}
        </div>
      </div>
      {param && <DetalheAtivo id={param} onClose={() => ir('equipamentos')} />}
      {novo && <NovoAtivo onClose={() => setNovo(false)} />}
    </>
  )
}

function DetalheAtivo({ id, onClose }) {
  const { db, item, local, servico } = useData()
  const [acao, setAcao] = useState(null)
  const a = db.ativos.find((x) => x.id === id)
  if (!a) return null
  const movs = db.movs.filter((m) => m.ativo_id === id)
  if (acao) return <MoverAtivo ativo={a} acao={acao} onClose={() => setAcao(null)} />
  return (
    <Modal titulo={`${item[a.item_id]?.descricao}`} sub={`${a.id}${a.numero_serie ? ' · série ' + a.numero_serie : ''}`} onClose={onClose}
      acoes={<button className="btn" onClick={onClose}>Fechar</button>}>
      <div className="row" style={{ paddingTop: 0 }}>
        <div className="grow">
          <div className="t">{a.status === 'VERIFICAR' ? 'Local não informado' : local[a.local_id]?.nome}</div>
          <div className="s">{[servico[a.servico_id]?.cliente, a.responsavel, desde(a.desde)].filter(Boolean).join(' · ')}</div>
        </div>
        <Status v={a.status} />
      </div>
      <div className="btns" style={{ margin: '12px 0 4px' }}>
        {a.status !== 'EM_CAMPO' && <button className="btn primary" onClick={() => setAcao('SAIDA_CAMPO')}>Levar a campo</button>}
        {a.status !== 'DISPONIVEL' && <button className="btn" onClick={() => setAcao(a.status === 'VERIFICAR' ? 'AJUSTE_INVENTARIO' : a.status === 'MANUTENCAO' ? 'RETORNO_MANUTENCAO' : 'DEVOLUCAO')}>Devolver ao armário</button>}
        {a.status !== 'MANUTENCAO' && <button className="btn" onClick={() => setAcao('ENVIO_MANUTENCAO')}>Manutenção</button>}
        <button className="btn" onClick={() => setAcao('TRANSFERENCIA')}>Outro local</button>
      </div>
      <h4 className="muted" style={{ margin: '14px 0 6px' }}>Histórico de usos</h4>
      <div className="list">
        {movs.length === 0 && <div className="empty">Sem movimentações registradas.</div>}
        {movs.map((m) => (
          <div key={m.id} className="row">
            <div className="grow">
              <div className="t">{TIPOS_MOV[m.tipo]}{m.servico_id ? ' · ' + (servico[m.servico_id]?.cliente || '') : ''}</div>
              <div className="s">{fmtDataHora(m.data_hora)} · {local[m.destino]?.nome} · {m.responsavel}{m.obs ? ' · ' + m.obs : ''}</div>
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

function MoverAtivo({ ativo, acao, onClose }) {
  const { db, load, nomeUsuario } = useData()
  const toast = useToast()
  const destinoPadrao = { SAIDA_CAMPO: 'EM_CAMPO', DEVOLUCAO: 'ARMARIO', RETORNO_MANUTENCAO: 'ARMARIO', AJUSTE_INVENTARIO: 'ARMARIO', ENVIO_MANUTENCAO: db.locais.find((l) => l.tipo === 'MANUTENCAO')?.id, TRANSFERENCIA: '' }[acao]
  const [destino, setDestino] = useState(destinoPadrao || '')
  const [srv, setSrv] = useState('')
  const [resp, setResp] = useState(nomeUsuario)
  const [obs, setObs] = useState('')
  const abertos = db.servicos.filter((s) => ['FECHADO', 'AGENDADO', 'EM_CAMPO'].includes(s.status))

  async function salvar() {
    const r = await supabase.from('movimentacoes').insert({
      tipo: acao, item_id: ativo.item_id, ativo_id: ativo.id, qtd: 1,
      origem: ativo.local_id, destino, servico_id: srv || null, responsavel: resp, obs,
    })
    if (r.error) return toast(r.error.message, true)
    toast('Registrado'); await load(); onClose()
  }
  return (
    <Modal titulo={{ SAIDA_CAMPO: 'Levar a campo', DEVOLUCAO: 'Devolver ao armário', RETORNO_MANUTENCAO: 'Voltou da manutenção', AJUSTE_INVENTARIO: 'Informar local', ENVIO_MANUTENCAO: 'Enviar para manutenção', TRANSFERENCIA: 'Mudar de local' }[acao]}
      sub={ativo.id} onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!destino} onClick={salvar}>Confirmar</button></>}>
      <div className="form">
        <label>Para onde<select value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="">Escolha</option>
          {db.locais.filter((l) => l.tipo !== 'BAIXA').map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select></label>
        <label>Serviço{' '}<select value={srv} onChange={(e) => setSrv(e.target.value)}>
          <option value="">Nenhum</option>
          {abertos.map((s) => <option key={s.id} value={s.id}>{s.cliente}</option>)}
        </select></label>
        <label>Com quem<input value={resp} onChange={(e) => setResp(e.target.value)} list="equipe" /></label>
        <datalist id="equipe">{db.equipe.map((e) => <option key={e.email} value={e.nome} />)}</datalist>
        <label>Observação<input value={obs} onChange={(e) => setObs(e.target.value)} /></label>
      </div>
    </Modal>
  )
}

function NovoAtivo({ onClose }) {
  const { db, load, nomeUsuario } = useData()
  const toast = useToast()
  const tipos = db.itens.filter((i) => i.controle === 'SERIAL')
  const [f, setF] = useState({ item_id: tipos[0]?.id || '', id: '', numero_serie: '', local: 'ARMARIO', calibracao_validade: '' })
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  async function salvar() {
    const id = f.id.trim().toUpperCase()
    const r = await supabase.from('ativos').insert({ id, item_id: f.item_id, numero_serie: f.numero_serie, calibracao_validade: f.calibracao_validade || null, status: 'VERIFICAR' })
    if (r.error) return toast(r.error.message, true)
    await supabase.from('movimentacoes').insert({ tipo: 'AJUSTE_INVENTARIO', item_id: f.item_id, ativo_id: id, qtd: 1, destino: f.local, responsavel: nomeUsuario, obs: 'Cadastro' })
    toast('Equipamento cadastrado'); await load(); onClose()
  }
  return (
    <Modal titulo="Novo equipamento" onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!f.id || !f.item_id} onClick={salvar}>Salvar</button></>}>
      <div className="form">
        <label className="full">Tipo<select value={f.item_id} onChange={set('item_id')}>{tipos.map((i) => <option key={i.id} value={i.id}>{i.descricao}</option>)}</select></label>
        <label>Identificação<input value={f.id} onChange={set('id')} placeholder="ex.: ISSO-801" /></label>
        <label>Nº de série<input value={f.numero_serie} onChange={set('numero_serie')} /></label>
        <label>Local<select value={f.local} onChange={set('local')}>{db.locais.map((l) => <option key={l.id} value={l.id}>{l.nome}</option>)}</select></label>
        <label>Calibração válida até<input type="date" value={f.calibracao_validade} onChange={set('calibracao_validade')} /></label>
      </div>
      <div className="tiny" style={{ marginTop: 10 }}>Tipo novo de equipamento? Cadastre antes em Materiais &gt; Item, grupo Equipamento.</div>
    </Modal>
  )
}
