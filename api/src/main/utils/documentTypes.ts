// What kind of document a contract is. Contracts saved before the type existed
// have none; their type is then guessed from the name, as the collection did.

export const DOCUMENT_TYPES = [
  'terms-of-service',
  'service-level-agreement',
  'privacy-policy',
  'acceptable-use-policy',
  'cookie-policy',
  'data-processing-agreement',
  'security-policy',
  'other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];
