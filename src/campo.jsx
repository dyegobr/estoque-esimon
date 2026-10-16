import { useEffect, useRef, useState } from 'react'
import { Camera, Plus, Trash2, X } from 'lucide-react'
import { supabase } from './data.jsx'

// Peças compartilhadas da rotina de campo: tipos de campo, preenchimento, leitura das respostas, fotos e assinatura

export const TIPOS_CAMPO = {
  texto: 'Texto curto', paragrafo: 'Texto longo', numero: 'Número', simnao: 'Sim / Não', lista: 'Escolha única',
  multipla: 'Múltipla escolha', data: 'Data', foto: 'Foto(s)', secao: 'Seção (grupo de campos)',
}
export const STATUS_VISITA = { AGENDADA: ['info', 'Agendada'], EM_ANDAMENTO: ['warn', 'Em andamento'], CONCLUIDA: ['ok', 'Concluída'], CANCELADA: ['', 'Cancelada'] }

export const fmtHora = (d) => new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
export const diaISO = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` }
export const mapa = (lat, lng) => (lat != null && lng != null ? `https://www.google.com/maps?q=${lat},${lng}` : null)

const vazio = (v) => v == null || v === '' || (Array.isArray(v) && v.length === 0)

// Lista dos campos obrigatórios que ficaram sem resposta
export function faltando(campos, dados, prefixo = '') {
  const r = []
  for (const c of campos) {
    const v = dados?.[c.id]
    if (c.tipo === 'secao') {
      const blocos = c.repetivel ? (v || []) : [v || {}]
      if (c.repetivel && c.obrigatorio && blocos.length === 0) r.push(prefixo + c.rotulo)
      blocos.forEach((b, i) => r.push(...faltando(c.campos || [], b, `${prefixo}${c.rotulo}${c.repetivel ? ' ' + (i + 1) : ''} › `)))
    } else if (c.obrigatorio && vazio(v)) r.push(prefixo + c.rotulo)
  }
  return r
}

// Reduz a foto antes de enviar: o técnico usa o próprio plano de dados
async function reduzir(file, max = 1600) {
  const img = await createImageBitmap(file).catch(() => null)
  if (!img) return file
  const k = Math.min(1, max / Math.max(img.width, img.height))
  const cv = document.createElement('canvas')
  cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k)
  cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height)
  return new Promise((res) => cv.toBlob((b) => res(b || file), 'image/jpeg', 0.8))
}

export async function enviarArquivo(visitaId, blob, ext = 'jpg') {
  const path = `visitas/${visitaId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
  const r = await supabase.storage.from('campo').upload(path, blob, { contentType: ext === 'png' ? 'image/png' : 'image/jpeg' })
  if (r.error) throw r.error
  return path
}

// URLs temporárias das fotos (o bucket é privado)
const cacheUrl = {}
export function useUrls(paths) {
  const chave = paths.filter(Boolean).join('|')
  const [urls, setUrls] = useState({})
  useEffect(() => {
    const falta = paths.filter((p) => p && !cacheUrl[p])
    const pronto = () => setUrls(Object.fromEntries(paths.filter(Boolean).map((p) => [p, cacheUrl[p]])))
    if (!falta.length) return pronto()
    supabase.storage.from('campo').createSignedUrls(falta, 3600).then(({ data }) => {
      for (const d of data || []) if (d.signedUrl) cacheUrl[d.path] = d.signedUrl
      pronto()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])
  return urls
}

function Fotos({ paths, onRemove }) {
  const urls = useUrls(paths)
  return (
    <div className="fotos">
      {paths.map((p) => (
        <div key={p} className="foto">
          {urls[p] ? <a href={urls[p]} target="_blank" rel="noreferrer"><img src={urls[p]} alt="" /></a> : <div className="spin" style={{ margin: 'auto' }} />}
          {onRemove && <button type="button" aria-label="Remover foto" onClick={() => onRemove(p)}><X size={14} /></button>}
        </div>
      ))}
    </div>
  )
}

function CampoFoto({ visitaId, valor, onChange, desabilitado }) {
  const ref = useRef()
  const [enviando, setEnviando] = useState(0)
  const [erro, setErro] = useState('')
  const lista = valor || []
  async function escolher(e) {
    const files = [...e.target.files]; e.target.value = ''
    setErro(''); setEnviando(files.length)
    const novos = []
    for (const f of files) {
      try { novos.push(await enviarArquivo(visitaId, await reduzir(f))) } catch (err) { setErro('Falha ao enviar foto: ' + err.message) }
      setEnviando((n) => n - 1)
    }
    if (novos.length) onChange([...lista, ...novos])
  }
  return (
    <div>
      <Fotos paths={lista} onRemove={desabilitado ? null : (p) => onChange(lista.filter((x) => x !== p))} />
      {!desabilitado && (
        <button type="button" className="btn small" disabled={enviando > 0} onClick={() => ref.current.click()}>
          <Camera size={15} /> {enviando ? `Enviando ${enviando}…` : lista.length ? 'Mais fotos' : 'Tirar / escolher foto'}
        </button>
      )}
      <input ref={ref} type="file" accept="image/*" multiple hidden onChange={escolher} />
      {erro && <div className="tiny" style={{ color: 'var(--bad)' }}>{erro}</div>}
    </div>
  )
}

function Campo({ c, valor, set, visitaId, desabilitado }) {
  const rot = <span className="campo-rot">{c.rotulo}{c.obrigatorio && <b style={{ color: 'var(--bad)' }}> *</b>}</span>
  const ajuda = c.ajuda && <span className="tiny">{c.ajuda}</span>
  const dis = desabilitado
  switch (c.tipo) {
    case 'paragrafo':
      return <label>{rot}{ajuda}<textarea rows={3} disabled={dis} value={valor || ''} onChange={(e) => set(e.target.value)} /></label>
    case 'numero':
      return <label>{rot}{ajuda}<input inputMode="decimal" disabled={dis} value={valor ?? ''} onChange={(e) => set(e.target.value.replace(',', '.'))} /></label>
    case 'data':
      return <label>{rot}{ajuda}<input type="date" disabled={dis} value={valor || ''} onChange={(e) => set(e.target.value)} /></label>
    case 'simnao':
    case 'lista': {
      const ops = c.tipo === 'simnao' ? ['Sim', 'Não'] : c.opcoes || []
      return (
        <div className="campo">{rot}{ajuda}
          <div className="seg escolhas">{ops.map((o) => <button type="button" key={o} disabled={dis} className={valor === o ? 'on' : ''} onClick={() => set(valor === o ? '' : o)}>{o}</button>)}</div>
        </div>
      )
    }
    case 'multipla': {
      const sel = valor || []
      return (
        <div className="campo">{rot}{ajuda}
          <div className="seg escolhas">{(c.opcoes || []).map((o) => <button type="button" key={o} disabled={dis} className={sel.includes(o) ? 'on' : ''} onClick={() => set(sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o])}>{o}</button>)}</div>
        </div>
      )
    }
    case 'foto':
      return <div className="campo">{rot}{ajuda}<CampoFoto visitaId={visitaId} valor={valor} onChange={set} desabilitado={dis} /></div>
    case 'secao': {
      if (!c.repetivel) return <div className="secao"><div className="secao-tit">{c.rotulo}</div>{ajuda}<Campos campos={c.campos || []} dados={valor || {}} onChange={set} visitaId={visitaId} desabilitado={dis} /></div>
      const blocos = valor || []
      return (
        <div className="campo">{rot}{ajuda}
          {blocos.map((b, i) => (
            <div key={i} className="secao">
              <div className="secao-tit">{c.rotulo} {i + 1}
                {!dis && <button type="button" className="btn ghost small" onClick={() => confirm(`Remover ${c.rotulo} ${i + 1}?`) && set(blocos.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}
              </div>
              <Campos campos={c.campos || []} dados={b} onChange={(nb) => set(blocos.map((x, j) => (j === i ? nb : x)))} visitaId={visitaId} desabilitado={dis} />
            </div>
          ))}
          {!dis && <button type="button" className="btn small" onClick={() => set([...blocos, {}])}><Plus size={15} /> Adicionar {c.rotulo.toLowerCase()}</button>}
        </div>
      )
    }
    default:
      return <label>{rot}{ajuda}<input disabled={dis} value={valor || ''} onChange={(e) => set(e.target.value)} /></label>
  }
}

export function Campos({ campos, dados, onChange, visitaId, desabilitado }) {
  return (
    <div className="campos">
      {campos.map((c) => <Campo key={c.id} c={c} valor={dados?.[c.id]} visitaId={visitaId} desabilitado={desabilitado} set={(v) => onChange({ ...dados, [c.id]: v })} />)}
    </div>
  )
}

// Leitura das respostas (gestor, dentro do serviço)
function fotosDe(campos, dados) {
  const r = []
  for (const c of campos) {
    const v = dados?.[c.id]
    if (c.tipo === 'foto') r.push(...(v || []))
    if (c.tipo === 'secao') for (const b of c.repetivel ? v || [] : [v || {}]) r.push(...fotosDe(c.campos || [], b))
  }
  return r
}

function Linhas({ campos, dados, urls }) {
  return campos.map((c) => {
    const v = dados?.[c.id]
    if (c.tipo === 'secao') {
      const blocos = c.repetivel ? v || [] : [v || {}]
      return blocos.map((b, i) => (
        <div key={c.id + i} className="secao">
          <div className="secao-tit">{c.rotulo}{c.repetivel ? ` ${i + 1}` : ''}</div>
          <Linhas campos={c.campos || []} dados={b} urls={urls} />
        </div>
      ))
    }
    if (c.tipo === 'foto') {
      if (!v?.length) return null
      return <div key={c.id} className="resp"><div className="s">{c.rotulo}</div><div className="fotos">{v.map((p) => <div key={p} className="foto">{urls[p] && <a href={urls[p]} target="_blank" rel="noreferrer"><img src={urls[p]} alt="" /></a>}</div>)}</div></div>
    }
    if (vazio(v)) return null
    return <div key={c.id} className="resp"><div className="s">{c.rotulo}</div><div className="t">{Array.isArray(v) ? v.join(', ') : String(v)}</div></div>
  })
}

export function Respostas({ modelo, dados }) {
  const urls = useUrls(fotosDe(modelo.campos, dados))
  return <div className="respostas"><Linhas campos={modelo.campos} dados={dados} urls={urls} /></div>
}

export function Assinatura({ onChange }) {
  const cv = useRef()
  const desenhando = useRef(false)
  const [tem, setTem] = useState(false)
  useEffect(() => {
    const c = cv.current
    const r = c.getBoundingClientRect()
    c.width = r.width * devicePixelRatio; c.height = r.height * devicePixelRatio
    const ctx = c.getContext('2d')
    ctx.scale(devicePixelRatio, devicePixelRatio)
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111'
  }, [])
  const pos = (e) => { const r = cv.current.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top] }
  const down = (e) => { e.preventDefault(); cv.current.setPointerCapture(e.pointerId); desenhando.current = true; const ctx = cv.current.getContext('2d'); ctx.beginPath(); ctx.moveTo(...pos(e)) }
  const move = (e) => { if (!desenhando.current) return; const ctx = cv.current.getContext('2d'); ctx.lineTo(...pos(e)); ctx.stroke() }
  const up = () => { if (!desenhando.current) return; desenhando.current = false; setTem(true); cv.current.toBlob((b) => onChange(b), 'image/png') }
  const limpar = () => { const c = cv.current; c.getContext('2d').clearRect(0, 0, c.width, c.height); setTem(false); onChange(null) }
  return (
    <div>
      <canvas ref={cv} className="assinatura" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      <div className="tiny" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span>Assine com o dedo dentro do quadro</span>
        {tem && <button type="button" className="btn ghost small" onClick={limpar}>Limpar</button>}
      </div>
    </div>
  )
}

export function posicao() {
  return new Promise((res) => {
    if (!navigator.geolocation) return res(null)
    navigator.geolocation.getCurrentPosition((p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 })
  })
}

export function AssinaturaSalva({ v }) {
  const urls = useUrls([v.assinatura_url])
  if (!v.assinatura_url) return null
  return (
    <div>
      <div className="tiny">Assinado por <b>{v.assinatura_nome}</b>{v.checkout_em ? ` em ${new Date(v.checkout_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` : ''}</div>
      {urls[v.assinatura_url] && <img className="assinatura-img" src={urls[v.assinatura_url]} alt="Assinatura" />}
    </div>
  )
}
