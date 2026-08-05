import { useEffect, useState, useCallback } from 'react'
import type { Regra } from '../lib/types'
import { listRegras, regraPreview, regraUpsert, regraPromover, regraToggle } from '../lib/db'

interface Preview { matches: number; total: number; pct: number; amostra: string[] }

export default function Regras() {
  const [regras, setRegras] = useState<Regra[]>([])
  const [termo, setTermo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(() => {
    listRegras().then(setRegras).catch(console.error)
  }, [])
  useEffect(carregar, [carregar])

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

  async function agir(fn: () => Promise<unknown>) {
    setErro('')
    try { await fn(); carregar() } catch (e) { setErro(e instanceof Error ? e.message : 'falhou') }
  }

  const podePromover = (r: Regra) =>
    r.acao === 'marcar_revisao' && Date.now() - new Date(r.editada_em).getTime() > 48 * 3600 * 1000

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
              <button className="btn perigo" disabled={!podePromover(r)}
                title={podePromover(r) ? '' : 'aguarde 48h de observação'}
                onClick={() => agir(() => regraPromover(r.id))}>
                Promover a auto-ocultar
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
