import test from 'node:test';
import assert from 'node:assert/strict';
import { TIERED_MODELS } from './models.ts';
import {
  TieredModelRouter,
  estimateRequestTokens,
  estimateTextTokens,
} from './modelRouter.ts';

test('TIERED_MODELS strictly contains the 8 markdown models ordered frontier to smaller', () => {
  assert.equal(TIERED_MODELS.length, 8);
  assert.equal(TIERED_MODELS[0].id, 'gemini-4-hydrogen');
  assert.equal(TIERED_MODELS[0].tier, 1);
  assert.equal(TIERED_MODELS[TIERED_MODELS.length - 1].tier, 8);
});

test('router stays on frontier model until 5 RPM limit is reached, then switches to Tier 2 before sending 6th RPM', () => {
  const router = new TieredModelRouter();
  const t0 = 1_000_000;

  // Requests 1..5 should all stay on gemini-4-hydrogen (5 RPM limit)
  for (let i = 0; i < 5; i += 1) {
    const selected = router.selectModel({ estimatedTokens: 1500, now: t0 + i * 1000 });
    assert.equal(selected?.id, 'gemini-4-hydrogen');
    router.recordAttempt(selected.id, 1500, t0 + i * 1000);
  }

  // 6th request within the same minute must switch to Tier 2 (gemini-3.8-flash), never sending 6 RPM on Tier 1
  const sixth = router.selectModel({ estimatedTokens: 1500, now: t0 + 10_000 });
  assert.equal(sixth?.id, 'gemini-3.8-flash');

  // After 61 seconds, Tier 1 RPM window resets and becomes eligible again (RPD is 5/20)
  const afterOneMinute = router.selectModel({
    estimatedTokens: 1500,
    now: t0 + 62_000,
  });
  assert.equal(afterOneMinute?.id, 'gemini-4-hydrogen');
});

test('router switches when TPM (250K) is about to be exceeded', () => {
  const router = new TieredModelRouter();
  const t0 = 2_000_000;

  router.recordAttempt('gemini-4-hydrogen', 240_000, t0);
  // Next request needs 15,000 tokens -> 240K + 15K = 255K > 250K -> must switch!
  const next = router.selectModel({ estimatedTokens: 15_000, now: t0 + 5_000 });
  assert.equal(next?.id, 'gemini-3.8-flash');
});

test('router switches when RPD (20) is reached and resets on next UTC day', () => {
  const router = new TieredModelRouter();
  const day1 = Date.UTC(2026, 10, 21, 10, 0, 0);

  // Simulate 20 requests spaced > 1 minute apart on Day 1
  for (let i = 0; i < 20; i += 1) {
    const ts = day1 + i * 70_000;
    const selected = router.selectModel({ estimatedTokens: 1000, now: ts });
    assert.equal(selected?.id, 'gemini-4-hydrogen');
    router.recordAttempt(selected.id, 1000, ts);
  }

  // 21st request on Day 1 must move to Tier 2
  const req21 = router.selectModel({
    estimatedTokens: 1000,
    now: day1 + 21 * 70_000,
  });
  assert.equal(req21?.id, 'gemini-3.8-flash');

  // Next UTC day resets RPD back to Tier 1
  const day2 = Date.UTC(2026, 10, 22, 0, 1, 0);
  const nextDaySelection = router.selectModel({ estimatedTokens: 1000, now: day2 });
  assert.equal(nextDaySelection?.id, 'gemini-4-hydrogen');
});

test('markFailure puts model into cooldown and candidate order fails over to next tier', () => {
  const router = new TieredModelRouter();
  const t0 = 3_000_000;

  router.markFailure('gemini-4-hydrogen', 429, t0);
  router.markFailure('gemini-3.8-flash', 503, t0);

  const next = router.selectModel({ estimatedTokens: 1000, now: t0 + 5_000 });
  assert.equal(next?.id, 'gemini-3.6-flash');

  const candidates = router.getCandidateOrder({ estimatedTokens: 1000, now: t0 + 5_000 });
  assert.equal(candidates[0].id, 'gemini-3.6-flash');
  assert.equal(candidates.length, 8);
});

test('token estimators compute positive conservative estimates', () => {
  const reqTokens = estimateRequestTokens('System prompt', [
    { parts: [{ text: 'ሰላም ኤልሳ' }] },
  ]);
  assert.ok(reqTokens > 1024);
  assert.equal(estimateTextTokens(''), 0);
  assert.ok(estimateTextTokens('አማርኛ') >= 2);
});
