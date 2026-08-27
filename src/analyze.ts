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
  /** Verbatim Slack thread / source message — appended to the issue, not rewritten. */
  slackTranscript?: string;
};

function buildSystemPrompt(): string {
  return `You turn a Slack note into a Linear task for Gramodesky.

Return ONLY valid JSON with keys:
- title: short Czech title (max ~80 chars), imperative / outcome-focused
- description: Markdown in Czech with ONLY these sections:
  ## Co chci
  1–3 sentences: what should change / what is broken. Stay faithful to the Slack source.
  ## Návrh postupu
  Max 2–3 short bullets. High-level direction only (what area to touch).
  Do NOT write implementation steps, code, file paths, or a detailed plan — Cursor will implement.
  ## Poznámky
  Optional; omit the section if empty. Only facts that help (links, IDs, urgency). Do not invent.
- priority: Linear priority integer — 0=None, 1=Urgent, 2=High, 3=Medium, 4=Low
  Infer from urgency wording, blockers, customer impact, and tone (e.g. "hned", "blokuje", "dnes" → 1–2).
- estimate_hours: number 0–6 (hours of work)
  0 = trivial, 1 = simple, 2 = medium, 3–6 = hard / multi-step
- project_id: UUID from the catalog below, or null if unclear
- project_reason, priority_reason, estimate_reason: short Czech explanations

Important:
- The full Slack conversation is appended to the Linear issue separately. Do NOT paste or restate the Slack thread in description.
- Prefer the focused/source message; use the rest of the thread only for context.

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
    'Source for the task (Slack):',
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
    `_Zdroj: Slack · #${ctx.channelName} · @${ctx.userName}_`,
    analysis.project_reason ? `_Projekt: ${analysis.project_reason}_` : null,
    analysis.priority_reason ? `_Priorita: ${analysis.priority_reason}_` : null,
    analysis.estimate_reason
      ? `_Estimate: ${analysis.estimate_hours} h — ${analysis.estimate_reason}_`
      : `_Estimate: ${analysis.estimate_hours} h_`,
    `_Model: ${analysis.llm_provider}/${analysis.llm_model}_`,
  ]
    .filter(Boolean)
    .join('\n');

  const transcript = (ctx.slackTranscript ?? '').trim();
  const conversationBlock = transcript
    ? `\n\n## Slack konverzace\n\n${transcript}`
    : `\n\n## Původní zpráva\n\n${ctx.text.trim()}`;

  return `${analysis.description.trim()}${conversationBlock}\n\n---\n${meta}`;
}
