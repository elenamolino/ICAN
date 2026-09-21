import sbd from 'sbd';

// The one place where a contract's text is cut into clauses. AI Classify's
// unfair-tos-detector splits with this same library and version, so both analysers
// see identical clauses. Keep `sbd` pinned to the detector's version (1.0.19).
export function splitIntoClauses(text: string): string[] {
  return sbd.sentences(text, {});
}
