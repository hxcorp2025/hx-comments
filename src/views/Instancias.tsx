import { useEffect, useState, useCallback, useRef } from 'react'
import type { EvoInstancia } from '../lib/evoDb'
import {
  evoListar, evoSincronizar, evoCriar, evoConectar,
  evoEstado, evoDesconectar, evoApagar,
} from '../lib/evoDb'
import { traduzErro } from '../lib/db'

const ROTULO_ESTADO: Record<string, { texto: string; pill: string }> = {
  open: { texto: 'conectado', pill: 'respondido' },
  connecting: { texto: 'aguardando leitura', pill: 'revisao' },
  close: { texto: 'desconectado', pill: 'neutro' },
}

function estadoDe(e: string | null) {
  return ROTULO_ESTADO[e ?? ''] ?? { texto: e ?? 'desconhecido', pill: 'neutro' }
}

export default function Instancias({ admin }: { admin: boolean }) {
  const [itens, setItens] = useState<EvoInstancia[]>([])
  const [falhouCarregar, setFalhouCarregar] = useState('')
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [nome, setNome] = useState('')
  const [rotulo, setRotulo] = useState('')
  const [apagando, setApagando] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState('')
  const primeiraCarga = useRef(true)

  const carregar = useCallback(async () => {
    try {
      setItens(await evoListar())
      setFalhouCarregar('')
    } catch (e) {
      setFalhouCarregar(traduzErro(e instanceof Error ? e.message : ''))
    } finally {
      primeiraCarga.current = false
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Enquanto houver QR na tela ou pedido na fila, o worker está trabalhando:
  // recarrega de 3 em 3s pra o QR aparecer e o estado virar sozinho.
  const trabalhando = itens.some((i) => i.qr_fresco || i.pedido_em_andamento)
  useEffect(() => {
    const t = setInterval(carregar, trabalhando ? 3000 : 20000)
    return () => clearInterval(t)
  }, [carregar, trabalhando])

  async function agir(fn: () => Promise<unknown>) {
    if (ocupado) return
    setErro('')
    setOcupado(true)
    try { await fn(); await carregar() }
    catch (e) { setErro(e instanceof Error ? e.message : 'falhou') }
    finally { setOcupado(false) }
  }

  async function criar() {
    await agir(async () => {
      await evoCriar(nome.trim().toLowerCase(), rotulo.trim())
      setNome(''); setRotulo('')
    })
  }

  async function apagar(n: string) {
    await agir(async () => {
      await evoApagar(n, confirmacao.trim())
      setApagando(null); setConfirmacao('')
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

  return (
    <div>
      <div className="aviso">
        <b>O que é esta aba:</b> aqui a gente conecta os números de WhatsApp que a operação usa,
        sem precisar abrir o painel da Evolution. Cada número é uma <b>instância</b>: você dá um
        nome, lê o QR code no celular e ele fica conectado. <b>Conectado</b> = pronto pra enviar.
        <b> Aguardando leitura</b> = o QR está na tela esperando o celular.
        <b> Desconectado</b> = caiu ou nunca foi lido, e é só gerar o QR de novo.
        <br />
        O painel não fala com o WhatsApp direto: ele registra o pedido e um serviço no banco
        executa em uns 10 segundos. Por isso o botão responde na hora e o resultado aparece logo
        depois, sozinho.
      </div>

      {admin && (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Conectar um número novo</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              placeholder="nome curto, sem espaço (ex.: rox-disparo-01)"
              value={nome}
              maxLength={41}
              onChange={(e) => setNome(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
            />
            <input
              placeholder="rótulo pra vocês lembrarem (ex.: chip do Peterson, comunidades VIP)"
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
            />
            <div className="acoes">
              <button className="btn primario" disabled={nome.length < 3 || ocupado} onClick={criar}>
                Criar e gerar QR
              </button>
              <button className="btn" disabled={ocupado} onClick={() => agir(evoSincronizar)}>
                Atualizar lista
              </button>
            </div>
            <p className="didatica">
              O nome não pode mudar depois e é o que aparece nos logs. Use minúsculas, números,
              hífen ou sublinhado, de 3 a 41 caracteres.
            </p>
            {erro && <p className="erro">{erro}</p>}
          </div>
        </div>
      )}

      {itens.length === 0 && !primeiraCarga.current && (
        <div className="vazio">
          <span className="emoji">📱</span>
          Nenhuma instância ainda. {admin ? 'Cria a primeira aí em cima.' : 'Fala com o Matheus.'}
        </div>
      )}

      {itens.map((i) => {
        const est = estadoDe(i.estado)
        return (
          <div className="card" key={i.nome}>
            <div className="meta">
              <span className={`pill ${est.pill}`}>{est.texto}</span>
              {i.proxy_ativo && <span className="pill ig">proxy {i.proxy_host ?? 'on'}</span>}
              {i.pedido_em_andamento && (
                <span className="pill neutro">processando: {i.pedido_em_andamento}…</span>
              )}
              {i.criada_por && <span>por {i.criada_por}</span>}
            </div>

            <p className="texto">
              <code>{i.nome}</code>
              {i.rotulo ? ` · ${i.rotulo}` : ''}
            </p>
            <p className="didatica">
              {i.numero ? `número ${i.numero}` : 'sem número conectado'}
              {i.perfil ? ` · ${i.perfil}` : ''}
              {i.visto_em ? ` · visto ${new Date(i.visto_em).toLocaleString('pt-BR')}` : ''}
            </p>

            {i.qr_fresco && i.qr_base64 && (
              <div style={{ marginTop: 10 }}>
                <p className="didatica" style={{ marginBottom: 6 }}>
                  No celular: <b>WhatsApp → Configurações → Aparelhos conectados → Conectar
                  aparelho</b>, e aponte pra este código. Ele vale mais ou menos 1 minuto; se
                  vencer, é só tocar em "Gerar QR" de novo.
                </p>
                <img
                  src={i.qr_base64}
                  alt={`QR code para conectar a instância ${i.nome}`}
                  style={{ width: 260, maxWidth: '100%', imageRendering: 'pixelated',
                           border: '1px solid var(--linha, #ddd)', borderRadius: 8, background: '#fff' }}
                />
                {i.pareamento && (
                  <p className="didatica" style={{ marginTop: 6 }}>
                    Não consegue ler o código? Dá pra parear por texto também.
                  </p>
                )}
              </div>
            )}

            {i.ultimo_erro && <p className="erro">último erro: {i.ultimo_erro}</p>}

            <div className="acoes">
              {i.estado !== 'open' && (
                <button className="btn primario" disabled={ocupado}
                  onClick={() => agir(() => evoConectar(i.nome))}>
                  {i.qr_fresco ? 'Gerar QR de novo' : 'Gerar QR'}
                </button>
              )}
              <button className="btn" disabled={ocupado} onClick={() => agir(() => evoEstado(i.nome))}>
                Conferir estado
              </button>
              {admin && i.estado === 'open' && (
                <button className="btn" disabled={ocupado}
                  onClick={() => agir(() => evoDesconectar(i.nome))}>
                  Desconectar
                </button>
              )}
              {admin && apagando !== i.nome && (
                <button className="btn perigo" disabled={ocupado}
                  onClick={() => { setApagando(i.nome); setConfirmacao(''); setErro('') }}>
                  Apagar
                </button>
              )}
            </div>

            {apagando === i.nome && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="didatica">
                  <b>Apagar remove a instância da Evolution e não tem volta.</b> Se ela estiver
                  conectada, o número cai e o histórico dela some. Pra confirmar, digite
                  <b> {i.nome}</b> abaixo.
                </div>
                <input placeholder={i.nome} value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)} />
                <div className="acoes">
                  <button className="btn perigo" disabled={ocupado || confirmacao.trim() !== i.nome}
                    onClick={() => apagar(i.nome)}>
                    Apagar de verdade
                  </button>
                  <button className="btn" disabled={ocupado}
                    onClick={() => { setApagando(null); setConfirmacao('') }}>
                    Cancelar
                  </button>
                </div>
                {erro && <p className="erro">{erro}</p>}
              </div>
            )}
          </div>
        )
      })}

      {erro && !apagando && <p className="erro">{erro}</p>}
    </div>
  )
}
