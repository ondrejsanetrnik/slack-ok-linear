import { DEFAULT_TEAM_NAME } from './config.js';

const LINEAR_API = 'https://api.linear.app/graphql';

export type LinearIssueInput = {
  teamId: string;
  title: string;
  description: string;
  assigneeId: string;
  stateName: string;
  projectId: string | null;
  priority: number;
  estimate: number | null;
  cycleId: string | null;
};

export type CreatedIssue = {
  id: string;
  identifier: string;
  url: string;
  title: string;
};

type GraphQlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

async function linearGraphql<T>(
  apiKey: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = (await response.json()) as GraphQlResponse<T>;
  if (!response.ok || body.errors?.length) {
    const message = body.errors?.map((e) => e.message).join('; ') || `Linear HTTP ${response.status}`;
    throw new Error(message);
  }
  if (!body.data) {
    throw new Error('Linear returned empty data');
  }
  return body.data;
}

export async function getActiveCycleId(apiKey: string, teamId: string): Promise<string | null> {
  const data = await linearGraphql<{
    team: { activeCycle: { id: string; number: number } | null } | null;
  }>(
    apiKey,
    `query ActiveCycle($teamId: String!) {
      team(id: $teamId) {
        activeCycle { id number }
      }
    }`,
    { teamId },
  );

  return data.team?.activeCycle?.id ?? null;
}

export async function getStateIdByName(
  apiKey: string,
  teamId: string,
  stateName: string,
): Promise<string> {
  const data = await linearGraphql<{
    team: { states: { nodes: Array<{ id: string; name: string }> } } | null;
  }>(
    apiKey,
    `query TeamStates($teamId: String!) {
      team(id: $teamId) {
        states { nodes { id name } }
      }
    }`,
    { teamId },
  );

  const nodes = data.team?.states.nodes ?? [];
  const match = nodes.find((s) => s.name.toLowerCase() === stateName.toLowerCase());
  if (!match) {
    throw new Error(`Linear state "${stateName}" not found on team ${DEFAULT_TEAM_NAME}`);
  }
  return match.id;
}

export async function createIssue(apiKey: string, input: LinearIssueInput): Promise<CreatedIssue> {
  const stateId = await getStateIdByName(apiKey, input.teamId, input.stateName);
  const cycleId = input.cycleId ?? (await getActiveCycleId(apiKey, input.teamId));

  const mutationInput: Record<string, unknown> = {
    teamId: input.teamId,
    title: input.title,
    description: input.description,
    assigneeId: input.assigneeId,
    stateId,
    priority: input.priority,
  };

  if (input.projectId) {
    mutationInput.projectId = input.projectId;
  }
  if (cycleId) {
    mutationInput.cycleId = cycleId;
  }
  if (input.estimate !== null && input.estimate !== undefined) {
    mutationInput.estimate = input.estimate;
  }

  try {
    return await issueCreate(apiKey, mutationInput);
  } catch (error) {
    // If estimate is outside team scale, retry without it and note in description.
    if (input.estimate === null || input.estimate === undefined) {
      throw error;
    }
    console.warn('Linear create with estimate failed, retrying without estimate', error);
    delete mutationInput.estimate;
    mutationInput.description = `${input.description}\n\n_Estimate (hours, not applied by Linear scale): **${input.estimate}**_`;
    return issueCreate(apiKey, mutationInput);
  }
}

async function issueCreate(
  apiKey: string,
  mutationInput: Record<string, unknown>,
): Promise<CreatedIssue> {
  const data = await linearGraphql<{
    issueCreate: {
      success: boolean;
      issue: { id: string; identifier: string; url: string; title: string } | null;
    };
  }>(
    apiKey,
    `mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url title }
      }
    }`,
    { input: mutationInput },
  );

  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new Error('Linear issueCreate failed');
  }

  return data.issueCreate.issue;
}
