import { AlertTriangle, ChevronRight } from 'lucide-react'
import { useData, ir, desde, fmtDataHora } from '../data.jsx'
import { Status, TIPOS_MOV } from '../ui.jsx'

export default function Painel() {
  const { db, item, local, servico, nomeUsuario } = useData()
  const faltas = db.saldo.filter((s) => s.comprar > 0).sort((a, b) => b.comprar - a.comprar)
  const emCampo = db.ativos.filter((a) => a.status === 'EM_CAMPO')
  const verificar = db.ativos.filter((a) => a.status === 'VERIFICAR')
  const abertos = db.servicos.filter((s) => ['FECHADO', 'AGENDADO', 'EM_CAMPO'].includes(s.status))
  const hora = new Date().getHours()

  return (
    <>
      <div className="topbar">
        <div>
          <img className="mobile-logo logo-img" src="/logo.png" alt="e-Simon" />
          <h1>{hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'}, {nomeUsuario.split(' ')[0]}</h1>
          <div className="sub">Situação do estoque agora</div>
        </div>
      </div>

      <div className="grid kpis">
        <div className={`card glass kpi ${faltas.length ? 'bad' : 'ok'}`}><div className="v">{faltas.length}</div><div className="l">itens para comprar</div></div>
        <div className="card glass kpi"><div className="v">{abertos.length}</div><div className="l">serviços em aberto</div></div>
        <div className="card glass kpi"><div className="v">{emCampo.length}</div><div className="l">equipamentos em campo</div></div>
        <div className={`card glass kpi ${verificar.length ? 'warn' : ''}`}><div className="v">{verificar.length}</div><div className="l">equipamentos sem local</div></div>
      </div>

      <div className="grid two">
        <div className="card glass">
          <h2>Previsão de compra <button className="btn small" onClick={() => ir('compras')}>Ver compras</button></h2>
          {faltas.length === 0 ? <div className="empty">Estoque cobre todos os serviços fechados.</div> : (
            <div className="list">
              {faltas.map((s) => {
                const tem = s.no_estoque + s.com_tecnicos
                return (
                  <div key={s.item_id} className="row click" onClick={() => ir('estoque', s.item_id)}>
                    <AlertTriangle size={18} color="#f87171" />
                    <div className="grow">
                      <div className="t">{s.descricao}</div>
                      <div className="s">tem {tem} · serviços precisam {s.reservado}{s.a_caminho ? ` · ${s.a_caminho} a caminho` : ''}</div>
                    </div>
                    <span className="pill bad">comprar {s.comprar}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card glass">
          <h2>Serviços em aberto <button className="btn small" onClick={() => ir('servicos')}>Todos</button></h2>
          {abertos.length === 0 ? <div className="empty">Nenhum serviço em aberto.</div> : (
            <div className="list">
              {abertos.map((s) => {
                const nec = db.necessidades.filter((n) => n.servico_id === s.id && n.status !== 'CANCELADO')
                const falta = nec.some((n) => (db.saldo.find((x) => x.item_id === n.item_id)?.disponivel ?? 0) < 0)
                return (
                  <div key={s.id} className="row click" onClick={() => ir('servicos', s.id)}>
                    <div className="grow">
                      <div className="t">{s.cliente}</div>
                      <div className="s">{nec.length} itens · {falta ? 'falta material' : 'material ok'}</div>
                    </div>
                    <Status v={s.status} />
                    <ChevronRight size={16} className="muted" />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid two">
        <div className="card glass">
          <h2>Equipamentos fora do armário <button className="btn small" onClick={() => ir('equipamentos')}>Todos</button></h2>
          {[...emCampo, ...verificar].length === 0 ? <div className="empty">Todos no armário.</div> : (
            <div className="list">
              {[...emCampo, ...verificar].map((a) => (
                <div key={a.id} className="row click" onClick={() => ir('equipamentos', a.id)}>
                  <div className="grow">
                    <div className="t">{item[a.item_id]?.descricao} {a.numero_serie && `· ${a.numero_serie}`}</div>
                    <div className="s">
                      {a.status === 'VERIFICAR' ? 'local não informado' : `${local[a.local_id]?.nome || ''}${a.servico_id ? ' · ' + (servico[a.servico_id]?.cliente || '') : ''}${a.responsavel ? ' · ' + a.responsavel : ''} · ${desde(a.desde)}`}
                    </div>
                  </div>
                  <Status v={a.status} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card glass">
          <h2>Últimas movimentações <button className="btn small" onClick={() => ir('historico')}>Histórico</button></h2>
          <div className="list">
            {db.movs.slice(0, 7).map((m) => (
              <div key={m.id} className="row">
                <div className="grow">
                  <div className="t">{TIPOS_MOV[m.tipo]} · {m.ativo_id || item[m.item_id]?.descricao}</div>
                  <div className="s">{fmtDataHora(m.data_hora)} · {m.responsavel}{m.servico_id ? ' · ' + (servico[m.servico_id]?.cliente || '') : ''}</div>
                </div>
                <span className="num">{m.qtd}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
