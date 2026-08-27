# slack-ok-linear

Create Linear issues from Slack **threads** via:

1. **Emoji** `:ticket:` on a message (recommended)
2. **Message shortcut** ⋮ → **OK → Linear**
3. Slash `/ok` only works **outside** threads (Slack limitation)

## Env

| Variable | Required | Notes |
|----------|----------|-------|
| `SLACK_SIGNING_SECRET` | yes | Same Slack app as the bot |
| `SLACK_BOT_TOKEN` | yes for emoji | `xoxb-…` Bot User OAuth Token |
| `SLACK_OK_REACTION` | no | default `ticket` |
| `LINEAR_API_KEY` | yes | |
| `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` | one | |
| `LLM_PROVIDER` | no | `auto` / `anthropic` / `openrouter` |

## Endpoints

- `POST /slack/events` — Event Subscriptions (reactions)
- `POST /slack/interactions` — Message shortcuts
- `POST /slack/commands/ok` — Slash `/ok`
- `GET /health`, `GET /llm-status`

## Slack app setup (jedna appka)

**Signing Secret + Bot Token + zkratka musí být ze stejné Slack appky.**

Teď je typicky: zkratka/ephemeral = **Andy**, zápis do vlákna = **Grambot** (`SLACK_BOT_TOKEN` z e-shopu) → přílohy a historie selžou.

Doporučení: vše na **Andy**.

1. Andy → **OAuth & Permissions** → Bot scopes:
   - `chat:write`
   - `reactions:read` / `reactions:write`
   - `channels:history` / `groups:history`
   - `files:read`
   - `users:read`
2. **Reinstall to Workspace**
3. Zkopíruj Andy **Bot User OAuth Token** (`xoxb-…`) do Railway `SLACK_BOT_TOKEN`
4. Signing Secret nech Andyho (už sedí se zkratkou)
5. Invite `@Andy` do kanálu

### A) Message shortcut

1. **Interactivity & Shortcuts** → ON  
   Request URL: `https://slack-ok-linear-production.up.railway.app/slack/interactions`
2. **Create New Shortcut** → **On messages** (not global)  
   - Name: `OK → Linear`  
   - Callback ID: `ok_linear`
3. In Slack search the shortcut as **OK** or **Linear** (not „nový“)
4. Reinstall app

### B) Emoji `:ticket:`

1. Bot scopes výše (včetně `reactions:*` a `files:read`)
2. **Event Subscriptions** → ON  
   Request URL: `https://slack-ok-linear-production.up.railway.app/slack/events`  
   Subscribe to bot events: `reaction_added`
3. **Reinstall to Workspace**
4. Invite bot into the channel
5. On a thread message add reaction 🎫 (`:ticket:`)

## Deploy

Railway service `slack-ok-linear`, healthcheck `/health`.
