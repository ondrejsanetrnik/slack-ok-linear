import express, { type Request, type Response } from 'express';

import { analyzeTask, buildIssueDescription } from './analyze.js';
import { loadConfig, type AppConfig } from './config.js';
import {
  appendAssetsToDescription,
  attachUrlToIssue,
  createIssue,
  uploadFileToLinear,
} from './linear.js';
import { probeLlm } from './llm.js';
import {
  addReaction,
  buildThreadTaskText,
  collectThreadFiles,
  downloadSlackFile,
  fetchMessageText,
  fetchThreadConversation,
  fetchUserName,
  formatThreadConversation,
  getMessagePermalink,
  parseInteractivePayload,
  parseMessageAction,
  parseReactionAddedEvent,
  parseSlashPayload,
  postEphemeral,
  postResponseUrl,
  postThreadMessage,
  verifySlackSignature,
  type SlackFileRef,
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
  channelId?: string;
  userName: string;
  userId: string;
  responseUrl?: string;
  threadTs?: string;
  messageTs?: string;
  files?: SlackFileRef[];
  slackTranscript?: string;
  slackPermalink?: string;
  /** Caption on the message that triggered OK (before thread expand). */
  focusMessageText?: string;
};

async function notifyProgress(config: AppConfig, job: OkJob, text: string): Promise<void> {
  if (job.responseUrl) {
    await postResponseUrl(job.responseUrl, {
      response_type: 'ephemeral',
      text,
    });
    return;
  }

  if (!config.slackBotToken || !job.channelId) {
    return;
  }

  await postEphemeral(config.slackBotToken, job.channelId, job.userId, text, job.threadTs);
}

async function publishResult(config: AppConfig, job: OkJob, text: string): Promise<void> {
  const botToken = config.slackBotToken;
  const channelId = job.channelId;
  const threadTs = job.threadTs ?? job.messageTs;

  if (botToken && channelId && threadTs) {
    await postThreadMessage(botToken, channelId, text, threadTs);
    if (job.messageTs) {
      try {
        await addReaction(botToken, channelId, job.messageTs, 'eyes');
      } catch (error) {
        // Missing reactions:write must not hide a successful issue create.
        console.warn('Could not add eyes reaction', error);
      }
    }
    return;
  }

  // Fallback when bot cannot post publicly.
  await notifyProgress(config, job, text);
}

async function transferSlackFilesToLinear(
  config: AppConfig,
  files: SlackFileRef[],
): Promise<Array<{ assetUrl: string; filename: string; contentType: string }>> {
  if (files.length === 0) {
    return [];
  }
  if (!config.slackBotToken) {
    console.warn('Slack files present but SLACK_BOT_TOKEN missing — skipping attachments');
    return [];
  }

  const assets: Array<{ assetUrl: string; filename: string; contentType: string }> = [];
  for (const file of files) {
    try {
      const downloaded = await downloadSlackFile(config.slackBotToken, file);
      const uploaded = await uploadFileToLinear(config.linearApiKey, {
        filename: downloaded.filename,
        contentType: downloaded.contentType,
        body: downloaded.buffer,
      });
      assets.push(uploaded);
    } catch (error) {
      console.error(`Failed to transfer Slack file ${file.name}`, error);
    }
  }
  return assets;
}

async function enrichJobWithSlackThread(config: AppConfig, job: OkJob): Promise<OkJob> {
  if (!config.slackBotToken || !job.channelId || !job.messageTs) {
    if (!job.slackTranscript) {
      job.slackTranscript = job.focusMessageText || job.text;
    }
    return job;
  }

  const threadTs = job.threadTs ?? job.messageTs;

  try {
    job.slackPermalink = await getMessagePermalink(
      config.slackBotToken,
      job.channelId,
      // Prefer thread root so the link opens the whole conversation.
      threadTs,
    );
  } catch (error) {
    console.warn('Could not resolve Slack permalink', error);
  }

  try {
    const messages = await fetchThreadConversation(
      config.slackBotToken,
      job.channelId,
      threadTs,
    );
    if (messages.length > 0) {
      job.slackTranscript = formatThreadConversation(messages, job.messageTs);
      const threadFiles = collectThreadFiles(messages);
      if (threadFiles.length > 0) {
        job.files = threadFiles;
      }

      const focus =
        messages.find((m) => m.ts === job.messageTs) ??
        messages.find((m) => m.isParent) ??
        messages[0];
      job.focusMessageText = focus?.text ?? job.focusMessageText;
      job.text = [
        '## Zpráva, ze které vzniká úkol',
        job.focusMessageText || '(bez textu)',
        '',
        '## Celé Slack vlákno (kořen + odpovědi)',
        job.slackTranscript,
        '',
        `Kanál: #${job.channelName || job.channelId}`,
        job.slackPermalink ? `Permalink: ${job.slackPermalink}` : null,
      ]
        .filter((line) => line !== null)
        .join('\n');
    } else if (!job.slackTranscript) {
      job.slackTranscript = job.focusMessageText || job.text;
    }
  } catch (error) {
    console.warn('Could not load Slack thread conversation', error);
    if (!job.slackTranscript) {
      job.slackTranscript = job.focusMessageText || job.text;
    }
  }

  return job;
}

async function processOkJob(config: AppConfig, job: OkJob): Promise<void> {
  await enrichJobWithSlackThread(config, job);

  const analysis = await analyzeTask(config, {
    text: job.text,
    channelName: job.channelName,
    userName: job.userName,
    userId: job.userId,
    slackTranscript: job.slackTranscript,
  });

  const assets = await transferSlackFilesToLinear(config, job.files ?? []);
  const description = appendAssetsToDescription(
    buildIssueDescription(analysis, {
      text: job.text,
      channelName: job.channelName,
      userName: job.userName,
      userId: job.userId,
      slackTranscript: job.slackTranscript,
      slackPermalink: job.slackPermalink,
    }),
    assets,
  );

  const issue = await createIssue(config.linearApiKey, {
    teamId: config.teamId,
    title: analysis.title,
    description,
    assigneeId: config.assigneeId,
    stateName: config.stateName,
    projectId: analysis.project_id,
    priority: analysis.priority,
    estimate: analysis.estimate_hours,
    cycleId: null,
  });

  if (job.slackPermalink) {
    try {
      await attachUrlToIssue(
        config.linearApiKey,
        issue.id,
        job.slackPermalink,
        'Slack konverzace',
      );
    } catch (error) {
      console.error(`Failed to attach Slack permalink to ${issue.identifier}`, error);
    }
  }

  for (const asset of assets) {
    try {
      await attachUrlToIssue(config.linearApiKey, issue.id, asset.assetUrl, asset.filename);
    } catch (error) {
      console.error(`Failed to attach ${asset.filename} to ${issue.identifier}`, error);
    }
  }

  const lines = [
    `Hotovo: *<${issue.url}|${issue.identifier}>* — ${issue.title}`,
    `Priorita: ${analysis.priority} · Estimate: ${analysis.estimate_hours} h` +
      (analysis.project_name ? ` · Projekt: ${analysis.project_name}` : ''),
  ];
  if ((job.files?.length ?? 0) > 0) {
    lines.push(
      assets.length > 0
        ? `Přílohy: ${assets.length}/${job.files!.length}`
        : 'Přílohy: nepodařilo se přenést (zkontroluj scope `files:read`)',
    );
  }

  await publishResult(config, job, lines.join('\n'));
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
        '*Ve vlákně použij:*',
        `• emoji :${config.slackOkReaction}: na zprávu`,
        '• nebo ⋮ → *OK → Linear*',
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
    channelId: payload.channel_id,
    userName: payload.user_name,
    userId: payload.user_id,
    responseUrl: payload.response_url,
    focusMessageText: payload.text,
    slackTranscript: payload.text,
  };
}

function fromMessageAction(action: SlackMessageActionPayload): OkJob {
  return {
    text: buildThreadTaskText(action),
    channelName: action.channelName,
    channelId: action.channelId,
    userName: action.userName,
    userId: action.userId,
    responseUrl: action.responseUrl,
    threadTs: action.threadTs ?? action.messageTs,
    messageTs: action.messageTs,
    files: action.files,
    focusMessageText: action.messageText,
  };
}

function runJob(config: AppConfig, job: OkJob): void {
  void processOkJob(config, job).catch(async (error) => {
    console.error('ok job failed', error);
    try {
      await notifyProgress(
        config,
        job,
        `Nepovedlo se založit issue: ${error instanceof Error ? error.message : String(error)}`,
      );
    } catch (postError) {
      console.error('notify failed', postError);
    }
  });
}

async function handleInteractivity(config: AppConfig, req: Request, res: Response): Promise<void> {
  const rawBody = (req as RawBodyRequest).rawBody;
  if (!rawBody || !verifySlackSignature(config.slackSigningSecret, req, rawBody)) {
    console.warn('interactions: invalid signature', {
      hasRawBody: Boolean(rawBody),
      contentType: req.headers['content-type'],
    });
    res.status(401).send('invalid signature');
    return;
  }

  const body = req.body as Record<string, unknown>;
  const payload = parseInteractivePayload(body.payload ?? body);
  if (!payload) {
    console.warn('interactions: invalid payload envelope');
    res.status(400).send('invalid payload');
    return;
  }

  if (String(payload.type ?? '') === 'url_verification') {
    res.status(200).json({ challenge: payload.challenge });
    return;
  }

  console.info('interactions:', {
    type: payload.type,
    callback_id: payload.callback_id,
  });

  const action = parseMessageAction(payload);
  if (!action) {
    console.warn('interactions: unsupported or empty message_action', {
      type: payload.type,
      callback_id: payload.callback_id,
      hasMessage: Boolean(payload.message),
    });
    res.status(200).send();
    const responseUrl = String(payload.response_url ?? '');
    if (responseUrl) {
      void postResponseUrl(responseUrl, {
        response_type: 'ephemeral',
        text: 'Z této zprávy nešlo vytáhnout text. Zkus jinou zprávu nebo reakci :ticket:.',
      }).catch((error) => console.error(error));
    }
    return;
  }

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

    const job = fromMessageAction(action);
    // Prefer fresh file list from API when bot can read history (shortcut payload can omit urls).
    if (config.slackBotToken && job.channelId && job.messageTs) {
      try {
        const fresh = await fetchMessageText(
          config.slackBotToken,
          job.channelId,
          job.messageTs,
        );
        if (fresh.files.length > 0) {
          job.files = fresh.files;
        }
        if (fresh.threadTs) {
          job.threadTs = fresh.threadTs;
        }
        if (fresh.text) {
          job.focusMessageText = fresh.text;
        }
      } catch (error) {
        console.warn('Could not refresh message for attachments', error);
      }
    }

    runJob(config, job);
  })();
}

async function handleEvents(config: AppConfig, req: Request, res: Response): Promise<void> {
  const rawBody = (req as RawBodyRequest).rawBody;
  const body = req.body as Record<string, unknown>;

  // URL verification has no usable signature content in some setups; still verify when possible.
  if (String(body.type ?? '') === 'url_verification') {
    res.status(200).json({ challenge: body.challenge });
    return;
  }

  if (!rawBody || !verifySlackSignature(config.slackSigningSecret, req, rawBody)) {
    res.status(401).send('invalid signature');
    return;
  }

  if (String(body.type ?? '') !== 'event_callback') {
    res.status(200).send('');
    return;
  }

  const event = (typeof body.event === 'object' && body.event !== null
    ? body.event
    : {}) as Record<string, unknown>;

  const reactionEvent = parseReactionAddedEvent(event);
  res.status(200).send('');

  if (!reactionEvent) {
    return;
  }

  if (reactionEvent.reaction !== config.slackOkReaction) {
    return;
  }

  if (!config.slackBotToken) {
    console.error('SLACK_BOT_TOKEN required for emoji reactions');
    return;
  }

  void (async () => {
    const botToken = config.slackBotToken!;
    try {
      const message = await fetchMessageText(
        botToken,
        reactionEvent.channelId,
        reactionEvent.messageTs,
      );
      const userName = await fetchUserName(botToken, reactionEvent.userId);

      const job: OkJob = {
        text: buildThreadTaskText({
          messageText: message.text,
          channelId: reactionEvent.channelId,
          threadTs: message.threadTs,
          messageTs: reactionEvent.messageTs,
          messageUserId: reactionEvent.itemUserId,
        }),
        channelName: reactionEvent.channelId,
        channelId: reactionEvent.channelId,
        userName,
        userId: reactionEvent.userId,
        threadTs: message.threadTs ?? reactionEvent.messageTs,
        messageTs: reactionEvent.messageTs,
        files: message.files,
        focusMessageText: message.text,
      };

      await notifyProgress(
        config,
        job,
        `Zakládám Linear issue (reakce :${config.slackOkReaction}:)…`,
      );
      await processOkJob(config, job);
    } catch (error) {
      console.error('reaction ok failed', error);
      try {
        await postEphemeral(
          botToken,
          reactionEvent.channelId,
          reactionEvent.userId,
          `Nepovedlo se založit issue: ${error instanceof Error ? error.message : String(error)}`,
          reactionEvent.messageTs,
        );
      } catch (notifyError) {
        console.error('reaction notify failed', notifyError);
      }
    }
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

  app.get('/bot-status', async (_req, res) => {
    if (!config.slackBotToken) {
      res.status(500).json({ ok: false, error: 'SLACK_BOT_TOKEN missing' });
      return;
    }
    try {
      const response = await fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.slackBotToken}` },
      });
      const data = (await response.json()) as {
        ok?: boolean;
        user?: string;
        user_id?: string;
        bot_id?: string;
        error?: string;
      };
      res.json({
        ok: Boolean(data.ok),
        bot_user: data.user ?? null,
        bot_user_id: data.user_id ?? null,
        bot_id: data.bot_id ?? null,
        error: data.error ?? null,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  // Slack / browsers sometimes probe Request URLs with GET.
  app.get('/slack/interactions', (_req, res) => {
    res.type('text/plain').send('ok');
  });
  app.get('/slack/events', (_req, res) => {
    res.type('text/plain').send('ok');
  });
  app.get('/slack/commands/ok', (_req, res) => {
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

  app.post('/slack/events', (req, res) => {
    void handleEvents(config, req, res);
  });

  app.listen(config.port, () => {
    console.log(
      `slack-ok-linear listening on :${config.port} (reaction :${config.slackOkReaction}:)`,
    );
    if (config.slackBotToken) {
      void fetch('https://slack.com/api/auth.test', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.slackBotToken}` },
      })
        .then(async (response) => {
          const data = (await response.json()) as { ok?: boolean; user?: string; error?: string };
          if (data.ok) {
            console.log(`Slack bot identity: ${data.user}`);
          } else {
            console.warn(`Slack bot auth.test failed: ${data.error ?? 'unknown'}`);
          }
        })
        .catch((error) => console.warn('Slack bot auth.test error', error));
    }
  });
}

main();
