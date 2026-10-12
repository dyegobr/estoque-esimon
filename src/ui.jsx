import { createContext, useCallback, useContext, useState } from 'react'

export function Modal({ titulo, sub, onClose, children, acoes }) {
  return (
    <div className="sheet-bg" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet glass" role="dialog" aria-modal="true">
        <h3>{titulo}</h3>
        {sub && <div className="muted" style={{ fontSize: 14, marginBottom: 14 }}>{sub}</div>}
        {children}
        {acoes && <div className="foot">{acoes}</div>}
      </div>
    </div>
  )
}

const STATUS = {
  DISPONIVEL: ['ok', 'Disponível'], EM_CAMPO: ['info', 'Em campo'], MANUTENCAO: ['warn', 'Manutenção'],
  BAIXADO: ['', 'Baixado'], VERIFICAR: ['warn', 'Verificar'],
  ORCAMENTO: ['', 'Orçamento'], FECHADO: ['warn', 'Fechado'], AGENDADO: ['info', 'Agendado'],
  CONCLUIDO: ['ok', 'Concluído'], CANCELADO: ['', 'Cancelado'],
  PLANEJADO: ['warn', 'Planejado'], RESERVADO: ['info', 'Reservado'], SEPARADO: ['info', 'Separado'], INSTALADO: ['ok', 'Instalado'],
  SUGERIDA: ['', 'Sugerida'], PEDIDA: ['info', 'Pedida'], RECEBIDA: ['ok', 'Recebida'], CANCELADA: ['', 'Cancelada'],
}
export function Status({ v }) {
  const [cls, txt] = STATUS[v] || ['', v]
  return <span className={`pill ${cls}`}>{txt}</span>
}

export const TIPOS_MOV = {
  ENTRADA_COMPRA: 'Entrada de compra', SAIDA_CAMPO: 'Saída a campo', DEVOLUCAO: 'Devolução', INSTALACAO: 'Instalado',
  TRANSFERENCIA: 'Transferência', ENVIO_MANUTENCAO: 'Envio p/ manutenção', RETORNO_MANUTENCAO: 'Retorno de manutenção',
  AJUSTE_INVENTARIO: 'Ajuste de inventário', BAIXA: 'Baixa',
}

const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)
export function ToastProvider({ children }) {
  const [t, setT] = useState(null)
  const show = useCallback((msg, err) => {
    setT({ msg, err })
    setTimeout(() => setT(null), err ? 5000 : 2600)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {t && <div className={`toast glass ${t.err ? 'err' : ''}`}>{t.msg}</div>}
    </ToastCtx.Provider>
  )
}
