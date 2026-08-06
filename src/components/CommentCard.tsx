import { useEffect, useState } from 'react'
import { EyeOff, Eye, MessageCircle, ExternalLink, Check } from 'lucide-react'
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
  onPatch: (id: number, patch: Partial<Comment>) => void
}

export default function CommentCard({ c, templates, admin, selecionado, onSelecionar, onPatch }: Props) {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [feito, setFeito] = useState('')
  const [respondendo, setRespondendo] = useState(false)
  const [templateId, setTemplateId] = useState<number | ''>('')
  const [textoLivre, setTextoLivre] = useState('')

  useEffect(() => {
    if (!feito) return
    const t = setTimeout(() => setFeito(''), 4000)
    return () => clearTimeout(t)
  }, [feito])

  // atualiza o card no lugar (sem recarregar a lista — o scroll não pula) e confirma visualmente
  async function agir(fn: () => Promise<unknown>, patch: Partial<Comment>, msg: string): Promise<boolean> {
    setErro('')
    setOcupado(true)
    try {
      await fn()
      onPatch(c.id, patch)
      setFeito(msg)
      return true
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falhou')
      return false
    } finally {
      setOcupado(false)
    }
  }

  const oculto = c.status === 'oculto_auto' || c.status === 'oculto_manual'
  const quando = c.created_time
    ? new Date(c.created_time).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : ''

  return (
    <div className={`card ${selecionado ? 'sel' : ''}`}>
      <div className="meta">
        {onSelecionar && (
          <label className="alvo-toque" aria-label="selecionar comentário">
            <input type="checkbox" checked={!!selecionado} onChange={onSelecionar} />
          </label>
        )}
        <span className={`pill ${c.plataforma}`}>{NOME_PLAT[c.plataforma]}</span>
        <span className={`pill ${c.status}`}>{NOME_STATUS[c.status] ?? c.status}</span>
        {c.classe && <span className={`pill ${c.classe}`}>{c.classe.replace('_', ' ')}</span>}
        <span>{c.autor_nome ?? 'autor não visível'}</span>
        <span>· {quando}</span>
        <span>· {c.like_count} 👍</span>
        {c.permalink_url && (
          <a className="alvo-toque" href={c.permalink_url} target="_blank" rel="noreferrer" aria-label="abrir no site">
            <ExternalLink size={15} />
          </a>
        )}
      </div>
      <p className="texto">{c.texto ?? '(sem texto)'}</p>
      <div className="acoes">
        {!oculto ? (
          <button className="btn perigo" disabled={ocupado}
            onClick={() => agir(() => ocultar(c.id), { status: 'oculto_manual', is_hidden: true }, 'Registrado — some da plataforma em até 1 min')}>
            <EyeOff size={15} style={{ verticalAlign: '-2px' }} /> Ocultar
          </button>
        ) : (
          <button className="btn ok" disabled={ocupado}
            onClick={() => agir(() => liberar(c.id), { status: 'liberado', is_hidden: false }, 'Registrado — volta pra plataforma em até 1 min; o motor não mexe mais nele')}>
            <Eye size={15} style={{ verticalAlign: '-2px' }} /> Liberar
          </button>
        )}
        {c.status === 'revisao' && (
          <button className="btn ok" disabled={ocupado}
            onClick={() => agir(() => liberar(c.id), { status: 'liberado', is_hidden: false }, 'Registrado — o motor não mexe mais nele')}>
            Está ok, liberar
          </button>
        )}
        <button className="btn" disabled={ocupado} onClick={() => setRespondendo(!respondendo)}>
          <MessageCircle size={15} style={{ verticalAlign: '-2px' }} /> Responder
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>🏷️</span>
          <select
            aria-label="classificar comentário"
            value={c.classe ?? ''}
            disabled={ocupado}
            onChange={(e) => agir(() => classificar(c.id, e.target.value as Classe),
              { classe: e.target.value as Classe }, 'Classificado')}
          >
            <option value="" disabled>classificar…</option>
            {CLASSES.map((cl) => (
              <option key={cl} value={cl}>{cl.replace('_', ' ')}</option>
            ))}
          </select>
        </label>
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
            <textarea placeholder="texto livre (só admin)" value={textoLivre}
              onChange={(e) => setTextoLivre(e.target.value)} rows={2} />
          )}
          <button
            className="btn primario"
            disabled={ocupado || (templateId === '' && !textoLivre.trim())}
            onClick={async () => {
              const ok = await agir(
                () => responder(c.id, templateId === '' ? null : templateId, textoLivre.trim() || null),
                { status: 'respondido' }, 'Resposta enviada como a página')
              if (ok) { setRespondendo(false); setTextoLivre(''); setTemplateId('') }
            }}
          >
            Enviar resposta como a página
          </button>
        </div>
      )}
      {feito && (
        <p className="feito"><Check size={14} style={{ verticalAlign: '-2px' }} /> {feito}</p>
      )}
      {erro && <p className="erro" style={{ marginTop: 8 }}>{erro}</p>}
    </div>
  )
}
