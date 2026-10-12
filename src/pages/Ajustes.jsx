import { useState } from 'react'
import { Download, LogOut, ArrowLeftRight, History } from 'lucide-react'
import { useData, supabase, ir } from '../data.jsx'
import { useToast } from '../ui.jsx'

export default function Ajustes() {
  const { db, me, load } = useData()
  const toast = useToast()
  const admin = me?.papel === 'ADMIN'
  const [pessoa, setPessoa] = useState({ email: '', nome: '', papel: 'TECNICO' })
  const [loc, setLoc] = useState({ id: '', nome: '', tipo: 'TECNICO' })
  const [baixando, setBaixando] = useState(false)

  async function addPessoa() {
    const r = await supabase.from('equipe').insert({ ...pessoa, email: pessoa.email.trim().toLowerCase() })
    if (r.error) return toast(r.error.message, true)
    setPessoa({ email: '', nome: '', papel: 'TECNICO' }); toast('Pessoa incluída. Ela já pode criar o acesso.'); await load()
  }
  async function alternar(p) {
    const r = await supabase.from('equipe').update({ ativo: !p.ativo }).eq('email', p.email)
    if (r.error) return toast(r.error.message, true)
    await load()
  }
  async function addLocal() {
    const r = await supabase.from('locais').insert({ ...loc, id: loc.id.trim().toUpperCase().replace(/\s+/g, '-') })
    if (r.error) return toast(r.error.message, true)
    setLoc({ id: '', nome: '', tipo: 'TECNICO' }); toast('Local criado'); await load()
  }

  // Backup: baixa uma planilha com todas as tabelas (mesmo formato da planilha-banco), para guardar no OneDrive
  async function backup() {
    setBaixando(true)
    const XLSX = await import('xlsx')
    const tabelas = ['itens', 'ativos', 'locais', 'servicos', 'necessidades', 'movimentacoes', 'compras', 'equipe']
    const wb = XLSX.utils.book_new()
    const saldo = await supabase.from('v_saldo_item').select('*')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(saldo.data || []), 'Saldos')
    for (const t of tabelas) {
      let todos = [], de = 0
      for (;;) {
        const r = await supabase.from(t).select('*').range(de, de + 999)
        if (r.error) { setBaixando(false); return toast(r.error.message, true) }
        todos = todos.concat(r.data); if (r.data.length < 1000) break; de += 1000
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(todos), t[0].toUpperCase() + t.slice(1))
    }
    XLSX.writeFile(wb, `eSimon_Estoque_backup_${new Date().toISOString().slice(0, 10)}.xlsx`)
    setBaixando(false)
  }

  return (
    <>
      <div className="topbar"><div><img className="mobile-logo logo-img" src="/logo.png" alt="e-Simon" /><h1>Ajustes</h1><div className="sub">{me?.nome} · {me?.email}</div></div></div>

      <div className="card glass">
        <h2>Atalhos</h2>
        <div className="btns">
          <button className="btn" onClick={() => ir('movimentar')}><ArrowLeftRight size={16} /> Movimentar</button>
          <button className="btn" onClick={() => ir('historico')}><History size={16} /> Histórico</button>
          <button className="btn primary" disabled={baixando} onClick={backup}><Download size={16} /> {baixando ? 'Gerando…' : 'Baixar backup (Excel)'}</button>
          <button className="btn" onClick={() => supabase.auth.signOut()}><LogOut size={16} /> Sair</button>
        </div>
        <div className="tiny" style={{ marginTop: 10 }}>O backup gera uma planilha com todas as tabelas. Salve na pasta Estoque Equipamentos do OneDrive.</div>
      </div>

      <div className="grid two">
        <div className="card glass">
          <h2>Equipe</h2>
          <div className="list">
            {db.equipe.map((p) => (
              <div key={p.email} className="row">
                <div className="grow"><div className="t">{p.nome}</div><div className="s">{p.email} · {p.papel === 'ADMIN' ? 'administrador' : 'técnico'}</div></div>
                {admin && p.email !== me.email && <button className="btn small" onClick={() => alternar(p)}>{p.ativo ? 'Desativar' : 'Reativar'}</button>}
                {!p.ativo && <span className="pill">inativo</span>}
              </div>
            ))}
          </div>
          {admin && (
            <div className="form" style={{ marginTop: 14 }}>
              <label>Nome<input value={pessoa.nome} onChange={(e) => setPessoa({ ...pessoa, nome: e.target.value })} /></label>
              <label>E-mail<input type="email" value={pessoa.email} onChange={(e) => setPessoa({ ...pessoa, email: e.target.value })} /></label>
              <label>Papel<select value={pessoa.papel} onChange={(e) => setPessoa({ ...pessoa, papel: e.target.value })}><option value="TECNICO">Técnico</option><option value="ADMIN">Administrador</option></select></label>
              <label>&nbsp;<button className="btn primary" disabled={!pessoa.email || !pessoa.nome} onClick={addPessoa}>Incluir na equipe</button></label>
            </div>
          )}
        </div>

        <div className="card glass">
          <h2>Locais</h2>
          <div className="list">
            {db.locais.map((l) => <div key={l.id} className="row"><div className="grow"><div className="t">{l.nome}</div><div className="s">{l.id}</div></div><span className="pill">{l.tipo.toLowerCase()}</span></div>)}
          </div>
          <div className="form" style={{ marginTop: 14 }}>
            <label>Nome<input value={loc.nome} onChange={(e) => setLoc({ ...loc, nome: e.target.value, id: loc.id || '' })} placeholder="Com João" /></label>
            <label>Código<input value={loc.id} onChange={(e) => setLoc({ ...loc, id: e.target.value })} placeholder="TEC-JOAO" /></label>
            <label>Tipo<select value={loc.tipo} onChange={(e) => setLoc({ ...loc, tipo: e.target.value })}>
              {[['ESTOQUE', 'Estoque'], ['TECNICO', 'Com técnico'], ['CLIENTE', 'Cliente'], ['MANUTENCAO', 'Manutenção'], ['FORNECEDOR', 'Fornecedor']].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
            </select></label>
            <label>&nbsp;<button className="btn" disabled={!loc.id || !loc.nome} onClick={addLocal}>Criar local</button></label>
          </div>
        </div>
      </div>
    </>
  )
}
