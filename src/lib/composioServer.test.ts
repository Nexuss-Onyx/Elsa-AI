import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOAuthCallbackHtml,
  normalizeToolkitSlug,
  normalizeToolkitSlugs,
  normalizeUserId,
  resolveCallbackOrigin,
} from './composioServer.ts';
import { buildElsaSystemInstruction } from './promptBuilder.ts';

test('normalizeUserId validates safe IDs and rejects invalid characters', () => {
  assert.equal(normalizeUserId(undefined), 'elsa-default-user');
  assert.equal(normalizeUserId(''), 'elsa-default-user');
  assert.equal(normalizeUserId('elsa_user_1234'), 'elsa_user_1234');
  assert.equal(normalizeUserId('../bad/path'), null);
  assert.equal(normalizeUserId('ab'), null);
});

test('normalizeToolkitSlug and normalizeToolkitSlugs sanitize and dedupe', () => {
  assert.equal(normalizeToolkitSlug('GitHub'), 'github');
  assert.equal(normalizeToolkitSlug('google_calendar'), 'google_calendar');
  assert.equal(normalizeToolkitSlug('bad slug!'), null);
  assert.deepEqual(normalizeToolkitSlugs(['Gmail', 'github', 'gmail', 'bad!']), [
    'gmail',
    'github',
  ]);
});

test('resolveCallbackOrigin allows Cloud Run and localhost origins and rejects arbitrary domains', () => {
  assert.equal(
    resolveCallbackOrigin('https://ais-dev-demo-123.europe-west2.run.app/chat'),
    'https://ais-dev-demo-123.europe-west2.run.app',
  );
  assert.equal(
    resolveCallbackOrigin('http://localhost:3000'),
    'http://localhost:3000',
  );
  const rejected = resolveCallbackOrigin('https://evil.example.com');
  assert.notEqual(rejected, 'https://evil.example.com');
});

test('buildOAuthCallbackHtml escapes script/HTML injection safely', () => {
  const html = buildOAuthCallbackHtml({
    toolkit: '<script>alert(1)</script>',
    ok: false,
    error: '<img src=x onerror=alert(1)>',
  });
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.equal(html.includes('<img src=x'), false);
  assert.match(html, /COMPOSIO_AUTH_COMPLETE/);
});

test('buildElsaSystemInstruction includes enabled connectors when provided', () => {
  const withConnectors = buildElsaSystemInstruction(['gmail', 'github']);
  assert.match(withConnectors, /gmail, github/);
  assert.match(withConnectors, /Connected App Tools/);
});
