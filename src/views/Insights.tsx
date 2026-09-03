import { useEffect, useState, useCallback } from 'react'
import type { NegativoPost } from '../lib/types'
import { listInsights, negativosPorPost, traduzErro, type InsightRow } from '../lib/db'

type Estado = 'carregando' | 'ok' | 'erro'

export default function Insights() {
  const [linhas, setLinhas] = useState<InsightRow[]>([])
  const [posts, setPosts] = useState<NegativoPost[]>([])
  const [estado, setEstado] = useState<Estado>('carregando')
  const [erroMsg, setErroMsg] = useState('')

  const carregar = useCallback(() => {
    setEstado('carregando')
    Promise.all([listInsights(), negativosPorPost()])
      .then(([l, p]) => { setLinhas(l); setPosts(p); setEstado('ok') })
      .catch((e) => { setErroMsg(traduzErro(e?.message ?? '')); setEstado('erro') })
  }, [])
  useEffect(carregar, [carregar])

  if (estado === 'carregando') return <p className="didatica">carregando…</p>
  if (estado === 'erro') {
    return (
      <div className="vazio">
        <span className="emoji">📡</span>{erroMsg || 'Não consegui carregar os insights.'}
        <p style={{ marginTop: 12 }}><button className="btn" onClick={carregar}>Tentar de novo</button></p>
      </div>
    )
  }

  // a janela de 7 dias BR já vem filtrada do servidor (era feita em JS com Date-UTC e perdia um dia)
  const soma = (f: (l: InsightRow) => boolean) =>
    linhas.filter(f).reduce((s, l) => s + Number(l.comentarios), 0)
  const total = soma(() => true)
  const sinalizados = soma((l) => ['revisao', 'oculto_auto', 'oculto_manual'].includes(l.status))
  const ocultosNos = soma((l) => ['oculto_auto', 'oculto_manual'].includes(l.status))
  const ocultosPlat = soma((l) => l.status === 'oculto_plataforma')
  const duvidas = soma((l) => l.classe === 'duvida')

  return (
    <div>
      <p className="didatica">
        Últimos 7 dias (fuso de Brasília). "Ocultos por nós" conta só a moderação da equipe;
        o que a própria plataforma escondeu (filtro de spam da Meta) aparece separado.
      </p>
      <div className="grade-kpi">
        <div className="kpi"><div className="num">{total}</div><div className="rotulo">comentários (7d)</div></div>
        <div className="kpi"><div className="num">{sinalizados}</div><div className="rotulo">sinalizados</div></div>
        <div className="kpi"><div className="num">{ocultosNos}</div><div className="rotulo">ocultos por nós</div></div>
        <div className="kpi"><div className="num">{ocultosPlat}</div><div className="rotulo">ocultos pela plataforma</div></div>
        <div className="kpi"><div className="num">{duvidas}</div><div className="rotulo">dúvidas de lead</div></div>
      </div>

      <h3 style={{ margin: '14px 0 4px' }}>Negativos por publicação × gasto (7d)</h3>
      <p className="didatica">
        Agrupado por PUBLICAÇÃO, não por anúncio: vários anúncios usam o mesmo post, então o comentário
        pertence ao post. O gasto é a soma dos anúncios daquele post. Negativo subindo em publicação
        escalada = qualidade caindo antes do CTR mostrar.
      </p>
      <div className="scroll-x">
        <table className="lista">
          <thead>
            <tr><th>Publicação</th><th className="num">Anúncios</th><th className="num">Gasto 7d</th><th className="num">Coments</th><th className="num">Negativos</th><th className="num">%</th></tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={`${p.plataforma}-${p.post_id}`}>
                <td>
                  {p.permalink_url && /^https:\/\//i.test(p.permalink_url)
                    ? <a href={p.permalink_url} target="_blank" rel="noreferrer noopener">{p.caption ?? p.post_id}</a>
                    : (p.caption ?? p.post_id)}
                  <div style={{ color: 'var(--muted)', fontSize: 12 }}>{p.plataforma}</div>
                </td>
                <td className="num">{p.ads}</td>
                <td className="num">R$ {Number(p.gasto_7d).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="num">{p.comentarios_7d}</td>
                <td className="num">{p.negativos_7d}</td>
                <td className="num" style={{ color: p.pct_negativo > 15 ? 'var(--critico)' : 'inherit' }}>{p.pct_negativo}%</td>
              </tr>
            ))}
            {posts.length === 0 && <tr><td colSpan={6} style={{ color: 'var(--muted)' }}>sem dados ainda</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
