export const metricTypeOptions = [
  { value: 'chao1', label: 'Chao1 Estimate' },
  { value: 'd50', label: 'D50 Diversity' },
  { value: 'efronThisted', label: 'Efron-Thisted Estimate' },
  { value: 'observed', label: 'Observed Diversity' },
  { value: 'shannonWienerIndex', label: 'Shannon-Wiener Index' },
  { value: 'shannonWiener', label: 'Shannon-Wiener Diversity' },
  { value: 'normalizedShannonWiener', label: 'Normalized Shannon-Wiener Index' },
  { value: 'inverseSimpson', label: 'Inverse Simpson Index' },
  { value: 'gini', label: 'Gini Index' },
];

const labelsMap = (() => {
  const map: Map<string, string> = new Map();

  for (const option of metricTypeOptions) {
    map.set(option.value, option.label);
  }

  return map;
})();

export const getMetricLabel = (value: string) => labelsMap.get(value);
