# slack-ok-linear

Slack **message shortcut** (works in threads) → AI → Linear issue in **Gramo IT**.

Slash `/ok` still works in channels, but **not in threads** (Slack limitation).

## Thread flow (recommended)

1. In a thread, open ⋮ on the message (error / your notes)
2. **OK → Linear**
3. Agent creates the issue; you get an ephemeral link

## Channel flow

`/ok Co chci: … / Jak přistoupím: … / Poznámky: …`

## Env

| Variable | Required | Notes |
|----------|----------|-------|
| `SLACK_SIGNING_SECRET` | yes | Slack app → Basic Information |
| `LINEAR_API_KEY` | yes | Linear → Settings → API → Personal API key |
| `OPENROUTER_API_KEY` | one of LLM | Preferred when working |
| `ANTHROPIC_API_KEY` | one of LLM | Fallback / primary if OpenRouter down |
| `ANTHROPIC_WORKSPACE_ID` | for some keys | `wrkspc_…` from Claude Console → Workspaces |
| `LLM_PROVIDER` | no | `auto` (default), `openrouter`, `anthropic` |
| `OPENROUTER_MODEL` | no | default `openai/gpt-5-mini` |
| `ANTHROPIC_MODEL` | no | default `claude-sonnet-4-5` |
| `SLACK_BOT_TOKEN` | no | reserved |
| `LINEAR_TEAM_ID` | no | defaults to Gramo IT |
| `LINEAR_ASSIGNEE_ID` | no | defaults to Ondra |
| `LINEAR_STATE_NAME` | no | default `Todo` |
| `PORT` | no | Railway sets this |

## Endpoints

- `GET /health` — healthcheck
- `GET /llm-status` — probe OpenRouter + Anthropic
- `POST /slack/commands/ok` — Slash Command Request URL
- `POST /slack/interactions` — Interactivity & Shortcuts Request URL

## Slack app setup (threads)

1. **Interactivity & Shortcuts** → ON  
   Request URL: `https://YOUR-SERVICE.up.railway.app/slack/interactions`
2. **Create New Shortcut** → **On messages**
   - Name: `OK → Linear`
   - Short description: `Založí Linear issue ze zprávy`
   - Callback ID: `ok_linear`
3. Reinstall app if Slack asks
4. In a thread: ⋮ on a message → **OK → Linear**

## Local

```bash
cp .env.example .env
npm install
npm run dev
```

## Deploy (Railway)

Same pattern as `fio-bank-mcp-http`: GitHub repo + Dockerfile, healthcheck `/health`.
