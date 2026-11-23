import { describe, expect, it } from 'vitest';
import { splitContractName } from './editor-import';

describe('splitContractName', () => {
  it('splits the names iCan gives contracts', () => {
    expect(splitContractName('Acme — Terms of Service')).toEqual({ company: 'Acme', title: 'Terms of Service' });
    expect(splitContractName('Overleaf terms of Service', 'Overleaf')).toEqual({ company: 'Overleaf', title: 'Overleaf terms of Service' });
  });
});
