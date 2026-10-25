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

Set `ARIA_LLM_MODE=mock` or use the API key `aria-mock-key`. Test Connection succeeds locally and does not call `api.cursor.com`. GitHub listing and repo reads use `ARIA_GITHUB_MODE=mock` or the token `aria-mock-github`.

## Model tiers

Planning tasks resolve to `claude-4.6-opus-thinking` (override per project after checking `GET /v1/models`). Development tasks resolve to `auto`.

`auto` is the product name. The Cloud Agents API does not take that string as `model.id` (the legacy v0 note was to send `default`; the current TypeScript/Python SDK exposes Cursor Router as `auto-smart`). `cursorWireSelection('auto')` returns `{ id: 'auto-smart', params: [{ id: 'optimize_for', value: 'cost' }] }` for a later cloud-agent launch. This milestone still does not call `POST /v1/agents`. The token queue records `auto` or the top-tier id, then `complete()` throws `CURSOR_NO_CHAT_API` and the reservation is released.

## If Cursor ships a completions API later

Add a `complete()` branch in `apps/middleware/src/services/llmProvider.service.ts` and route it through `completeThroughGateway` in `guardedLlm.service.ts`. Do not call Cursor from a controller.
