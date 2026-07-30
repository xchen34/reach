export function normalizeCardSearch(value: string) {
  return value
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "");
}

export function matchesCardSearch(fields: Array<string | null | undefined>, query: string) {
  const needle = normalizeCardSearch(query);
  if (!needle) {
    return true;
  }

  return fields.some((field) => normalizeCardSearch(field ?? "").includes(needle));
}
