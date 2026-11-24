import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildElsaSystemInstruction,
  buildElsaTitleSystemInstruction,
  buildTitlePromptFromTurns,
  formatConversationTitle,
  sanitizeChatHistory,
  sanitizeGeneratedTitle,
  shouldTriggerBackgroundRename,
} from './promptBuilder.ts';

test('buildElsaSystemInstruction establishes Elsa AI brand without revealing Gemini or model switching', () => {
  const instruction = buildElsaSystemInstruction();
  assert.match(instruction, /Elsa AI \(ኤልሳ AI\)/);
  assert.match(instruction, /Never refer to yourself as Gemini/i);
  assert.match(instruction, /Never mention internal routing, model switching, rate limits/i);
  assert.match(instruction, /Amharic/);
});

test('sanitizeChatHistory filters empty or invalid turns and enforces alternating turns', () => {
  const result = sanitizeChatHistory([
    { role: 'model', text: 'leading orphan' },
    { role: 'user', text: '  ሰላም ኤልሳ  ' },
    { role: 'user', text: 'ሁለተኛ ጥያቄ' },
    { role: 'model', text: '' },
    { role: 'system', text: 'ignore me' },
    { role: 'model', text: 'ሰላም! እንዴት ልረዳዎ?' },
  ]);

  assert.deepEqual(result, [
    { role: 'user', parts: [{ text: 'ሰላም ኤልሳ\n\nሁለተኛ ጥያቄ' }] },
    { role: 'model', parts: [{ text: 'ሰላም! እንዴት ልረዳዎ?' }] },
  ]);
});

test('formatConversationTitle truncates long prompts cleanly', () => {
  assert.equal(formatConversationTitle('   '), 'አዲስ ውይይት');
  assert.equal(formatConversationTitle('ሰላም ኤልሳ'), 'ሰላም ኤልሳ');
  const longText = 'ስለ ኢትዮጵያ የቡና ሥነ-ሥርዓት እና ስለ አቦል ቶና በረካ ባህላዊ ትርጉም በዝርዝር ንገሪኝ';
  const title = formatConversationTitle(longText);
  assert.ok(title.endsWith('…'));
  assert.ok(title.length <= 42);
});

test('title generation instruction and sanitizer produce clean Amharic session titles', () => {
  const sys = buildElsaTitleSystemInstruction();
  assert.match(sys, /Amharic/);
  assert.match(sys, /Never mention Gemini/i);

  assert.equal(sanitizeGeneratedTitle('«የኢትዮጵያ ቡና ታሪክ።»\nተጨማሪ'), 'የኢትዮጵያ ቡና ታሪክ');
  assert.equal(sanitizeGeneratedTitle('** የአማርኛ ሰዋሰው መመሪያ **'), 'የአማርኛ ሰዋሰው መመሪያ');
  assert.equal(sanitizeGeneratedTitle('Gemini Chat'), null);
  assert.equal(sanitizeGeneratedTitle('  '), null);

  const prompt = buildTitlePromptFromTurns([
    { role: 'user', parts: [{ text: 'ሰላም' }] },
    { role: 'model', parts: [{ text: 'ሰላም እንዴት ልረዳዎ?' }] },
    { role: 'user', parts: [{ text: 'ስለ ኢትዮጵያ ቡና አመጣጥ ንገሪኝ' }] },
  ]);
  assert.match(prompt, /User: ሰላም/);
  assert.match(prompt, /Elsa AI: ሰላም እንዴት ልረዳዎ\?/);
});

test('shouldTriggerBackgroundRename triggers only at the second user prompt when not yet renamed', () => {
  assert.equal(shouldTriggerBackgroundRename([{ role: 'user' }], false), false);
  assert.equal(
    shouldTriggerBackgroundRename([{ role: 'user' }, { role: 'model' }], false),
    false,
  );
  assert.equal(
    shouldTriggerBackgroundRename(
      [{ role: 'user' }, { role: 'model' }, { role: 'user' }],
      false,
    ),
    true,
  );
  assert.equal(
    shouldTriggerBackgroundRename(
      [{ role: 'user' }, { role: 'model' }, { role: 'user' }],
      true,
    ),
    false,
  );
  assert.equal(
    shouldTriggerBackgroundRename(
      [
        { role: 'user' },
        { role: 'model' },
        { role: 'user' },
        { role: 'model' },
        { role: 'user' },
      ],
      false,
    ),
    false,
  );
});

