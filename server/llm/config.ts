const efforts = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export function modelConfiguration() {
  const model = process.env.OPENAI_MODEL ?? 'gpt-6.1-terra';
  const effort = process.env.OPENAI_REASONING_EFFORT ?? 'low';
  if (!efforts.includes(effort as typeof efforts[number])) throw new Error('invalid_reasoning_effort');
  return { model, reasoningEffort: effort as typeof efforts[number] };
}

export type UsageRates = { input: number; output: number };
/** USD per million tokens; use the 30-minute cache-write ceiling, with no cache discount.
 * Terra: https://developers.openai.com/api/docs/models/gpt-6.1-terra (verified 2026-11-08).
 */
export function usageRates(model: string): UsageRates {
  const input = process.env.OPENAI_INPUT_USD_PER_MILLION, output = process.env.OPENAI_OUTPUT_USD_PER_MILLION;
  if (input !== undefined || output !== undefined) {
    const rates = { input: Number(input), output: Number(output) };
    if (!input?.trim() || !output?.trim() || !Object.values(rates).every(rate => Number.isFinite(rate) && rate > 0)) throw new Error('invalid_model_pricing');
    return rates;
  }
  if (model === 'gpt-6.1-terra') return { input: 1.25, output: 5 };
  if (model === 'gpt-5.6-luna') return { input: .25, output: 1.20 };
  // A custom model needs explicit prices rather than an unrelated model's allowance.
  throw new Error('model_pricing_unconfigured');
}
