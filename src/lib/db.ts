import { sb } from './supabase'
import type { Comment, Regra, Template, LogRow, NegativoPost, Classe, Plataforma } from './types'

// Lê a VIEW ad_comments_painel: comentário + estado real da fila de ações (pending/erro).
const TABELA = 'ad_comments_painel'

// prioridade da fila: severidade da classe primeiro (golpe antes de dúvida), depois likes, depois recência.
// like_count é ~sempre 0 no FB, então classe é o que realmente ordena.
const PESO: Record<string, number> = { golpe: 0, reclamacao: 1, duvida: 2, neutro: 3, prova_social: 4 }
function ordenarFila(a: Comment, b: Comment) {
  const pa = PESO[a.classe ?? 'neutro'] ?? 3
  const pb = PESO[b.classe ?? 'neutro'] ?? 3
  if (pa !== pb) return pa - pb
  if (a.like_count !== b.like_count) return b.like_count - a.like_count
  return (b.created_time ?? '').localeCompare(a.created_time ?? '')
}

export async function listFila(): Promise<Comment[]> {
  const { data, error } = await sb
    .from(TABELA)
    .select('*')
    .eq('status', 'revisao')
    .order('created_time', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data as Comment[]).sort(ordenarFila)
}

export async function contarFila(): Promise<number> {
  const { count, error } = await sb
    .from(TABELA)
    .select('id', { count: 'exact', head: true })
    .eq('status', 'revisao')
  if (error) throw error
  return count ?? 0
}

// ações que a plataforma ainda não confirmou (ou que falharam) — o que o painel precisa admitir
export async function listPendencias(): Promise<Comment[]> {
  const { data, error } = await sb
    .from(TABELA)
    .select('*')
    .in('fila_status', ['pending', 'erro'])
    .order('id', { ascending: false })
    .limit(50)
  if (error) throw error
  return data as Comment[]
}

export interface FeedFiltro {
  plataforma: Plataforma
  status?: string
  classe?: string
  busca?: string
}

// PostgREST usa ilike com % e _ como coringa — escapar o que o operador digitou
const escaparBusca = (s: string) => s.replace(/[%_\\]/g, (m) => '\\' + m)

export async function listFeed(f: FeedFiltro): Promise<Comment[]> {
  let q = sb.from(TABELA).select('*').eq('plataforma', f.plataforma)
  if (f.status) q = q.eq('status', f.status)
  if (f.classe) q = q.eq('classe', f.classe)
  if (f.busca) q = q.ilike('texto', `%${escaparBusca(f.busca)}%`)
  const { data, error } = await q.order('created_time', { ascending: false }).limit(200)
  if (error) throw error
  return data as Comment[]
}

export async function listUltimosOcultos(): Promise<Comment[]> {
  const { data, error } = await sb
    .from(TABELA)
    .select('*')
    .in('status', ['oculto_auto', 'oculto_manual'])
    .order('oculto_em', { ascending: false, nullsFirst: false })
    .limit(30)
  if (error) throw error
  return data as Comment[]
}

export async function listRegras(): Promise<Regra[]> {
  const { data, error } = await sb.from('mod_rules').select('*').order('severidade').order('id')
  if (error) throw error
  return data as Regra[]
}

export async function listTemplates(): Promise<Template[]> {
  const { data, error } = await sb.from('mod_templates').select('*').eq('ativa', true).order('id')
  if (error) throw error
  return data as Template[]
}

export async function listLog(): Promise<LogRow[]> {
  const { data, error } = await sb.from('mod_log').select('*').order('ts', { ascending: false }).limit(300)
  if (error) throw error
  return data as LogRow[]
}

export interface InsightRow {
  dia_br: string
  plataforma: string
  status: string
  classe: string | null
  comentarios: number
  likes: number
}

// data BR de hoje sem passar por Date-UTC (o bug do KPI de 7 dias)
export function hojeBR(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
}
export function diasAtrasBR(n: number): string {
  const d = new Date(Date.now() - n * 864e5)
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(d)
}

// filtro dos 7 dias feito no SERVIDOR (antes vinha tudo e cortava em 1000 linhas no cliente)
export async function listInsights(): Promise<InsightRow[]> {
  const { data, error } = await sb
    .from('mod_insights')
    .select('*')
    .gte('dia_br', diasAtrasBR(6))
    .order('dia_br', { ascending: false })
    .limit(2000)
  if (error) throw error
  return data as InsightRow[]
}

export async function negativosPorPost(): Promise<NegativoPost[]> {
  const { data, error } = await sb.rpc('mod_negativos_por_post')
  if (error) throw error
  return data as NegativoPost[]
}

// ---- ações (RPC SECURITY DEFINER; allowlist validada no banco; execução real via worker) ----

export const ocultar = (id: number) => rpc('mod_ocultar', { p_id: id })
export const liberar = (id: number) => rpc('mod_liberar', { p_id: id })
export const ocultarLote = (ids: number[]) =>
  rpc('mod_ocultar_lote', { p_ids: ids }) as Promise<{ ok: number; erros: number; detalhe: { id: number; erro: string }[] }>
export const classificar = (id: number, classe: Classe) => rpc('mod_classificar', { p_id: id, p_classe: classe })
export const responder = (id: number, templateId: number | null, texto: string | null) =>
  rpc('mod_responder', { p_id: id, p_template_id: templateId, p_texto: texto })
export const regraPreview = (termo: string) => rpc('mod_regra_preview', { p_termo: termo })
export const regraUpsert = (id: number | null, termo: string, descricao: string, plataformas: string[]) =>
  rpc('mod_regra_upsert', { p_id: id, p_termo: termo, p_descricao: descricao, p_plataformas: plataformas })
export const regraPromover = (id: number) => rpc('mod_regra_promover', { p_id: id })
export const regraToggle = (id: number, ativa: boolean) => rpc('mod_regra_toggle', { p_id: id, p_ativa: ativa })
export const regraRespostas = (id: number, respostas: string[] | null) =>
  rpc('mod_regra_respostas', { p_id: id, p_respostas: respostas })

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw new Error(traduzErro(error.message))
  return data
}

export function traduzErro(msg: string): string {
  if (/Failed to fetch|NetworkError|network/i.test(msg))
    return 'Sem conexão — a ação NÃO foi registrada. Tenta de novo.'
  if (/statement timeout|canceling statement/i.test(msg))
    return 'O banco demorou demais. A ação NÃO foi registrada, tenta de novo.'
  if (/permission denied|acesso negado/i.test(msg))
    return 'Sem permissão pra essa ação. Fala com o Matheus.'
  return msg
}
