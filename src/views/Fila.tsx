import { useEffect, useState, useCallback } from 'react'
import type { Comment, Template } from '../lib/types'
import { listFila, listUltimosOcultos, ocultarLote } from '../lib/db'
import CommentCard from '../components/CommentCard'

type Estado = 'carregando' | 'ok' | 'erro'

export default function Fila({ templates, admin, onContagem }: {
  templates: Template[]; admin: boolean; onContagem: (n: number) => void
}) {
  const [fila, setFila] = useState<Comment[]>([])
  const [ocultos, setOcultos] = useState<Comment[]>([])
  const [estado, setEstado] = useState<Estado>('carregando')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [ocupado, setOcupado] = useState(false)
  const [progresso, setProgresso] = useState('')

  const carregar = useCallback(() => {
    setEstado('carregando')
    Promise.all([listFila(), listUltimosOcultos()])
      .then(([f, o]) => {
        setFila(f); setOcultos(o); setEstado('ok'); onContagem(f.length)
      })
      .catch(() => setEstado('erro'))
    setSel(new Set())
  }, [onContagem])
  useEffect(carregar, [carregar])

  // ação individual atualiza o item no lugar (sem reload, sem pulo de scroll)
  function patch(id: number, p: Partial<Comment>) {
    setFila((xs) => {
      const novo = xs.map((c) => (c.id === id ? { ...c, ...p } : c))
      onContagem(novo.filter((c) => c.status === 'revisao').length)
      return novo
    })
    setOcultos((xs) => xs.map((c) => (c.id === id ? { ...c, ...p } : c)))
  }

  function alternar(id: number) {
    const s = new Set(sel)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSel(s)
  }

  // lote fatiado em 10 (limite da RPC) com progresso visível
  async function ocultarSelecionados() {
    const ids = [...sel]
    setOcupado(true)
    let ok = 0, erros = 0
    try {
      for (let i = 0; i < ids.length; i += 10) {
        const fatia = ids.slice(i, i + 10)
        setProgresso(`ocultando ${Math.min(i + 10, ids.length)}/${ids.length}…`)
        const r = (await ocultarLote(fatia)) as { ok: number; erros: number }
        ok += r.ok; erros += r.erros
        fatia.forEach((id) => patch(id, { status: 'oculto_manual', is_hidden: true }))
      }
      setProgresso(erros > 0 ? `${ok} ocultados · ${erros} falharam (ver cards)` : `${ok} ocultados ✓`)
      setTimeout(() => setProgresso(''), 5000)
      setSel(new Set())
    } catch (e) {
      setProgresso(e instanceof Error ? e.message : 'lote falhou')
    } finally {
      setOcupado(false)
    }
  }

  if (estado === 'carregando') return <p className="didatica">carregando a fila…</p>
  if (estado === 'erro') {
    return (
      <div className="vazio">
        <span className="emoji">📡</span>Não consegui carregar a fila (conexão?).
        <p style={{ marginTop: 12 }}><button className="btn" onClick={carregar}>Tentar de novo</button></p>
      </div>
    )
  }

  const pendentes = fila.filter((c) => c.status === 'revisao')

  return (
    <div style={{ paddingBottom: sel.size > 0 ? 90 : 0 }}>
      <p className="didatica">
        A fila mostra o que as regras marcaram pra decisão humana (mais likes primeiro).
        "Está ok" libera e o motor nunca mais mexe nele.
      </p>
      {pendentes.length === 0 && fila.length === 0 ? (
        <div className="vazio"><span className="emoji">✅</span>Fila limpa — nenhum comentário esperando revisão.</div>
      ) : (
        fila.map((c) => (
          <CommentCard key={c.id} c={c} templates={templates} admin={admin}
            selecionado={sel.has(c.id)}
            onSelecionar={c.status === 'revisao' ? () => alternar(c.id) : undefined}
            onPatch={patch} />
        ))
      )}
      {(sel.size > 0 || progresso) && (
        <div className="bulkbar">
          <span>{progresso || `${sel.size} selecionado${sel.size > 1 ? 's' : ''}`}</span>
          <span style={{ display: 'flex', gap: 8 }}>
            {sel.size > 0 && (
              <>
                <button className="btn perigo" disabled={ocupado} onClick={ocultarSelecionados}>Ocultar todos</button>
                <button className="btn" disabled={ocupado} onClick={() => setSel(new Set())} aria-label="limpar seleção">✕</button>
              </>
            )}
          </span>
        </div>
      )}
      {ocultos.length > 0 && (
        <>
          <h3 style={{ margin: '20px 0 4px' }}>Últimos ocultos</h3>
          <p className="didatica">Nada some sem rastro: dá pra liberar qualquer um de volta.</p>
          {ocultos.map((c) => (
            <CommentCard key={c.id} c={c} templates={templates} admin={admin} onPatch={patch} />
          ))}
        </>
      )}
    </div>
  )
}
