// The fields of the editor's panel that are also written in the contract's text.
// Each remembers where its value is, so renaming "A" never touches the other
// words "A" of the text. Pure logic: no React, no requests.

export type FieldId = 'service' | 'company' | 'pricing';
type Range = [start: number, end: number];

export interface LinkedText {
  text: string;
  links: Record<FieldId, Range[]>;
}

export const FIELD_PLACEHOLDER: Record<FieldId, string> = {
  service: '[Service]',
  company: '[Company]',
  pricing: '[Pricing link]',
};

const FIELDS = Object.keys(FIELD_PLACEHOLDER) as FieldId[];
const PRICING_SENTENCE = 'The plans and their prices are set out in the pricing at';

const noLinks = (): LinkedText['links'] => ({ service: [], company: [], pricing: [] });

export const unlinked = (text: string): LinkedText => ({ text, links: noLinks() });

function occurrences(text: string, value: string): Range[] {
  const found: Range[] = [];
  for (let at = text.indexOf(value); at !== -1; at = text.indexOf(value, at + value.length)) {
    found.push([at, at + value.length]);
  }
  return found;
}

/** Finds the values in a saved text. Two fields with the same value cannot be told apart, so neither is linked. */
export function linkSavedText(text: string, values: Record<FieldId, string>): LinkedText {
  const links = noLinks();
  const taken: Range[] = [];
  // Longest first: "YouRoom" inside "YouRoom Inc" is the company's.
  for (const field of [...FIELDS].sort((a, b) => values[b].length - values[a].length)) {
    const value = values[field];
    if (value.length < 2 || FIELDS.some((other) => other !== field && values[other] === value)) continue;
    links[field] = occurrences(text, value).filter(
      ([start, end]) =>
        !/\w/.test(text[start - 1] ?? '') &&
        !/\w/.test(text[end] ?? '') &&
        !taken.some(([from, to]) => start < to && end > from)
    );
    taken.push(...links[field]);
  }
  return { text, links };
}

/** The pricing address in a saved text, if it has one. */
export function pricingIn(text: string): string {
  const at = text.indexOf(PRICING_SENTENCE);
  if (at === -1) return '';
  return text.slice(at + PRICING_SENTENCE.length).match(/^ (https?:\/\/[^\s,]+)/)?.[1] ?? '';
}

/** Follows an edit made in the text: links after it move, and one edited by hand is let go. */
export function editText(state: LinkedText, text: string): LinkedText {
  const before = state.text;
  if (before === text) return state;
  let start = 0;
  while (start < before.length && start < text.length && before[start] === text[start]) start++;
  let end = before.length, newEnd = text.length;
  while (end > start && newEnd > start && before[end - 1] === text[newEnd - 1]) {
    end--;
    newEnd--;
  }
  const links = noLinks();
  for (const field of FIELDS) {
    for (const [from, to] of state.links[field]) {
      if (to <= start) links[field].push([from, to]);
      else if (from >= end) links[field].push([from + newEnd - end, to + newEnd - end]);
    }
  }
  return { text, links };
}

/** Writes a field's value wherever the field is in the text. An empty value puts the placeholder back. */
export function setField(state: LinkedText, field: FieldId, value: string): LinkedText {
  const written = value.trim() ? value : FIELD_PLACEHOLDER[field];
  const targets = new Map<number, Range>();
  for (const range of [...state.links[field], ...occurrences(state.text, FIELD_PLACEHOLDER[field])]) {
    targets.set(range[0], range);
  }
  const ordered = [...targets.values()].sort((a, b) => a[0] - b[0]);
  if (!ordered.length) return state;

  let text = '', done = 0;
  const linked: Range[] = [];
  for (const [start, end] of ordered) {
    text += state.text.slice(done, start);
    linked.push([text.length, text.length + written.length]);
    text += written;
    done = end;
  }
  text += state.text.slice(done);

  const links = noLinks();
  for (const other of FIELDS) {
    if (other === field) continue;
    links[other] = state.links[other].map(([from, to]) => {
      const shift = ordered.reduce((sum, [start, end]) => (end <= from ? sum + written.length - (end - start) : sum), 0);
      return [from + shift, to + shift] as Range;
    });
  }
  links[field] = linked;
  return { text, links };
}

/** Writes the pricing link, adding its sentence under Fees and payment (`headingLine`) when the text has none. */
export function setPricing(state: LinkedText, value: string, headingLine: number | null): LinkedText {
  let next = state;
  const placed = state.links.pricing.length > 0 || state.text.includes(FIELD_PLACEHOLDER.pricing);
  if (!placed && value.trim()) {
    const sentence = `${PRICING_SENTENCE} ${FIELD_PLACEHOLDER.pricing}, which is part of these terms.`;
    const lines = state.text.split('\n');
    if (headingLine) lines.splice(headingLine, 0, '', sentence);
    else lines.push('', '## Fees and payment', '', sentence, '');
    next = editText(state, lines.join('\n'));
  }
  return setField(next, 'pricing', value);
}
