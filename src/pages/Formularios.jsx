import { useState } from 'react'
import { Plus, Trash2, ArrowUp, ArrowDown, Eye, Pencil, Copy } from 'lucide-react'
import { useData, supabase } from '../data.jsx'
import { Modal, useToast } from '../ui.jsx'
import { Campos, TIPOS_CAMPO } from '../campo.jsx'

const slug = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'campo'
function idUnico(rotulo, usados) {
  const base = slug(rotulo)
  let id = base, n = 2
  while (usados.has(id)) id = `${base}_${n++}`
  return id
}
const todosIds = (campos, s = new Set()) => { for (const c of campos) { s.add(c.id); if (c.campos) todosIds(c.campos, s) } return s }

export default function Formularios() {
  const { db } = useData()
  const [modal, setModal] = useState(null)
  const usoModelo = (id) => db.tiposVisita.filter((t) => t.modelos.includes(id)).map((t) => t.nome)
  return (
    <>
      <div className="topbar">
        <div><h1>Formulários</h1><div className="sub">Modelos que o técnico preenche em campo e os tipos de visita</div></div>
        <button className="btn primary" onClick={() => setModal({ modelo: { nome: '', descricao: '', campos: [], ativo: true } })}><Plus size={17} /> Formulário</button>
      </div>
      <div className="grid two">
        <div className="card glass">
          <h2>Modelos de formulário</h2>
          <div className="list">
            {db.modelos.length === 0 && <div className="empty">Nenhum formulário.</div>}
            {db.modelos.map((m) => (
              <div key={m.id} className="row click" onClick={() => setModal({ modelo: m })}>
                <div className="grow">
                  <div className="t">{m.nome}</div>
                  <div className="s">{contar(m.campos)} campos{usoModelo(m.id).length ? ` · usado em ${usoModelo(m.id).join(', ')}` : ''}</div>
                </div>
                {!m.ativo && <span className="pill">inativo</span>}
                <Pencil size={16} />
              </div>
            ))}
          </div>
        </div>
        <div className="card glass">
          <h2>Tipos de visita <button className="btn small" onClick={() => setModal({ tipo: { nome: '', modelos: [], duracao_min: 60, ativo: true } })}><Plus size={15} /> Tipo</button></h2>
          <div className="tiny" style={{ marginBottom: 8 }}>Ao agendar, o tipo já traz os formulários e a duração. Dá para ajustar em cada visita.</div>
          <div className="list">
            {db.tiposVisita.map((t) => (
              <div key={t.id} className="row click" onClick={() => setModal({ tipo: t })}>
                <div className="grow">
                  <div className="t">{t.nome}</div>
                  <div className="s">{t.duracao_min} min · {t.modelos.length ? t.modelos.map((id) => db.modelos.find((m) => m.id === id)?.nome).filter(Boolean).join(', ') : 'sem formulário'}</div>
                </div>
                {!t.ativo && <span className="pill">inativo</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
      {modal?.modelo && <EditarModelo inicial={modal.modelo} onClose={() => setModal(null)} />}
      {modal?.tipo && <EditarTipo inicial={modal.tipo} onClose={() => setModal(null)} />}
    </>
  )
}

const contar = (campos) => campos.reduce((n, c) => n + (c.tipo === 'secao' ? contar(c.campos || []) : 1), 0)

function EditarTipo({ inicial, onClose }) {
  const { db, load } = useData()
  const toast = useToast()
  const [t, setT] = useState(inicial)
  async function salvar() {
    const reg = { nome: t.nome.trim(), modelos: t.modelos, duracao_min: Number(t.duracao_min) || 60, ativo: t.ativo }
    const r = t.id ? await supabase.from('tipos_visita').update(reg).eq('id', t.id) : await supabase.from('tipos_visita').insert(reg)
    if (r.error) return toast(r.error.message, true)
    toast('Tipo salvo'); await load(); onClose()
  }
  return (
    <Modal titulo={t.id ? 'Tipo de visita' : 'Novo tipo de visita'} onClose={onClose}
      acoes={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" disabled={!t.nome.trim()} onClick={salvar}>Salvar</button></>}>
      <div className="form">
        <label>Nome<input value={t.nome} onChange={(e) => setT({ ...t, nome: e.target.value })} placeholder="Ex.: Instalação de monitoramento" /></label>
        <label>Duração padrão (min)<input type="number" min="15" step="15" value={t.duracao_min} onChange={(e) => setT({ ...t, duracao_min: e.target.value })} /></label>
        <div className="full campo"><span>Formulários</span>
          <div className="seg escolhas">{db.modelos.filter((m) => m.ativo).map((m) => <button type="button" key={m.id} className={t.modelos.includes(m.id) ? 'on' : ''} onClick={() => setT({ ...t, modelos: t.modelos.includes(m.id) ? t.modelos.filter((x) => x !== m.id) : [...t.modelos, m.id] })}>{m.nome}</button>)}</div>
        </div>
        {t.id && <label className="full chk"><input type="checkbox" checked={t.ativo} onChange={(e) => setT({ ...t, ativo: e.target.checked })} /> Ativo (aparece ao agendar)</label>}
      </div>
    </Modal>
  )
}

function EditarModelo({ inicial, onClose }) {
  const { load } = useData()
  const toast = useToast()
  const [m, setM] = useState(() => structuredClone(inicial))
  const [ver, setVer] = useState(false)
  const [teste, setTeste] = useState({})
  async function salvar() {
    const reg = { nome: m.nome.trim(), descricao: m.descricao || null, campos: finalizar(m.campos, todosIds(m.campos)), ativo: m.ativo, atualizado_em: new Date().toISOString() }
    const r = m.id ? await supabase.from('modelos_formulario').update(reg).eq('id', m.id) : await supabase.from('modelos_formulario').insert(reg)
    if (r.error) return toast(r.error.message, true)
    toast('Formulário salvo'); await load(); onClose()
  }
  function duplicar() { setM({ ...structuredClone(m), id: undefined, nome: `${m.nome} (cópia)` }); toast('Cópia criada. Salve para gravar.') }
  const semRotulo = [...todosIds(m.campos)].length !== contarTodos(m.campos) || temVazio(m.campos)
  return (
    <Modal titulo={m.id ? 'Editar formulário' : 'Novo formulário'} sub="As respostas antigas continuam valendo quando você muda o modelo" onClose={onClose}
      acoes={<>
        {m.id && <button className="btn ghost" style={{ marginRight: 'auto' }} onClick={duplicar}><Copy size={15} /> Duplicar</button>}
        <button className="btn" onClick={() => setVer(!ver)}><Eye size={15} /> {ver ? 'Editar' : 'Pré-visualizar'}</button>
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" disabled={!m.nome.trim() || semRotulo} onClick={salvar}>Salvar</button>
      </>}>
      {ver ? <Campos campos={m.campos} dados={teste} onChange={setTeste} visitaId="teste" /> : (
        <>
          <div className="form" style={{ marginBottom: 14 }}>
            <label>Nome<input value={m.nome} onChange={(e) => setM({ ...m, nome: e.target.value })} placeholder="Ex.: Monitoramento - Instalação" /></label>
            <label>Descrição<input value={m.descricao || ''} onChange={(e) => setM({ ...m, descricao: e.target.value })} /></label>
            {m.id && <label className="full chk"><input type="checkbox" checked={m.ativo} onChange={(e) => setM({ ...m, ativo: e.target.checked })} /> Ativo</label>}
          </div>
          <ListaCampos campos={m.campos} usados={todosIds(m.campos)} onChange={(campos) => setM({ ...m, campos })} />
        </>
      )}
    </Modal>
  )
}
// Campo novo ganha id a partir da pergunta ao salvar; depois disso o id fica fixo para não perder respostas antigas
function finalizar(campos, usados) {
  return campos.map(({ novo, ...c }) => {
    if (novo) { usados.delete(c.id); c.id = idUnico(c.rotulo, usados); usados.add(c.id) }
    return c.campos ? { ...c, campos: finalizar(c.campos, usados) } : c
  })
}
const contarTodos = (campos) => campos.reduce((n, c) => n + 1 + (c.campos ? contarTodos(c.campos) : 0), 0)
const temVazio = (campos) => campos.some((c) => !c.rotulo?.trim() || (c.campos && temVazio(c.campos)))

function ListaCampos({ campos, onChange, usados, dentro }) {
  const mover = (i, d) => { const c = [...campos]; [c[i], c[i + d]] = [c[i + d], c[i]]; onChange(c) }
  const novo = () => onChange([...campos, { id: idUnico('campo', usados), tipo: 'texto', rotulo: '', novo: true }])
  return (
    <div className="campos-editor">
      {campos.map((c, i) => (
        <div key={c.id} className="campo-ed">
          <div className="form">
            <label className="full">Pergunta
              <input value={c.rotulo} placeholder="Ex.: Foto do quadro" onChange={(e) => {
                const rotulo = e.target.value
                onChange(campos.map((x, j) => (j === i ? { ...x, rotulo } : x)))
              }} />
            </label>
            <label>Tipo
              <select value={c.tipo} onChange={(e) => onChange(campos.map((x, j) => (j === i ? { ...x, tipo: e.target.value, ...(e.target.value === 'secao' && !x.campos ? { campos: [], repetivel: false } : {}) } : x)))}>
                {Object.entries(TIPOS_CAMPO).filter(([k]) => !(dentro && k === 'secao')).map(([k, t]) => <option key={k} value={k}>{t}</option>)}
              </select>
            </label>
            <label>Dica para o técnico<input value={c.ajuda || ''} onChange={(e) => onChange(campos.map((x, j) => (j === i ? { ...x, ajuda: e.target.value } : x)))} /></label>
            {['lista', 'multipla'].includes(c.tipo) && (
              <label className="full">Opções (separe por vírgula)
                <input defaultValue={(c.opcoes || []).join(', ')} onBlur={(e) => onChange(campos.map((x, j) => (j === i ? { ...x, opcoes: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) } : x)))} placeholder="Geral, Comum, Prumada" />
              </label>
            )}
          </div>
          <div className="toolbar" style={{ marginTop: 8 }}>
            <div className="btns">
              <label className="chk"><input type="checkbox" checked={!!c.obrigatorio} onChange={(e) => onChange(campos.map((x, j) => (j === i ? { ...x, obrigatorio: e.target.checked } : x)))} /> Obrigatório</label>
              {c.tipo === 'secao' && <label className="chk"><input type="checkbox" checked={!!c.repetivel} onChange={(e) => onChange(campos.map((x, j) => (j === i ? { ...x, repetivel: e.target.checked } : x)))} /> Repetir (um bloco por quadro, por ponto…)</label>}
            </div>
            <div className="btns">
              <button className="btn ghost small" disabled={i === 0} aria-label="Subir" onClick={() => mover(i, -1)}><ArrowUp size={15} /></button>
              <button className="btn ghost small" disabled={i === campos.length - 1} aria-label="Descer" onClick={() => mover(i, 1)}><ArrowDown size={15} /></button>
              <button className="btn ghost small" aria-label="Remover" onClick={() => confirm(`Remover "${c.rotulo || 'campo'}"?`) && onChange(campos.filter((_, j) => j !== i))}><Trash2 size={15} /></button>
            </div>
          </div>
          {c.tipo === 'secao' && (
            <div className="secao" style={{ marginTop: 10 }}>
              <div className="secao-tit">Campos de “{c.rotulo || 'seção'}”</div>
              <ListaCampos dentro campos={c.campos || []} usados={usados} onChange={(sub) => onChange(campos.map((x, j) => (j === i ? { ...x, campos: sub } : x)))} />
            </div>
          )}
        </div>
      ))}
      <button className="btn small" onClick={novo}><Plus size={15} /> {dentro ? 'Campo na seção' : 'Adicionar pergunta'}</button>
    </div>
  )
}
