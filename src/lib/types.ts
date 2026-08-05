export type Plataforma = 'fb' | 'ig' | 'tiktok'
export type Status = 'visivel' | 'revisao' | 'oculto_auto' | 'oculto_manual' | 'respondido' | 'liberado'
export type Classe = 'golpe' | 'reclamacao' | 'duvida' | 'prova_social' | 'neutro'

export interface Comment {
  id: number
  plataforma: Plataforma
  post_id: string
  comment_id: string
  parent_id: string | null
  autor_nome: string | null
  texto: string | null
  created_time: string | null
  like_count: number
  is_hidden: boolean
  status: Status
  classe: Classe | null
  ad_ids: string[]
  permalink_url: string | null
}

export interface Regra {
  id: number
  termo: string
  descricao: string | null
  acao: 'auto_ocultar' | 'marcar_revisao'
  plataformas: string[]
  ativa: boolean
  criada_por: string
  criada_em: string
  editada_em: string
  promovida_em: string | null
}

export interface Template {
  id: number
  titulo: string
  texto: string
  ativa: boolean
}

export interface LogRow {
  id: number
  ts: string
  quem: string
  acao: string
  plataforma: string | null
  comment_id: string | null
  detalhe: string | null
}

export interface NegativoAnuncio {
  ad_id: string
  ad_name: string | null
  gasto_7d: number
  comentarios_7d: number
  negativos_7d: number
  pct_negativo: number
  ocultos_7d: number
}
