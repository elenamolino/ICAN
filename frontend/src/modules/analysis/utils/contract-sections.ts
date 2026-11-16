// The sections a Terms of Service is expected to have, and a detector that
// finds them in a text as it is written. Pure logic: no React, no requests.

export interface ExpectedSection {
  id: string;
  title: string;
  /** What the section covers, shown when it is missing. */
  covers: string;
  /** Stems that, in a heading, mean the heading is this section. */
  headingKeywords: string[];
  /** Phrases that, in the body, mean the topic is mentioned without its own section. */
  bodyKeywords: string[];
  /** Unfair-clause categories of the classifier that usually live in this section. */
  categories: string[];
  /** Placeholder text the blank template and "Add section" insert. */
  starter: string;
}

export const EXPECTED_SECTIONS: ExpectedSection[] = [
  {
    id: 'acceptance',
    title: 'Acceptance of the terms',
    covers: 'How and when the user accepts the contract.',
    // "acceptance", never "accept": "Acceptable use" is another section.
    headingKeywords: ['acceptance', 'accepting', 'agreement to', 'introduction'],
    bodyKeywords: ['you accept these terms', 'you agree to these terms', 'by using the service', 'by accessing'],
    categories: ['use'],
    starter: 'By creating an account or using the service you accept these terms. If you do not agree with them, do not use the service.',
  },
  {
    id: 'service',
    title: 'The service',
    covers: 'What the provider offers.',
    headingKeywords: ['service', 'description', 'what we offer'],
    bodyKeywords: ['the service lets', 'the service allows', 'we provide'],
    categories: [],
    starter: '[Describe what the service does and who it is for.]',
  },
  {
    id: 'accounts',
    title: 'Accounts',
    covers: 'Registration, minimum age and keeping the account secure.',
    headingKeywords: ['account', 'registration', 'eligibility'],
    bodyKeywords: ['your account', 'at least 16', 'at least 18', 'years old', 'password'],
    categories: [],
    starter: 'You must be at least 16 years old to create an account. Keep your password secret and tell us if someone else uses your account.',
  },
  {
    id: 'payment',
    title: 'Fees and payment',
    covers: 'Prices, billing and refunds.',
    headingKeywords: ['fee', 'payment', 'price', 'pricing', 'billing', 'subscription', 'refund'],
    bodyKeywords: ['billed', 'refund', 'subscription', 'per month'],
    categories: [],
    starter: '[Explain the plans, how and when they are billed, and when refunds apply.]',
  },
  {
    id: 'content',
    title: 'Your content',
    covers: 'Who owns what the user uploads, and what licence the provider gets.',
    headingKeywords: ['your content', 'user content', 'content', 'your data'],
    bodyKeywords: ['content you upload', 'you keep ownership', 'licence to', 'license to', 'remove content'],
    categories: ['cr'],
    starter: 'You keep ownership of the content you upload. You give us a licence to store and show it only to provide the service to you.',
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    covers: 'What users must not do with the service.',
    headingKeywords: ['acceptable use', 'prohibited', 'rules', 'conduct', 'restrictions'],
    bodyKeywords: ['you must not', 'you may not', 'prohibited'],
    categories: [],
    starter: 'You must not use the service to break the law, to harm other people or to attack the service itself.',
  },
  {
    id: 'privacy',
    title: 'Privacy',
    covers: 'How personal data is handled, usually by pointing to the privacy policy.',
    headingKeywords: ['privacy', 'personal data', 'data protection'],
    bodyKeywords: ['privacy policy', 'personal data', 'gdpr'],
    categories: [],
    starter: 'We handle your personal data as explained in our Privacy Policy.',
  },
  {
    id: 'changes',
    title: 'Changes to the terms',
    covers: 'How the terms can change and how much notice users get.',
    headingKeywords: ['change', 'modification', 'amendment', 'update'],
    bodyKeywords: ['change these terms', 'modify these terms', 'update these terms'],
    categories: ['ch'],
    starter: 'We may change these terms. We will tell you at least 30 days before a change takes effect, and you can close your account if you do not agree.',
  },
  {
    id: 'termination',
    title: 'Termination',
    covers: 'When the account can be closed, and by whom.',
    headingKeywords: ['terminat', 'suspension', 'cancellation', 'closing your account'],
    bodyKeywords: ['terminate', 'suspend your account', 'close your account'],
    categories: ['ter'],
    starter: 'You can close your account at any time. We may close it if you seriously breach these terms, and we will tell you why.',
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    covers: 'How far the provider answers for damages.',
    headingKeywords: ['liabilit', 'warrant', 'disclaimer', 'indemn'],
    bodyKeywords: ['not liable', 'not be liable', 'liability', 'as is'],
    categories: ['ltd'],
    starter: 'We are liable for damages we cause by gross negligence or wilful misconduct, and as the law requires.',
  },
  {
    id: 'law',
    title: 'Governing law',
    covers: 'Which country\'s law applies.',
    headingKeywords: ['governing law', 'applicable law', 'law'],
    bodyKeywords: ['governed by', 'laws of'],
    categories: ['law'],
    starter: 'These terms are governed by Spanish law. If you are a consumer, you keep the protection of the law of the country where you live.',
  },
  {
    id: 'disputes',
    title: 'Disputes',
    covers: 'Which courts decide disputes, or whether there is arbitration.',
    headingKeywords: ['dispute', 'jurisdiction', 'arbitration', 'courts'],
    bodyKeywords: ['courts of', 'arbitration', 'jurisdiction'],
    categories: ['j', 'a'],
    starter: 'Disputes go to the courts of the place where you live.',
  },
  {
    id: 'contact',
    title: 'Contact',
    covers: 'Who the provider is and how to reach them.',
    headingKeywords: ['contact', 'who we are', 'about us'],
    bodyKeywords: ['contact us', 'write to us', 'email us', '@'],
    categories: [],
    starter: '[Company name, registered address and an email address for questions about these terms.]',
  },
];

export interface ContractClause {
  text: string;
  /** 1-based line where the clause starts. */
  line: number;
}

export interface ContractBlock {
  /** null for the text before the first heading. */
  heading: string | null;
  /** 1 for "# Title", 2 for "## Section" and for numbered or capitalised headings. */
  level: number;
  /** 1-based line of the heading, or of the first text when there is none. */
  line: number;
  /** Last line before the next heading. */
  endLine: number;
  clauses: ContractClause[];
}

const MARKDOWN_HEADING = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
// "5. Changes to these terms", "5) Changes", "5.1 Changes" — short and without a final full stop.
const NUMBERED_HEADING = /^\s{0,3}(\d+(?:\.\d+)*)[.)]?\s+(\S.*)$/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
// The line under a "setext" heading: "Title" over "=====" (level 1) or "-----" (level 2),
// as the contracts converted from HTML write them.
const SETEXT_UNDERLINE = /^\s{0,3}(=+|-+)\s*$/;

// "1\. Introduction" → "1. Introduction": Markdown escapes are not part of the title.
const unescape = (text: string) => text.replace(/\\(.)/g, '$1');

function headingOf(line: string): { text: string; level: number } | null {
  const markdown = MARKDOWN_HEADING.exec(line);
  if (markdown) return { text: markdown[2], level: markdown[1].length };

  const numbered = NUMBERED_HEADING.exec(line);
  if (numbered) {
    const text = numbered[2].trim();
    const words = text.split(/\s+/).length;
    if (words <= 8 && !/[.:;,]$/.test(text)) return { text, level: 2 };
  }

  const trimmed = line.trim();
  if (/^[A-Z][A-Z\s&,'-]{3,60}$/.test(trimmed) && trimmed.split(/\s+/).length <= 8) {
    return { text: trimmed, level: 2 };
  }
  return null;
}

/**
 * Splits a contract into blocks, one per heading, with its clauses: each
 * paragraph (text between blank lines) and each list item is a clause.
 */
export function parseContract(text: string): ContractBlock[] {
  const lines = text.split(/\r?\n/);
  const blocks: ContractBlock[] = [];
  let current: ContractBlock = { heading: null, level: 0, line: 1, endLine: lines.length, clauses: [] };
  let paragraph: ContractClause | null = null;

  const closeParagraph = () => {
    if (paragraph && paragraph.text.trim()) current.clauses.push({ ...paragraph, text: paragraph.text.trim() });
    paragraph = null;
  };

  let skipNext = false;
  lines.forEach((raw, index) => {
    const lineNumber = index + 1;
    if (skipNext) {
      skipNext = false;
      return;
    }
    const underline = SETEXT_UNDERLINE.exec(lines[index + 1] ?? '');
    const setext = underline && raw.trim() && !LIST_ITEM.test(raw) && !paragraph
      ? { text: raw.trim(), level: underline[1].startsWith('=') ? 1 : 2 }
      : null;
    if (setext) skipNext = true;
    const found = setext ?? headingOf(raw);
    const heading = found && { ...found, text: unescape(found.text) };
    if (heading) {
      closeParagraph();
      if (current.heading !== null || current.clauses.length) blocks.push({ ...current, endLine: lineNumber - 1 });
      current = { heading: heading.text, level: heading.level, line: lineNumber, endLine: lines.length, clauses: [] };
      return;
    }
    if (!raw.trim()) {
      closeParagraph();
      return;
    }
    if (LIST_ITEM.test(raw)) {
      closeParagraph();
      paragraph = { text: raw.replace(LIST_ITEM, ''), line: lineNumber };
      return;
    }
    if (paragraph) paragraph.text += ` ${raw.trim()}`;
    else paragraph = { text: raw.trim(), line: lineNumber };
  });
  closeParagraph();
  if (current.heading !== null || current.clauses.length) blocks.push(current);
  return blocks;
}

// Without accents, so accented headings still match the keywords.
const normalise = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9@\s]/g, ' ').replace(/\s+/g, ' ').trim();

function headingMatches(section: ExpectedSection, heading: string) {
  const text = normalise(heading);
  return section.headingKeywords.some(keyword => text.includes(keyword));
}

export type SectionStatus = 'present' | 'mentioned' | 'missing';

export interface SectionReport {
  section: ExpectedSection;
  status: SectionStatus;
  /** Line to jump to: the heading when present, the mention when mentioned. */
  line: number | null;
  /** Clauses under the section's heading (present only). */
  clauses: ContractClause[];
  /** Line ranges of its headings and their text (present only). */
  ranges: [number, number][];
  /** Heading of the block that mentions it (mentioned only); null for the text before any heading. */
  mentionedIn: string | null;
}

export interface ContractReport {
  sections: SectionReport[];
  /** Headings that are none of the expected sections. */
  otherBlocks: ContractBlock[];
  present: number;
  total: number;
}

/**
 * Checks a contract against the expected sections. A heading may cover more
 * than one ("Governing law and disputes"). A first heading written as "# ..."
 * is the document title ("# Terms of Service"), not a section.
 */
export function analyseSections(text: string): ContractReport {
  const blocks = parseContract(text);
  const firstHeading = blocks.find(b => b.heading !== null);
  const isDocumentTitle = (block: ContractBlock) => block === firstHeading && block.level === 1;

  const matched = new Set<ContractBlock>();
  const sections = EXPECTED_SECTIONS.map<SectionReport>(section => {
    const own = blocks.filter(b => b.heading !== null && !isDocumentTitle(b) && headingMatches(section, b.heading));
    if (own.length) {
      own.forEach(b => matched.add(b));
      return {
        section,
        status: 'present',
        line: own[0].line,
        clauses: own.flatMap(b => b.clauses),
        ranges: own.map(b => [b.line, b.endLine] as [number, number]),
        mentionedIn: null,
      };
    }
    for (const block of blocks) {
      const clause = block.clauses.find(c => section.bodyKeywords.some(k => normalise(c.text).includes(k)));
      if (clause) return { section, status: 'mentioned', line: clause.line, clauses: [], ranges: [], mentionedIn: block.heading };
    }
    return { section, status: 'missing', line: null, clauses: [], ranges: [], mentionedIn: null };
  });

  const otherBlocks = blocks.filter(b => b.heading !== null && !matched.has(b) && !isDocumentTitle(b));
  const present = sections.filter(s => s.status === 'present').length;
  return { sections, otherBlocks, present, total: sections.length };
}

/** The Markdown a missing section adds at the end of the contract. */
export function sectionStarter(section: ExpectedSection) {
  return `## ${section.title}\n\n${section.starter}\n`;
}
