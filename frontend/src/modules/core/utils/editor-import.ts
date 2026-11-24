/**
 * A saved document's company and title. Documents name the service and keep the
 * company apart ("FastMusic — Service Level Agreement", company "FastMusic Inc.");
 * older ones were named after the company ("Acme — Terms of Service") and have none.
 */
export function splitContractName(name: string, service?: string | null, company?: string | null) {
  const [first, ...rest] = name.split(' — ');
  const title = rest.length ? rest.join(' — ') : name;
  if (company) return { company, title };
  return rest.length ? { company: first, title } : { company: service ?? '', title: name };
}
