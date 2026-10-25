# Cursor as the default LLM provider

ARIA's setup wizard defaults to **Cursor**. The official programmatic surface (researched October 2026) is the [Cursor Cloud Agents API](https://cursor.com/docs/cloud-agent/api/endpoints), a public beta at `https://api.cursor.com`.

## What the API actually is

- Authentication is an API key from [Cursor Dashboard → Integrations](https://cursor.com/dashboard/integrations), sent as `Authorization: Bearer <key>` or HTTP Basic (key as the username, empty password).
- `GET /v1/me` returns the authenticated user. ARIA uses this for **Test Connection**.
- `POST /v1/agents` launches a cloud agent against a repository Cursor already has access to. Runs are asynchronous and poll via `GET /v1/agents/{id}`.
- Official docs state that the Cloud Agents API and the TypeScript/Python `@cursor/sdk` are **not** a chat-completions or model-inference API. There is no endpoint that accepts a prompt and returns a completion the way OpenAI, Anthropic, Gemini, or Groq do.

## What ARIA does with that

| Step | Cursor behavior |
|---|---|
| Test Connection | `GET {CURSOR_API_BASE}/v1/me` (default base `https://api.cursor.com`). Must return HTTP 200 before the key is stored. |
| Stored secret | AES-256-GCM. The key is derived with scrypt from `WORKSPACE_ENCRYPTION_KEY` and a random salt. The API key is never logged or returned. |
| Knowledge map | Built from the GitHub tree and a bounded set of file reads (manifests, routes, schemas). No chat call. |
| Company generation | Deterministic role templates and a seeded name list. No chat call. |
| Later chat features | Use Gemini, Groq, Ollama, OpenAI, Anthropic, or any OpenAI-compatible base URL. Those calls go through the token-budget gateway and the sanitizer. |

`complete()` for provider `cursor` throws `CURSOR_NO_CHAT_API` rather than pretending a cloud-agent launch is a completion. Launching a cloud agent to summarize a repo would require the repo to be connected inside Cursor, would be asynchronous, and would not fit the token-budget queue. That is intentionally out of this milestone.

## Local tests without a real key

`ARIA_LLM_MODE=mock` (and `ARIA_GITHUB_MODE=mock`) skips the network when `NODE_ENV` is not `production`. A key string is not special. Production ignores mock mode.

To exercise the HTTP path, point `CURSOR_API_BASE` and `GITHUB_API_BASE` at `node scripts/provider-stub.mjs` and leave the modes on `live`. The stub accepts any bearer token and returns a model catalog.

## Model tiers

Test Connection calls `GET /v1/models`, picks a planning id and an Auto id from that list, and stores both. Hard-coded ids are only the mock catalog and the last-resort labels in `defaultTierModels`. A live completion without a stored id is rejected.

`auto` is sent as `{ id: 'auto' }` when the catalog lists it. `auto-smart` is sent with `optimize_for=cost` only when that id itself was stored. `claude-4.6-opus-thinking` is not assumed to be current; the picker prefers `claude-opus-5`, `gpt-5.5`, `grok-4.6`, `claude-fable-5`, or `composer-2.5` when the catalog includes one of them.

This milestone still does not call `POST /v1/agents`. The token queue records the stored id, then `complete()` throws `CURSOR_NO_CHAT_API` and the reservation is released.

## If Cursor ships a completions API later

Add a `complete()` branch in `apps/middleware/src/services/llmProvider.service.ts` and route it through `completeThroughGateway` in `guardedLlm.service.ts`. Do not call Cursor from a controller.
