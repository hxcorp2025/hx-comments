import { useEffect, useState, useCallback } from 'react'
import type { Comment, Template } from '../lib/types'
import { listFila, listUltimosOcultos, ocultarLote } from '../lib/db'
import CommentCard from '../components/CommentCard'

export default function Fila({ templates, admin }: { templates: Template[]; admin: boolean }) {
  const [fila, setFila] = useState<Comment[]>([])
  const [ocultos, setOcultos] = useState<Comment[]>([])
  const [sel, setSel] = useState<Set<number>>(new Set())
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(() => {
    listFila().then(setFila).catch(console.error)
    listUltimosOcultos().then(setOcultos).catch(console.error)
    setSel(new Set())
  }, [])
  useEffect(carregar, [carregar])

  function alternar(id: number) {
    const s = new Set(sel)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSel(s)
  }

  async function ocultarSelecionados() {
    setOcupado(true)
    try {
      await ocultarLote([...sel].slice(0, 50))
      carregar()
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div>
      <p className="didatica">
        A fila mostra o que as regras marcaram pra decisão humana (ordenada por likes — o que mais gente viu primeiro).
        "Está ok" libera e o motor nunca mais mexe nele.
      </p>
      {fila.length === 0 ? (
        <div className="vazio">
          <span className="emoji">✅</span>Fila limpa — nenhum comentário esperando revisão.
        </div>
      ) : (
        fila.map((c) => (
          <CommentCard key={c.id} c={c} templates={templates} admin={admin}
            selecionado={sel.has(c.id)} onSelecionar={() => alternar(c.id)} onMudou={carregar} />
        ))
      )}
      {sel.size > 0 && (
        <div className="bulkbar">
          <span>{sel.size} selecionado{sel.size > 1 ? 's' : ''}</span>
          <button className="btn perigo" disabled={ocupado} onClick={ocultarSelecionados}>
            Ocultar todos
          </button>
        </div>
      )}
      {ocultos.length > 0 && (
        <>
          <h3 style={{ margin: '20px 0 4px' }}>Últimos ocultos</h3>
          <p className="didatica">Nada some sem rastro: dá pra liberar qualquer um de volta.</p>
          {ocultos.map((c) => (
            <CommentCard key={c.id} c={c} templates={templates} admin={admin} onMudou={carregar} />
          ))}
        </>
      )}
    </div>
  )
}
