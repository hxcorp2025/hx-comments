# Backend — Central de Comentários

O backend inteiro mora no Supabase (projeto `ntavetjmfotlwmcgwsju`), aplicado via migrations
pelo Claude (MCP). Este arquivo é o runbook do que existe — NENHUM segredo aqui.

## Migrations aplicadas (05/08/2026)

| Migration | O que faz |
|---|---|
| `central_comentarios_f1_tabelas` | `ad_comments`, `mod_posts`, `mod_rules`, `mod_log`, `mod_templates`, `painel_operadores` + RLS + allowlist |
| `central_comentarios_f1_motor` | `mod_api_set_hidden/responder` (Vault) + `mod_engine()` (regras, unaccent, nunca reoculta `liberado`) |
| `central_comentarios_f1_sync` | `meta_comments_sync()` incremental (FB stories + IG dark posts via creative) |
| `central_comentarios_f1_rpcs` | RPCs do painel (`mod_ocultar/liberar/lote/classificar/responder/regra_*`) — allowlist + rate limit + log |
| `central_comentarios_f1_insights_crons` | `mod_insights`, `mod_negativos_por_anuncio()`, `mod_digest_semanal()` + crons |
| `meta_audiences_f2_publicos` | 4 Custom Audiences (ALL/30d/2plus/7d) + replace semanal |
| `meta_capi_recorrente_f2` | evento CAPI `CompradorRecorrente` (fila+trigger+cron) + custom conversion |
| `meta_diagnostics_f2` | snapshot diário de learning stage + alerta |

## Crons

- `meta_comments_sync_15min` (*/15) — sync + motor
- `mod_digest_semanal` (seg 12h UTC = 9h BR) — digest pro WhatsApp
- `meta_audiences_semanal` (seg 1h UTC = dom 22h BR) — refresh dos públicos
- `sortudao_recorrente_5min` (*/5) — fila do CompradorRecorrente
- `meta_diagnostics_diario` (12:30 UTC = 9:30 BR) — learning stage + alerta

## Segurança (regra da casa)

- anon key é pública por design; a fechadura é RLS + allowlist `painel_operadores` validada DENTRO de cada RPC
- Toda função nova: `revoke all ... from public, anon, authenticated` + grant seletivo (incidente 29/07)
- Tokens (page token Diego Rox, SU Sortudão) SÓ no Vault, chamados server-side
- Ocultar é reversível; `mod_log` registra tudo; motor nunca reoculta `status='liberado'`
