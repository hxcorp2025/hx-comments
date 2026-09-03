import { useEffect, useState, useCallback } from 'react'
import type { Template } from '../lib/types'
import { listTemplatesTodos, templateUpsert, templateToggle, traduzErro } from '../lib/db'

// Aba de gestão dos templates de resposta (o dropdown "escolher template aprovado…" da Fila/Feeds).
// Qualquer operador cria/edita/desativa (decisão do Matheus 24/08); tudo vai pro mod_log.
export default function Templates({ onMudou }: { onMudou: () => void }) {
  const [lista, setLista] = useState<Template[]>([])
  const [falhouCarregar, setFalhouCarregar] = useState('')
  const [erro, setErro] = useState('')
  // onde o erro aconteceu ('novo' ou id do card) — senão erro do criar aparecia dentro da edição aberta
  const [erroDe, setErroDe] = useState<'novo' | number | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [rascunhoDe, setRascunhoDe] = useState<number | null>(null)

  const [novoTitulo, setNovoTitulo] = useState(() => localStorage.getItem('hx_rascunho_tpl_titulo') ?? '')
  const [novoTexto, setNovoTexto] = useState(() => localStorage.getItem('hx_rascunho_tpl_texto') ?? '')

  const [editando, setEditando] = useState<number | null>(null)
  const [editTitulo, setEditTitulo] = useState('')
  const [editTexto, setEditTexto] = useState('')

  const carregar = useCallback(() => {
    listTemplatesTodos()
      .then((t) => { setLista(t); setFalhouCarregar('') })
      .catch((e) => setFalhouCarregar(traduzErro((e as Error)?.message ?? '')))
  }, [])
  useEffect(carregar, [carregar])

  // rascunho local: reload/desmontagem não come texto digitado (mesmo padrão das Regras)
  useEffect(() => {
    if (novoTitulo) localStorage.setItem('hx_rascunho_tpl_titulo', novoTitulo)
    else localStorage.removeItem('hx_rascunho_tpl_titulo')
  }, [novoTitulo])
  useEffect(() => {
    if (novoTexto) localStorage.setItem('hx_rascunho_tpl_texto', novoTexto)
    else localStorage.removeItem('hx_rascunho_tpl_texto')
  }, [novoTexto])

  // sem o guard de `ocupado`, duplo toque criava/salvava duas vezes
  async function agir(de: 'novo' | number, fn: () => Promise<unknown>) {
    if (ocupado) return
    setErro(''); setErroDe(null)
    setOcupado(true)
    try { await fn(); carregar(); onMudou() }
    catch (e) { setErro(e instanceof Error ? e.message : 'falhou'); setErroDe(de) }
    finally { setOcupado(false) }
  }

  async function criar() {
    await agir('novo', async () => {
      await templateUpsert(null, novoTitulo.trim(), novoTexto.trim())
      setNovoTitulo(''); setNovoTexto('')
    })
  }

  function abrirEdicao(t: Template) {
    setErro(''); setErroDe(null)
    setEditando(t.id)
    setRascunhoDe(null)
    const salvo = localStorage.getItem('hx_rascunho_tpl_' + t.id)
    if (salvo) {
      try {
        const { titulo, texto } = JSON.parse(salvo) as { titulo: string; texto: string }
        // rascunho antigo pode estar POR CIMA de edição mais nova de outro operador — avisar, não esconder
        if ((titulo ?? t.titulo) !== t.titulo || (texto ?? t.texto) !== t.texto) setRascunhoDe(t.id)
        setEditTitulo(titulo ?? t.titulo); setEditTexto(texto ?? t.texto)
        return
      } catch { /* rascunho corrompido: cai pro valor salvo */ }
    }
    setEditTitulo(t.titulo); setEditTexto(t.texto)
  }

  function descartarRascunho(t: Template) {
    localStorage.removeItem('hx_rascunho_tpl_' + t.id)
    setEditTitulo(t.titulo); setEditTexto(t.texto)
    setRascunhoDe(null)
  }

  useEffect(() => {
    if (editando === null) return
    const k = 'hx_rascunho_tpl_' + editando
    const original = lista.find((t) => t.id === editando)
    if (editTitulo !== (original?.titulo ?? '') || editTexto !== (original?.texto ?? ''))
      localStorage.setItem(k, JSON.stringify({ titulo: editTitulo, texto: editTexto }))
    else localStorage.removeItem(k)
  }, [editando, editTitulo, editTexto, lista])

  function fecharEdicao(id: number) {
    localStorage.removeItem('hx_rascunho_tpl_' + id)
    setEditando(null)
  }

  async function salvarEdicao(id: number) {
    await agir(id, async () => {
      await templateUpsert(id, editTitulo.trim(), editTexto.trim())
      fecharEdicao(id)
    })
  }

  if (falhouCarregar) {
    return (
      <div className="vazio">
        <span className="emoji">📡</span>{falhouCarregar}
        <p style={{ marginTop: 12 }}><button className="btn" onClick={carregar}>Tentar de novo</button></p>
      </div>
    )
  }

  const podeCriar = novoTitulo.trim().length >= 2 && novoTexto.trim().length >= 2

  return (
    <div>
      <div className="aviso">
        <b>O que é isso:</b> estes são os textos do dropdown "escolher template aprovado…" quando
        alguém responde um comentário na Fila / Facebook / Instagram / TikTok. A resposta sai em nome
        da <b>página</b>, então escreva como o Diego falaria. Um template vale pros 3 canais.
        Editar muda só as <b>próximas</b> respostas; desligar tira do dropdown e o servidor recusa
        template desligado (nada é apagado, dá pra religar). Toda mudança fica registrada no Log
        com seu e-mail, incluindo o texto antes/depois.
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Novo template</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input placeholder="título curto (o nome que aparece no dropdown)" maxLength={60}
            value={novoTitulo} onChange={(e) => setNovoTitulo(e.target.value)} />
          <textarea rows={3} maxLength={500}
            placeholder="texto da resposta (máx. 500 caracteres)"
            value={novoTexto} onChange={(e) => setNovoTexto(e.target.value)} />
          <div className="didatica">{novoTexto.length}/500</div>
          <div className="acoes">
            <button className="btn primario" disabled={!podeCriar || ocupado} onClick={criar}>
              Criar template
            </button>
          </div>
          {erro && erroDe === 'novo' && <p className="erro">{erro}</p>}
        </div>
      </div>

      {lista.length === 0 && (
        <div className="vazio"><span className="emoji">📝</span>Nenhum template ainda, crie o primeiro acima.</div>
      )}

      {lista.map((t) => (
        <div className="card" key={t.id}>
          <div className="meta">
            {t.ativa
              ? <span className="pill respondido">no dropdown</span>
              : <span className="pill neutro">desligado</span>}
            <span>por {t.criado_por ?? '·'}</span>
          </div>
          <p className="texto"><b>{t.titulo}</b></p>
          <p className="didatica">"{t.texto}"</p>
          <div className="acoes">
            {editando !== t.id && (
              <button className="btn" disabled={ocupado} onClick={() => abrirEdicao(t)}>Editar</button>
            )}
            <button className="btn" disabled={ocupado}
              onClick={() => agir(t.id, () => templateToggle(t.id, !t.ativa))}>
              {t.ativa ? 'Desligar' : 'Ligar'}
            </button>
          </div>

          {editando === t.id && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {rascunhoDe === t.id && (
                <div className="didatica">
                  ⚠️ <b>Rascunho local recuperado</b>, difere do que está salvo (alguém pode ter
                  editado depois de você).{' '}
                  <button className="btn" style={{ minHeight: 24, padding: '2px 8px' }}
                    onClick={() => descartarRascunho(t)}>
                    Descartar e usar o salvo
                  </button>
                </div>
              )}
              <input maxLength={60} value={editTitulo}
                onChange={(e) => setEditTitulo(e.target.value)} />
              <textarea rows={3} maxLength={500} value={editTexto}
                onChange={(e) => setEditTexto(e.target.value)} />
              <div className="didatica">{editTexto.length}/500 · a edição vale só pras próximas respostas</div>
              <div className="acoes">
                <button className="btn primario"
                  disabled={ocupado || editTitulo.trim().length < 2 || editTexto.trim().length < 2}
                  onClick={() => salvarEdicao(t.id)}>
                  Salvar
                </button>
                <button className="btn" disabled={ocupado} onClick={() => fecharEdicao(t.id)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
          {erro && erroDe === t.id && <p className="erro" style={{ marginTop: 8 }}>{erro}</p>}
        </div>
      ))}
    </div>
  )
}
