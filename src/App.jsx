import { useEffect, useState } from 'react'
import { LayoutGrid, Boxes, Gauge, ClipboardList, ShoppingCart, History, Settings, LogOut, ArrowLeftRight, Sun, Moon } from 'lucide-react'
import { DataProvider, supabase, useData, ir } from './data.jsx'
import { ToastProvider } from './ui.jsx'
import { useTema, BotaoTema } from './theme.jsx'
import Login from './pages/Login.jsx'
import Painel from './pages/Painel.jsx'
import Estoque from './pages/Estoque.jsx'
import Equipamentos from './pages/Equipamentos.jsx'
import Servicos from './pages/Servicos.jsx'
import Compras from './pages/Compras.jsx'
import Historico from './pages/Historico.jsx'
import Movimentar from './pages/Movimentar.jsx'
import Ajustes from './pages/Ajustes.jsx'

const PAGINAS = [
  { id: 'painel', nome: 'Painel', curto: 'Painel', icone: LayoutGrid, C: Painel },
  { id: 'servicos', nome: 'Serviços', curto: 'Serviços', icone: ClipboardList, C: Servicos },
  { id: 'estoque', nome: 'Materiais', curto: 'Materiais', icone: Boxes, C: Estoque },
  { id: 'equipamentos', nome: 'Equipamentos', curto: 'Equip.', icone: Gauge, C: Equipamentos },
  { id: 'compras', nome: 'Compras', curto: 'Compras', icone: ShoppingCart, C: Compras },
  { id: 'movimentar', nome: 'Movimentar', curto: 'Mover', icone: ArrowLeftRight, C: Movimentar, soDesktop: true },
  { id: 'historico', nome: 'Histórico', curto: 'Histórico', icone: History, C: Historico, soDesktop: true },
  { id: 'ajustes', nome: 'Ajustes', curto: 'Ajustes', icone: Settings, C: Ajustes, soDesktop: true },
]

function rotaAtual() {
  const [p, ...resto] = window.location.hash.replace(/^#\/?/, '').split('/')
  return { pagina: PAGINAS.find((x) => x.id === p) ? p : 'painel', param: resto.length ? decodeURIComponent(resto.join('/')) : null }
}

function Shell({ session, tema, alternar }) {
  const { db, erro, me, nomeUsuario } = useData()
  const [rota, setRota] = useState(rotaAtual())
  useEffect(() => {
    const f = () => setRota(rotaAtual())
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])

  if (erro) return <div className="login"><div className="card glass"><p>Erro ao carregar: {erro}</p></div></div>
  if (!db) return <div className="spin" />
  if (!me) {
    return (
      <div className="login">
        <div className="card glass">
          <img className="logo-img" src="/logo.png" alt="e-Simon" />
          <p>O e-mail <b>{session.user.email}</b> ainda não está na equipe. Peça ao administrador para incluir você em Ajustes.</p>
          <button className="btn" onClick={() => supabase.auth.signOut()}>Sair</button>
        </div>
      </div>
    )
  }

  const pag = PAGINAS.find((p) => p.id === rota.pagina)
  const P = pag.C
  return (
    <div className="shell">
      <aside className="side glass">
        <img className="logo logo-img" src="/logo.png" alt="e-Simon" />
        {PAGINAS.map((p) => (
          <button key={p.id} className={`navbtn ${p.id === rota.pagina ? 'on' : ''}`} onClick={() => ir(p.id)}>
            <p.icone size={19} strokeWidth={1.9} /> {p.nome}
          </button>
        ))}
        <div className="spacer" />
        <button className="navbtn" onClick={alternar}>{tema === 'light' ? <Moon size={19} /> : <Sun size={19} />} {tema === 'light' ? 'Tema escuro' : 'Tema claro'}</button>
        <div className="me">{nomeUsuario}</div>
        <button className="navbtn" onClick={() => supabase.auth.signOut()}><LogOut size={19} /> Sair</button>
      </aside>
      <BotaoTema tema={tema} alternar={alternar} className="theme-fab" />
      <main className="main">
        <P param={rota.param} />
      </main>
      <nav className="tabbar glass">
        {PAGINAS.filter((p) => !p.soDesktop).concat(PAGINAS.find((p) => p.id === 'ajustes')).map((p) => (
          <button key={p.id} className={p.id === rota.pagina ? 'on' : ''} onClick={() => ir(p.id)}>
            <p.icone size={20} strokeWidth={1.9} />
            {p.curto}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  const [session, setSession] = useState(undefined)
  const [tema, alternar] = useTema()
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  return (
    <ToastProvider>
      <div className="backdrop"><div className="blob b1" /><div className="blob b2" /><div className="blob b3" /></div>
      {session === undefined ? <div className="spin" /> : session ? (
        <DataProvider session={session} key={session.user.id}><Shell session={session} tema={tema} alternar={alternar} /></DataProvider>
      ) : <><BotaoTema tema={tema} alternar={alternar} className="theme-fab always" /><Login /></>}
    </ToastProvider>
  )
}
