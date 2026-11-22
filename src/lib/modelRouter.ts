import { TIERED_MODELS, type ModelSpec } from './models.ts';

interface TokenEntry {
  timestamp: number;
  tokens: number;
}

interface ModelUsageState {
  minuteRequestTimestamps: number[];
  minuteTokenEntries: TokenEntry[];
  dayKey: string;
  dayRequests: number;
  cooldownUntil: number;
}

const ONE_MINUTE_MS = 60_000;

function getUtcDayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/**
 * Conservative token estimator for Ethiopic/Amharic + English text.
 * Ethiopic UTF-8 characters tend to tokenize denser than ASCII, so ~2 chars/token + output buffer.
 */
export function estimateRequestTokens(
  systemInstruction: string,
  turns: Array<{ parts: Array<{ text: string }> }>,
  outputReserveTokens = 1024,
): number {
  let charCount = systemInstruction.length;
  for (const turn of turns) {
    for (const part of turn.parts) {
      charCount += part.text.length;
    }
  }
  return Math.ceil(charCount / 2) + outputReserveTokens;
}

export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 2));
}

export class TieredModelRouter {
  private readonly models: readonly ModelSpec[];
  private readonly state = new Map<string, ModelUsageState>();

  constructor(models: readonly ModelSpec[] = TIERED_MODELS) {
    this.models = models;
  }

  private getOrCreateState(modelId: string, now: number): ModelUsageState {
    const dayKey = getUtcDayKey(now);
    const existing = this.state.get(modelId);
    if (!existing) {
      const fresh: ModelUsageState = {
        minuteRequestTimestamps: [],
        minuteTokenEntries: [],
        dayKey,
        dayRequests: 0,
        cooldownUntil: 0,
      };
      this.state.set(modelId, fresh);
      return fresh;
    }

    // Prune rolling 60-second windows
    const cutoff = now - ONE_MINUTE_MS;
    existing.minuteRequestTimestamps = existing.minuteRequestTimestamps.filter(
      (ts) => ts > cutoff,
    );
    existing.minuteTokenEntries = existing.minuteTokenEntries.filter(
      (entry) => entry.timestamp > cutoff,
    );

    // Reset daily counter on new UTC day
    if (existing.dayKey !== dayKey) {
      existing.dayKey = dayKey;
      existing.dayRequests = 0;
    }

    return existing;
  }

  public getUsageSnapshot(modelId: string, now = Date.now()): {
    rpmUsed: number;
    tpmUsed: number;
    rpdUsed: number;
    inCooldown: boolean;
  } {
    const s = this.getOrCreateState(modelId, now);
    const tpmUsed = s.minuteTokenEntries.reduce((sum, e) => sum + e.tokens, 0);
    return {
      rpmUsed: s.minuteRequestTimestamps.length,
      tpmUsed,
      rpdUsed: s.dayRequests,
      inCooldown: s.cooldownUntil > now,
    };
  }

  public isWithinLimits(
    model: ModelSpec,
    estimatedTokens: number,
    now = Date.now(),
  ): boolean {
    const usage = this.getUsageSnapshot(model.id, now);
    if (usage.inCooldown) return false;
    if (usage.rpmUsed + 1 > model.rpmLimit) return false;
    if (usage.tpmUsed + estimatedTokens > model.tpmLimit) return false;
    if (usage.rpdUsed + 1 > model.rpdLimit) return false;
    return true;
  }

  /**
   * Selects the highest-capability (lowest tier number) model that has not reached
   * its RPM, TPM, RPD limits or temporary error cooldown.
   */
  public selectModel(options: {
    estimatedTokens: number;
    exclude?: ReadonlySet<string>;
    now?: number;
  }): ModelSpec | null {
    const now = options.now ?? Date.now();
    const exclude = options.exclude;

    for (const model of this.models) {
      if (exclude?.has(model.id)) continue;
      if (this.isWithinLimits(model, options.estimatedTokens, now)) {
        return model;
      }
    }

    return null;
  }

  /**
   * Returns ordered candidate models for a request:
   * 1) Frontier-to-less-capable models currently within RPM/TPM/RPD and not in cooldown
   * 2) Remaining models not yet tried (sorted by tier) if every tier is temporarily saturated
   */
  public getCandidateOrder(options: {
    estimatedTokens: number;
    exclude?: ReadonlySet<string>;
    now?: number;
  }): ModelSpec[] {
    const now = options.now ?? Date.now();
    const exclude = options.exclude;
    const withinLimit: ModelSpec[] = [];
    const fallback: ModelSpec[] = [];

    for (const model of this.models) {
      if (exclude?.has(model.id)) continue;
      if (this.isWithinLimits(model, options.estimatedTokens, now)) {
        withinLimit.push(model);
      } else {
        fallback.push(model);
      }
    }

    return [...withinLimit, ...fallback];
  }

  public recordAttempt(
    modelId: string,
    estimatedInputTokens: number,
    now = Date.now(),
  ): void {
    const s = this.getOrCreateState(modelId, now);
    s.minuteRequestTimestamps.push(now);
    if (estimatedInputTokens > 0) {
      s.minuteTokenEntries.push({ timestamp: now, tokens: estimatedInputTokens });
    }
    s.dayRequests += 1;
  }

  public recordCompletionTokens(
    modelId: string,
    outputTokens: number,
    now = Date.now(),
  ): void {
    if (outputTokens <= 0) return;
    const s = this.getOrCreateState(modelId, now);
    s.minuteTokenEntries.push({ timestamp: now, tokens: outputTokens });
  }

  public markFailure(
    modelId: string,
    statusCode: number,
    now = Date.now(),
  ): void {
    const s = this.getOrCreateState(modelId, now);
    const cooldownMs =
      statusCode === 404
        ? 30 * ONE_MINUTE_MS
        : statusCode === 429
          ? ONE_MINUTE_MS
          : 5 * ONE_MINUTE_MS;
    s.cooldownUntil = Math.max(s.cooldownUntil, now + cooldownMs);
  }
}
