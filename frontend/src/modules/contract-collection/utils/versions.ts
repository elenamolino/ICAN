import { ContractVersionListItem } from '../api/contractCollectionsApi';
import { ClauseAnalysis } from '../../analysis/api/analysisApi';
import { topCategories } from '../../analysis/constants/clauseCategories';
import { parseContract } from '../../analysis/utils/contract-sections';

/** "v2 · Adds a refund policy", or "v2" for a version without a name. Versions are numbered by capture date. */
export const versionTitle = (version: ContractVersionListItem, number: number) =>
  version.name ? `v${number} · ${version.name}` : `v${number}`;

export interface VersionChanges {
  changed: number;
  added: number;
  removed: number;
  unfairBefore: number;
  unfairAfter: number;
  /** Unfair categories this version has and the previous one did not, by label. */
  newUnfairCategories: string[];
}

const normalise = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Share of words two clauses have in common, against the longer one.
function similarity(a: string, b: string) {
  const left = new Set(normalise(a).split(' ')), right = new Set(normalise(b).split(' '));
  let shared = 0;
  left.forEach((word) => { if (right.has(word)) shared++; });
  return shared / Math.max(left.size, right.size, 1);
}

const unfairCategories = (clauses: ClauseAnalysis[]) =>
  new Set(clauses.filter((c) => c.isUnfair).map((c) => topCategories(c)[0]?.label).filter(Boolean) as string[]);

/**
 * What changed from one version's clauses to the next: clauses with the same
 * text are unchanged, a removed and an added clause that share most of their
 * words are one changed clause, and the rest were added or removed.
 */
export function summariseChanges(previous: ClauseAnalysis[], current: ClauseAnalysis[]): VersionChanges {
  const before = new Set(previous.map((c) => normalise(c.term)));
  const after = new Set(current.map((c) => normalise(c.term)));
  const removed = previous.filter((c) => !after.has(normalise(c.term)));
  const added = current.filter((c) => !before.has(normalise(c.term)));

  let changed = 0;
  for (const clause of added.slice()) {
    const best = removed
      .map((candidate) => ({ candidate, score: similarity(candidate.term, clause.term) }))
      .sort((x, y) => y.score - x.score)[0];
    if (best && best.score >= 0.6) {
      changed++;
      removed.splice(removed.indexOf(best.candidate), 1);
      added.splice(added.indexOf(clause), 1);
    }
  }

  const categoriesBefore = unfairCategories(previous);
  return {
    changed,
    added: added.length,
    removed: removed.length,
    unfairBefore: previous.filter((c) => c.isUnfair).length,
    unfairAfter: current.filter((c) => c.isUnfair).length,
    newUnfairCategories: [...unfairCategories(current)].filter((label) => !categoriesBefore.has(label)),
  };
}

export type TextChange =
  | { kind: 'section-added' | 'section-removed'; section: string }
  /** context: the words before the change, kept so "Last updated: 16 Nov" → "20 Nov" reads well. */
  | { kind: 'reworded'; section: string | null; context: string; before: string; after: string }
  | { kind: 'paragraph-added' | 'paragraph-removed'; section: string | null; text: string };

// "1. Acceptance of the terms" and "Acceptance of the terms" are the same section.
const sectionKey = (heading: string | null) =>
  heading === null ? '' : normalise(heading.replace(/^\s*\d+(\.\d+)*[.)]?\s*/, ''));
const words = (text: string) => text.split(/\s+/).filter(Boolean);
const clip = (text: string, max = 90) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

function blocksByKey(text: string) {
  const blocks = new Map<string, { heading: string | null; paragraphs: string[] }>();
  for (const block of parseContract(text)) {
    // The document title ("# Terms of Service") and the text before any section count as the introduction.
    const key = block.level === 1 ? '' : sectionKey(block.heading);
    const entry = blocks.get(key) ?? { heading: block.level === 1 ? null : block.heading, paragraphs: [] };
    entry.paragraphs.push(...block.clauses.map((c) => c.text));
    blocks.set(key, entry);
  }
  return blocks;
}

// Only the words that differ, after the words both share at the start and at the end.
function reworded(section: string | null, before: string, after: string): TextChange {
  const a = words(before), b = words(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++;
  const removedWords = a.slice(start, a.length - end);
  const addedWords = b.slice(start, b.length - end);
  // When words are replaced, a few shared words after them too, so "16" → "20"
  // reads "16 Nov 2026" → "20 Nov 2026". Text only added or only taken out
  // keeps one side empty.
  const trailing = removedWords.length && addedWords.length ? a.slice(a.length - end, a.length - end + 3) : [];
  return {
    kind: 'reworded',
    section,
    context: clip(a.slice(Math.max(0, start - 4), start).join(' '), 60),
    before: clip([...removedWords, ...trailing].join(' ')),
    after: clip([...addedWords, ...trailing].join(' ')),
  };
}

/**
 * What changed in a contract's text from one version to the next, in words a
 * person reads: sections added or removed, and inside each section the
 * paragraphs reworded (only the part that differs), added or removed.
 */
export function describeTextChanges(previousText: string, currentText: string): TextChange[] {
  const before = blocksByKey(previousText);
  const after = blocksByKey(currentText);
  const changes: TextChange[] = [];

  for (const [key, block] of before) {
    if (!after.has(key) && block.heading) changes.push({ kind: 'section-removed', section: block.heading });
  }
  for (const [key, block] of after) {
    const old = before.get(key);
    if (!old) {
      if (block.heading) changes.push({ kind: 'section-added', section: block.heading });
      continue;
    }
    const section = block.heading;
    const removed = old.paragraphs.filter((p) => !block.paragraphs.includes(p));
    const added = block.paragraphs.filter((p) => !old.paragraphs.includes(p));
    for (const paragraph of added) {
      const best = removed
        .map((candidate) => ({ candidate, score: similarity(candidate, paragraph) }))
        .sort((x, y) => y.score - x.score)[0];
      if (best && best.score >= 0.5) {
        changes.push(reworded(section, best.candidate, paragraph));
        removed.splice(removed.indexOf(best.candidate), 1);
      } else {
        changes.push({ kind: 'paragraph-added', section, text: clip(paragraph) });
      }
    }
    for (const paragraph of removed) changes.push({ kind: 'paragraph-removed', section, text: clip(paragraph) });
  }
  return changes;
}

/**
 * The version a version came from: the one it was edited from when it says so,
 * otherwise the one before it by date. Versions come sorted by date.
 */
export function parentOf(versions: ContractVersionListItem[], id: string): ContractVersionListItem | null {
  const index = versions.findIndex((v) => v.id === id);
  if (index === -1) return null;
  const declared = versions[index]._parentVersionId;
  if (declared) return versions.find((v) => v.id === declared) ?? null;
  return index > 0 ? versions[index - 1] : null;
}

export interface GraphNode {
  id: string;
  /** Position by date, from 0. */
  column: number;
  /** 0 is the main line; each branch gets the next free row. */
  row: number;
  parentId: string | null;
}

/**
 * Lays versions out like branches in git: a version continues its parent's
 * row when its parent is the last one on it, and opens a new row (a branch)
 * when it was edited from an older version.
 */
export function layoutVersionGraph(versions: ContractVersionListItem[]): GraphNode[] {
  const tips: string[] = [];
  return versions.map((version, column) => {
    const parent = parentOf(versions, version.id);
    let row = parent ? tips.indexOf(parent.id) : -1;
    if (row === -1) {
      row = tips.length;
      tips.push(version.id);
    } else {
      tips[row] = version.id;
    }
    return { id: version.id, column, row, parentId: parent?.id ?? null };
  });
}
