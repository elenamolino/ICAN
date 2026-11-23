import type { Organization } from '../../organization/api/organizationsApi';

export type OrganizationChoice = Organization & { label: string };

// getMyOrganizations returns a tree (subOrganizations nested): flatten it so
// orgs the user only has access to via a sub-org still show up as choices.
// A sub-org is labelled with its parent ("FIS › 2026-2027"), since names
// like "2026-2027" mean nothing alone, and appears once even when the user
// is also a direct member of it.
export function flattenOrganizations(orgs: Organization[], parent?: Organization): OrganizationChoice[] {
  const all = orgs.flatMap<OrganizationChoice>((org) => [
    { ...org, label: parent ? `${parent.displayName} › ${org.displayName}` : org.displayName },
    ...flattenOrganizations(org.subOrganizations ?? [], org),
  ]);
  const byId = new Map<string, OrganizationChoice>();
  for (const choice of all) {
    const seen = byId.get(choice.id);
    if (!seen || choice.label.length > seen.label.length) byId.set(choice.id, choice);
  }
  return [...byId.values()];
}
