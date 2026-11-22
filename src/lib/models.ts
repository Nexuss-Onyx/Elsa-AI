export interface ModelSpec {
  id: string;
  tier: number;
  rpmLimit: number;
  tpmLimit: number;
  rpdLimit: number;
}

/**
 * Strictly derived from /public/assets/aistudio/Gemini_rate_limits_by_model_ac388bd8.md.
 * Ordered from most frontier/capable (Tier 1) down to less capable (Tier 8).
 */
export const TIERED_MODELS: readonly ModelSpec[] = [
  {
    id: 'gemini-4-hydrogen',
    tier: 1,
    rpmLimit: 5,
    tpmLimit: 250_000,
    rpdLimit: 20,
  },
  {
    id: 'gemini-3.8-flash',
    tier: 2,
    rpmLimit: 5,
    tpmLimit: 250_000,
    rpdLimit: 20,
  },
  {
    id: 'gemini-3.6-flash',
    tier: 3,
    rpmLimit: 5,
    tpmLimit: 250_000,
    rpdLimit: 20,
  },
  {
    id: 'gemini-3-flash-preview',
    tier: 4,
    rpmLimit: 5,
    tpmLimit: 250_000,
    rpdLimit: 20,
  },
  {
    id: 'gemini-3.5-flash-lite',
    tier: 5,
    rpmLimit: 15,
    tpmLimit: 250_000,
    rpdLimit: 500,
  },
  {
    id: 'gemini-3.1-flash-lite',
    tier: 6,
    rpmLimit: 15,
    tpmLimit: 250_000,
    rpdLimit: 500,
  },
  {
    id: 'gemini-2.5-flash',
    tier: 7,
    rpmLimit: 5,
    tpmLimit: 250_000,
    rpdLimit: 20,
  },
  {
    id: 'gemini-2.5-flash-lite',
    tier: 8,
    rpmLimit: 10,
    tpmLimit: 250_000,
    rpdLimit: 20,
  },
] as const;

export function getModelSpec(modelId: string): ModelSpec | undefined {
  return TIERED_MODELS.find((m) => m.id === modelId);
}
