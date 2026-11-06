/**
 * The condition the samples of the sequenced library are renamed to. It always comes first
 * in the order, so every condition is compared against the library.
 */
export const SEQUENCED_LIBRARY_CONDITION = "0 - Library";

/**
 * Comparisons the analysis produces for a condition order, as "numerator vs denominator":
 * every condition is compared with each condition before it.
 */
export function listComparisons(
  conditionOrder: readonly string[],
  options: { sequencedLibraryEnabled: boolean },
): string[] {
  const order = options.sequencedLibraryEnabled
    ? [
        SEQUENCED_LIBRARY_CONDITION,
        ...conditionOrder.filter((c) => c !== SEQUENCED_LIBRARY_CONDITION),
      ]
    : [...conditionOrder];

  const comparisons: string[] = [];
  for (let numerator = 1; numerator < order.length; numerator++) {
    for (let denominator = 0; denominator < numerator; denominator++) {
      comparisons.push(`${order[numerator]} vs ${order[denominator]}`);
    }
  }
  return comparisons;
}
