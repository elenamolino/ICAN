// Checks on the editor's text that are not about sections: template
// placeholders left unfilled, and where the classifier's clauses sit.

export interface Placeholder {
  /** As written, brackets included: "[Company]". */
  text: string;
  line: number;
}

// "[Company]", but not a Markdown link "[text](url)", a reference "[text][id]",
// a task box "[ ]" / "[x]" or escaped brackets "\[TBC\]", which are literal
// text of the contract (that is how converted contracts write them).
const PLACEHOLDER = /(?<!\\)\[([^\]\n]{2,80})(?<!\\)\](?![([])/g;

export function findPlaceholders(text: string): Placeholder[] {
  const found: Placeholder[] = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const match of line.matchAll(PLACEHOLDER)) {
      if (/^\s*x?\s*$/i.test(match[1])) continue;
      found.push({ text: match[0], line: index + 1 });
    }
  });
  return found;
}

const normalise = (text: string) =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * The line where a clause starts in the text, or null when it is no longer
 * there (edited after the analysis). Matches on the clause's first words, so
 * Markdown marks and line breaks inside the clause do not get in the way.
 */
export function locateClause(text: string, clause: string): number | null {
  const words = normalise(clause).split(' ').filter(Boolean).slice(0, 8);
  if (!words.length) return null;
  const needle = words.join(' ');

  const lines = text.split(/\r?\n/);
  // Normalised text with, for each character, the line it came from.
  let flat = '';
  const lineOf: number[] = [];
  lines.forEach((line, index) => {
    const part = normalise(line);
    if (!part) return;
    if (flat) {
      flat += ' ';
      lineOf.push(index + 1);
    }
    for (const char of part) {
      flat += char;
      lineOf.push(index + 1);
    }
  });

  const at = flat.indexOf(needle);
  return at === -1 ? null : lineOf[at];
}
