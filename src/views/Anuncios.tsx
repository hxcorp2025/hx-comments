import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, ShieldCheck, ShieldAlert, EyeOff, MessageSquareOff, MessageCircleQuestion } from 'lucide-react'
import { verificarPedir, verificacaoAtual, verificacoesHistorico, traduzErro } from '../lib/db'
import type { Verificacao, AchadoAnuncio, Historico, HistoricoItem } from '../lib/db'

// nome do botão na aba Regras DESTE app. A tela não pode mandar procurar um botão que não existe.
const BOTAO_REGRA = 'Promover a auto-ocultar'

// mesma janela em que o servidor fecha verificação travada (mod_verificar_pedir)
const TRAVOU_MS = 20 * 60_000

const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

const pl = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function quando(iso: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function idade(iso: string | null) {
  if (!iso) return ''
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (min < 60) return `há ${min} min`
  const h = Math.round(min / 60)
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`
}

const quemPediu = (q: string | null) => (!q || q === 'automatico' ? 'pelo robô' : `por ${q}`)

// o erro da Graph vem cru, em inglês e com link. Pra quem opera, só importa o que fazer.
function traduzMotivo(a: AchadoAnuncio): string {
  if (a.object_type === 'POST_DELETED')
    return 'O post do Facebook deste anúncio foi apagado, mas o anúncio continua ativo no gerenciador.'
  const m = a.motivo ?? ''
  if (/nao achei o post|sem post/i.test(m))
    return 'Não achei o post deste anúncio pra ler os comentários.'
  if (/does not exist|missing permission|Unsupported get/i.test(m))
    return 'A Meta não deixou abrir este post: ou ele foi apagado, ou a página perdeu a permissão.'
  if (/cadastrada/i.test(m)) return 'A página deste anúncio não está cadastrada na central.'
  return 'A Meta não devolveu os comentários deste post.'
}

interface Props {
  admin: boolean
  // JA: o "Parar tudo" desliga o ocultar automático e o "Religar" NÃO devolve ele.
  // undefined = este app não tem essa trava.
  autoOcultar?: boolean | 'desconhecido'
  onIrFila?: () => void
}

export default function Anuncios({ admin, autoOcultar, onIrFila }: Props) {
  const [v, setV] = useState<Verificacao | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [pedindo, setPedindo] = useState(false)
  const [erro, setErro] = useState('')
  const [jaTinha, setJaTinha] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())
  const timer = useRef<number | null>(null)
  const [hist, setHist] = useState<Historico | null>(null)
  const [histErro, setHistErro] = useState(false)

  const puxar = useCallback(async () => {
    try {
      setV(await verificacaoAtual())
      setErro('')
    } catch (e) {
      setErro(traduzErro((e as Error).message))
    } finally {
      setCarregando(false)
      setAgora(Date.now())
    }
  }, [])

  useEffect(() => {
    puxar()
  }, [puxar])

  // histórico: carrega na abertura e de novo toda vez que uma verificação termina
  const fimDaUltima = v && (v.status === 'ok' || v.status === 'erro') ? `${v.id}:${v.status}` : ''
  useEffect(() => {
    let vivo = true
    verificacoesHistorico(20)
      .then((h) => { if (vivo) { setHist(h); setHistErro(false) } })
      .catch(() => { if (vivo) setHistErro(true) })
    const t = window.setInterval(() => {
      verificacoesHistorico(20).then((h) => { if (vivo) setHist(h) }).catch(() => {})
    }, 5 * 60_000)
    return () => { vivo = false; window.clearInterval(t) }
  }, [fimDaUltima])

  const naFila = v?.status === 'pendente' || v?.status === 'rodando'
  // worker parado não pode prender a tela pra sempre: passada a janela, libera o botão
  const travou = naFila && agora - Date.parse(v!.criada_em) > TRAVOU_MS
  const rodando = naFila && !travou

  useEffect(() => {
    if (!naFila) {
      if (timer.current) window.clearInterval(timer.current)
      return
    }
    // travada, continua olhando devagar: a verificação pode terminar atrasada
    timer.current = window.setInterval(puxar, rodando ? 4000 : 60_000)
    return () => {
      if (timer.current) window.clearInterval(timer.current)
    }
  }, [naFila, rodando, puxar])

  async function pedir() {
    if (pedindo || rodando) return
    setPedindo(true)
    setErro('')
    try {
      const r = await verificarPedir()
      setJaTinha(r.ja_rodando)
      await puxar()
    } catch (e) {
      setErro(traduzErro((e as Error).message))
    } finally {
      setPedindo(false)
    }
  }

  if (carregando) return <p className="didatica" style={{ padding: 20 }}>carregando…</p>

  if (erro && !v) {
    return (
      <div className="vazio">
        <span className="emoji">📡</span>Não consegui carregar a última verificação. {erro}
        <p style={{ marginTop: 12 }}><button className="btn" onClick={puxar}>Tentar de novo</button></p>
      </div>
    )
  }

  // durante uma verificação nova, o resultado anterior continua na tela
  const r: Verificacao | null = v?.status === 'ok' ? v : (v?.anterior ?? null)
  const achados: AchadoAnuncio[] = r?.achados ?? []
  const ilegiveis = achados.filter((a) => a.ilegivel !== false)
  const lidos = achados.filter((a) => a.ilegivel === false)
  const sujos = lidos.filter((a) => a.bateram > 0)
  const limpos = lidos.filter((a) => a.bateram === 0 && a.comentarios > 0)
  const vazios = lidos.filter((a) => a.comentarios === 0)
  const semAnuncio = r !== null && (r.ads_ativos ?? 0) === 0
  const bateram = r?.bateram ?? 0
  const nIlegiveis = r?.ads_ilegiveis ?? 0

  // por que um comentário que bate em regra continua no ar. O servidor diz o motivo real
  // (bloqueio); sem ele (verificação antiga), cai no que a tela sabe do estado da conta.
  const aguardando = r?.aguardando ?? 0
  const travados = Math.max(0, bateram - aguardando)
  const b = r?.bloqueio ?? null
  // o que o servidor já explica; o resto ganha o parágrafo genérico (nunca número vermelho mudo)
  const explicados = b ? b.sem_autor + b.teto + b.desligado : (autoOcultar === false ? travados : 0)
  const resto = Math.max(0, travados - explicados)
  // verificação antiga (antes de lead ser contado à parte) não tem o campo
  const temLeads = typeof r?.leads === 'number'
  const leads = r?.leads ?? 0
  const velha = r?.terminada_em ? Date.now() - Date.parse(r.terminada_em) > 2 * 3600_000 : false

  return (
    <div>
      <div className="card">
        <h2 style={{ margin: '0 0 6px' }}>Verificar anúncios</h2>
        <p className="didatica" style={{ margin: '0 0 12px' }}>
          Confere <b>agora</b> os comentários de todos os anúncios que estão no ar, em todas as
          páginas, contra as regras. Serve pra você poder afirmar que está tudo bem, e pra
          descobrir o anúncio que a central <b>não consegue ler</b>, que é o risco que ninguém vê.
        </p>
        <button className="btn primario" onClick={pedir} disabled={pedindo || rodando}
          aria-busy={pedindo || rodando}>
          <RefreshCw size={15} />
          {rodando ? 'verificando…' : pedindo ? 'pedindo…' : 'Verificar anúncios agora'}
        </button>
        {erro && v && <p className="erro" style={{ marginTop: 10 }}>{erro}</p>}
      </div>

      <div role="status" aria-live="polite">
        {rodando && (
          <div className="aviso">
            {v!.status === 'pendente' ? (
              <b>Na fila. Começa em alguns segundos.</b>
            ) : v!.fase === 'descobrir' ? (
              <b>Descobrindo quais anúncios estão no ar…</b>
            ) : v!.fase === 'ler' ? (
              <b>
                Lendo os comentários: {v!.posts_lidos ?? 0} de {pl(v!.posts_alvo ?? 0, 'post', 'posts')}
                {' '}({pl(v!.ads_ativos ?? 0, 'anúncio', 'anúncios')}).
              </b>
            ) : (
              <b>Passando as regras…</b>
            )}
            <br />
            <span className="didatica">
              Pode sair desta aba que ela não para: o trabalho é feito no servidor.
            </span>
          </div>
        )}
        {jaTinha && naFila && (
          <div className="aviso">
            Já tinha uma verificação pedida {quemPediu(v!.quem)}, então estou te mostrando ela em
            vez de começar outra.
          </div>
        )}
        {travou && (
          <div className="aviso">
            <b>A verificação #{v!.id} travou.</b> Pode pedir de novo.
          </div>
        )}
      </div>

      {v?.status === 'erro' && (
        <div className="erro" role="alert">
          {v.erro?.startsWith('descoberta incompleta')
            ? <>A verificação #{v.id} não conseguiu ver a lista completa de anúncios no ar, então
                ela <b>não dá veredito</b>: dizer "está limpo" sem ver tudo seria mentir. Pode pedir
                de novo; se repetir, avise quem administra.</>
            : <>A verificação #{v.id} parou com erro. Pode pedir de novo.</>}
          {admin && v.erro && <details><summary>detalhe técnico</summary>{v.erro}</details>}
        </div>
      )}

      {r && (
        <>
          <p className="didatica" style={{ margin: '14px 0 10px' }}>
            {r.id === v?.id ? 'Resultado' : 'Último resultado'} da verificação #{r.id} · pedida{' '}
            {quemPediu(r.quem)} · terminou {quando(r.terminada_em)} ({idade(r.terminada_em)})
            {admin && <> · {pl(r.requests, 'chamada', 'chamadas')} à Meta</>}
          </p>

          {velha && !rodando && (
            <div className="aviso">
              <b>Esta conferida é de {idade(r.terminada_em)}.</b> A automática roda de hora em hora:
              se a hora não muda, algo parou. Avise quem administra.
            </div>
          )}

          {semAnuncio ? (
            <div className="aviso">
              <b>Nenhum anúncio no ar nesta conta agora.</b> Isso não quer dizer que está tudo
              limpo: é que não existe anúncio ativo pra conferir. Se você esperava anúncio rodando,
              o problema está no gerenciador de anúncios, não aqui.
            </div>
          ) : (
            <>
              <div className="grade-kpi">
                <div className="kpi">
                  <div className="num" style={{ color: nIlegiveis > 0 ? 'var(--critico)' : undefined }}>
                    {nIlegiveis > 0 && <ShieldAlert size={18} aria-hidden="true" />} {nIlegiveis}
                  </div>
                  <div className="rotulo">anúncios que não consigo ler</div>
                </div>
                <div className="kpi">
                  <div className="num" style={{ color: bateram > 0 ? 'var(--critico)' : undefined }}>
                    {bateram}
                  </div>
                  <div className="rotulo">batem em regra e estão no ar</div>
                </div>
                <div className="kpi">
                  <div className="num">{r.ads_ativos}</div>
                  <div className="rotulo">anúncios no ar</div>
                </div>
                <div className="kpi">
                  <div className="num">{r.comentarios_lidos}</div>
                  <div className="rotulo">comentários conferidos</div>
                </div>
              </div>

              {(aguardando > 0 || travados > 0) && (
                <div className="aviso">
                  {aguardando > 0 && (
                    <p style={{ margin: 0 }}>
                      <b>{pl(aguardando, 'comentário bate', 'comentários batem')} em regra que ainda
                      não oculta sozinha</b> e {aguardando === 1 ? 'está' : 'estão'} na Fila esperando
                      alguém decidir.{' '}
                      {temLeads
                        ? <>Se a regra for de golpe ou spam, dá pra fazer sumirem sozinhos com <b>{BOTAO_REGRA}</b> na aba Regras.</>
                        : <>Na Fila, alguém decide: responder, liberar ou ocultar.</>}
                    </p>
                  )}
                  {travados > 0 && b && b.sem_autor > 0 && (
                    <p style={{ margin: aguardando > 0 ? '8px 0 0' : 0 }}>
                      <b>{pl(b.sem_autor, 'comentário bate', 'comentários batem')} em regra que oculta
                      sozinha, mas não {b.sem_autor === 1 ? 'saiu' : 'saíram'}:</b> a rede não informou
                      quem escreveu, e sem saber o autor a central não oculta sozinha, porque pode ser a
                      própria página. Na Fila é um clique.
                    </p>
                  )}
                  {travados > 0 && b && b.teto > 0 && (
                    <p style={{ margin: '8px 0 0' }}>
                      <b>{pl(b.teto, 'comentário ficou', 'comentários ficaram')} pra depois</b> porque o
                      limite de ocultação automática por hora foi atingido. Saem sozinhos quando o limite da hora liberar.
                    </p>
                  )}
                  {travados > 0 && ((b && b.desligado > 0) || (!b && autoOcultar === false)) && (
                    <p style={{ margin: '8px 0 0' }}>
                      <b>O ocultar automático está desligado.</b> Isso acontece depois de um Parar tudo:
                      religar a execução devolve só o manual. Até quem administra religar o automático,
                      estes comentários ficam na Fila.
                    </p>
                  )}
                  {resto > 0 && (
                    <p style={{ margin: '8px 0 0' }}>
                      <b>{pl(resto, 'comentário bate', 'comentários batem')} em regra que oculta
                      sozinha e ainda {resto === 1 ? 'está' : 'estão'} no ar.</b> Confere na Fila.
                    </p>
                  )}
                  {onIrFila && (
                    <p style={{ margin: '10px 0 0' }}>
                      <button className="btn" onClick={onIrFila}>Abrir a Fila</button>
                    </p>
                  )}
                </div>
              )}

              {leads > 0 && (
                <div className="card">
                  <p style={{ margin: 0 }}>
                    <MessageCircleQuestion size={15} aria-hidden="true" />{' '}
                    <b>{pl(leads, 'pergunta de cliente', 'perguntas de cliente')}</b> na Fila esperando
                    resposta. Quem pergunta preço ou como entrar é lead: estas nunca somem sozinhas.
                  </p>
                  {onIrFila && (
                    <p style={{ margin: '10px 0 0' }}>
                      <button className="btn" onClick={onIrFila}>Abrir a Fila</button>
                    </p>
                  )}
                </div>
              )}

              {(r.ocultados ?? 0) > 0 && (
                <div className="aviso">
                  <EyeOff size={15} aria-hidden="true" /> Desde que esta verificação começou,{' '}
                  <b>{pl(r.ocultados ?? 0, 'comentário foi mandado', 'comentários foram mandados')}
                  {' '}ocultar</b> por bater em regra que oculta sozinha. Somem da rede em até 1 minuto.
                </div>
              )}

              {ilegiveis.length > 0 && (
                <div className="card falhou">
                  <h3 style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldAlert size={17} aria-hidden="true" />
                    {pl(ilegiveis.length, 'anúncio no ar que eu não consigo ler', 'anúncios no ar que eu não consigo ler')}
                  </h3>
                  <p className="didatica" style={{ margin: '0 0 10px' }}>
                    A central está cega nestes. Não dá pra dizer que estão limpos, porque ninguém leu.
                  </p>
                  {ilegiveis.map((a) => (
                    <div key={a.ad_id} style={{ marginBottom: 10 }}>
                      <b>{a.nome ?? a.ad_id}</b>
                      {a.gasto_7d > 0 && <>{' '}<span className="pill">{brl(a.gasto_7d)} em 7 dias</span></>}
                      <p className="didatica" style={{ margin: '4px 0 0' }}>{traduzMotivo(a)}</p>
                      {admin && a.motivo && (
                        <details><summary>detalhe técnico</summary>{a.motivo}</details>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {sujos.length > 0 && (
                <div className="card">
                  <h3 style={{ margin: '0 0 10px' }}>
                    {pl(sujos.length, 'anúncio com comentário batendo em regra', 'anúncios com comentário batendo em regra')}
                  </h3>
                  <TabelaAnuncios linhas={sujos} />
                  <p className="didatica" style={{ margin: '8px 0 0' }}>
                    Quando dois anúncios usam o mesmo post, os mesmos comentários aparecem nos dois.
                  </p>
                </div>
              )}

              {limpos.length > 0 && (
                <div className="card">
                  <h3 style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <ShieldCheck size={17} aria-hidden="true" />
                    {pl(limpos.length, 'anúncio sem nada pendente', 'anúncios sem nada pendente')}
                  </h3>
                  <p className="didatica" style={{ margin: '0 0 10px' }}>
                    Os comentários novos foram baixados agora e nenhum comentário público destes
                    anúncios bate nas regras.
                  </p>
                  <TabelaAnuncios linhas={limpos} />
                </div>
              )}

              {vazios.length > 0 && (
                <div className="card">
                  <h3 style={{ margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MessageSquareOff size={17} aria-hidden="true" />
                    {pl(vazios.length, 'anúncio sem nenhum comentário', 'anúncios sem nenhum comentário')}
                  </h3>
                  <p className="didatica" style={{ margin: '0 0 10px' }}>
                    Lidos, mas ninguém comentou ainda. Não entram na conta de limpos.
                  </p>
                  <TabelaAnuncios linhas={vazios} />
                </div>
              )}
            </>
          )}
        </>
      )}

      <HistoricoVerificacoes h={hist} falhou={histErro} admin={admin} />

      {!v && !rodando && !erro && (
        <div className="vazio">
          <span className="emoji">🔎</span>
          Ainda não teve nenhuma verificação. Clica em <b>Verificar anúncios agora</b>.
        </div>
      )}
    </div>
  )
}

function TabelaAnuncios({ linhas }: { linhas: AchadoAnuncio[] }) {
  return (
    <div className="scroll-x">
      <table className="lista">
        <thead>
          <tr>
            <th>Anúncio</th>
            <th className="num">Gasto 7d</th>
            <th className="num">Comentários</th>
            <th className="num">Batem em regra</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((a) => (
            <tr key={a.ad_id}>
              <td>{a.nome ?? a.ad_id}</td>
              <td className="num">{a.gasto_7d > 0 ? brl(a.gasto_7d) : '·'}</td>
              <td className="num">{a.comentarios}</td>
              <td className="num" style={{ color: a.bateram > 0 ? 'var(--critico)' : undefined }}>
                {a.bateram > 0 ? <b>{a.bateram}</b> : '·'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function textoAviso(i: HistoricoItem) {
  if (i.origem === 'botao' || !i.aviso) return '·'
  if (i.aviso.startsWith('enviado')) return 'enviado'
  if (i.aviso === 'sem_novidade') return 'não precisou (nada novo)'
  if (i.aviso === 'suprimido_cooldown') return 'repetido'
  return 'não saiu'
}

// e-mail inteiro fica longo no celular e expõe o endereço de quem apertou
const soNome = (q: string | null) => (q ?? '').split('@')[0]

function HistoricoVerificacoes({ h, falhou, admin }: { h: Historico | null; falhou: boolean; admin: boolean }) {
  if (falhou && !h) {
    return <p className="didatica" style={{ marginTop: 18 }}>Não consegui carregar o histórico das verificações.</p>
  }
  if (!h || h.lista.length === 0) return null
  const d = h.ultimas_24h
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h3 style={{ margin: '0 0 6px' }}>Histórico das verificações</h3>
      <p className="didatica" style={{ margin: '0 0 6px' }}>
        <b>Últimas 24 horas:</b> {pl(d.verificacoes, 'verificação', 'verificações')} ({d.automaticas}{' '}
        {d.automaticas === 1 ? 'automática' : 'automáticas'}, {d.pelo_botao} pelo botão
        {d.com_erro > 0 && <>, <b style={{ color: 'var(--critico)' }}>{d.com_erro} com erro</b></>})
        {d.ultima_automatica && <> · última automática {idade(d.ultima_automatica)}</>}
      </p>
      <p className="didatica" style={{ margin: '0 0 12px' }}>
        <b>Ocultados de verdade:</b> {d.verif_saiu} pela verificação e {d.ronda_saiu} na ronda de 15 em 15 minutos
        {d.verif_na_fila > 0 && <> · {d.verif_na_fila} ainda saindo</>}
        {d.verif_nao_saiu + d.ronda_nao_saiu > 0 && (
          <> · {pl(d.verif_nao_saiu + d.ronda_nao_saiu, 'não saiu', 'não saíram')} porque o comentário já
            tinha sido apagado ou a Meta recusou</>
        )}
      </p>
      <div className="scroll-x">
        <table className="lista">
          <thead>
            <tr>
              <th>Quando</th>
              <th>Como</th>
              <th className="num">Anúncios</th>
              {admin && <th className="num">Posts lidos</th>}
              <th className="num">Comentários</th>
              <th className="num">Mandados ocultar</th>
              <th className="num">Batem e no ar</th>
              <th className="num">Perguntas</th>
              <th className="num">Não li</th>
              {admin && <th className="num">Duração</th>}
              {admin && <th>Aviso</th>}
            </tr>
          </thead>
          <tbody>
            {h.lista.map((i) => {
              const ok = i.status === 'ok'
              return (
                <tr key={i.id}>
                  <td>{quando(i.criada_em)}</td>
                  <td>
                    {i.origem === 'cron' ? 'automática' : `botão · ${soNome(i.quem)}`}
                    {i.status === 'erro' && <> · <b style={{ color: 'var(--critico)' }}>erro</b></>}
                    {(i.status === 'pendente' || i.status === 'rodando') && <> · rodando</>}
                  </td>
                  <td className="num">{ok ? i.ads_ativos : '·'}</td>
                  {admin && <td className="num">{ok ? `${i.posts_lidos ?? 0}/${i.posts_alvo ?? 0}` : '·'}</td>}
                  <td className="num">{ok ? i.comentarios_lidos : '·'}</td>
                  <td className="num">
                    {ok ? i.mandados : '·'}
                    {ok && (i.nao_saiu ?? 0) > 0 && <> ({i.nao_saiu} não saiu)</>}
                  </td>
                  <td className="num" style={{ color: ok && (i.bateram ?? 0) > 0 ? 'var(--critico)' : undefined }}>
                    {ok ? i.bateram : '·'}
                  </td>
                  <td className="num">{ok ? (i.leads ?? '·') : '·'}</td>
                  <td className="num" style={{ color: ok && (i.ads_ilegiveis ?? 0) > 0 ? 'var(--critico)' : undefined }}>
                    {ok ? i.ads_ilegiveis : '·'}
                  </td>
                  {admin && <td className="num">{i.duracao_s != null ? `${i.duracao_s}s` : '·'}</td>}
                  {admin && <td>{textoAviso(i)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="didatica" style={{ margin: '10px 0 0' }}>
        <b>Mandados ocultar</b> é o que a verificação mandou sumir; se o autor apagou antes, não chega a
        ser ocultado e aparece como "não saiu". <b>Batem e no ar</b> é o que casa com regra e continua
        público, esperando alguém na Fila. <b>Perguntas</b> é cliente perguntando: nunca some sozinho.{' '}
        <b>Não li</b> é anúncio no ar que a central não conseguiu abrir.
        {admin && (
          <> <b>Posts lidos</b> é quantos posts foram lidos de quantos precisavam. <b>Aviso</b> é o
            alerta no WhatsApp: enviado, não precisou (nada novo desde o último), repetido (segurado
            pra não encher) ou não saiu (falhou).</>
        )}
      </p>
    </div>
  )
}
