import { describe, expect, it } from 'vitest';
import { ClauseAnalysis } from '../../analysis/api/analysisApi';
import { nextVersionNumbers, describeTextChanges, layoutVersionGraph, parentOf, summariseChanges } from './versions';
import { ContractVersionListItem } from '../api/contractCollectionsApi';

const clause = (term: string, unfair?: 'ter' | 'ch'): ClauseAnalysis => ({
  term, isUnfair: Boolean(unfair), wordCount: term.split(' ').length,
  ltd: 0, ter: unfair === 'ter' ? 0.9 : 0, ch: unfair === 'ch' ? 0.9 : 0, cr: 0, use: 0, law: 0, j: 0, a: 0,
});

describe('summariseChanges', () => {
  const previous = [
    clause('You can close your account at any time.'),
    clause('We may suspend your account if you seriously breach these terms.', 'ter'),
    clause('Disputes go to the courts of the place where you live.'),
  ];

  it('counts nothing when the clauses are the same', () => {
    expect(summariseChanges(previous, previous)).toEqual({
      changed: 0, added: 0, removed: 0, unfairBefore: 1, unfairAfter: 1, newUnfairCategories: [],
    });
  });

  it('tells changed clauses from added and removed ones, and the unfair ones that appear', () => {
    const current = [
      clause('You can close your account at any time.'),
      clause('We may suspend your account if you seriously or repeatedly breach these terms.', 'ter'),
      clause('We may change these terms at any time without notice.', 'ch'),
    ];

    expect(summariseChanges(previous, current)).toEqual({
      changed: 1, added: 1, removed: 1, unfairBefore: 1, unfairAfter: 2, newUnfairCategories: ['Unilateral change'],
    });
  });
});

describe('describeTextChanges', () => {
  const v2 = [
    '# Terms of Service',
    '',
    'Last updated: 16 Nov 2026',
    '',
    '## 1. Acceptance of the terms',
    '',
    'By using YouRoom you accept these terms.',
    '',
    '## 9. Termination',
    '',
    'You can close your account at any time.',
  ].join('\n');

  it('reports nothing for the same text', () => {
    expect(describeTextChanges(v2, v2)).toEqual([]);
  });

  it('names removed and added sections, the reworded part of a paragraph and added paragraphs', () => {
    const v3 = [
      '# Terms of Service',
      '',
      'Last updated: 20 Nov 2026',
      '',
      '## 8. Termination',
      '',
      'You can close your account at any time.',
      '',
      'We may suspend your account without notice.',
      '',
      '## 13. Contact',
      '',
      'Write to youroom@example.com.',
    ].join('\n');

    expect(describeTextChanges(v2, v3)).toEqual([
      { kind: 'section-removed', section: '1. Acceptance of the terms' },
      { kind: 'reworded', section: null, context: 'Last updated:', before: '16 Nov 2026', after: '20 Nov 2026' },
      { kind: 'paragraph-added', section: '8. Termination', text: 'We may suspend your account without notice.' },
      { kind: 'section-added', section: '13. Contact' },
    ]);
  });

  it('shows only the new words when a paragraph only gains text', () => {
    const before = '## Termination\n\nYou can close your account from the settings.';
    const after = '## Termination\n\nYou can close your account at any time from the settings.';

    expect(describeTextChanges(before, after)).toEqual([
      { kind: 'reworded', section: 'Termination', context: 'can close your account', before: '', after: 'at any time' },
    ]);
  });
});

describe('layoutVersionGraph', () => {
  const version = (id: string, parent?: string) =>
    ({ id, _parentVersionId: parent ?? null, capturedAt: '2026-01-01', label: 'intermediate' } as ContractVersionListItem);

  it('keeps versions without a declared parent on one line, by date', () => {
    const versions = [version('v1'), version('v2'), version('v3')];

    expect(layoutVersionGraph(versions).map((n) => [n.id, n.row, n.parentId])).toEqual([
      ['v1', 0, null], ['v2', 0, 'v1'], ['v3', 0, 'v2'],
    ]);
  });

  it('opens a branch for a version edited from an older one, and continues it', () => {
    const versions = [version('v1'), version('v2'), version('v3'), version('v4', 'v1'), version('v5', 'v4'), version('v6', 'v3')];

    expect(layoutVersionGraph(versions).map((n) => [n.id, n.row, n.parentId])).toEqual([
      ['v1', 0, null], ['v2', 0, 'v1'], ['v3', 0, 'v2'], ['v4', 1, 'v1'], ['v5', 1, 'v4'], ['v6', 0, 'v3'],
    ]);
    expect(parentOf(versions, 'v4')?.id).toBe('v1');
    expect(parentOf(versions, 'v6')?.id).toBe('v3');
  });
});

describe('nextVersionNumbers', () => {
  it('starts at 0.1 and follows the highest number', () => {
    expect(nextVersionNumbers([])).toEqual({ minor: '0.1', major: '1.0' });
    expect(nextVersionNumbers([{}, {}, {}]).minor).toBe('0.4');
    expect(nextVersionNumbers([{ number: '1.0' }, { number: '0.9' }, { number: '1.10' }, {}])).toEqual({ minor: '1.11', major: '2.0' });
  });
});
