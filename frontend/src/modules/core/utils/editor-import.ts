/** "Acme — Terms of Service" as saved by iCan: the company and the title. */
export function splitContractName(name: string, service?: string | null) {
  const [first, ...rest] = name.split(' — ');
  return rest.length ? { company: first, title: rest.join(' — ') } : { company: service ?? '', title: name };
}
