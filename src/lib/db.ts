import { sb } from './supabase'
import type { Comment, Regra, Template, LogRow, NegativoAnuncio, Classe, Plataforma } from './types'

// ---- leitura (RLS: só operador allowlisted lê) ----

export async function listFila(): Promise<Comment[]> {
  const { data, error } = await sb
    .from('ad_comments')
    .select('*')
    .eq('status', 'revisao')
    .order('like_count', { ascending: false })
    .order('created_time', { ascending: false })
    .limit(200)
  if (error) throw error
  return data as Comment[]
}

export interface FeedFiltro {
  plataforma: Plataforma
  status?: string
  classe?: string
  busca?: string
}

export async function listFeed(f: FeedFiltro): Promise<Comment[]> {
  let q = sb.from('ad_comments').select('*').eq('plataforma', f.plataforma)
  if (f.status) q = q.eq('status', f.status)
  if (f.classe) q = q.eq('classe', f.classe)
  if (f.busca) q = q.ilike('texto', `%${f.busca}%`)
  const { data, error } = await q.order('created_time', { ascending: false }).limit(200)
  if (error) throw error
  return data as Comment[]
}

export async function listUltimosOcultos(): Promise<Comment[]> {
  const { data, error } = await sb
    .from('ad_comments')
    .select('*')
    .in('status', ['oculto_auto', 'oculto_manual'])
    .order('synced_at', { ascending: false })
    .limit(30)
  if (error) throw error
  return data as Comment[]
}

export async function listRegras(): Promise<Regra[]> {
  const { data, error } = await sb.from('mod_rules').select('*').order('id')
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

export async function listInsights(): Promise<InsightRow[]> {
  const { data, error } = await sb.from('mod_insights').select('*')
  if (error) throw error
  return data as InsightRow[]
}

// ---- ações (RPC SECURITY DEFINER; allowlist validada no banco) ----

export const ocultar = async (id: number) => rpc('mod_ocultar', { p_id: id })
export const liberar = async (id: number) => rpc('mod_liberar', { p_id: id })
export const ocultarLote = async (ids: number[]) => rpc('mod_ocultar_lote', { p_ids: ids })
export const classificar = async (id: number, classe: Classe) =>
  rpc('mod_classificar', { p_id: id, p_classe: classe })
export const responder = async (id: number, templateId: number | null, texto: string | null) =>
  rpc('mod_responder', { p_id: id, p_template_id: templateId, p_texto: texto })
export const regraPreview = async (termo: string) => rpc('mod_regra_preview', { p_termo: termo })
export const regraUpsert = async (id: number | null, termo: string, descricao: string, plataformas: string[]) =>
  rpc('mod_regra_upsert', { p_id: id, p_termo: termo, p_descricao: descricao, p_plataformas: plataformas })
export const regraPromover = async (id: number) => rpc('mod_regra_promover', { p_id: id })
export const regraToggle = async (id: number, ativa: boolean) =>
  rpc('mod_regra_toggle', { p_id: id, p_ativa: ativa })

export async function negativosPorAnuncio(): Promise<NegativoAnuncio[]> {
  const { data, error } = await sb.rpc('mod_negativos_por_anuncio')
  if (error) throw error
  return data as NegativoAnuncio[]
}

async function rpc(fn: string, args: Record<string, unknown>) {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}
