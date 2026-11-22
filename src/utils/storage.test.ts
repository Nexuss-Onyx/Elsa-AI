import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dedupeEmptyConversations,
  filterNonEmptyConversations,
  startOrReuseNewConversation,
  type Conversation,
} from './storage';

const makeConv = (id: string, messageCount: number, updatedAt = 1000): Conversation => ({
  id,
  title: messageCount === 0 ? 'አዲስ ውይይት' : `Chat ${id}`,
  messages: Array.from({ length: messageCount }, (_, idx) => ({
    id: `m_${idx}`,
    role: 'user' as const,
    text: 'ሰላም',
    createdAt: updatedAt,
  })),
  updatedAt,
});

test('filterNonEmptyConversations keeps only chats with at least one message', () => {
  const input = [makeConv('e1', 0, 3000), makeConv('c1', 1, 2000), makeConv('e2', 0, 1000)];
  const result = filterNonEmptyConversations(input);
  assert.deepEqual(
    result.map((c) => c.id),
    ['c1'],
  );
});

test('dedupeEmptyConversations collapses multiple empty conversations into one', () => {
  const input = [makeConv('e1', 0, 3000), makeConv('c1', 2, 2000), makeConv('e2', 0, 1000)];
  const result = dedupeEmptyConversations(input);
  assert.equal(result.length, 2);
  assert.deepEqual(
    result.map((c) => c.id),
    ['e1', 'c1'],
  );
});

test('startOrReuseNewConversation reuses existing empty conversation without duplicating', () => {
  const existing = [makeConv('c1', 2, 2000), makeConv('e1', 0, 1000)];
  const next = startOrReuseNewConversation(existing);
  assert.equal(next.activeId, 'e1');
  assert.equal(next.conversations.length, 2);
  assert.equal(next.conversations[0].id, 'e1');
  assert.equal(next.conversations[1].id, 'c1');
});

test('startOrReuseNewConversation creates a new conversation only when none is empty', () => {
  const existing = [makeConv('c1', 2, 2000)];
  const next = startOrReuseNewConversation(existing);
  assert.equal(next.conversations.length, 2);
  assert.equal(next.conversations[0].messages.length, 0);
  assert.equal(next.conversations[0].id, next.activeId);
});
