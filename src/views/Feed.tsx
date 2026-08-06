import { useEffect, useState, useRef, useCallback } from 'react'
import type { Comment, Plataforma, Template } from '../lib/types'
import { listFeed, listPendencias, traduzErro } from '../lib/db'
import { FEATURES } from '../lib/config'
import CommentCard from '../components/CommentCard'

type Estado = 'carregando' | 'revalidando' | 'ok' | 'erro'

export default function Feed({ plataforma, templates, admin }: { plataforma: Plataforma; templates: Template[]; admin: boolean }) {
  const [itens, setItens] = useState<Comment[]>([])
  const [pendencias, setPendencias] = useState<Comment[]>([])
  const [estado, setEstado] = useState<Estado>('carregando')
  const [erroMsg, setErroMsg] = useState('')
  const [status, setStatus] = useState('')
  const [classe, setClasse] = useState('')
  const [busca, setBusca] = useState('')
  const seq = useRef(0)
  const jaCarregou = useRef(false)

  const carregar = useCallback(() => {
    const minha = ++seq.current // resposta velha nunca sobrescreve filtro novo
    setEstado(jaCarregou.current ? 'revalidando' : 'carregando')
    listFeed({ plataforma, status: status || undefined, classe: classe || undefined, busca: busca || undefined })
      .then((r) => { if (seq.current === minha) { setItens(r); jaCarregou.current = true; setEstado('ok') } })
      .catch((e) => { if (seq.current === minha) { setErroMsg(traduzErro(e?.message ?? '')); setEstado('erro') } })
    listPendencias().then(setPendencias).catch(() => {})
  }, [plataforma, status, classe, busca])

  useEffect(() => {
    const t = setTimeout(carregar, 300)
    return () => clearTimeout(t)
  }, [carregar])

  function patch(id: number, p: Partial<Comment>) {
    setItens((xs) => xs.map((c) => (c.id === id ? { ...c, ...p } : c)))
  }
  const comEstadoReal = (c: Comment): Comment => {
    const p = pendencias.find((x) => x.id === c.id)
    return p ? { ...c, fila_status: p.fila_status, fila_erro: p.fila_erro, status: p.status } : c
  }

  if (plataforma === 'tiktok' && !FEATURES.tiktok) {
    return (
      <div className="vazio">
        <span className="emoji">⏳</span>
        Módulo TikTok aguardando a aprovação dos novos scopes do app.
      </div>
    )
  }

  return (
    <div>
      <div className="filtros">
        <input type="search" enterKeyHint="search" placeholder="buscar no texto…"
          value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="filtrar status">
          <option value="">todos os status</option>
          <option value="visivel">visível</option>
          <option value="revisao">em revisão</option>
          <option value="oculto_auto">oculto (motor)</option>
          <option value="oculto_manual">oculto por nós</option>
          <option value="oculto_plataforma">oculto pela plataforma</option>
          <option value="respondido">respondido</option>
          <option value="liberado">liberado</option>
          <option value="removido_origem">apagado na origem</option>
        </select>
        <select value={classe} onChange={(e) => setClasse(e.target.value)} aria-label="filtrar classe">
          <option value="">todas as classes</option>
          <option value="golpe">golpe</option>
          <option value="reclamacao">reclamação</option>
          <option value="duvida">dúvida de lead</option>
          <option value="prova_social">prova social</option>
          <option value="neutro">neutro</option>
        </select>
      </div>

      {estado === 'carregando' && <p className="didatica">carregando…</p>}
      {estado === 'erro' && (
        <div className="vazio">
          <span className="emoji">📡</span>{erroMsg || 'Não consegui carregar.'}
          <p style={{ marginTop: 12 }}><button className="btn" onClick={carregar}>Tentar de novo</button></p>
        </div>
      )}
      {(estado === 'ok' || estado === 'revalidando') && itens.length === 0 && (
        <div className="vazio"><span className="emoji">🔍</span>Nenhum comentário com esses filtros.</div>
      )}
      {/* revalidando mantém a lista na tela (só esmaecida) — antes o scroll pulava a cada tecla */}
      <div style={{ opacity: estado === 'revalidando' ? 0.55 : 1, transition: 'opacity .15s' }}>
        {(estado === 'ok' || estado === 'revalidando') && itens.map(comEstadoReal).map((c) => (
          <CommentCard key={c.id} c={c} templates={templates} admin={admin} onPatch={patch} />
        ))}
      </div>
      {itens.length === 200 && (
        <p className="didatica">Mostrando os 200 mais recentes — use os filtros ou a busca pra afunilar.</p>
      )}
    </div>
  )
}
