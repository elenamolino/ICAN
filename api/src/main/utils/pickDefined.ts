/** The given fields of `data`, leaving out the ones it does not set. */
export function pickDefined(data: Record<string, any>, fields: string[]): Record<string, any> {
  return Object.fromEntries(
    fields.filter(field => data[field] !== undefined).map(field => [field, data[field]])
  );
}
