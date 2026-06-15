const naturalTextCollator = new Intl.Collator(undefined, { numeric: true });

export function compareNaturalText(a: string, b: string): number {
  return naturalTextCollator.compare(a, b);
}
