import { describe, expect, it } from 'vitest';
import sbd from 'sbd';
import { splitIntoClauses } from '../../main/utils/splitClauses';

describe('splitIntoClauses', () => {
  it('cuts the text into sentences, exactly as unfair-tos-detector does', () => {
    const text = 'We may change these terms. You accept them by using the service.\n\nFees are non-refundable.';

    expect(splitIntoClauses(text)).toEqual(sbd.sentences(text, {}));
    expect(splitIntoClauses(text)).toHaveLength(3);
  });

  it('returns no clauses for empty text', () => {
    expect(splitIntoClauses('   ')).toEqual([]);
  });
});
