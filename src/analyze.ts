import { z } from 'zod';

import type { AppConfig } from './config.js';
import { completeJson } from './llm.js';
import {
  findProjectById,
  guessProjectFromChannel,
  projectCatalogForPrompt,
} from './projects.js';

const AnalysisSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().min(1),
  priority: z.number().int().min(0).max(4),
  estimate_hours: z.number().min(0).max(6),
  project_id: z.string().uuid().nullable(),
  project_reason: z.string().optional(),
  priority_reason: z.string().optional(),
  estimate_reason: z.string().optional(),
});

export type TaskAnalysis = z.infer<typeof AnalysisSchema> & {
  project_name: string | null;
  llm_provider: string;
  llm_model: string;
};

export type AnalyzeContext = {
  text: string;
  channelName: string;
  userName: string;
  userId: string;
};

function buildSystemPrompt(): string {
  return `You turn a Slack /ok note into a Linear task for Gramodesky.

Return ONLY valid JSON with keys:
- title: short Czech title (max ~80 chars), imperative / outcome-focused
- description: Markdown in Czech with sections:
  ## Co chci
  ## Jak k tomu přistoupím
  ## Poznámky
  Keep the author's intent. Expand lightly for clarity; do not invent requirements.
- priority: Linear priority integer — 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low
  Infer from urgency wording, blockers, customer impact, and tone (e.g. "hned", "blokuje", "dnes" → 1–2).
- estimate_hours: number 0–6 (hours of work)
  0 = trivial, 1 = simple, 2 = medium, 3–6 = hard / multi-step
- project_id: UUID from the catalog below, or null if unclear
- project_reason, priority_reason, estimate_reason: short Czech explanations

Project catalog (prefer channel + requester + topic match):
${projectCatalogForPrompt()}
`;
}

function extractJsonObject(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('LLM did not return JSON');
  }
}

export async function analyzeTask(
  config: AppConfig,
  ctx: AnalyzeContext,
): Promise<TaskAnalysis> {
  const channelHint = guessProjectFromChannel(ctx.channelName);

  const userPrompt = [
    `Slack channel: #${ctx.channelName || 'unknown'}`,
    `Requester Slack user: ${ctx.userName} (${ctx.userId})`,
    channelHint ? `Channel heuristic project: ${channelHint.name} (${channelHint.id})` : null,
    '',
    'User note for /ok:',
    ctx.text,
  ]
    .filter((line) => line !== null)
    .join('\n');

  const { text, provider, model } = await completeJson(config, [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: userPrompt },
  ]);

  const parsed = AnalysisSchema.parse(extractJsonObject(text));

  let projectId = parsed.project_id;
  let projectName: string | null = null;

  if (projectId) {
    const known = findProjectById(projectId);
    if (!known || !known.active) {
      projectId = channelHint?.id ?? null;
    }
  } else if (channelHint) {
    projectId = channelHint.id;
  }

  if (projectId) {
    projectName = findProjectById(projectId)?.name ?? null;
  }

  const estimate = Math.round(parsed.estimate_hours);
  const clampedEstimate = Math.min(6, Math.max(0, estimate));

  return {
    ...parsed,
    project_id: projectId,
    estimate_hours: clampedEstimate,
    project_name: projectName,
    llm_provider: provider,
    llm_model: model,
  };
}

export function buildIssueDescription(analysis: TaskAnalysis, ctx: AnalyzeContext): string {
  const meta = [
    `_Zdroj: Slack \`/ok\` · #${ctx.channelName} · @${ctx.userName}_`,
    analysis.project_reason ? `_Projekt: ${analysis.project_reason}_` : null,
    analysis.priority_reason ? `_Priorita: ${analysis.priority_reason}_` : null,
    analysis.estimate_reason
      ? `_Estimate: ${analysis.estimate_hours} h — ${analysis.estimate_reason}_`
      : `_Estimate: ${analysis.estimate_hours} h_`,
    `_Model: ${analysis.llm_provider}/${analysis.llm_model}_`,
  ]
    .filter(Boolean)
    .join('\n');

  return `${analysis.description.trim()}\n\n---\n${meta}`;
}
