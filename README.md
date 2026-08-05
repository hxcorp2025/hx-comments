# 🗣️ Central de Comentários — Hook Mídia

Painel interno de moderação de comentários de anúncios (TikTok + Meta FB/IG) do Sortudão.

- **Produção:** https://hxcorp2025.github.io/hx-comments/
- **Stack:** Vite + React 19 + TS · Supabase (RLS + Auth) · backend 100% Postgres (ver `backend/README.md`)
- **Acesso:** Supabase Auth com allowlist (`painel_operadores`) — conta fora da lista não vê nem faz nada
- **Módulos:** Fila de revisão · TikTok (aguardando scopes) · Facebook · Instagram · Regras · Insights · Log

Deploy: push na `main` → GitHub Actions → Pages. Repo público (regra do Pages free) — zero segredo aqui, por desenho.
