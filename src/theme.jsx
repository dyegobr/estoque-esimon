import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const lerSalvo = () => { try { return localStorage.getItem('tema') } catch { return null } }
const doSistema = () => (window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark')

export function aplicarTema(t) {
  document.documentElement.dataset.theme = t
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#edf3f9' : '#06121f')
}

// Sem escolha salva, segue o tema do aparelho
export function useTema() {
  const [tema, setTema] = useState(() => lerSalvo() || doSistema())
  useEffect(() => { aplicarTema(tema) }, [tema])
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)')
    const f = () => { if (!lerSalvo()) setTema(doSistema()) }
    mq?.addEventListener('change', f)
    return () => mq?.removeEventListener('change', f)
  }, [])
  const alternar = () => setTema((t) => {
    const novo = t === 'light' ? 'dark' : 'light'
    try { localStorage.setItem('tema', novo) } catch { /* sem armazenamento: vale só nesta sessão */ }
    return novo
  })
  return [tema, alternar]
}

export function BotaoTema({ tema, alternar, className = '' }) {
  const claro = tema === 'light'
  return (
    <button className={`btn theme-btn ${className}`} onClick={alternar} aria-label={claro ? 'Usar tema escuro' : 'Usar tema claro'} title={claro ? 'Tema escuro' : 'Tema claro'}>
      {claro ? <Moon size={18} /> : <Sun size={18} />}
    </button>
  )
}
