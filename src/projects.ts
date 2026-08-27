export type LinearProjectRef = {
  id: string;
  name: string;
  /** Slack channel names (without #) that usually belong here. */
  channels: string[];
  /** Slack display names / emails / keywords for the person who typically raises work. */
  people: string[];
  /** Free-text topic hints for the LLM. */
  topics: string[];
  active: boolean;
};

/**
 * Active-ish Gramo IT projects used for routing.
 * Prefer thematic + requester match; completed projects stay listed but marked inactive.
 */
export const PROJECT_CATALOG: LinearProjectRef[] = [
  {
    id: '792ca861-3057-4e14-aa1f-fb4d60c0e1d2',
    name: 'Gramína (Denča)',
    channels: ['gramina', 'support', 'zakaznicka-podpora'],
    people: ['denča', 'denca', 'denisa'],
    topics: ['gramína', 'daktela', 'ticket agent', 'support AI', 'playbook'],
    active: true,
  },
  {
    id: '0edafb4f-88bc-4f1f-ba51-2025bd5e4b27',
    name: 'Zákaznická podpora (Denča)',
    channels: ['support', 'zakaznicka-podpora'],
    people: ['denča', 'denca', 'denisa'],
    topics: ['podpora', 'reklamace', 'retino', 'zákazník'],
    active: true,
  },
  {
    id: '54242b7e-3414-493f-990c-2bd709eee825',
    name: 'Chat bot (Denča)',
    channels: ['chatbot', 'gramik', 'grambot'],
    people: ['denča', 'denca'],
    topics: ['chatbot', 'gramík', 'grambot', 'chatkit'],
    active: true,
  },
  {
    id: '08fb0555-b667-4452-8a25-7b316f8a20ec',
    name: 'React Frontend (Sváťa)',
    channels: ['react', 'frontend', 'fe'],
    people: ['sváťa', 'svata', 'filev'],
    topics: ['react', 'inertia', 'frontend', 'nový web'],
    active: true,
  },
  {
    id: '9c347108-ce94-4359-9d5c-feaa05213a27',
    name: 'Technický dluh (Sváťa, Dan)',
    channels: ['tech-debt', 'technicky-dluh'],
    people: ['sváťa', 'svata', 'dan', 'daniel'],
    topics: ['technický dluh', 'refactor', 'cleanup', 'debt'],
    active: true,
  },
  {
    id: '047c54da-469c-4d27-9683-2daa4256a0bf',
    name: 'Data & Machine Learning (Jarda)',
    channels: ['ml', 'data', 'clickhouse'],
    people: ['jarda', 'jaroslav', 'patočka'],
    topics: ['ml', 'embedding', 'vektory', 'pro mě', 'personalizace', 'clickhouse'],
    active: true,
  },
  {
    id: 'f54aafa2-fca1-4074-9393-ef11b2e539a7',
    name: 'Meta coding (Jarda)',
    channels: ['meta', 'devtools'],
    people: ['jarda', 'jaroslav'],
    topics: ['meta coding', 'agent tooling', 'devtools'],
    active: true,
  },
  {
    id: 'dafb456c-95ce-4eea-ab63-e039be4582a3',
    name: 'Administrace (Vladimír)',
    channels: ['admin', 'administrace'],
    people: ['vladimír', 'vladimir'],
    topics: ['admin', 'administrace', 'back office'],
    active: true,
  },
  {
    id: '69d0f4e7-e496-44ea-b382-889f69c27eea',
    name: 'Prodejna (Séba)',
    channels: ['prodejna'],
    people: ['séba', 'seba', 'petr'],
    topics: ['prodejna', 'pos', 'kamenná'],
    active: true,
  },
  {
    id: '2efd3d4a-70df-4c86-b9a2-e8485f422f22',
    name: 'Marketplaces a Baselinker (Petr)',
    channels: ['baselinker', 'marketplace', 'marketplaces'],
    people: ['petr'],
    topics: ['baselinker', 'marketplace', 'allegro', 'heureka'],
    active: true,
  },
  {
    id: 'a25ca835-c7fb-4748-a9ba-1f47f753afaa',
    name: 'Audiotechnika (Petr)',
    channels: ['audio', 'audiotechnika'],
    people: ['petr'],
    topics: ['audiotechnika', 'gramofon', 'sluchátka'],
    active: true,
  },
  {
    id: 'd6603506-22f5-4dbb-84e4-5c1c86014288',
    name: 'Marketing (Martin Očovaj)',
    channels: ['marketing'],
    people: ['martin', 'očovaj', 'ocovaj'],
    topics: ['marketing', 'kampaně', 'newsletter'],
    active: true,
  },
  {
    id: '6dd28bfa-a86b-44ac-9eed-6a791377b377',
    name: 'Alba (Jirka)',
    channels: ['alba', 'katalog'],
    people: ['jirka', 'jiří', 'jiri'],
    topics: ['alba', 'katalog', 'release', 'master'],
    active: true,
  },
  {
    id: '4daa5616-5688-44e1-b3cf-b2173fed23bb',
    name: 'Expedice (Verča)',
    channels: ['expedice', 'sklad'],
    people: ['verča', 'verca', 'veronika'],
    topics: ['expedice', 'zásilka', 'balení', 'doprava'],
    active: true,
  },
  {
    id: '9d3fb81f-7719-46a4-b635-db8d95967a7e',
    name: 'Účetnictví (Adel)',
    channels: ['ucetnictvi', 'účetnictví', 'finance'],
    people: ['adel'],
    topics: ['účetnictví', 'faktura', 'uol', 'pohledávky'],
    active: true,
  },
  {
    id: 'c0c5b96d-5822-42bc-acec-9772acc32cfa',
    name: 'Monitoring (Ondra)',
    channels: ['monitoring', 'ops', 'infra'],
    people: ['ondra', 'os'],
    topics: ['monitoring', 'horizon', 'deploy', 'infra', 'sentry', 'uptime'],
    active: true,
  },
  {
    id: '63088ba0-4b9e-47cb-8e56-0f4b3a20d7ec',
    name: 'Konverzní poměr (Ondra)',
    channels: ['conversion', 'konverze'],
    people: ['ondra'],
    topics: ['konverze', 'checkout', 'a/b', 'funnel'],
    active: true,
  },
  {
    id: 'dc0b0121-8575-474a-a72e-61e951d01aae',
    name: 'AI produktizace',
    channels: ['ai'],
    people: ['ondra', 'jarda'],
    topics: ['ai produktizace', 'llm produkt'],
    active: true,
  },
  {
    id: 'e49c3126-8f68-48ce-b062-fecc336f41d7',
    name: 'Antikvární desky (Milan)',
    channels: ['antikvariat', 'antik'],
    people: ['milan'],
    topics: ['antikvariát', 'second hand', 'použité'],
    active: true,
  },
  {
    id: '0af3a5de-5735-4204-940f-45d1bfb8e91b',
    name: 'Skladová optimalizace (Marek)',
    channels: ['sklad'],
    people: ['marek'],
    topics: ['sklad', 'zásoby', 'optimalizace skladu'],
    active: true,
  },
  {
    id: '3b5a65c5-5594-49b5-9da4-8f86af479c1c',
    name: 'Android (Marek)',
    channels: ['android'],
    people: ['marek'],
    topics: ['android', 'mobilní app'],
    active: true,
  },
  {
    id: '3a22cd67-e861-4784-885d-d4566ca07aea',
    name: 'SEO',
    channels: ['seo'],
    people: [],
    topics: ['seo', 'sitemap', 'vyhledávače'],
    active: true,
  },
];

export function activeProjects(): LinearProjectRef[] {
  return PROJECT_CATALOG.filter((p) => p.active);
}

export function projectCatalogForPrompt(): string {
  return activeProjects()
    .map((p) => {
      const bits = [
        `- id: ${p.id}`,
        `name: ${p.name}`,
        p.channels.length ? `channels: ${p.channels.join(', ')}` : null,
        p.people.length ? `people: ${p.people.join(', ')}` : null,
        p.topics.length ? `topics: ${p.topics.join(', ')}` : null,
      ].filter(Boolean);
      return bits.join(' | ');
    })
    .join('\n');
}

export function findProjectById(id: string): LinearProjectRef | undefined {
  return PROJECT_CATALOG.find((p) => p.id === id);
}

export function guessProjectFromChannel(channelName: string | undefined): LinearProjectRef | undefined {
  if (!channelName) {
    return undefined;
  }
  const normalized = channelName.replace(/^#/, '').toLowerCase();
  return activeProjects().find((p) => p.channels.some((c) => c.toLowerCase() === normalized));
}
