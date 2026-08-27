import express, { type Request, type Response } from 'express';

import { analyzeTask, buildIssueDescription } from './analyze.js';
import { loadConfig, type AppConfig } from './config.js';
import { createIssue } from './linear.js';
import { probeLlm } from './llm.js';
import { parseSlashPayload, postResponseUrl, verifySlackSignature } from './slack.js';

type RawBodyRequest = Request & { rawBody?: Buffer };

function readRawBody(req: Request, _res: Response, buf: Buffer): void {
  (req as RawBodyRequest).rawBody = buf;
}

async function handleOkCommand(config: AppConfig, req: Request, res: Response): Promise<void> {
  const rawBody = (req as RawBodyRequest).rawBody;
  if (!rawBody || !verifySlackSignature(config.slackSigningSecret, req, rawBody)) {
    res.status(401).send('invalid signature');
    return;
  }

  const payload = parseSlashPayload(req.body as Record<string, unknown>);
  if (payload.command !== '/ok') {
    res.status(200).json({
      response_type: 'ephemeral',
      text: `Tenhle endpoint umí jen \`/ok\` (dostal jsem \`${payload.command || '?'}\`).`,
    });
    return;
  }

  if (!payload.text) {
    res.status(200).json({
      response_type: 'ephemeral',
      text: [
        '*Použití*',
        '`/ok Co chci: …`',
        '`Jak k tomu přistoupím: …`',
        '`Poznámky pro AI: …`',
        '',
        'Celý text za `/ok` jde agentovi — založí Linear issue (Gramo IT → Ondra → Todo → aktuální cyklus).',
      ].join('\n'),
    });
    return;
  }

  // Ack within Slack's 3s window; finish async via response_url.
  res.status(200).json({
    response_type: 'ephemeral',
    text: 'Zakládám Linear issue… (pár vteřin)',
  });

  void processOkAsync(config, payload).catch(async (error) => {
    console.error('/ok failed', error);
    try {
      await postResponseUrl(payload.response_url, {
        response_type: 'ephemeral',
        text: `Nepovedlo se založit issue: ${error instanceof Error ? error.message : String(error)}`,
      });
    } catch (postError) {
      console.error('response_url error', postError);
    }
  });
}

async function processOkAsync(
  config: AppConfig,
  payload: ReturnType<typeof parseSlashPayload>,
): Promise<void> {
  const analysis = await analyzeTask(config, {
    text: payload.text,
    channelName: payload.channel_name,
    userName: payload.user_name,
    userId: payload.user_id,
  });

  const issue = await createIssue(config.linearApiKey, {
    teamId: config.teamId,
    title: analysis.title,
    description: buildIssueDescription(analysis, {
      text: payload.text,
      channelName: payload.channel_name,
      userName: payload.user_name,
      userId: payload.user_id,
    }),
    assigneeId: config.assigneeId,
    stateName: config.stateName,
    projectId: analysis.project_id,
    priority: analysis.priority,
    estimate: analysis.estimate_hours,
    cycleId: null,
  });

  const lines = [
    `Hotovo: *<${issue.url}|${issue.identifier}>* — ${issue.title}`,
    `Priorita: ${analysis.priority} · Estimate: ${analysis.estimate_hours} h` +
      (analysis.project_name ? ` · Projekt: ${analysis.project_name}` : ''),
  ];

  await postResponseUrl(payload.response_url, {
    response_type: 'ephemeral',
    text: lines.join('\n'),
  });
}

function main(): void {
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }

  if (!config.openRouterApiKey && !config.anthropicApiKey) {
    console.error('Set OPENROUTER_API_KEY and/or ANTHROPIC_API_KEY');
    process.exit(1);
  }

  const app = express();
  app.use(
    express.urlencoded({
      extended: true,
      verify: readRawBody,
    }),
  );
  app.use(express.json({ verify: readRawBody }));

  app.get('/', (_req, res) => {
    res.type('text/plain').send('slack-ok-linear');
  });

  app.get('/health', (_req, res) => {
    res.type('text/plain').send('ok');
  });

  app.get('/llm-status', async (_req, res) => {
    try {
      const status = await probeLlm(config);
      res.json(status);
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post('/slack/commands/ok', (req, res) => {
    void handleOkCommand(config, req, res);
  });

  app.listen(config.port, () => {
    console.log(`slack-ok-linear listening on :${config.port}`);
  });
}

main();
