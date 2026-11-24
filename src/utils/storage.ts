import type { ChatMessage } from '../lib/promptBuilder';

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  isRenamedByAi?: boolean;
}

const CONVERSATIONS_KEY = 'elsa_ai_conversations_v2';

export function createId(prefix = 'id'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createNewConversation(): Conversation {
  return {
    id: createId('conv'),
    title: 'አዲስ ውይይት',
    messages: [],
    updatedAt: Date.now(),
    isRenamedByAi: false,
  };
}

export function filterNonEmptyConversations(conversations: Conversation[]): Conversation[] {
  return conversations.filter((conv) => conv.messages.length > 0);
}

export function dedupeEmptyConversations(conversations: Conversation[]): Conversation[] {
  let keptEmpty = false;
  const result: Conversation[] = [];
  for (const conv of conversations) {
    if (conv.messages.length === 0) {
      if (keptEmpty) continue;
      keptEmpty = true;
    }
    result.push(conv);
  }
  return result;
}

export function startOrReuseNewConversation(conversations: Conversation[]): {
  conversations: Conversation[];
  activeId: string;
} {
  const existingEmpty = conversations.find((c) => c.messages.length === 0);
  if (existingEmpty) {
    const now = Date.now();
    const updatedEmpty: Conversation = { ...existingEmpty, updatedAt: now };
    const others = conversations.filter((c) => c.messages.length > 0);
    return {
      conversations: [updatedEmpty, ...others],
      activeId: updatedEmpty.id,
    };
  }
  const fresh = createNewConversation();
  return {
    conversations: [fresh, ...conversations],
    activeId: fresh.id,
  };
}

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const normalized = parsed
      .filter(
        (item): item is Conversation =>
          Boolean(
            item &&
              typeof item.id === 'string' &&
              Array.isArray(item.messages) &&
              item.messages.length > 0,
          ),
      )
      .map((item) => ({
        id: item.id,
        title: typeof item.title === 'string' && item.title.trim() ? item.title : 'አዲስ ውይይት',
        messages: item.messages,
        updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now(),
        isRenamedByAi: Boolean(item.isRenamedByAi),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return normalized;
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  if (typeof window === 'undefined') return;
  try {
    const nonEmpty = filterNonEmptyConversations(conversations);
    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(nonEmpty));
  } catch {
    // Ignore quota errors gracefully
  }
}

const ELSA_USER_ID_KEY = 'elsa_ai_user_id_v1';
const ENABLED_CONNECTORS_KEY = 'elsa_ai_enabled_connectors_v1';

export function getOrCreateElsaUserId(): string {
  if (typeof window === 'undefined') return 'elsa-default-user';
  try {
    const existing = window.localStorage.getItem(ELSA_USER_ID_KEY);
    if (existing && /^[a-zA-Z0-9_-]{4,80}$/.test(existing)) {
      return existing;
    }
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `elsa_${crypto.randomUUID()}`
        : `elsa_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(ELSA_USER_ID_KEY, generated);
    return generated;
  } catch {
    return 'elsa-default-user';
  }
}

export function loadEnabledConnectors(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(ENABLED_CONNECTORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return Array.from(
      new Set(
        parsed
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim().toLowerCase())
          .filter((item) => /^[a-z0-9_-]{1,80}$/.test(item)),
      ),
    );
  } catch {
    return [];
  }
}

export function saveEnabledConnectors(slugs: string[]): void {
  if (typeof window === 'undefined') return;
  try {
    const clean = Array.from(
      new Set(
        slugs
          .map((s) => s.trim().toLowerCase())
          .filter((s) => /^[a-z0-9_-]{1,80}$/.test(s)),
      ),
    );
    window.localStorage.setItem(ENABLED_CONNECTORS_KEY, JSON.stringify(clean));
  } catch {
    // Ignore quota errors gracefully
  }
}

