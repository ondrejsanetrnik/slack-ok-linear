# slack-ok-linear

Slack slash command **`/ok`** → AI (OpenRouter or Anthropic) → Linear issue in **Gramo IT**.

## Flow

1. In Slack: `/ok Co chci: … / Jak přistoupím: … / Poznámky: …`
2. Service acks immediately (Slack 3s limit)
3. LLM fills title, description, priority, estimate (0–6 h), project
4. Linear issue: assignee **Ondra**, state **Todo**, **current cycle**, team **Gramo IT**
5. Ephemeral reply with issue link

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
| `SLACK_BOT_TOKEN` | no | reserved for future thread replies |
| `LINEAR_TEAM_ID` | no | defaults to Gramo IT |
| `LINEAR_ASSIGNEE_ID` | no | defaults to Ondra |
| `LINEAR_STATE_NAME` | no | default `Todo` |
| `PORT` | no | Railway sets this |

## Endpoints

- `GET /health` — healthcheck
- `GET /llm-status` — probe OpenRouter + Anthropic
- `POST /slack/commands/ok` — Slack slash Request URL

## Slack app setup

1. [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From scratch
2. **Slash Commands** → Create New Command
   - Command: `/ok`
   - Request URL: `https://YOUR-SERVICE.up.railway.app/slack/commands/ok`
   - Short description: `Založí Linear issue přes AI`
3. Copy **Signing Secret** → `SLACK_SIGNING_SECRET`
4. Install app to the Gramodesky workspace
5. Invite the app to channels where you use `/ok` (if Slack requires it)

## Local

```bash
cp .env.example .env
npm install
npm run dev
```

## Deploy (Railway)

Same pattern as `fio-bank-mcp-http`: GitHub repo + Dockerfile, healthcheck `/health`.
