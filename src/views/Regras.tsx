import { useEffect, useState, useCallback } from 'react'
import type { Regra } from '../lib/types'
import { listRegras, regraPreview, regraUpsert, regraPromover, regraToggle, regraRespostas, traduzErro } from '../lib/db'

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
        Só depois dá pra promover a "ocultar sozinha" — e nunca com termo genérico ("pix" sozinho JAMAIS:
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
                title={r.respostas_auto ? 'essa regra responde — pare de responder antes de ocultar'
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
          </div>

          {editandoRespostas === r.id && (
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="didatica">
                <b>Resposta automática:</b> quando um comentário bater nessa regra, a Central publica
                <b> uma</b> destas versões (sorteada) como a página — e o comentário sai da fila como
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
        </div>
      ))}
    </div>
  )
}
