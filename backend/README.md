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
| `evo_api_helper` + `evo_api_timeout_maior` | `evo_api()` — HTTP pra Evolution, chave do Vault, curl 30s. **Só postgres/service_role** |
| `evo_painel_instancias` | `evo_instancias`, `evo_fila` + RPCs `evo_pedir()` / `evo_painel()` (allowlist + papel admin) |
| `evo_worker` + `evo_worker_endurecido` | worker das ações: criar, conectar (QR), estado, logout, deletar, sincronizar, proxy, grupos |
| `evo_mascarar_payload_robusto` | tira credencial de dentro do payload em qualquer nível (token/apikey/password/uri/secret) |
| `evo_warmup_e_limites` | `evo_chip_politica`, `evo_envio_log`, `evo_teto_hoje()`, `evo_pode_enviar()`, view `evo_chips_saude` |
| `evo_grupos_leitura` | `evo_grupos` + `evo_processar_grupos()` (marca `sumiu_em` quem some da varredura) |

### 🔴 Antes de mexer em qualquer coisa `evo_*`

Este subsistema **já foi auditado e teve os grants fechados** (11/08). Se você recriar uma função
ou uma view aqui, ela **nasce aberta de novo** — foi assim que número de chip e GID de grupo ficaram
legíveis pela chave anon por algumas horas. Regras que valem sempre:

- Função nova ou recriada → `revoke all ... from public, anon, authenticated` + grant seletivo.
- **View nova → `revoke` também.** View de dono `postgres` sem `security_invoker` **fura a RLS** da
  tabela de baixo, mesmo com a tabela perfeitamente trancada. O painel lê por RPC com gate, nunca
  por view.
- Ação destrutiva (criar/desconectar/apagar/proxy) exige `papel='admin'` dentro do SQL. Esconder o
  botão no front não é permissão: o repo é público e publica o nome da RPC.
- Nada de `it.instancia` / `release_id` / `ref_id` cru na URL: são entrada de terceiro, valida com
  regex antes.
- Conferir depois: `select has_table_privilege('anon','public.<view>','SELECT')`.

## Crons

- `meta_comments_sync_15min` (*/15) — sync + motor
- `mod_digest_semanal` (seg 12h UTC = 9h BR) — digest pro WhatsApp
- `meta_audiences_semanal` (seg 1h UTC = dom 22h BR) — refresh dos públicos
- `sortudao_recorrente_5min` (*/5) — fila do CompradorRecorrente
- `meta_diagnostics_diario` (12:30 UTC = 9:30 BR) — learning stage + alerta
- `evo_worker_10s` (#122, a cada **10 segundos**) — worker das instâncias. Cadência em segundos
  porque o QR do WhatsApp vale ~1 min; com cron de 1/min o código venceria antes de aparecer
- `evo_sync_5min` (#124, */5) — poda a fila e pede `sincronizar` (com guarda de duplicata)
- `evo_grupos_6h` (#126, 25 */6) — varre grupos de cada instância conectada

## Segurança (regra da casa)

- anon key é pública por design; a fechadura é RLS + allowlist `painel_operadores` validada DENTRO de cada RPC
- Toda função nova: `revoke all ... from public, anon, authenticated` + grant seletivo (incidente 29/07)
- Tokens (page token Diego Rox, SU Sortudão) SÓ no Vault, chamados server-side
- Ocultar é reversível; `mod_log` registra tudo; motor nunca reoculta `status='liberado'`
