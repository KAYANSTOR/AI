export interface ModelPricingRule {
  modelId: string;
  providerCode: string;
  inputPricePer1M: number;
  outputPricePer1M: number;
  cachedInputPricePer1M: number;
  pricingSource: string;
  pricingVersion: string;
  pricingEffectiveDate: string;
}

export interface UsageCostInput {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  actualProviderCostUsd?: number | null;
}

export interface UsageCostResult {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;
  costUsd: number;
  costType: 'actual' | 'estimated';
  pricingSource: string;
  pricingVersion: string;
}

export function calculateUsageCost(
  pricing: ModelPricingRule,
  input: UsageCostInput
): UsageCostResult {
  const inputTokens = Math.max(0, Math.floor(Number(input.inputTokens)));
  const outputTokens = Math.max(0, Math.floor(Number(input.outputTokens)));
  const cachedTokens = Math.max(0, Math.floor(Number(input.cachedTokens ?? 0)));

  if (!Number.isFinite(inputTokens) || !Number.isFinite(outputTokens) || !Number.isFinite(cachedTokens)) {
    throw new Error('Invalid token counts supplied to cost calculator.');
  }
  if (!pricing.pricingSource || !pricing.pricingVersion) {
    throw new Error('Pricing rule must include documented source and version.');
  }

  const billableInputTokens = Math.max(0, inputTokens - cachedTokens);
  const totalTokens = inputTokens + outputTokens;

  if (
    input.actualProviderCostUsd !== undefined &&
    input.actualProviderCostUsd !== null &&
    Number.isFinite(input.actualProviderCostUsd) &&
    input.actualProviderCostUsd >= 0
  ) {
    return {
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens,
      costUsd: Number(input.actualProviderCostUsd.toFixed(6)),
      costType: 'actual',
      pricingSource: `${pricing.pricingSource} (Provider Billing Actual)`,
      pricingVersion: pricing.pricingVersion,
    };
  }

  const inputCost = (billableInputTokens / 1_000_000) * pricing.inputPricePer1M;
  const cachedCost = (cachedTokens / 1_000_000) * pricing.cachedInputPricePer1M;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPricePer1M;
  const totalCost = Number((inputCost + cachedCost + outputCost).toFixed(6));

  return {
    inputTokens,
    outputTokens,
    cachedTokens,
    totalTokens,
    costUsd: totalCost,
    costType: 'estimated',
    pricingSource: pricing.pricingSource,
    pricingVersion: pricing.pricingVersion,
  };
}
