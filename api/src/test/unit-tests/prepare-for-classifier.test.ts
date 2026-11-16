import { describe, expect, it } from 'vitest';
import { prepareForClassifier } from '../../main/utils/prepareForClassifier';

describe('prepareForClassifier', () => {
  it('drops numbered Markdown headings, so "## 2." is not taken for a clause', () => {
    const text = '## 2. The service\n\nYouRoom is an online tool. We may add features.';

    expect(prepareForClassifier(text)).toBe('YouRoom is an online tool. We may add features.');
  });

  it('drops underlined headings and rules, as in contracts converted from HTML', () => {
    const text = 'Meta Platform Terms\n===================\n\n1\\. Introduction\n----------------\n\nYou accept these terms.\n\n---\n\nMore text.';

    expect(prepareForClassifier(text)).toBe('You accept these terms.\n\nMore text.');
  });

  it('turns each list item into a sentence of its own', () => {
    const text = 'You must not use the service to:\n\n- break the law;\n- send spam\n1. attack it.';

    expect(prepareForClassifier(text)).toBe('You must not use the service to:\n\nbreak the law.\nsend spam.\nattack it.');
  });

  it('keeps the words of links, bold, italics and escapes, without their marks', () => {
    const text = 'Read the [Privacy Policy](https://example.com). We are **not liable** for _any_ loss \\[TBC\\].';

    expect(prepareForClassifier(text)).toBe('Read the Privacy Policy. We are not liable for any loss [TBC].');
  });

  it('leaves plain text as it is', () => {
    const text = 'We may terminate your account at any time.\nYou can close it too.';

    expect(prepareForClassifier(text)).toBe(text);
  });
});
