// ===== CONFIG =====
// anon key é pública por design (RLS + allowlist protegem). NENHUM segredo aqui, nunca.
export const CONFIG = {
  SUPABASE_URL: 'https://ntavetjmfotlwmcgwsju.supabase.co',
  SUPABASE_ANON_KEY:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50YXZldGptZm90bHdtY2d3c2p1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQwNTAzNDksImV4cCI6MjA1OTYyNjM0OX0.jWCJr4qPHjiun2BCdx8U4Oi7cQ2gQmU-D0vrk10FGao',
} as const

// Módulos por plataforma. TikTok liga quando os scopes aprovarem (re-auth + flag true).
export const FEATURES = {
  tiktok: false,
} as const
