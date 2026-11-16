import { describe, expect, it } from 'vitest';
import { findPlaceholders, locateClause } from './contract-checks';
import { CONTRACT_TEMPLATES } from '../data/contract-templates';

describe('findPlaceholders', () => {
  it('finds every bracketed placeholder with its line', () => {
    const text = 'Between you and [Company].\n\n[Service] lets you [describe what it does].';

    expect(findPlaceholders(text)).toEqual([
      { text: '[Company]', line: 1 },
      { text: '[Service]', line: 3 },
      { text: '[describe what it does]', line: 3 },
    ]);
  });

  it('ignores links, references and task boxes', () => {
    const text = 'Read the [Privacy Policy](https://example.com), see [docs][1].\n- [ ] done\n- [x] done\nTerm: \\[TBC\\].';

    expect(findPlaceholders(text)).toEqual([]);
  });
});

describe('locateClause', () => {
  const text = [
    '# Terms',
    '',
    '## Changes',
    '',
    'We may change these terms at any time',
    'without notice.',
    '',
    '- **We are not liable** for any damages.',
  ].join('\n');

  it('finds the line a clause starts on, across line breaks', () => {
    expect(locateClause(text, 'We may change these terms at any time without notice.')).toBe(5);
  });

  it('ignores Markdown marks and punctuation', () => {
    expect(locateClause(text, 'We are not liable for any damages')).toBe(8);
  });

  it('returns null when the clause is no longer in the text', () => {
    expect(locateClause(text, 'You can close your account at any time.')).toBeNull();
  });
});

describe('the SaaS template', () => {
  it('asks for every placeholder to be filled in before saving', () => {
    const saas = CONTRACT_TEMPLATES.find(t => t.id === 'saas')!;

    expect(findPlaceholders(saas.text).map(p => p.text)).toContain('[Company]');
  });
});
