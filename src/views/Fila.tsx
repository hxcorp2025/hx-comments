import { useEffect, useState, useCallback } from 'react'
import type { Comment, Template } from '../lib/types'
import { listFila, listUltimosOcultos, listPendencias, ocultarLote, traduzErro } from '../lib/db'
import CommentCard from '../components/CommentCard'

type Estado = 'carregando' | 'ok' | 'erro'

export default function Fila({ templates, admin, onContagem }: {
  templates: Template[]; admin: boolean; onContagem: (n: number) => void
}) {
  const [fila, setFila] = useState<Comment[]>([])
  const [ocultos, setOcultos] = useState<Comment[]>([])
  const [pendencias, setPendencias] = useState<Comment[]>([])
  const [estado, setEstado] = useState<Estado>('carregando')
  const [erroMsg, setErroMsg] = useState('')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [ocupado, setOcupado] = useState(false)
  const [progresso, setProgresso] = useState('')

  const carregar = useCallback(() => {
    setEstado('carregando')
    Promise.all([listFila(), listUltimosOcultos(), listPendencias()])
      .then(([f, o, p]) => { setFila(f); setOcultos(o); setPendencias(p); setEstado('ok') })
      .catch((e) => { setErroMsg(traduzErro(e?.message ?? '')); setEstado('erro') })
    setSel(new Set())
  }, [])
  useEffect(carregar, [carregar])

  // badge sempre reflete a lista renderizada (efeito, não setState durante render)
  useEffect(() => {
    onContagem(fila.filter((c) => c.status === 'revisao').length)
  }, [fila, onContagem])

  // repesca o estado da fila de ações ~20s depois: se o worker falhar, o card mostra
  useEffect(() => {
    if (estado !== 'ok') return
    const t = setInterval(() => {
      listPendencias().then(setPendencias).catch(() => {})
    }, 20000)
    return () => clearInterval(t)
  }, [estado])

  function patch(id: number, p: Partial<Comment>) {
    setFila((xs) => xs.map((c) => (c.id === id ? { ...c, ...p } : c)))
    setOcultos((xs) => xs.map((c) => (c.id === id ? { ...c, ...p } : c)))
  }

  // pendências (do servidor) mandam mais que o otimismo local
  const comEstadoReal = (c: Comment): Comment => {
    const p = pendencias.find((x) => x.id === c.id)
    return p ? { ...c, fila_status: p.fila_status, fila_erro: p.fila_erro, status: p.status } : c
  }

  function alternar(id: number) {
    const s = new Set(sel)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSel(s)
  }

  // lote fatiado em 10 (limite da RPC); só patcha o que REALMENTE deu certo
  async function ocultarSelecionados() {
    const ids = [...sel]
    setOcupado(true)
    let ok = 0
    const falhas: { id: number; erro: string }[] = []
    try {
      for (let i = 0; i < ids.length; i += 10) {
        const fatia = ids.slice(i, i + 10)
        setProgresso(`ocultando ${Math.min(i + 10, ids.length)}/${ids.length}…`)
        try {
          const r = await ocultarLote(fatia)
          ok += r.ok
          const idsFalhos = new Set((r.detalhe ?? []).map((d) => d.id))
          falhas.push(...(r.detalhe ?? []))
          fatia.forEach((id) => {
            if (!idsFalhos.has(id)) patch(id, { status: 'oculto_manual', is_hidden: true, fila_status: 'pending' })
            else patch(id, { fila_status: 'erro', fila_erro: (r.detalhe ?? []).find((d) => d.id === id)?.erro ?? 'falhou' })
          })
        } catch (e) {
          fatia.forEach((id) => patch(id, { fila_status: 'erro', fila_erro: traduzErro((e as Error)?.message ?? '') }))
          falhas.push(...fatia.map((id) => ({ id, erro: 'falhou' })))
        }
        // tira do seletor o que já passou, pra reclicar não reprocessar
        setSel((s) => { const n = new Set(s); fatia.forEach((id) => n.delete(id)); return n })
      }
      setProgresso(falhas.length > 0
        ? `${ok} registrados · ${falhas.length} falharam (marcados em vermelho)`
        : `${ok} registrados, saem da plataforma em até 1 min`)
      setTimeout(() => setProgresso(''), 6000)
    } finally {
      setOcupado(false)
    }
  }

  if (estado === 'carregando') return <p className="didatica">carregando a fila…</p>
  if (estado === 'erro') {
    return (
      <div className="vazio">
        <span className="emoji">📡</span>{erroMsg || 'Não consegui carregar a fila.'}
        <p style={{ marginTop: 12 }}><button className="btn" onClick={carregar}>Tentar de novo</button></p>
      </div>
    )
  }

  const falhas = pendencias.filter((p) => p.fila_status === 'erro')

  return (
    <div style={{ paddingBottom: sel.size > 0 || progresso ? 100 : 0 }}>
      <p className="didatica">
        Ordem da fila: golpe → reclamação → dúvida de lead. "Está ok" libera e o motor nunca mais mexe nele.
        A ação sai na plataforma em até 1 minuto, o card avisa se falhar.
      </p>

      {falhas.length > 0 && (
        <div className="aviso" role="alert">
          ⚠️ {falhas.length} ação(ões) não foram aceitas pela plataforma, os comentários continuam como estavam lá.
          Estão marcados em vermelho abaixo (ou na aba da plataforma).
        </div>
      )}

      {fila.length === 0 ? (
        <div className="vazio"><span className="emoji">✅</span>Fila limpa, nenhum comentário esperando revisão.</div>
      ) : (
        fila.map(comEstadoReal).map((c) => (
          <CommentCard key={c.id} c={c} templates={templates} admin={admin} travado={ocupado}
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
          <h3 style={{ margin: '20px 0 4px' }}>Últimos ocultos por nós</h3>
          <p className="didatica">Nada some sem rastro: dá pra liberar qualquer um de volta.</p>
          {ocultos.map(comEstadoReal).map((c) => (
            <CommentCard key={c.id} c={c} templates={templates} admin={admin} travado={ocupado} onPatch={patch} />
          ))}
        </>
      )}
    </div>
  )
}
