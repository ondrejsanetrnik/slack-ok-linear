import type { AppConfig } from './config.js';

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export class LlmError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

async function callOpenRouter(
  config: AppConfig,
  messages: ChatMessage[],
): Promise<{ text: string; provider: string; model: string }> {
  const key = config.openRouterApiKey;
  if (!key) {
    throw new LlmError('OPENROUTER_API_KEY is not set', 'openrouter');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://www.gramodesky.cz',
      'X-Title': 'Gramodesky Slack /ok',
    },
    body: JSON.stringify({
      model: config.openRouterModel,
      temperature: 0.2,
      messages,
      response_format: { type: 'json_object' },
    }),
  });

  const body = (await response.json()) as {
    error?: { message?: string };
    model?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok) {
    throw new LlmError(
      body.error?.message ?? `OpenRouter HTTP ${response.status}`,
      'openrouter',
      response.status,
    );
  }

  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new LlmError('OpenRouter returned empty content', 'openrouter');
  }

  return { text, provider: 'openrouter', model: body.model ?? config.openRouterModel };
}

async function callAnthropic(
  config: AppConfig,
  messages: ChatMessage[],
): Promise<{ text: string; provider: string; model: string }> {
  const key = config.anthropicApiKey;
  if (!key) {
    throw new LlmError('ANTHROPIC_API_KEY is not set', 'anthropic');
  }

  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n');
  const anthropicMessages = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.anthropicModel,
      max_tokens: 2048,
      temperature: 0.2,
      system: system || undefined,
      messages: anthropicMessages,
    }),
  });

  const body = (await response.json()) as {
    error?: { message?: string };
    content?: Array<{ type: string; text?: string }>;
  };

  if (!response.ok) {
    throw new LlmError(
      body.error?.message ?? `Anthropic HTTP ${response.status}`,
      'anthropic',
      response.status,
    );
  }

  const text = body.content
    ?.filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('\n')
    .trim();

  if (!text) {
    throw new LlmError('Anthropic returned empty content', 'anthropic');
  }

  return { text, provider: 'anthropic', model: config.anthropicModel };
}

/**
 * Prefer OpenRouter when configured and healthy; fall back to Anthropic.
 * LLM_PROVIDER=openrouter|anthropic forces a single path.
 */
export async function completeJson(
  config: AppConfig,
  messages: ChatMessage[],
): Promise<{ text: string; provider: string; model: string }> {
  if (config.llmProvider === 'openrouter') {
    return callOpenRouter(config, messages);
  }
  if (config.llmProvider === 'anthropic') {
    return callAnthropic(config, messages);
  }

  if (config.openRouterApiKey) {
    try {
      return await callOpenRouter(config, messages);
    } catch (error) {
      if (!config.anthropicApiKey) {
        throw error;
      }
      console.warn('OpenRouter failed, falling back to Anthropic', error);
    }
  }

  if (config.anthropicApiKey) {
    return callAnthropic(config, messages);
  }

  throw new LlmError(
    'No LLM key configured. Set OPENROUTER_API_KEY and/or ANTHROPIC_API_KEY.',
    'none',
  );
}

export async function probeLlm(config: AppConfig): Promise<{
  openrouter: { ok: boolean; detail: string };
  anthropic: { ok: boolean; detail: string };
}> {
  const probeMessages: ChatMessage[] = [
    { role: 'system', content: 'Reply with JSON only.' },
    { role: 'user', content: '{"ping":"pong"} — reply with {"ok":true}' },
  ];

  const openrouter = { ok: false, detail: 'not configured' };
  const anthropic = { ok: false, detail: 'not configured' };

  if (config.openRouterApiKey) {
    try {
      const result = await callOpenRouter(config, probeMessages);
      openrouter.ok = true;
      openrouter.detail = `ok via ${result.model}`;
    } catch (error) {
      openrouter.detail = error instanceof Error ? error.message : String(error);
    }
  }

  if (config.anthropicApiKey) {
    try {
      const result = await callAnthropic(config, probeMessages);
      anthropic.ok = true;
      anthropic.detail = `ok via ${result.model}`;
    } catch (error) {
      anthropic.detail = error instanceof Error ? error.message : String(error);
    }
  }

  return { openrouter, anthropic };
}
