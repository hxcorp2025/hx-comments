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

// erro é escopado: mostrar no card onde a ação foi pedida, não no rodapé da página
// (no celular, com várias instâncias, erro no rodapé nasce fora da tela)
type Erro = { onde: string; msg: string } | null
const NOVO = '_novo'

export default function Instancias({ admin }: { admin: boolean }) {
  const [itens, setItens] = useState<EvoInstancia[]>([])
  const [falhouCarregar, setFalhouCarregar] = useState('')
  const [erro, setErro] = useState<Erro>(null)
  const [ocupado, setOcupado] = useState(false)
  const [nome, setNome] = useState('')
  const [rotulo, setRotulo] = useState('')
  const [apagando, setApagando] = useState<string | null>(null)
  const [desconectando, setDesconectando] = useState<string | null>(null)
  const [confirmacao, setConfirmacao] = useState('')
  const [carregou, setCarregou] = useState(false)
  // instâncias cujo QR já venceu e que já tiveram o estado conferido uma vez
  const conferidas = useRef<Set<string>>(new Set())
  const tinhaQr = useRef<Set<string>>(new Set())

  const carregar = useCallback(async () => {
    try {
      setItens(await evoListar())
      setFalhouCarregar('')
    } catch (e) {
      setFalhouCarregar(traduzErro(e instanceof Error ? e.message : ''))
    } finally {
      setCarregou(true)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const trabalhando = itens.some((i) => i.qr_fresco || i.pedido_em_andamento)

  // com QR na tela ou pedido na fila, recarrega de 3 em 3s; senão, devagar.
  // Pausa com a aba em segundo plano pra não bater no banco com o celular no bolso.
  useEffect(() => {
    let t: number | undefined
    const liga = () => {
      clearInterval(t)
      if (document.hidden) return
      t = setInterval(carregar, trabalhando ? 3000 : 20000) as unknown as number
    }
    liga()
    document.addEventListener('visibilitychange', liga)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', liga) }
  }, [carregar, trabalhando])

  // QR venceu sem virar "conectado"? confere o estado UMA vez — senão o card fica
  // mentindo "aguardando leitura" por até 5 min depois de a pessoa já ter lido.
  useEffect(() => {
    for (const i of itens) {
      if (i.qr_fresco) { tinhaQr.current.add(i.nome); conferidas.current.delete(i.nome); continue }
      if (tinhaQr.current.has(i.nome) && i.estado !== 'open' && !conferidas.current.has(i.nome)
          && !i.pedido_em_andamento) {
        conferidas.current.add(i.nome)
        evoEstado(i.nome).then(carregar).catch(() => {})
      }
    }
  }, [itens, carregar])

  async function agir(onde: string, fn: () => Promise<unknown>) {
    if (ocupado) return
    setErro(null)
    setOcupado(true)
    try { await fn(); await carregar() }
    catch (e) { setErro({ onde, msg: e instanceof Error ? e.message : 'falhou' }) }
    finally { setOcupado(false) }
  }

  const erroDe = (onde: string) =>
    erro?.onde === onde ? <p className="erro" role="alert">{erro.msg}</p> : null

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
        executa em uns 10 segundos (se tiver fila, um pouco mais). Por isso o botão responde na
        hora e o resultado aparece logo depois, sozinho.
      </div>

      {admin && (
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Conectar um número novo</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label htmlFor="evo-nome" className="didatica">Nome curto, sem espaço</label>
            <input
              id="evo-nome"
              placeholder="ex.: rox-disparo-01"
              value={nome}
              maxLength={41}
              onChange={(e) => setNome(
                e.target.value.toLowerCase()
                  .replace(/[^a-z0-9_-]/g, '')
                  .replace(/^[^a-z0-9]+/, ''), // o banco exige começar por letra ou número
              )}
            />
            <label htmlFor="evo-rotulo" className="didatica">Rótulo pra vocês lembrarem</label>
            <input
              id="evo-rotulo"
              placeholder="ex.: chip do Peterson, comunidades VIP"
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
            />
            <div className="acoes">
              <button className="btn primario" disabled={nome.length < 3 || ocupado}
                onClick={() => agir(NOVO, async () => {
                  await evoCriar(nome, rotulo.trim()); setNome(''); setRotulo('')
                })}>
                Criar e gerar QR
              </button>
              <button className="btn" disabled={ocupado}
                onClick={() => agir(NOVO, evoSincronizar)}>
                Atualizar lista
              </button>
            </div>
            <p className="didatica">
              O nome não pode mudar depois e é o que aparece nos logs. Minúsculas, números, hífen
              ou sublinhado, de 3 a 41 caracteres, começando por letra ou número.
            </p>
            {erroDe(NOVO)}
          </div>
        </div>
      )}

      {itens.length === 0 && carregou && (
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
                  vencer, é só tocar em "Gerar QR" de novo. Depois de ler, o painel confirma
                  sozinho em alguns segundos.
                </p>
                <img
                  src={i.qr_base64}
                  alt={`QR code para conectar a instância ${i.nome}`}
                  style={{ width: 260, maxWidth: '100%', imageRendering: 'pixelated',
                           border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}
                />
                {i.pareamento && i.pareamento.length <= 12 && (
                  <p className="didatica" style={{ marginTop: 6 }}>
                    Não consegue ler o código? Em <b>Conectar aparelho → Conectar com número de
                    telefone</b>, digite: <code>{i.pareamento}</code>
                  </p>
                )}
              </div>
            )}

            {i.ultimo_erro && <p className="erro">último erro: {i.ultimo_erro}</p>}

            <div className="acoes">
              {i.estado !== 'open' && (
                <button className="btn primario" disabled={ocupado}
                  onClick={() => agir(i.nome, () => evoConectar(i.nome))}>
                  {i.qr_fresco ? 'Gerar QR de novo' : 'Gerar QR'}
                </button>
              )}
              <button className="btn" disabled={ocupado}
                onClick={() => agir(i.nome, () => evoEstado(i.nome))}>
                Conferir estado
              </button>
              {admin && i.estado === 'open' && desconectando !== i.nome && (
                <button className="btn perigo" disabled={ocupado}
                  onClick={() => { setDesconectando(i.nome); setErro(null) }}>
                  Desconectar
                </button>
              )}
              {admin && apagando !== i.nome && (
                <button className="btn perigo" disabled={ocupado}
                  onClick={() => { setApagando(i.nome); setConfirmacao(''); setErro(null) }}>
                  Apagar
                </button>
              )}
            </div>

            {desconectando === i.nome && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="didatica">
                  <b>Desconectar {i.nome}?</b> O número para de enviar na hora e só volta quando
                  alguém estiver com o celular na mão pra ler o QR de novo.
                </div>
                <div className="acoes">
                  <button className="btn perigo" disabled={ocupado}
                    onClick={() => agir(i.nome, async () => {
                      await evoDesconectar(i.nome); setDesconectando(null)
                    })}>
                    Desconectar mesmo assim
                  </button>
                  <button className="btn" disabled={ocupado}
                    onClick={() => setDesconectando(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {apagando === i.nome && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="didatica">
                  <b>Apagar remove a instância da Evolution e não tem volta.</b> Se ela estiver
                  conectada, o número cai e o histórico dela some. Pra confirmar, digite
                  <b> {i.nome}</b> abaixo.
                </div>
                <input aria-label={`digite ${i.nome} para confirmar`} placeholder={i.nome}
                  value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} />
                <div className="acoes">
                  <button className="btn perigo" disabled={ocupado || confirmacao.trim() !== i.nome}
                    onClick={() => agir(i.nome, async () => {
                      await evoApagar(i.nome, confirmacao.trim())
                      setApagando(null); setConfirmacao('')
                    })}>
                    Apagar de verdade
                  </button>
                  <button className="btn" disabled={ocupado}
                    onClick={() => { setApagando(null); setConfirmacao('') }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {erroDe(i.nome)}
          </div>
        )
      })}
    </div>
  )
}
