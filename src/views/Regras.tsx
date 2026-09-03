import { useEffect, useState, useCallback } from 'react'
import type { Regra } from '../lib/types'
import { listRegras, regraPreview, regraUpsert, regraPromover, regraToggle, regraRespostas, regraDm, regraRespostasIg, ttBwList, ttBwSolicitar, traduzErro } from '../lib/db'

interface Preview { matches: number; total: number; pct: number; amostra: string[] }

export default function Regras() {
  const [regras, setRegras] = useState<Regra[]>([])
  const [termo, setTermo] = useState(() => localStorage.getItem('hx_rascunho_regra_termo') ?? '')
  const [descricao, setDescricao] = useState(() => localStorage.getItem('hx_rascunho_regra_desc') ?? '')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [erro, setErro] = useState('')
  const [falhouCarregar, setFalhouCarregar] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [editandoRespostas, setEditandoRespostas] = useState<number | null>(null)
  const [draft, setDraft] = useState<string[]>(['', '', ''])

  function abrirEditorRespostas(r: Regra) {
    setErro('')
    setEditandoRespostas(r.id)
    // rascunho local vence: recuperação de texto perdido por reload/desmontagem
    const salvo = localStorage.getItem('hx_rascunho_resp_' + r.id)
    if (salvo) {
      try {
        const arr = JSON.parse(salvo) as string[]
        setDraft([arr[0] ?? '', arr[1] ?? '', arr[2] ?? ''])
        return
      } catch { /* rascunho corrompido: cai pro valor salvo da regra */ }
    }
    const v = r.respostas_auto ?? []
    setDraft([v[0] ?? '', v[1] ?? '', v[2] ?? ''])
  }

  useEffect(() => {
    if (editandoRespostas === null) return
    const k = 'hx_rascunho_resp_' + editandoRespostas
    if (draft.some((d) => d.trim())) localStorage.setItem(k, JSON.stringify(draft))
    else localStorage.removeItem(k)
  }, [editandoRespostas, draft])

  function fecharEditorRespostas(id: number) {
    localStorage.removeItem('hx_rascunho_resp_' + id)
    setEditandoRespostas(null)
  }

  async function salvarRespostas(id: number) {
    const versoes = draft.map((d) => d.trim()).filter((d) => d.length >= 2)
    if (versoes.length === 0) { setErro('escreva pelo menos 1 resposta (mín. 2 caracteres)'); return }
    await agir(async () => { await regraRespostas(id, versoes); fecharEditorRespostas(id) })
  }

  const [editandoDm, setEditandoDm] = useState<number | null>(null)
  const [draftDm, setDraftDm] = useState<string[]>(['', '', ''])

  function abrirEditorDm(r: Regra) {
    setErro('')
    setEditandoDm(r.id)
    const salvo = localStorage.getItem('hx_rascunho_dm_' + r.id)
    if (salvo) {
      try {
        const arr = JSON.parse(salvo) as string[]
        setDraftDm([arr[0] ?? '', arr[1] ?? '', arr[2] ?? ''])
        return
      } catch { /* rascunho corrompido: cai pro valor salvo */ }
    }
    const v = r.dm_respostas ?? []
    setDraftDm([v[0] ?? '', v[1] ?? '', v[2] ?? ''])
  }

  useEffect(() => {
    if (editandoDm === null) return
    const k = 'hx_rascunho_dm_' + editandoDm
    if (draftDm.some((d) => d.trim())) localStorage.setItem(k, JSON.stringify(draftDm))
    else localStorage.removeItem(k)
  }, [editandoDm, draftDm])

  function fecharEditorDm(id: number) {
    localStorage.removeItem('hx_rascunho_dm_' + id)
    setEditandoDm(null)
  }

  async function salvarDm(id: number) {
    const versoes = draftDm.map((d) => d.trim()).filter((d) => d.length >= 2)
    if (versoes.length === 0) { setErro('escreva pelo menos 1 DM (mín. 2 caracteres)'); return }
    await agir(async () => { await regraDm(id, versoes); fecharEditorDm(id) })
  }

  const [editandoIg, setEditandoIg] = useState<number | null>(null)
  const [draftIg, setDraftIg] = useState<string[]>(['', '', ''])

  function abrirEditorIg(r: Regra) {
    setErro('')
    setEditandoIg(r.id)
    const salvo = localStorage.getItem('hx_rascunho_ig_' + r.id)
    if (salvo) {
      try {
        const arr = JSON.parse(salvo) as string[]
        setDraftIg([arr[0] ?? '', arr[1] ?? '', arr[2] ?? ''])
        return
      } catch { /* rascunho corrompido: cai pro valor salvo */ }
    }
    const v = r.respostas_auto_ig ?? []
    setDraftIg([v[0] ?? '', v[1] ?? '', v[2] ?? ''])
  }

  useEffect(() => {
    if (editandoIg === null) return
    const k = 'hx_rascunho_ig_' + editandoIg
    if (draftIg.some((d) => d.trim())) localStorage.setItem(k, JSON.stringify(draftIg))
    else localStorage.removeItem(k)
  }, [editandoIg, draftIg])

  function fecharEditorIg(id: number) {
    localStorage.removeItem('hx_rascunho_ig_' + id)
    setEditandoIg(null)
  }

  async function salvarIg(id: number) {
    const versoes = draftIg.map((d) => d.trim()).filter((d) => d.length >= 2)
    if (versoes.length === 0) { setErro('escreva pelo menos 1 versão (mín. 2 caracteres)'); return }
    await agir(async () => { await regraRespostasIg(id, versoes); fecharEditorIg(id) })
  }

  const carregar = useCallback(() => {
    listRegras()
      .then((r) => { setRegras(r); setFalhouCarregar('') })
      .catch((e) => setFalhouCarregar(traduzErro(e?.message ?? '')))
  }, [])
  useEffect(carregar, [carregar])

  useEffect(() => {
    if (termo) localStorage.setItem('hx_rascunho_regra_termo', termo)
    else localStorage.removeItem('hx_rascunho_regra_termo')
  }, [termo])
  useEffect(() => {
    if (descricao) localStorage.setItem('hx_rascunho_regra_desc', descricao)
    else localStorage.removeItem('hx_rascunho_regra_desc')
  }, [descricao])

  async function verPreview() {
    setErro('')
    setOcupado(true)
    try {
      setPreview((await regraPreview(termo)) as Preview)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falhou')
    } finally {
      setOcupado(false)
    }
  }

  async function criar() {
    setErro('')
    setOcupado(true)
    try {
      await regraUpsert(null, termo, descricao, ['fb', 'ig', 'tiktok'])
      setTermo(''); setDescricao(''); setPreview(null)
      carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'falhou')
    } finally {
      setOcupado(false)
    }
  }

  // sem o guard de `ocupado`, duplo toque promovia a regra duas vezes
  async function agir(fn: () => Promise<unknown>) {
    if (ocupado) return
    setErro('')
    setOcupado(true)
    try { await fn(); carregar() }
    catch (e) { setErro(e instanceof Error ? e.message : 'falhou') }
    finally { setOcupado(false) }
  }

  const podePromover = (r: Regra) =>
    r.acao === 'marcar_revisao' && Date.now() - new Date(r.editada_em).getTime() > 48 * 3600 * 1000

  if (falhouCarregar) {
    return (
      <div className="vazio">
        <span className="emoji">📡</span>{falhouCarregar}
        <p style={{ marginTop: 12 }}><button className="btn" onClick={carregar}>Tentar de novo</button></p>
      </div>
    )
  }

  return (
    <div>
      <div className="aviso">
        <b>Como funciona:</b> toda regra nova nasce como "marcar pra revisão" e fica 48h em observação.
        Só depois dá pra promover a "ocultar sozinha", e nunca com termo genérico ("pix" sozinho JAMAIS:
        pix é o produto, "fiz o pix e ganhei" é prova social).
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 8 }}>Nova regra</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input placeholder="termo ou regex (aplicado sem acento/maiúscula)" value={termo} onChange={(e) => setTermo(e.target.value)} />
          <input placeholder="descrição (o que ela pega)" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          <div className="acoes">
            <button className="btn" disabled={!termo || ocupado} onClick={verPreview}>Testar (preview)</button>
            <button className="btn primario" disabled={!termo || !descricao || ocupado} onClick={criar}>Criar em observação</button>
          </div>
          {preview && (
            <div className="didatica">
              Bateria em <b>{preview.matches}</b> de {preview.total} ({preview.pct}%).
              {preview.amostra.length > 0 && (
                <ul style={{ margin: '6px 0 0 18px' }}>
                  {preview.amostra.map((a, i) => <li key={i}>"{a}"</li>)}
                </ul>
              )}
            </div>
          )}
          {erro && <p className="erro">{erro}</p>}
        </div>
      </div>

      {regras.map((r) => (
        <div className="card" key={r.id}>
          <div className="meta">
            <span className={`pill ${r.acao === 'auto_ocultar' ? 'golpe' : 'revisao'}`}>
              {r.acao === 'auto_ocultar' ? 'oculta sozinha' : 'marca pra revisão'}
            </span>
            {r.respostas_auto && (
              <span className="pill respondido">responde sozinha ({r.respostas_auto.length} versõe{r.respostas_auto.length > 1 ? 's' : ''})</span>
            )}
            {r.dm_respostas && (
              <span className="pill ig">DM no IG ({r.dm_respostas.length})</span>
            )}
            {r.respostas_auto_ig && (
              <span className="pill ig">IG sem link ({r.respostas_auto_ig.length})</span>
            )}
            {!r.ativa && <span className="pill neutro">desligada</span>}
            <span>por {r.criada_por}</span>
          </div>
          <p className="texto"><code>{r.termo}</code></p>
          <p className="didatica">{r.descricao}</p>
          <div className="acoes">
            <button className="btn" onClick={() => agir(() => regraToggle(r.id, !r.ativa))}>
              {r.ativa ? 'Desligar' : 'Ligar'}
            </button>
            {r.acao === 'marcar_revisao' && (
              <button className="btn perigo" disabled={!podePromover(r) || !!r.respostas_auto}
                title={r.respostas_auto ? 'essa regra responde, pare de responder antes de ocultar'
                       : podePromover(r) ? '' : 'aguarde 48h de observação'}
                onClick={() => agir(() => regraPromover(r.id))}>
                Promover a auto-ocultar
              </button>
            )}
            {r.acao === 'marcar_revisao' && !r.respostas_auto && editandoRespostas !== r.id && (
              <button className="btn" onClick={() => abrirEditorRespostas(r)}>
                Criar resposta automática
              </button>
            )}
            {r.respostas_auto && editandoRespostas !== r.id && (
              <>
                <button className="btn" onClick={() => abrirEditorRespostas(r)}>Editar respostas</button>
                <button className="btn" onClick={() => agir(() => regraRespostas(r.id, null))}>
                  Parar de responder
                </button>
              </>
            )}
            {r.respostas_auto && !r.dm_respostas && editandoDm !== r.id && (
              <button className="btn" onClick={() => abrirEditorDm(r)}>Criar DM (IG)</button>
            )}
            {r.dm_respostas && editandoDm !== r.id && (
              <>
                <button className="btn" onClick={() => abrirEditorDm(r)}>Editar DM</button>
                <button className="btn" onClick={() => agir(() => regraDm(r.id, null))}>Parar DM</button>
              </>
            )}
            {r.respostas_auto && !r.respostas_auto_ig && editandoIg !== r.id && (
              <button className="btn" onClick={() => abrirEditorIg(r)}>Versão IG (sem link)</button>
            )}
            {r.respostas_auto_ig && editandoIg !== r.id && (
              <>
                <button className="btn" onClick={() => abrirEditorIg(r)}>Editar versão IG</button>
                <button className="btn" onClick={() => agir(() => regraRespostasIg(r.id, null))}>Usar base no IG</button>
              </>
            )}
          </div>

          {editandoRespostas === r.id && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="didatica">
                <b>Resposta automática:</b> quando um comentário bater nessa regra, a Central publica
                <b> uma</b> destas versões (sorteada) como a página, e o comentário sai da fila como
                "respondido". Até 3 versões pra não parecer robô; máx. 500 caracteres cada.
                Escrever/editar é do admin; <b>qualquer operador</b> pode "Parar de responder".
              </div>
              {[0, 1, 2].map((i) => (
                <textarea key={i} rows={2} maxLength={500}
                  placeholder={`versão ${i + 1}${i > 0 ? ' (opcional)' : ''}`}
                  value={draft[i]}
                  onChange={(e) => setDraft((d) => d.map((v, j) => (j === i ? e.target.value : v)))} />
              ))}
              <div className="acoes">
                <button className="btn primario" disabled={ocupado} onClick={() => salvarRespostas(r.id)}>
                  Salvar respostas
                </button>
                <button className="btn" disabled={ocupado} onClick={() => fecharEditorRespostas(r.id)}>
                  Cancelar
                </button>
              </div>
              {erro && editandoRespostas === r.id && <p className="erro">{erro}</p>}
            </div>
          )}

          {editandoDm === r.id && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="didatica">
                <b>DM automático (só Instagram):</b> além da resposta pública, a Central manda
                <b> uma</b> destas versões no direct de quem comentou (sorteada). Se a pessoa
                responder, a conversa segue no <b>Direct da página</b> e o time responde por lá.
                Máx. 1 DM por pessoa por dia; escrever é do admin; qualquer operador pode "Parar DM".
              </div>
              {[0, 1, 2].map((i) => (
                <textarea key={i} rows={2} maxLength={500}
                  placeholder={`DM versão ${i + 1}${i > 0 ? ' (opcional)' : ''}`}
                  value={draftDm[i]}
                  onChange={(e) => setDraftDm((d) => d.map((v, j) => (j === i ? e.target.value : v)))} />
              ))}
              <div className="acoes">
                <button className="btn primario" disabled={ocupado} onClick={() => salvarDm(r.id)}>
                  Salvar DM
                </button>
                <button className="btn" disabled={ocupado} onClick={() => fecharEditorDm(r.id)}>
                  Cancelar
                </button>
              </div>
              {erro && editandoDm === r.id && <p className="erro">{erro}</p>}
            </div>
          )}

          {editandoIg === r.id && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="didatica">
                <b>Versão IG (sem link):</b> no Instagram, link em comentário não clica e a URL crua
                fica feia. Estas versões substituem as respostas base SÓ no IG, sem link (o link
                clicável vai no DM). No Facebook segue valendo a versão base, com link.
              </div>
              {[0, 1, 2].map((i) => (
                <textarea key={i} rows={2} maxLength={500}
                  placeholder={`versão IG ${i + 1}${i > 0 ? ' (opcional)' : ''}, sem link`}
                  value={draftIg[i]}
                  onChange={(e) => setDraftIg((d) => d.map((v, j) => (j === i ? e.target.value : v)))} />
              ))}
              <div className="acoes">
                <button className="btn primario" disabled={ocupado} onClick={() => salvarIg(r.id)}>
                  Salvar versão IG
                </button>
                <button className="btn" disabled={ocupado} onClick={() => fecharEditorIg(r.id)}>
                  Cancelar
                </button>
              </div>
              {erro && editandoIg === r.id && <p className="erro">{erro}</p>}
            </div>
          )}
        </div>
      ))}

      <BlockedTikTok />
    </div>
  )
}

// ===== Palavras bloqueadas do TikTok (nível de conta — segura o comentário ANTES de publicar) =====
function BlockedTikTok() {
  const [palavras, setPalavras] = useState<string[]>([])
  const [pendentes, setPendentes] = useState<{ acao: string; palavras: string[]; status: string; erro: string | null }[]>([])
  const [novo, setNovo] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(() => {
    ttBwList().then((r) => {
      if (!r.ok) { setErro(r.erro ?? 'não consegui carregar'); return }
      setPalavras(r.palavras ?? [])
      setPendentes(r.pendentes ?? [])
    }).catch((e) => setErro(traduzErro((e as Error).message)))
  }, [])
  useEffect(carregar, [carregar])

  async function pedir(acao: 'create' | 'delete', lista: string[]) {
    if (ocupado) return
    setErro('')
    setOcupado(true)
    try {
      const r = await ttBwSolicitar(acao, lista)
      if (!r.ok) throw new Error(r.erro ?? 'falhou')
      if (acao === 'create') setNovo('')
      carregar()
    } catch (e) { setErro((e as Error).message) }
    finally { setOcupado(false) }
  }

  return (
    <div className="card" style={{ marginTop: 24 }}>
      <b>🚫 TikTok · palavras bloqueadas</b>
      <p className="didatica" style={{ margin: '6px 0 10px' }}>
        Vale pra conta INTEIRA de anúncios do TikTok (pega Smart+): comentário com uma dessas
        palavras é segurado <b>antes de aparecer pro público</b>. Mudanças aplicam em até 1 minuto.
        Só o admin adiciona/remove, é a conta do cliente.
      </p>

      {erro && <div className="aviso" role="alert">{erro}</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <input style={{ flex: 1, minWidth: 220 }} value={novo} disabled={ocupado}
          placeholder="Palavras separadas por vírgula (ex.: golpe, fraude, calote)"
          onChange={(e) => setNovo(e.target.value)} />
        <button className="btn primario" disabled={ocupado || novo.trim().length < 2}
          onClick={() => pedir('create', novo.split(/[,;\n]/))}>
          Bloquear
        </button>
      </div>

      {pendentes.length > 0 && (
        <p className="didatica" style={{ margin: '0 0 8px' }}>
          ⏳ {pendentes.map((p, i) => (
            <span key={i}>
              {p.status === 'erro' ? '⚠️ falhou' : p.status === 'feito' ? '✓' : 'aplicando'}
              {' '}{p.acao === 'create' ? 'bloquear' : 'liberar'}: {p.palavras.join(', ')}
              {p.erro ? ` (${p.erro})` : ''}{i < pendentes.length - 1 ? ' · ' : ''}
            </span>
          ))}
        </p>
      )}

      {palavras.length === 0 ? (
        <p className="didatica" style={{ margin: 0 }}>Nenhuma palavra bloqueada ainda.</p>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {palavras.map((p) => (
            <span key={p} className="pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {p}
              <button className="btn" style={{ minHeight: 20, padding: '0 6px' }} disabled={ocupado}
                title="Liberar a palavra" onClick={() => pedir('delete', [p])}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
