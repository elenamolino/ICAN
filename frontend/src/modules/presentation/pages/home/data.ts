export type NavChild = {
  label: string;
  to: string;
};

export type NavItem = {
  label: string;
  to?: string;
  children?: NavChild[];
};

export type Funder = {
  name: string;
  href: string;
  image: string;
};

export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Analyse',
    children: [
      { label: 'AI Classify', to: '/analyse/ai-classify' },
      { label: 'Ontology Analysis', to: '/analyse/ontology-analysis' },
    ],
  },
  {
    label: 'Explore',
    children: [
      { label: 'Contracts', to: '/contracts' },
      { label: 'Collections', to: '/collections' },
    ],
  },
  { label: 'Docs', to: '/docs' },
];

export const FUNDERS: Funder[] = [
  {
    name: 'SCORE Lab',
    href: 'https://score.us.es',
    image: 'assets/landing/score.png',
  },
  {
    name: 'Spanish Research Agency',
    href: 'https://www.aei.gob.es',
    image: 'assets/landing/government.png',
  },
  {
    name: 'Universidad de Sevilla',
    href: 'https://www.us.es',
    image: 'assets/landing/university.png',
  },
  {
    name: 'Junta de Andalucía',
    href: 'https://www.juntadeandalucia.es',
    image: 'assets/landing/junta.webp',
  },
];
