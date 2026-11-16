import { describe, expect, it } from 'vitest';
import { analyseSections, parseContract } from './contract-sections';
import { CONTRACT_TEMPLATES } from '../data/contract-templates';

const statusOf = (text: string, id: string) => analyseSections(text).sections.find(s => s.section.id === id)!;

describe('parseContract', () => {
  it('splits by Markdown, numbered and capitalised headings', () => {
    const blocks = parseContract(['# Terms', '', '1. Acceptance', 'You accept.', '', 'LIMITATION OF LIABILITY', 'We are liable.'].join('\n'));

    expect(blocks.map(b => [b.heading, b.level, b.line, b.endLine])).toEqual([
      ['Terms', 1, 1, 2],
      ['Acceptance', 2, 3, 5],
      ['LIMITATION OF LIABILITY', 2, 6, 7],
    ]);
  });

  it('takes each paragraph and each list item as a clause, with the line it starts on', () => {
    const [block] = parseContract(['## Use', 'You must not:', '', '- send spam;', '- attack the service.', '', 'A paragraph', 'on two lines.'].join('\n'));

    expect(block.clauses).toEqual([
      { text: 'You must not:', line: 2 },
      { text: 'send spam;', line: 4 },
      { text: 'attack the service.', line: 5 },
      { text: 'A paragraph on two lines.', line: 7 },
    ]);
  });

  it('reads underlined headings and drops Markdown escapes, as in contracts converted from HTML', () => {
    const blocks = parseContract(['Meta Platform Terms', '===================', '', '1\\. Introduction', '----------------', '', 'You accept these terms.'].join('\n'));

    expect(blocks.map(b => [b.heading, b.level, b.line])).toEqual([
      ['Meta Platform Terms', 1, 1],
      ['1. Introduction', 2, 4],
    ]);
    expect(blocks[1].clauses).toEqual([{ text: 'You accept these terms.', line: 7 }]);
  });

  it('does not take a numbered sentence for a heading', () => {
    const blocks = parseContract('## Accounts\n1. You must be 16 years old.');

    expect(blocks).toHaveLength(1);
    expect(blocks[0].clauses[0].text).toBe('You must be 16 years old.');
  });
});

describe('analyseSections', () => {
  it('finds every expected section in the SaaS template', () => {
    const report = analyseSections(CONTRACT_TEMPLATES.find(t => t.id === 'saas')!.text);

    expect(report.sections.filter(s => s.status !== 'present').map(s => s.section.id)).toEqual([]);
    expect(report.otherBlocks).toEqual([]);
  });

  it('does not take the document title or "Acceptable use" for other sections', () => {
    const text = '# Terms of Service\nLast updated today.\n\n## Acceptable use\nYou must not spam.';

    expect(statusOf(text, 'service').status).toBe('missing');
    expect(statusOf(text, 'acceptance').status).toBe('missing');
    expect(statusOf(text, 'acceptable-use').status).toBe('present');
  });

  it('lets one heading cover two sections', () => {
    const text = '## Governing law and jurisdiction\nSpanish law applies and the courts of Seville decide.';

    expect(statusOf(text, 'law').status).toBe('present');
    expect(statusOf(text, 'disputes').status).toBe('present');
  });

  it('reports a topic mentioned inside another section, and where', () => {
    const mentioned = statusOf('## Accounts\nKeep your password.\n\n## Applicable rules\nThe courts of Seville decide.', 'disputes');
    expect(mentioned).toMatchObject({ status: 'mentioned', mentionedIn: 'Applicable rules', line: 5 });
  });

  it('lists headings that are none of the expected sections', () => {
    const report = analyseSections('## Beta features\nThey may break.');

    expect(report.otherBlocks.map(b => b.heading)).toEqual(['Beta features']);
  });
});
