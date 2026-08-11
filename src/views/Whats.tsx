import { useEffect, useState, useCallback } from 'react'
import {
  waFila, waThread, waResponder, waSugestao, waRegras, waRegraUpsert,
  waEnviando, waFalhas, waReenfileirar,
  type WaConversa, type WaMsg, type WaRegra, type WaEnviando, type WaFalha,
} from '../lib/waDb'
import { traduzErro } from '../lib/db'
import { sb } from '../lib/supabase'

// placeholder "(image)" da fila vira rótulo legível
const MIDIA_ROTULO: Record<string, string> = {
  '(image)': '📷 Foto', '(sticker)': '💟 Figurinha', '(audio)': '🎙️ Áudio',
  '(video)': '🎬 Vídeo', '(document)': '📄 Documento', '(reaction)': '👍 Reação',
  '(unsupported)': '(mensagem não suportada)',
}

// arquivo mora no bucket PRIVADO wa-media; o navegador só enxerga via URL assinada
// de 1h, e só operador logado consegue gerar (política do storage)
function MidiaMsg({ m }: { m: WaMsg }) {
  const [url, setUrl] = useState<string | null>(null)
  const [falhou, setFalhou] = useState(false)
  useEffect(() => {
    if (m.midia_status !== 'ok' || !m.midia_path) return
    // painel fica aberto o dia todo: renova a URL assinada aos 50 min (validade 1h)
    // e um blip de rede não deixa a mídia quebrada pra sempre
    let vivo = true
    const gerar = () => sb.storage.from('wa-media')
      .createSignedUrl(m.midia_path!, 3600,
        m.tipo === 'document' ? { download: m.midia_nome ?? true } : undefined)
      .then(({ data, error }) => {
        if (!vivo) return
        if (error || !data) setFalhou(true)
        else { setFalhou(false); setUrl(data.signedUrl) }
      })
      .catch(() => { if (vivo) setFalhou(true) })
    gerar()
    const t = setInterval(gerar, 50 * 60 * 1000)
    return () => { vivo = false; clearInterval(t) }
  }, [m.midia_status, m.midia_path])

  if (m.midia_status !== 'ok') {
    return <i className="didatica">{m.midia_status === 'erro' || m.midia_status === 'vencido'
      ? '⚠️ mídia indisponível' : '⏳ mídia chegando (até 1 min)…'}</i>
  }
  if (falhou) return <i className="didatica">⚠️ não consegui abrir a mídia</i>
  if (!url) return <i className="didatica">abrindo…</i>
  return (
    <span style={{ display: 'inline-block', maxWidth: 280, verticalAlign: 'top' }}>
      {(m.tipo === 'image' || m.tipo === 'sticker') && (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={m.midia_caption ?? 'imagem recebida'}
            style={{ maxWidth: m.tipo === 'sticker' ? 120 : 240, borderRadius: 8, display: 'block' }} />
        </a>
      )}
      {m.tipo === 'audio' && <audio controls src={url} style={{ maxWidth: 280 }} />}
      {m.tipo === 'video' && <video controls src={url} style={{ maxWidth: 280, borderRadius: 8 }} />}
      {m.tipo === 'document' && (
        <a href={url} target="_blank" rel="noreferrer">📄 {m.midia_nome ?? 'documento'}</a>
      )}
      {m.midia_caption && <span style={{ display: 'block', marginTop: 4 }}>{m.midia_caption}</span>}
    </span>
  )
}

type Estado = 'carregando' | 'ok' | 'erro'

// chave de conversa = número nosso × cliente
const chave = (c: WaConversa) => `${c.phone_id}|${c.fone_key}`

// cor do relógio da janela: <4h vermelho, <8h amarelo (mesma régua do dash 24)
function corJanela(c: WaConversa): string {
  if (c.janela === 'fechada') return 'var(--cinza, #8a8f98)'
  if (c.fecha_em_h !== null && c.fecha_em_h < 4) return '#e5484d'
  if (c.fecha_em_h !== null && c.fecha_em_h < 8) return '#f5a623'
  return '#30a46c'
}

export default function Whats({ admin, onContagem }: { admin: boolean; onContagem: (n: number) => void }) {
  const [conversas, setConversas] = useState<WaConversa[]>([])
  const [estado, setEstado] = useState<Estado>('carregando')
  const [erroMsg, setErroMsg] = useState('')
  const [aberta, setAberta] = useState<string | null>(null)
  const [thread, setThread] = useState<WaMsg[]>([])
  const [threadErro, setThreadErro] = useState('')
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [aviso, setAviso] = useState('')
  const [verRegras, setVerRegras] = useState(false)
  const [numFiltro, setNumFiltro] = useState<'todos' | '0646' | '0640'>('todos')
  const [aCaminho, setACaminho] = useState<WaEnviando[]>([])
  const [falhas, setFalhas] = useState<WaFalha[]>([])

  const carregar = useCallback(() => {
    setEstado('carregando')
    Promise.all([waFila(), waEnviando(), waFalhas()])
      .then(([f, ec, fl]) => { setConversas(f); setACaminho(ec); setFalhas(fl); setEstado('ok') })
      .catch((e) => { setErroMsg(traduzErro(e?.message ?? '')); setEstado('erro') })
  }, [])
  useEffect(carregar, [carregar])

  // badge = só o que precisa de AÇÃO: janela aberta, fora do controle, com msg pendente
  useEffect(() => {
    onContagem(conversas.filter((c) => c.janela === 'aberta' && !c.grupo_controle && c.pendentes > 0).length)
  }, [conversas, onContagem])

  // a fila muda por fora (webhook, worker) — repesca a cada 30s,
  // PAUSADO enquanto houver conversa aberta (refetch desmontaria o card e comeria o texto digitado)
  useEffect(() => {
    if (estado !== 'ok' || aberta !== null) return
    const t = setInterval(() => {
      Promise.all([waFila(), waEnviando(), waFalhas()])
        .then(([f, ec, fl]) => { setConversas(f); setACaminho(ec); setFalhas(fl) })
        .catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [estado, aberta])

  useEffect(() => {
    if (!aberta) return
    const k = 'hx_rascunho_wa_' + aberta
    if (texto.trim()) sessionStorage.setItem(k, texto)
    else sessionStorage.removeItem(k)
  }, [aberta, texto])

  function abrir(c: WaConversa) {
    const k = chave(c)
    if (aberta === k) { setAberta(null); return }
    setAberta(k)
    // rascunho por conversa: texto digitado sobrevive a reload/troca de conversa
    setTexto(sessionStorage.getItem('hx_rascunho_wa_' + k) ?? '')
    setThread([])
    setThreadErro('')
    waThread(c.phone_id, c.fone_key)
      .then((t) => setThread([...t].reverse()))   // banco manda desc; conversa lê de cima pra baixo
      .catch((e) => setThreadErro(traduzErro(e?.message ?? '')))
  }

  async function enviar(c: WaConversa) {
    if (ocupado || texto.trim().length < 2) return
    setOcupado(true)
    setAviso('')
    try {
      await waResponder(c.phone_id, c.wa_id, texto.trim())
      sessionStorage.removeItem('hx_rascunho_wa_' + chave(c))
      setTexto('')
      setAviso('Na fila de envio — sai em até 1 min. A conversa some da fila quando o envio confirmar.')
      // otimismo: some da fila local; o refresh de 30s corrige se o worker falhar
      setConversas((xs) => xs.filter((x) => chave(x) !== chave(c)))
      setAberta(null)
      setTimeout(() => setAviso(''), 6000)
    } catch (e) {
      setAviso((e as Error)?.message ?? 'falhou')
    } finally {
      setOcupado(false)
    }
  }

  async function sugestao(c: WaConversa, acao: 'aprovar' | 'descartar') {
    if (ocupado || c.sugestao_id === null) return
    setOcupado(true)
    setAviso('')
    try {
      await waSugestao(c.sugestao_id, acao)
      if (acao === 'aprovar') {
        setAviso('Aprovada — o robô envia em até 1 min.')
        setConversas((xs) => xs.filter((x) => chave(x) !== chave(c)))
      } else {
        setConversas((xs) => xs.map((x) => chave(x) === chave(c)
          ? { ...x, sugestao_id: null, sugestao_corpo: null, sugestao_regra: null } : x))
      }
      setTimeout(() => setAviso(''), 6000)
    } catch (e) {
      setAviso((e as Error)?.message ?? 'falhou')
    } finally {
      setOcupado(false)
    }
  }

  if (estado === 'carregando') return <p className="didatica">carregando as conversas…</p>
  if (estado === 'erro') {
    return (
      <div className="vazio">
        <span className="emoji">📡</span>{erroMsg || 'Não consegui carregar as conversas.'}
        <p style={{ marginTop: 12 }}><button className="btn" onClick={carregar}>Tentar de novo</button></p>
      </div>
    )
  }

  return (
    <div>
      <p className="didatica">
        Conversas dos números do Sortudão esperando resposta nossa. O WhatsApp só deixa responder
        texto livre por <b>24h depois da última mensagem do cliente</b> — o relógio "fecha em" é isso.
        Resposta sai do MESMO número que a pessoa chamou, em até 1 min.
        Conversa marcada <b>controle</b> faz parte do teste do funil: não responder.
      </p>

      {aviso && <div className="aviso" role="status">{aviso}</div>}

      <p style={{ margin: '10px 0', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn" onClick={() => setVerRegras(!verRegras)}>
          {verRegras ? '← Voltar pra fila' : `⚙️ Regras automáticas`}
        </button>
        {!verRegras && (['todos', '0646', '0640'] as const).map((n) => (
          <button key={n} className={`btn ${numFiltro === n ? 'primario' : ''}`}
            onClick={() => setNumFiltro(n)}>
            {n === 'todos' ? 'Todos' : n === '0646' ? '0646 atendimento' : '0640 disparo'}
          </button>
        ))}
      </p>

      {!verRegras && falhas.length > 0 && (
        <div className="aviso" role="alert">
          🔴 <b>{falhas.length} resposta(s) NÃO saíram</b> — o cliente não recebeu:
          {falhas.map((f) => (
            <p key={f.id} style={{ margin: '6px 0 0' }}>
              {f.cliente}: “{f.corpo.slice(0, 60)}{f.corpo.length > 60 ? '…' : ''}” <i>({f.erro})</i>{' '}
              <button className="btn" disabled={ocupado}
                onClick={async () => { setOcupado(true); try { await waReenfileirar(f.id); carregar() } catch (e) { setAviso((e as Error).message) } finally { setOcupado(false) } }}>
                Tentar de novo
              </button>
            </p>
          ))}
        </div>
      )}

      {!verRegras && aCaminho.length > 0 && (
        <p className="didatica">
          📤 {aCaminho.length} resposta(s) a caminho (o robô envia em até 1 min): {aCaminho.map((e) => e.cliente).join(' · ')}
        </p>
      )}

      {verRegras ? (
        <RegrasWa admin={admin} />
      ) : conversas.length === 0 ? (
        <div className="vazio"><span className="emoji">✅</span>Nenhuma conversa esperando resposta.</div>
      ) : (
        conversas
          .filter((c) => numFiltro === 'todos'
            || (numFiltro === '0646' && c.phone_id === '1208116992388134')
            || (numFiltro === '0640' && c.phone_id === '1144206475452073'))
          .map((c) => {
          const k = chave(c)
          const abertaAqui = aberta === k
          return (
            <div className="card" key={k} style={{ borderLeft: `3px solid ${corJanela(c)}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <span>
                  <b>{c.cliente}</b>{' '}
                  <span className="pill">{c.numero_nosso}</span>{' '}
                  {c.pendentes > 1 && <span className="pill">{c.pendentes} msgs</span>}{' '}
                  {c.grupo_controle && <span className="pill" style={{ background: '#5b2333', color: '#ffb1c1' }}>controle: NÃO responder</span>}
                </span>
                <span style={{ color: corJanela(c), fontVariantNumeric: 'tabular-nums' }}>
                  {c.janela === 'aberta'
                    ? `fecha em ${c.fecha_em_h?.toFixed(1)} h`
                    : 'janela fechada (só template)'}
                </span>
              </div>

              <p style={{ margin: '8px 0', whiteSpace: 'pre-wrap' }}>{MIDIA_ROTULO[c.ultima_mensagem] ?? c.ultima_mensagem}</p>
              <p className="didatica" style={{ margin: 0 }}>
                esperando há {c.esperando_h.toFixed(1)} h
              </p>

              {c.sugestao_id !== null && !c.grupo_controle && (
                <div className="aviso" style={{ marginTop: 8 }}>
                  💡 Regra <b>{c.sugestao_regra}</b> sugere: “{c.sugestao_corpo}”
                  <p style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button className="btn primario" disabled={ocupado} onClick={() => sugestao(c, 'aprovar')}>Enviar essa</button>
                    <button className="btn" disabled={ocupado} onClick={() => sugestao(c, 'descartar')}>Descartar</button>
                  </p>
                </div>
              )}

              <p style={{ marginTop: 8 }}>
                <button className="btn" onClick={() => abrir(c)}>
                  {abertaAqui ? 'Fechar' : 'Ver conversa e responder'}
                </button>
              </p>

              {abertaAqui && (
                <div style={{ marginTop: 8, borderTop: '1px solid var(--linha, #333)', paddingTop: 8 }}>
                  {threadErro && <p className="didatica">{threadErro}</p>}
                  {thread.map((m, i) => (
                    <p key={i} style={{
                      margin: '6px 0', whiteSpace: 'pre-wrap',
                      textAlign: m.direcao === 'out' ? 'right' : 'left',
                      opacity: m.direcao === 'out' ? 0.85 : 1,
                    }}>
                      <span className="pill">{m.direcao === 'out' ? (m.operador ?? 'nós') : c.cliente}</span>{' '}
                      {m.midia_path ? <MidiaMsg m={m} /> : (MIDIA_ROTULO[m.corpo] ?? m.corpo)}
                    </p>
                  ))}

                  {c.grupo_controle ? (
                    <p className="didatica">Grupo controle — o envio fica bloqueado de propósito.</p>
                  ) : c.janela === 'fechada' ? (
                    <p className="didatica">Janela de 24h fechada — responder de novo só com template aprovado (em breve).</p>
                  ) : (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <textarea
                        value={texto}
                        onChange={(e) => setTexto(e.target.value)}
                        placeholder="Escreve a resposta…"
                        rows={2}
                        style={{ flex: 1 }}
                        disabled={ocupado}
                      />
                      <button className="btn primario" disabled={ocupado || texto.trim().length < 2}
                        onClick={() => enviar(c)}>
                        Enviar
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}

// ===== Regras automáticas do WhatsApp =====
function RegrasWa({ admin }: { admin: boolean }) {
  const [regras, setRegras] = useState<WaRegra[]>([])
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [nome, setNome] = useState('')
  const [gatilho, setGatilho] = useState('')
  const [resposta, setResposta] = useState('')
  const [modo, setModo] = useState<'sugerir' | 'auto'>('sugerir')

  const carregar = useCallback(() => {
    waRegras().then(setRegras).catch((e) => setErro(traduzErro(e?.message ?? '')))
  }, [])
  useEffect(carregar, [carregar])

  async function agir(fn: () => Promise<unknown>) {
    if (ocupado) return
    setErro('')
    setOcupado(true)
    try { await fn(); carregar() }
    catch (e) { setErro((e as Error)?.message ?? 'falhou') }
    finally { setOcupado(false) }
  }

  return (
    <div>
      <p className="didatica">
        Regra casa quando a mensagem do cliente <b>contém</b> o gatilho (sem diferenciar acento/maiúscula).
        <b> Sugerir</b> = aparece na fila com botão de 1 clique · <b>Auto</b> = o robô envia sozinho
        (só no 0646, e só o Matheus liga). Mensagem que fala de <b>dinheiro, compra, pix ou golpe NUNCA
        recebe resposta automática</b> — vai pra fila humana sempre, mesmo casando regra.
      </p>

      {erro && <div className="aviso" role="alert">{erro}</div>}

      <div className="card">
        <b>Nova regra</b>
        <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
          <input placeholder="Nome (ex.: saudação)" value={nome} onChange={(e) => setNome(e.target.value)} />
          <input placeholder="Gatilho (ex.: horário do sorteio)" value={gatilho} onChange={(e) => setGatilho(e.target.value)} />
          <textarea placeholder="Resposta que sai pro cliente" rows={2} value={resposta} onChange={(e) => setResposta(e.target.value)} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label><input type="radio" checked={modo === 'sugerir'} onChange={() => setModo('sugerir')} /> Sugerir</label>
            <label title={admin ? '' : 'Só o admin liga o modo auto'}>
              <input type="radio" checked={modo === 'auto'} disabled={!admin} onChange={() => setModo('auto')} /> Auto (0646)
            </label>
            <button className="btn primario" disabled={ocupado || !nome || !gatilho || resposta.length < 2}
              onClick={() => agir(async () => {
                await waRegraUpsert({ id: null, nome, gatilho, resposta, modo, tipo: 'contem', phoneId: null, ativo: true })
                setNome(''); setGatilho(''); setResposta(''); setModo('sugerir')
              })}>
              Criar
            </button>
          </div>
        </div>
      </div>

      {regras.map((r) => (
        <div className="card" key={r.id} style={{ opacity: r.ativo ? 1 : 0.55 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
            <span>
              <b>{r.nome}</b>{' '}
              <span className="pill">{r.modo === 'auto' ? '🤖 auto' : '💡 sugerir'}</span>{' '}
              {r.hits > 0 && <span className="pill">{r.hits} uso{r.hits > 1 ? 's' : ''}</span>}
            </span>
            <button className="btn" disabled={ocupado}
              onClick={() => agir(() => waRegraUpsert({
                id: r.id, nome: r.nome, gatilho: r.gatilho, resposta: r.resposta,
                modo: r.modo, tipo: r.tipo, phoneId: r.phone_id, ativo: !r.ativo,
              }))}>
              {r.ativo ? 'Desativar' : 'Reativar'}
            </button>
          </div>
          <p className="didatica" style={{ margin: '6px 0 0' }}>
            “{r.gatilho}” → “{r.resposta}”
          </p>
        </div>
      ))}
    </div>
  )
}
