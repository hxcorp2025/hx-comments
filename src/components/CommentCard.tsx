import { useState } from 'react'
import { EyeOff, Eye, MessageCircle, ExternalLink } from 'lucide-react'
import type { Comment, Classe, Template } from '../lib/types'
import { ocultar, liberar, classificar, responder } from '../lib/db'

const CLASSES: Classe[] = ['golpe', 'reclamacao', 'duvida', 'prova_social', 'neutro']
const NOME_PLAT = { fb: 'Facebook', ig: 'Instagram', tiktok: 'TikTok' } as const
const NOME_STATUS: Record<string, string> = {
  visivel: 'visível', revisao: 'em revisão', oculto_auto: 'oculto (motor)',
  oculto_manual: 'oculto', respondido: 'respondido', liberado: 'liberado',
}

interface Props {
  c: Comment
  templates: Template[]
  admin: boolean
  selecionado?: boolean
  onSelecionar?: () => void
  onMudou: () => void
}

export default function CommentCard({ c, templates, admin, selecionado, onSelecionar, onMudou }: Props) {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [respondendo, setRespondendo] = useState(false)
  const [templateId, setTemplateId] = useState<number | ''>('')
  const [textoLivre, setTextoLivre] = useState('')

  async function agir(fn: () => Promise<unknown>) {
    setErro('')
    setOcupado(true)
    try {
      await fn()
      onMudou()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falhou')
    } finally {
      setOcupado(false)
    }
  }

  const oculto = c.status === 'oculto_auto' || c.status === 'oculto_manual'
  const quando = c.created_time ? new Date(c.created_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''

  return (
    <div className={`card ${selecionado ? 'sel' : ''}`}>
      <div className="meta">
        {onSelecionar && (
          <input type="checkbox" checked={!!selecionado} onChange={onSelecionar} aria-label="selecionar" style={{ width: 18, height: 18 }} />
        )}
        <span className={`pill ${c.plataforma}`}>{NOME_PLAT[c.plataforma]}</span>
        <span className={`pill ${c.status}`}>{NOME_STATUS[c.status] ?? c.status}</span>
        {c.classe && <span className={`pill ${c.classe}`}>{c.classe.replace('_', ' ')}</span>}
        <span>{c.autor_nome ?? 'autor não visível'}</span>
        <span>· {quando}</span>
        <span>· {c.like_count} 👍</span>
        {c.permalink_url && (
          <a href={c.permalink_url} target="_blank" rel="noreferrer" aria-label="abrir no site">
            <ExternalLink size={14} />
          </a>
        )}
      </div>
      <p className="texto">{c.texto ?? '(sem texto)'}</p>
      <div className="acoes">
        {!oculto ? (
          <button className="btn perigo" disabled={ocupado} onClick={() => agir(() => ocultar(c.id))}>
            <EyeOff size={15} style={{ verticalAlign: '-2px' }} /> Ocultar
          </button>
        ) : (
          <button className="btn ok" disabled={ocupado} onClick={() => agir(() => liberar(c.id))}>
            <Eye size={15} style={{ verticalAlign: '-2px' }} /> Liberar
          </button>
        )}
        {c.status === 'revisao' && (
          <button className="btn ok" disabled={ocupado} onClick={() => agir(() => liberar(c.id))}>
            Está ok, liberar
          </button>
        )}
        <button className="btn" disabled={ocupado} onClick={() => setRespondendo(!respondendo)}>
          <MessageCircle size={15} style={{ verticalAlign: '-2px' }} /> Responder
        </button>
        <select
          aria-label="classificar"
          value={c.classe ?? ''}
          disabled={ocupado}
          onChange={(e) => agir(() => classificar(c.id, e.target.value as Classe))}
        >
          <option value="" disabled>classificar…</option>
          {CLASSES.map((cl) => (
            <option key={cl} value={cl}>{cl.replace('_', ' ')}</option>
          ))}
        </select>
      </div>
      {respondendo && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">escolher template aprovado…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>{t.titulo}</option>
            ))}
          </select>
          {templateId !== '' && (
            <p className="didatica">"{templates.find((t) => t.id === templateId)?.texto}"</p>
          )}
          {admin && (
            <textarea
              placeholder="texto livre (só admin)"
              value={textoLivre}
              onChange={(e) => setTextoLivre(e.target.value)}
              rows={2}
            />
          )}
          <button
            className="btn primario"
            disabled={ocupado || (templateId === '' && !textoLivre.trim())}
            onClick={() =>
              agir(() => responder(c.id, templateId === '' ? null : templateId, textoLivre.trim() || null)).then(() => setRespondendo(false))
            }
          >
            Enviar resposta como a página
          </button>
        </div>
      )}
      {erro && <p className="erro" style={{ marginTop: 8 }}>{erro}</p>}
    </div>
  )
}
