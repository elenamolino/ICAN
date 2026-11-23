import { describe, expect, it } from 'vitest';
import { documentTypeFromName, documentTypeOf } from '../../core/utils/document-types';
import { analyseSections, sectionsForType } from './contract-sections';
import { CONTRACT_TEMPLATES } from '../data/contract-templates';

describe('document types', () => {
  it('guesses the type of older contracts from the name, and keeps a chosen one', () => {
    expect(documentTypeFromName('AWS — Service Level Agreement')).toBe('service-level-agreement');
    expect(documentTypeFromName('GitHub — Privacy Statement')).toBe('privacy-policy');
    expect(documentTypeFromName('Overleaf terms of Service')).toBe('terms-of-service');
    expect(documentTypeOf({ name: 'Acme — Terms', documentType: 'service-level-agreement' })).toBe('service-level-agreement');
  });

  it('gives every template all the sections of its type', () => {
    for (const template of CONTRACT_TEMPLATES) {
      const report = analyseSections(template.text, sectionsForType(template.documentType));
      expect(report.total).toBeGreaterThan(0);
      expect(report.sections.filter((s) => s.status !== 'present').map((s) => s.section.title)).toEqual([]);
    }
  });
});
