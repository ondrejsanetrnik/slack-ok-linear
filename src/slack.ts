import { createHmac, timingSafeEqual } from 'node:crypto';

import type { Request } from 'express';

const MAX_CLOCK_SKEW_SEC = 60 * 5;

export function verifySlackSignature(
  signingSecret: string,
  req: Request,
  rawBody: Buffer,
): boolean {
  const timestamp = req.headers['x-slack-request-timestamp'];
  const signature = req.headers['x-slack-signature'];
  if (typeof timestamp !== 'string' || typeof signature !== 'string') {
    return false;
  }

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_CLOCK_SKEW_SEC) {
    return false;
  }

  const base = `v0:${timestamp}:${rawBody.toString('utf8')}`;
  const digest = createHmac('sha256', signingSecret).update(base).digest('hex');
  const expected = Buffer.from(`v0=${digest}`);
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length) {
    return false;
  }
  return timingSafeEqual(expected, provided);
}

export type SlackSlashPayload = {
  command: string;
  text: string;
  user_id: string;
  user_name: string;
  channel_id: string;
  channel_name: string;
  response_url: string;
  trigger_id: string;
  team_id: string;
};

export type SlackMessageActionPayload = {
  callbackId: string;
  responseUrl: string;
  triggerId: string;
  userId: string;
  userName: string;
  channelId: string;
  channelName: string;
  messageText: string;
  messageTs: string;
  threadTs: string | undefined;
  messageUserId: string | undefined;
  permalinkHint: string | undefined;
};

export function parseSlashPayload(body: Record<string, unknown>): SlackSlashPayload {
  return {
    command: String(body.command ?? ''),
    text: String(body.text ?? '').trim(),
    user_id: String(body.user_id ?? ''),
    user_name: String(body.user_name ?? ''),
    channel_id: String(body.channel_id ?? ''),
    channel_name: String(body.channel_name ?? ''),
    response_url: String(body.response_url ?? ''),
    trigger_id: String(body.trigger_id ?? ''),
    team_id: String(body.team_id ?? ''),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function parseInteractivePayload(raw: unknown): Record<string, unknown> | null {
  if (typeof raw === 'string') {
    try {
      return asRecord(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object' && raw !== null) {
    return asRecord(raw);
  }
  return null;
}

export function parseMessageAction(payload: Record<string, unknown>): SlackMessageActionPayload | null {
  if (String(payload.type ?? '') !== 'message_action') {
    return null;
  }

  const user = asRecord(payload.user);
  const channel = asRecord(payload.channel);
  const message = asRecord(payload.message);

  const messageText = String(message.text ?? '').trim();
  const responseUrl = String(payload.response_url ?? '');
  if (!messageText || !responseUrl) {
    return null;
  }

  return {
    callbackId: String(payload.callback_id ?? ''),
    responseUrl,
    triggerId: String(payload.trigger_id ?? ''),
    userId: String(user.id ?? ''),
    userName: String(user.username ?? user.name ?? ''),
    channelId: String(channel.id ?? ''),
    channelName: String(channel.name ?? ''),
    messageText,
    messageTs: String(message.ts ?? ''),
    threadTs: message.thread_ts ? String(message.thread_ts) : undefined,
    messageUserId: message.user ? String(message.user) : undefined,
    permalinkHint: undefined,
  };
}

export async function postResponseUrl(
  responseUrl: string,
  message: {
    text: string;
    response_type?: 'ephemeral' | 'in_channel';
    replace_original?: boolean;
    thread_ts?: string;
  },
): Promise<void> {
  const response = await fetch(responseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Slack response_url failed: ${response.status} ${text}`);
  }
}

export function buildThreadTaskText(action: SlackMessageActionPayload, extraNotes?: string): string {
  const parts = [
    '## Zpráva ze Slack threadu',
    action.messageText,
    '',
    `Kanál: #${action.channelName || action.channelId}`,
    action.threadTs ? `Thread ts: ${action.threadTs}` : null,
    action.messageTs ? `Message ts: ${action.messageTs}` : null,
    action.messageUserId ? `Autor zprávy: <@${action.messageUserId}>` : null,
  ].filter((line) => line !== null);

  const notes = (extraNotes ?? '').trim();
  if (notes) {
    parts.push('', '## Poznámky od Ondry', notes);
  }

  return parts.join('\n');
}
