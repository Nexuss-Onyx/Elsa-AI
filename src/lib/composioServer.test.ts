import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOAuthCallbackHtml,
  curateCategories,
  normalizeToolkitSlug,
  normalizeToolkitSlugs,
  normalizeUserId,
  resolveCallbackOrigin,
  sortToolkitsByUtility,
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

test('resolveCallbackOrigin allows Cloud Run, Vercel, and localhost origins and rejects arbitrary domains', () => {
  assert.equal(
    resolveCallbackOrigin('https://ais-dev-demo-123.europe-west2.run.app/chat'),
    'https://ais-dev-demo-123.europe-west2.run.app',
  );
  assert.equal(
    resolveCallbackOrigin('https://elsa-ai-preview.vercel.app/chat'),
    'https://elsa-ai-preview.vercel.app',
  );
  assert.equal(
    resolveCallbackOrigin('http://localhost:3000'),
    'http://localhost:3000',
  );
  const rejected = resolveCallbackOrigin('https://evil.example.com');
  assert.notEqual(rejected, 'https://evil.example.com');
});

test('buildOAuthCallbackHtml escapes script/HTML injection safely and avoids COOP .closed access', () => {
  const html = buildOAuthCallbackHtml({
    toolkit: '<script>alert(1)</script>',
    ok: false,
    error: '<img src=x onerror=alert(1)>',
  });
  assert.equal(html.includes('<script>alert(1)</script>'), false);
  assert.equal(html.includes('<img src=x'), false);
  assert.equal(html.includes('opener.closed'), false);
  assert.match(html, /BroadcastChannel/);
  assert.match(html, /COMPOSIO_AUTH_COMPLETE/);
});

test('buildElsaSystemInstruction includes enabled connectors when provided', () => {
  const withConnectors = buildElsaSystemInstruction(['gmail', 'github']);
  assert.match(withConnectors, /gmail, github/);
  assert.match(withConnectors, /Connected App Tools/);
});

test('curateCategories deduplicates raw categories, removes noisy tags, and caps list', () => {
  const raw = [
    { id: 'popular', name: 'popular' },
    { id: 'crm', name: 'crm' },
    { id: 'CRM', name: 'CRM' },
    { id: 'productivity', name: 'productivity' },
    { id: 'productivity', name: 'Productivity' },
    { id: 'productivity', name: 'productivity' },
    { id: 'email', name: 'email' },
  ];
  const curated = curateCategories(raw, 2);
  assert.equal(curated.length, 2);
  assert.equal(curated[0].id, 'productivity');
  assert.equal(curated[0].name, 'Productivity');
  assert.equal(curated[1].id, 'crm');
  assert.equal(curated[1].name, 'CRM');
});

test('sortToolkitsByUtility pins recently used apps first and sorts most useful apps above obscure ones', () => {
  const sample = [
    { slug: 'composio', name: 'Composio', toolsCount: 17, isConnected: false },
    { slug: '0codekit', name: '0CodeKit', toolsCount: 8, isConnected: false },
    { slug: 'ambiguous_mcp', name: 'Ambiguous MCP', toolsCount: 945, isConnected: false },
    { slug: 'trello', name: 'Trello', toolsCount: 80, isConnected: false },
    { slug: 'gmail', name: 'Gmail', toolsCount: 61, isConnected: false },
    { slug: 'random_tool', name: 'Random Tool', toolsCount: 120, isConnected: false },
    { slug: 'notion', name: 'Notion', toolsCount: 59, isConnected: false },
  ];

  const coldSorted = sortToolkitsByUtility(sample, []);
  assert.deepEqual(
    coldSorted.map((x) => x.slug),
    ['gmail', 'notion', 'trello', 'random_tool', 'ambiguous_mcp', 'composio', '0codekit'],
  );

  const recentPinned = sortToolkitsByUtility(sample, ['trello', 'random_tool']);
  assert.deepEqual(
    recentPinned.slice(0, 4).map((x) => x.slug),
    ['trello', 'random_tool', 'gmail', 'notion'],
  );
});
