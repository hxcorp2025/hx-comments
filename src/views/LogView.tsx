import { useEffect, useState } from 'react'
import type { LogRow } from '../lib/types'
import { listLog } from '../lib/db'

export default function LogView() {
  const [linhas, setLinhas] = useState<LogRow[]>([])
  useEffect(() => { listLog().then(setLinhas).catch(console.error) }, [])

  return (
    <div>
      <p className="didatica">Auditoria completa: toda ação (humana ou do motor) fica registrada. Nada some sem rastro.</p>
      <div className="scroll-x">
        <table className="lista">
          <thead><tr><th>Quando</th><th>Quem</th><th>Ação</th><th>Detalhe</th></tr></thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(l.ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                <td>{l.quem}</td>
                <td>{l.acao}</td>
                <td style={{ color: 'var(--muted)' }}>{l.detalhe}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
