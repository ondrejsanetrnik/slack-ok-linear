// Fixed Linear IDs for Gramodesky (override via env when needed).
export const DEFAULT_TEAM_ID = 'dc2f7dcd-f3c5-4a84-8950-9f1cde6ee5a3'; // Gramo IT
export const DEFAULT_TEAM_NAME = 'Gramo IT';
export const DEFAULT_ASSIGNEE_ID = 'd897ce42-4c70-4a26-ac64-c808dac9bb90'; // Ondra
export const DEFAULT_STATE_NAME = 'Todo';

export type AppConfig = {
  port: number;
  slackSigningSecret: string;
  slackBotToken: string | undefined;
  linearApiKey: string;
  teamId: string;
  assigneeId: string;
  stateName: string;
  openRouterApiKey: string | undefined;
  openRouterModel: string;
  anthropicApiKey: string | undefined;
  anthropicModel: string;
  llmProvider: 'auto' | 'openrouter' | 'anthropic';
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  const providerRaw = (process.env.LLM_PROVIDER ?? 'auto').trim().toLowerCase();
  const llmProvider =
    providerRaw === 'openrouter' || providerRaw === 'anthropic' || providerRaw === 'auto'
      ? providerRaw
      : 'auto';

  return {
    port: Number(process.env.PORT ?? '8000'),
    slackSigningSecret: required('SLACK_SIGNING_SECRET'),
    slackBotToken: process.env.SLACK_BOT_TOKEN?.trim() || undefined,
    linearApiKey: required('LINEAR_API_KEY'),
    teamId: process.env.LINEAR_TEAM_ID?.trim() || DEFAULT_TEAM_ID,
    assigneeId: process.env.LINEAR_ASSIGNEE_ID?.trim() || DEFAULT_ASSIGNEE_ID,
    stateName: process.env.LINEAR_STATE_NAME?.trim() || DEFAULT_STATE_NAME,
    openRouterApiKey: process.env.OPENROUTER_API_KEY?.trim() || undefined,
    openRouterModel: process.env.OPENROUTER_MODEL?.trim() || 'openai/gpt-5-mini',
    anthropicApiKey: process.env.ANTHROPIC_API_KEY?.trim() || undefined,
    anthropicModel: process.env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-4-20250514',
    llmProvider,
  };
}
