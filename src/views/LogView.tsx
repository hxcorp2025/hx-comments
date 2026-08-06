import { useEffect, useState, useCallback } from 'react'
import type { LogRow } from '../lib/types'
import { listLog, traduzErro } from '../lib/db'

type Estado = 'carregando' | 'ok' | 'erro'

export default function LogView() {
  const [linhas, setLinhas] = useState<LogRow[]>([])
  const [estado, setEstado] = useState<Estado>('carregando')
  const [erroMsg, setErroMsg] = useState('')

  const carregar = useCallback(() => {
    setEstado('carregando')
    listLog()
      .then((r) => { setLinhas(r); setEstado('ok') })
      .catch((e) => { setErroMsg(traduzErro(e?.message ?? '')); setEstado('erro') })
  }, [])
  useEffect(carregar, [carregar])

  if (estado === 'carregando') return <p className="didatica">carregando…</p>
  if (estado === 'erro') {
    return (
      <div className="vazio">
        <span className="emoji">📡</span>{erroMsg || 'Não consegui carregar o log.'}
        <p style={{ marginTop: 12 }}><button className="btn" onClick={carregar}>Tentar de novo</button></p>
      </div>
    )
  }

  return (
    <div>
      <p className="didatica">
        Auditoria: toda ação (humana ou do motor) fica registrada. "enfileirado" = o operador pediu;
        "confirmado" = a plataforma aceitou; "falhou" = a plataforma recusou e o comentário voltou.
      </p>
      <div className="scroll-x">
        <table className="lista">
          <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {new Date(l.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </td>
                <td>{l.quem}</td>
                <td className={/falhou|erro/.test(l.acao) ? 'acao-erro' : undefined}>{l.acao}</td>
                <td style={{ color: 'var(--muted)' }}>{l.detalhe}</td>
              </tr>
            ))}
            {linhas.length === 0 && <tr><td colSpan={4} style={{ color: 'var(--muted)' }}>sem registros</td></tr>}
          </tbody>
        </table>
      </div>
      {linhas.length === 300 && <p className="didatica">Mostrando os 300 eventos mais recentes.</p>}
    </div>
  )
}
