import { useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import type { Comment, Template } from '../lib/types'
import { listFila, listOcultos, listLiberados, listPendencias, ocultarLote, traduzErro } from '../lib/db'
import CommentCard from '../components/CommentCard'

type Estado = 'carregando' | 'ok' | 'erro'
type IdGrupo = 'recentes' | 'antigos' | 'ocultos' | 'liberados'

// Comentário parado na fila há mais que isso sai da lista aberta e vai pro grupo fechado.
const DIAS_RECENTE = 7

// Cabeçalho clicável que abre e fecha um grupo. Os cartões só montam com o grupo aberto:
// 200 ocultos montados de uma vez pesam no celular.
function Grupo({ titulo, sub, n, tom, aberto, onAlternar, children }: {
  titulo: string; sub: string; n: number; tom: string
  aberto: boolean; onAlternar: () => void; children: ReactNode
}) {
  return (
    <section className="grupo">
      <button className="grupo-cab" aria-expanded={aberto} onClick={onAlternar}>
        <ChevronRight size={18} className="grupo-seta" aria-hidden="true" />
        <span className="grupo-titulo">
          {titulo}
          <span className="grupo-sub">{sub}</span>
        </span>
        <span className={`pill ${tom}`}>{n}</span>
      </button>
      {aberto && <div className="grupo-corpo">{children}</div>}
    </section>
  )
}

export default function Fila({ templates, admin, onContagem }: {
  templates: Template[]; admin: boolean; onContagem: (n: number) => void
}) {
  const [fila, setFila] = useState<Comment[]>([])
  const [ocultos, setOcultos] = useState<Comment[]>([])
  const [ocultosTotal, setOcultosTotal] = useState(0)
  const [liberados, setLiberados] = useState<Comment[]>([])
  // só a fila da semana nasce aberta; o resto abre no clique
  const [abertos, setAbertos] = useState<Set<IdGrupo>>(new Set(['recentes']))
  const [pendencias, setPendencias] = useState<Comment[]>([])
  const [estado, setEstado] = useState<Estado>('carregando')
  const [erroMsg, setErroMsg] = useState('')
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [ocupado, setOcupado] = useState(false)
  const [progresso, setProgresso] = useState('')

  const carregar = useCallback(() => {
    setEstado('carregando')
    Promise.all([listFila(), listOcultos(), listLiberados(), listPendencias()])
      .then(([f, o, l, p]) => {
        setFila(f); setOcultos(o.lista); setOcultosTotal(o.total); setLiberados(l)
        setPendencias(p); setEstado('ok')
      })
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
    setLiberados((xs) => xs.map((c) => (c.id === id ? { ...c, ...p } : c)))
  }

  function abrirFechar(g: IdGrupo) {
    setAbertos((a) => { const n = new Set(a); if (n.has(g)) n.delete(g); else n.add(g); return n })
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
  const corte = Date.now() - DIAS_RECENTE * 864e5
  const eRecente = (c: Comment) => !!c.created_time && new Date(c.created_time).getTime() >= corte
  const recentes = fila.filter(eRecente)
  const antigos = fila.filter((c) => !eRecente(c))

  const cartaoFila = (c: Comment) => (
    <CommentCard key={c.id} c={c} templates={templates} admin={admin} travado={ocupado}
      selecionado={sel.has(c.id)}
      onSelecionar={c.status === 'revisao' ? () => alternar(c.id) : undefined}
      onPatch={patch} />
  )
  const cartao = (c: Comment) => (
    <CommentCard key={c.id} c={c} templates={templates} admin={admin} travado={ocupado} onPatch={patch} />
  )

  return (
    <div style={{ paddingBottom: sel.size > 0 || progresso ? 100 : 0 }}>
      <p className="didatica">
        Mais novo em cima. Fica aberto só o que chegou nos últimos {DIAS_RECENTE} dias; o resto está nos
        grupos abaixo, toca no título pra abrir. "Está ok" libera e o motor nunca mais mexe nele.
        A ação sai na plataforma em até 1 minuto, o cartão avisa se falhar.
      </p>

      {falhas.length > 0 && (
        <div className="aviso" role="alert">
          ⚠️ {falhas.length} ação(ões) não foram aceitas pela plataforma, os comentários continuam como estavam lá.
          Estão marcados em vermelho abaixo (ou na aba da plataforma).
        </div>
      )}

      <Grupo titulo={`Na fila, últimos ${DIAS_RECENTE} dias`} sub="esperando você decidir, o mais novo em cima"
        n={recentes.length} tom="revisao" aberto={abertos.has('recentes')} onAlternar={() => abrirFechar('recentes')}>
        {recentes.length === 0
          ? <p className="didatica">✅ Nada novo esperando revisão nos últimos {DIAS_RECENTE} dias.</p>
          : recentes.map(comEstadoReal).map(cartaoFila)}
      </Grupo>

      {antigos.length > 0 && (
        <Grupo titulo={`Na fila há mais de ${DIAS_RECENTE} dias`} sub="parados há tempo, o mais novo em cima"
          n={antigos.length} tom="revisao" aberto={abertos.has('antigos')} onAlternar={() => abrirFechar('antigos')}>
          {antigos.map(comEstadoReal).map(cartaoFila)}
        </Grupo>
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

      <Grupo titulo="Já ocultados" sub="pelo motor ou por nós, o ocultado mais recente em cima"
        n={ocultosTotal} tom="oculto_manual" aberto={abertos.has('ocultos')} onAlternar={() => abrirFechar('ocultos')}>
        <p className="didatica">Nada some sem rastro: dá pra liberar qualquer um de volta.</p>
        {ocultos.map(comEstadoReal).map(cartao)}
        {ocultosTotal > ocultos.length && (
          <p className="didatica">
            Mostrando os {ocultos.length} mais recentes de {ocultosTotal}. Pra achar um mais antigo, use a busca
            na aba da plataforma com o filtro de status de oculto.
          </p>
        )}
      </Grupo>

      <Grupo titulo="Já liberados" sub={'marcados como "está ok", o motor não mexe mais neles'}
        n={liberados.length} tom="liberado" aberto={abertos.has('liberados')} onAlternar={() => abrirFechar('liberados')}>
        {liberados.length === 0
          ? <p className="didatica">Nenhum comentário liberado ainda.</p>
          : liberados.map(comEstadoReal).map(cartao)}
      </Grupo>
    </div>
  )
}
