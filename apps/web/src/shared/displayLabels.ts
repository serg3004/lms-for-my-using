export function getReadableTitle(value: string | null | undefined, fallback: string) {
  const title = value?.trim();

  return title || fallback;
}

export function getListItemLabel(label: string, index: number) {
  return `${label} ${index + 1}`;
}
