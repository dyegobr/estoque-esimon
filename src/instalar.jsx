import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'

// Convite para instalar o app na tela inicial.
// Android/Chrome: o navegador libera um botão de instalar de verdade (beforeinstallprompt).
// iPhone/Safari: a Apple não deixa o site instalar sozinho, então mostramos o passo a passo.
let pedido = null
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); pedido = e; window.dispatchEvent(new Event('pode-instalar')) })
}

const instalado = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
const lerFechado = () => { try { return Number(localStorage.getItem('instalar-fechado')) || 0 } catch { return 0 } }

export default function ConviteInstalar() {
  const [android, setAndroid] = useState(!!pedido)
  const [fechado, setFechado] = useState(() => Date.now() - lerFechado() < 3 * 86400000)
  useEffect(() => {
    const f = () => setAndroid(true)
    const ok = () => setFechado(true)
    window.addEventListener('pode-instalar', f)
    window.addEventListener('appinstalled', ok)
    return () => { window.removeEventListener('pode-instalar', f); window.removeEventListener('appinstalled', ok) }
  }, [])
  if (instalado() || fechado || (!android && !ios())) return null

  function fechar() { try { localStorage.setItem('instalar-fechado', String(Date.now())) } catch { /* sem espaço */ } setFechado(true) }
  async function instalar() {
    if (!pedido) return
    pedido.prompt()
    const r = await pedido.userChoice
    pedido = null
    if (r.outcome === 'accepted') setFechado(true); else setAndroid(false)
  }

  return (
    <div className="card glass instalar">
      <img src="/icon-192.png" alt="" />
      <div className="grow">
        <b>Instale o app e-Simon</b>
        {android
          ? <div className="tiny">Abre direto da tela inicial, em tela cheia, e carrega mesmo com internet fraca.</div>
          : <div className="tiny">No Safari, toque em <Share size={13} style={{ verticalAlign: '-2px' }} /> <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</div>}
        {android && <button className="btn primary small" style={{ marginTop: 8 }} onClick={instalar}><Download size={15} /> Instalar</button>}
      </div>
      <button className="btn ghost small" aria-label="Agora não" onClick={fechar}><X size={16} /></button>
    </div>
  )
}
