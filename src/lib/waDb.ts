import { sb } from './supabase'
import { traduzErro } from './db'

// ===== Aba WhatsApp — tudo via RPC SECURITY DEFINER (allowlist no banco). =====
// O painel NUNCA envia direto: mod_wa_responder só ENFILEIRA; o worker do banco
// manda em até 1 min. (Regra da casa: RPC de painel não faz HTTP.)

export interface WaConversa {
  phone_id: string
  numero_nosso: string
  wa_id: string
  cliente: string
  fone_key: string
  ultima_mensagem: string
  pendentes: number
  recebida_em: string
  esperando_h: number
  fecha_em_h: number | null
  janela: 'aberta' | 'fechada'
  grupo_controle: boolean
  sugestao_id: number | null
  sugestao_corpo: string | null
  sugestao_regra: string | null
}

export interface WaMsg {
  direcao: 'in' | 'out'
  tipo: string | null
  status: string | null
  corpo: string
  ts: string
  operador: string | null
}

export interface WaRegra {
  id: number
  nome: string
  ativo: boolean
  modo: 'sugerir' | 'auto'
  tipo: 'contem' | 'regex'
  gatilho: string
  resposta: string
  phone_id: string | null
  prioridade: number
  hits: number
  criado_por: string | null
}

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.rpc(fn, args)
  if (error) throw new Error(traduzErro(error.message))
  return data as T
}

// respostas jsonb {ok, erro?} das RPCs de ação — erro do banco vira exceção legível
function exigirOk(r: { ok: boolean; erro?: string } | null | undefined) {
  if (!r?.ok) throw new Error(r?.erro ?? 'A ação não foi registrada. Tenta de novo.')
  return r
}

export interface WaEnviando {
  id: number
  cliente: string
  corpo: string
  criado_em: string
  origem: string
}

export interface WaFalha {
  id: number
  cliente: string
  corpo: string
  erro: string
  criado_em: string
  tentativas: number
}

export const waFila = () => rpc<WaConversa[]>('mod_wa_fila')
export const waEnviando = () => rpc<WaEnviando[]>('mod_wa_enviando')
export const waFalhas = () => rpc<WaFalha[]>('mod_wa_falhas')
export const waReenfileirar = async (id: number) =>
  exigirOk(await rpc<{ ok: boolean; erro?: string }>('mod_wa_reenfileirar', { p_id: id }))

export const waThread = (phoneId: string, foneKey: string) =>
  rpc<WaMsg[]>('mod_wa_thread', { p_phone_id: phoneId, p_fone_key: foneKey })

export const waResponder = async (phoneId: string, waId: string, texto: string) =>
  exigirOk(await rpc<{ ok: boolean; erro?: string; fila_id?: number }>('mod_wa_responder', {
    p_phone_id: phoneId, p_wa_id: waId, p_texto: texto,
  }))

export const waSugestao = async (id: number, acao: 'aprovar' | 'descartar') =>
  exigirOk(await rpc<{ ok: boolean; erro?: string }>('mod_wa_sugestao', { p_id: id, p_acao: acao }))

export const waRegras = () => rpc<WaRegra[]>('mod_wa_regras_list')

export const waRegraUpsert = async (r: {
  id: number | null; nome: string; gatilho: string; resposta: string
  modo: 'sugerir' | 'auto'; tipo: 'contem' | 'regex'; phoneId: string | null; ativo: boolean
}) =>
  exigirOk(await rpc<{ ok: boolean; erro?: string; id?: number }>('mod_wa_regra_upsert', {
    p_id: r.id, p_nome: r.nome, p_gatilho: r.gatilho, p_resposta: r.resposta,
    p_modo: r.modo, p_tipo: r.tipo, p_phone_id: r.phoneId, p_ativo: r.ativo,
  }))
