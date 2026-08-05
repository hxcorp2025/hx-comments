import { useEffect, useState, useCallback } from 'react'
import type { Comment, Plataforma, Template } from '../lib/types'
import { listFeed } from '../lib/db'
import { FEATURES } from '../lib/config'
import CommentCard from '../components/CommentCard'

export default function Feed({ plataforma, templates, admin }: { plataforma: Plataforma; templates: Template[]; admin: boolean }) {
  const [itens, setItens] = useState<Comment[]>([])
  const [status, setStatus] = useState('')
  const [classe, setClasse] = useState('')
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(false)

  const carregar = useCallback(() => {
    setCarregando(true)
    listFeed({ plataforma, status: status || undefined, classe: classe || undefined, busca: busca || undefined })
      .then(setItens)
      .catch(console.error)
      .finally(() => setCarregando(false))
  }, [plataforma, status, classe, busca])

  useEffect(() => {
    const t = setTimeout(carregar, 300)
    return () => clearTimeout(t)
  }, [carregar])

  if (plataforma === 'tiktok' && !FEATURES.tiktok) {
    return (
      <div className="vazio">
        <span className="emoji">⏳</span>
        Módulo TikTok aguardando a aprovação dos novos scopes do app.
        <br />Assim que aprovar (re-auth de 2 min), os comentários aparecem aqui — mesmas regras, mesma fila.
      </div>
    )
  }

  return (
    <div>
      <div className="filtros">
        <input placeholder="buscar no texto…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="filtrar status">
          <option value="">todos os status</option>
          <option value="visivel">visível</option>
          <option value="revisao">em revisão</option>
          <option value="oculto_auto">oculto (motor)</option>
          <option value="oculto_manual">oculto (manual)</option>
          <option value="respondido">respondido</option>
          <option value="liberado">liberado</option>
        </select>
        <select value={classe} onChange={(e) => setClasse(e.target.value)} aria-label="filtrar classe">
          <option value="">todas as classes</option>
          <option value="golpe">golpe</option>
          <option value="reclamacao">reclamação</option>
          <option value="duvida">dúvida</option>
          <option value="prova_social">prova social</option>
          <option value="neutro">neutro</option>
        </select>
      </div>
      {carregando && <p className="didatica">carregando…</p>}
      {!carregando && itens.length === 0 && (
        <div className="vazio"><span className="emoji">🔍</span>Nenhum comentário com esses filtros.</div>
      )}
      {itens.map((c) => (
        <CommentCard key={c.id} c={c} templates={templates} admin={admin} onMudou={carregar} />
      ))}
    </div>
  )
}
