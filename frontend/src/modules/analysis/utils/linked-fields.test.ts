import { describe, expect, it } from 'vitest';
import { editText, linkSavedText, pricingIn, setField, setPricing, unlinked } from './linked-fields';

const typed = (...values: string[]) =>
  values.reduce((state, value) => setField(state, 'company', value), unlinked('A deal with [Company]. A [Service] by [Company].'));

describe('linked fields', () => {
  it('follows a name typed letter by letter without touching the same letters elsewhere', () => {
    expect(typed('A', 'Ac', 'Acme').text).toBe('A deal with Acme. A [Service] by Acme.');
  });

  it('puts the placeholder back when the field is emptied', () => {
    expect(typed('A', '').text).toBe('A deal with [Company]. A [Service] by [Company].');
  });

  it('keeps following after edits in the text and in another field', () => {
    let state = typed('Acme');
    state = editText(state, `New. ${state.text}`);
    state = setField(state, 'service', 'Rooms');
    expect(setField(state, 'company', 'Beta').text).toBe('New. A deal with Beta. A Rooms by Beta.');
  });

  it('lets go of a value edited by hand', () => {
    const state = typed('Acme');
    const edited = editText(state, state.text.replace('Acme', 'Acne'));
    expect(setField(edited, 'company', 'Beta').text).toBe('A deal with Acne. A [Service] by Beta.');
  });

  it('finds whole words in a saved text', () => {
    const state = linkSavedText('Rooms and Roomsy.', { service: 'Rooms', company: '', pricing: '' });
    expect(setField(state, 'service', 'Flats').text).toBe('Flats and Roomsy.');
  });

  it('adds the pricing under Fees, once, and reads it back', () => {
    let state = unlinked('## Fees and payment\n\nPaid monthly.');
    for (const url of ['h', 'https://x.es/p', 'https://x.es/p/1']) state = setPricing(state, url, 1);
    expect(state.text).toBe(
      '## Fees and payment\n\nThe plans and their prices are set out in the pricing at https://x.es/p/1, which is part of these terms.\n\nPaid monthly.'
    );
    expect(pricingIn(state.text)).toBe('https://x.es/p/1');
  });
});
