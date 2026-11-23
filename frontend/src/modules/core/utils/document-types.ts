// What kind of document a contract is. Contracts saved before the type existed
// have none, and their type is guessed from the name.

export const DOCUMENT_TYPES = [
  { id: 'terms-of-service', label: 'Terms of Service', description: 'The contract between the provider and its users: accounts, payment, content, liability and disputes.' },
  { id: 'service-level-agreement', label: 'Service Level Agreement', description: 'What the provider promises about availability and support, and the credits when it fails.' },
  { id: 'privacy-policy', label: 'Privacy Policy', description: 'How personal data is collected, used, kept and shared.' },
  { id: 'acceptable-use-policy', label: 'Acceptable Use Policy', description: 'What users may and may not do with the service.' },
  { id: 'cookie-policy', label: 'Cookie Policy', description: 'Which cookies and similar technologies are used, and the choices users have.' },
  { id: 'data-processing-agreement', label: 'Data Processing Agreement', description: 'How the provider processes personal data on behalf of its business customers.' },
  { id: 'other', label: 'Other document', description: 'Another document of the agreement.' },
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number]['id'];

export const documentTypeLabel = (type: DocumentType) => DOCUMENT_TYPES.find((t) => t.id === type)!.label;
export const documentTypeDescription = (type: DocumentType) => DOCUMENT_TYPES.find((t) => t.id === type)!.description;

export function documentTypeFromName(name: string): DocumentType {
  const text = name.toLocaleLowerCase();
  if (/service level|\bsla\b/.test(text)) return 'service-level-agreement';
  if (text.includes('privacy')) return 'privacy-policy';
  if (text.includes('acceptable use')) return 'acceptable-use-policy';
  if (text.includes('cookie')) return 'cookie-policy';
  if (/data processing|\bdpa\b/.test(text)) return 'data-processing-agreement';
  if (/terms|conditions|agreement/.test(text)) return 'terms-of-service';
  return 'other';
}

export const documentTypeOf = (contract: { name: string; documentType?: DocumentType | null }): DocumentType =>
  contract.documentType ?? documentTypeFromName(contract.name);
