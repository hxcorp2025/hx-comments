import { useEffect, useState } from 'react'
import type { NegativoAnuncio } from '../lib/types'
import { listInsights, negativosPorAnuncio, type InsightRow } from '../lib/db'

export default function Insights() {
  const [linhas, setLinhas] = useState<InsightRow[]>([])
  const [anuncios, setAnuncios] = useState<NegativoAnuncio[]>([])

  useEffect(() => {
    listInsights().then(setLinhas).catch(console.error)
    negativosPorAnuncio().then(setAnuncios).catch(console.error)
  }, [])

  const seteDias = linhas.filter((l) => Date.now() - new Date(l.dia_br).getTime() < 7 * 864e5)
  const total = seteDias.reduce((s, l) => s + Number(l.comentarios), 0)
  const sinalizados = seteDias
    .filter((l) => ['revisao', 'oculto_auto', 'oculto_manual'].includes(l.status))
    .reduce((s, l) => s + Number(l.comentarios), 0)
  const ocultos = seteDias
    .filter((l) => ['oculto_auto', 'oculto_manual'].includes(l.status))
    .reduce((s, l) => s + Number(l.comentarios), 0)

  return (
    <div>
      <p className="didatica">
        Últimos 7 dias. "Sinalizado" = o motor achou algo (revisão ou oculto). O digest semanal
        com as citações literais pro Lorenzo sai toda segunda 9h no WhatsApp.
      </p>
      <div className="grade-kpi">
        <div className="kpi"><div className="num">{total}</div><div className="rotulo">comentários (7d)</div></div>
        <div className="kpi"><div className="num">{sinalizados}</div><div className="rotulo">sinalizados</div></div>
        <div className="kpi"><div className="num">{ocultos}</div><div className="rotulo">ocultos</div></div>
      </div>

      <h3 style={{ margin: '14px 0 4px' }}>Negativos por anúncio × gasto (7d)</h3>
      <p className="didatica">
        Pra que serve: negativo SUBINDO num criativo escalado = fadiga/qualidade caindo antes do CTR mostrar.
        Gasto alto + % negativo alto = olhar o criativo com o Patrick.
      </p>
      <div className="scroll-x">
        <table className="lista">
          <thead>
            <tr><th>Anúncio</th><th>Gasto 7d</th><th>Coments</th><th>Negativos</th><th>%</th><th>Ocultos</th></tr>
          </thead>
          <tbody>
            {anuncios.map((a) => (
              <tr key={a.ad_id}>
                <td>{a.ad_name ?? a.ad_id}</td>
                <td>R$ {Number(a.gasto_7d).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td>{a.comentarios_7d}</td>
                <td>{a.negativos_7d}</td>
                <td style={{ color: a.pct_negativo > 15 ? 'var(--red)' : 'inherit' }}>{a.pct_negativo}%</td>
                <td>{a.ocultos_7d}</td>
              </tr>
            ))}
            {anuncios.length === 0 && (
              <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>sem dados ainda</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
