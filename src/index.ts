import express, { type Request, type Response } from 'express';

import { analyzeTask, buildIssueDescription } from './analyze.js';
import { loadConfig, type AppConfig } from './config.js';
import { createIssue } from './linear.js';
import { probeLlm } from './llm.js';
import {
  buildThreadTaskText,
  parseInteractivePayload,
  parseMessageAction,
  parseSlashPayload,
  postResponseUrl,
  verifySlackSignature,
  type SlackMessageActionPayload,
  type SlackSlashPayload,
} from './slack.js';

type RawBodyRequest = Request & { rawBody?: Buffer };

function readRawBody(req: Request, _res: Response, buf: Buffer): void {
  (req as RawBodyRequest).rawBody = buf;
}

type OkJob = {
  text: string;
  channelName: string;
  userName: string;
  userId: string;
  responseUrl: string;
};

async function processOkJob(config: AppConfig, job: OkJob): Promise<void> {
  const analysis = await analyzeTask(config, {
    text: job.text,
    channelName: job.channelName,
    userName: job.userName,
    userId: job.userId,
  });

  const issue = await createIssue(config.linearApiKey, {
    teamId: config.teamId,
    title: analysis.title,
    description: buildIssueDescription(analysis, {
      text: job.text,
      channelName: job.channelName,
      userName: job.userName,
      userId: job.userId,
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

  await postResponseUrl(job.responseUrl, {
    response_type: 'ephemeral',
    text: lines.join('\n'),
  });
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
        'Ve *vlákně* Slack `/ok` nepodporuje.',
        'Použij zkratku u zprávy: ⋮ → *OK → Linear*.',
        '',
        'V kanálu (mimo thread): `/ok Co chci: …`',
      ].join('\n'),
    });
    return;
  }

  res.status(200).json({
    response_type: 'ephemeral',
    text: 'Zakládám Linear issue… (pár vteřin)',
  });

  void runJob(config, fromSlash(payload));
}

function fromSlash(payload: SlackSlashPayload): OkJob {
  return {
    text: payload.text,
    channelName: payload.channel_name,
    userName: payload.user_name,
    userId: payload.user_id,
    responseUrl: payload.response_url,
  };
}

function fromMessageAction(action: SlackMessageActionPayload): OkJob {
  return {
    text: buildThreadTaskText(action),
    channelName: action.channelName,
    userName: action.userName,
    userId: action.userId,
    responseUrl: action.responseUrl,
  };
}

function runJob(config: AppConfig, job: OkJob): void {
  void processOkJob(config, job).catch(async (error) => {
    console.error('ok job failed', error);
    try {
      await postResponseUrl(job.responseUrl, {
        response_type: 'ephemeral',
        text: `Nepovedlo se založit issue: ${error instanceof Error ? error.message : String(error)}`,
      });
    } catch (postError) {
      console.error('response_url error', postError);
    }
  });
}

async function handleInteractivity(config: AppConfig, req: Request, res: Response): Promise<void> {
  const rawBody = (req as RawBodyRequest).rawBody;
  if (!rawBody || !verifySlackSignature(config.slackSigningSecret, req, rawBody)) {
    res.status(401).send('invalid signature');
    return;
  }

  const body = req.body as Record<string, unknown>;
  const payload = parseInteractivePayload(body.payload ?? body);
  if (!payload) {
    res.status(400).send('invalid payload');
    return;
  }

  // Slack URL verification (rare on interactivity, but safe).
  if (String(payload.type ?? '') === 'url_verification') {
    res.status(200).json({ challenge: payload.challenge });
    return;
  }

  const action = parseMessageAction(payload);
  if (!action) {
    res.status(200).send('');
    return;
  }

  // Accept any message shortcut on this app (callback_id set in Slack UI).
  // Message actions must ACK with empty 200; follow up via response_url.
  res.status(200).send();

  void (async () => {
    try {
      await postResponseUrl(action.responseUrl, {
        response_type: 'ephemeral',
        text: 'Zakládám Linear issue ze zprávy ve vlákně…',
      });
    } catch (error) {
      console.error('ack via response_url failed', error);
    }
    runJob(config, fromMessageAction(action));
  })();
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

  app.post('/slack/interactions', (req, res) => {
    void handleInteractivity(config, req, res);
  });

  app.listen(config.port, () => {
    console.log(`slack-ok-linear listening on :${config.port}`);
  });
}

main();
