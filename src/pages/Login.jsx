import { useState } from 'react'
import { supabase } from '../data.jsx'

export default function Login() {
  const [modo, setModo] = useState('entrar')
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [msg, setMsg] = useState(null)
  const [ocupado, setOcupado] = useState(false)

  async function enviar(e) {
    e.preventDefault()
    setOcupado(true); setMsg(null)
    const redir = window.location.origin
    let r
    if (modo === 'entrar') r = await supabase.auth.signInWithPassword({ email, password: senha })
    else if (modo === 'criar') r = await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: redir } })
    else r = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redir })
    setOcupado(false)
    if (r.error) return setMsg(traduz(r.error.message))
    if (modo === 'criar' && !r.data.session) setMsg('Enviamos um e-mail de confirmação. Abra o link e depois entre.')
    if (modo === 'senha') setMsg('Enviamos um link para redefinir a senha.')
  }

  return (
    <div className="login">
      <form className="card glass" onSubmit={enviar}>
        <img src="/logo.png" alt="e-Simon" />
        <p>Controle de estoque e equipamentos</p>
        <label>E-mail<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        {modo !== 'senha' && (
          <label>Senha<input type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} /></label>
        )}
        <button className="btn primary" disabled={ocupado}>
          {modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar acesso' : 'Enviar link'}
        </button>
        {msg && <p>{msg}</p>}
        <div className="btns" style={{ justifyContent: 'center' }}>
          {modo !== 'entrar' && <button type="button" className="btn ghost small" onClick={() => setModo('entrar')}>Já tenho acesso</button>}
          {modo !== 'criar' && <button type="button" className="btn ghost small" onClick={() => setModo('criar')}>Primeiro acesso</button>}
          {modo !== 'senha' && <button type="button" className="btn ghost small" onClick={() => setModo('senha')}>Esqueci a senha</button>}
        </div>
      </form>
    </div>
  )
}

function traduz(m) {
  if (/Invalid login/i.test(m)) return 'E-mail ou senha incorretos.'
  if (/Email not confirmed/i.test(m)) return 'Confirme o e-mail pelo link que enviamos antes de entrar.'
  if (/already registered/i.test(m)) return 'Esse e-mail já tem acesso. Use "Já tenho acesso".'
  return m
}
