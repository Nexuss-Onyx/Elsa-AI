import { Composio } from '@composio/core';
import { GoogleProvider } from '@composio/google';
import type { FunctionDeclaration } from '@google/genai';

export interface ConnectorCategoryItem {
  id: string;
  name: string;
}

export interface ConnectorAppItem {
  slug: string;
  name: string;
  logo: string | null;
  description: string;
  categories: Array<{ slug: string; name: string }>;
  toolsCount: number | null;
  isNoAuth: boolean;
  isConnected: boolean;
  connectedAccountId: string | null;
  connectionStatus: string | null;
  isPinnedRecent?: boolean;
}

export const MOST_USEFUL_TOOLKIT_ORDER: string[] = [
  'gmail',
  'googlecalendar',
  'notion',
  'googledrive',
  'googlesheets',
  'googledocs',
  'slack',
  'github',
  'outlook',
  'microsoft_teams',
  'zoom',
  'discord',
  'linear',
  'jira',
  'asana',
  'trello',
  'todoist',
  'airtable',
  'hubspot',
  'dropbox',
  'figma',
  'shopify',
  'stripe',
  'salesforce',
  'zendesk',
  'clickup',
  'calendly',
  'cal',
  'onedrive',
  'whatsapp',
  'telegram',
  'youtube',
  'linkedin',
  'twitter',
  'reddit',
  'gitlab',
  'bitbucket',
  'vercel',
  'supabase',
  'postgres',
  'perplexityai',
  'exa',
  'firecrawl',
  'tavily',
];

const MOST_USEFUL_RANK_MAP = new Map<string, number>(
  MOST_USEFUL_TOOLKIT_ORDER.map((slug, index) => [slug, index]),
);

const DEMOTED_TOOLKIT_SLUGS = new Set<string>(['composio', '0codekit']);
const NOISY_CATEGORY_IDS = new Set<string>([
  'popular',
  'other-/-miscellaneous',
  'other',
  'miscellaneous',
  'uncategorized',
  'unknown',
]);

function formatCategoryDisplayName(rawName: string, slug: string): string {
  const trimmed = rawName.trim();
  if (trimmed && /[A-Z]/.test(trimmed)) {
    return trimmed;
  }
  const source = trimmed || slug;
  const upperWords = new Set(['crm', 'ai', 'hr', 'erp', 'lms', 'seo', 'api', 'bi', 'it', 'cms']);
  return source
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((word) => {
      const lower = word.toLowerCase();
      if (upperWords.has(lower)) return lower.toUpperCase();
      if (lower === '&' || lower === '/') return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

export function curateCategories(
  rawItems: Array<{ id?: string; name?: string }>,
  limit = 30,
): ConnectorCategoryItem[] {
  const counts = new Map<string, { id: string; name: string; count: number }>();

  for (const item of rawItems) {
    const rawId = typeof item.id === 'string' ? item.id.trim().toLowerCase() : '';
    const rawName = typeof item.name === 'string' ? item.name.trim() : '';
    if (!rawId || rawId.length > 48 || NOISY_CATEGORY_IDS.has(rawId)) continue;

    const existing = counts.get(rawId);
    const formattedName = formatCategoryDisplayName(rawName, rawId);
    if (existing) {
      existing.count += 1;
      if (rawName && /[A-Z]/.test(rawName) && !/[A-Z]/.test(existing.name)) {
        existing.name = formattedName;
      }
    } else {
      counts.set(rawId, {
        id: rawId,
        name: formattedName,
        count: 1,
      });
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map(({ id, name }) => ({ id, name }));
}

export function isDemotedUtilityToolkit(slug: string, toolsCount?: number | null): boolean {
  const lower = slug.trim().toLowerCase();
  if (!lower) return true;
  if (DEMOTED_TOOLKIT_SLUGS.has(lower)) return true;
  if (lower.endsWith('_mcp') || lower.startsWith('composio_')) return true;
  if (typeof toolsCount === 'number' && toolsCount <= 0) return true;
  return false;
}

export function sortToolkitsByUtility<
  T extends {
    slug: string;
    name: string;
    toolsCount?: number | null;
    isConnected?: boolean;
  },
>(items: T[], recentSlugs: string[] = []): T[] {
  const recentMap = new Map<string, number>();
  recentSlugs.forEach((slug, index) => {
    const clean = slug.trim().toLowerCase();
    if (clean && !recentMap.has(clean)) {
      recentMap.set(clean, index);
    }
  });

  return [...items].sort((a, b) => {
    const slugA = a.slug.trim().toLowerCase();
    const slugB = b.slug.trim().toLowerCase();

    const recentA = recentMap.get(slugA);
    const recentB = recentMap.get(slugB);
    if (recentA !== undefined && recentB !== undefined) return recentA - recentB;
    if (recentA !== undefined) return -1;
    if (recentB !== undefined) return 1;

    const demotedA = isDemotedUtilityToolkit(slugA, a.toolsCount);
    const demotedB = isDemotedUtilityToolkit(slugB, b.toolsCount);
    if (demotedA !== demotedB) return demotedA ? 1 : -1;

    const rankA = MOST_USEFUL_RANK_MAP.get(slugA);
    const rankB = MOST_USEFUL_RANK_MAP.get(slugB);
    if (rankA !== undefined && rankB !== undefined) return rankA - rankB;
    if (rankA !== undefined) return -1;
    if (rankB !== undefined) return 1;

    const connA = Boolean(a.isConnected);
    const connB = Boolean(b.isConnected);
    if (connA !== connB) return connA ? -1 : 1;

    const toolsA = typeof a.toolsCount === 'number' ? a.toolsCount : 0;
    const toolsB = typeof b.toolsCount === 'number' ? b.toolsCount : 0;
    if (toolsA !== toolsB) return toolsB - toolsA;

    return a.name.localeCompare(b.name);
  });
}

interface CachedToolkitMeta {
  description: string;
  categories: Array<{ slug: string; name: string }>;
  toolsCount: number | null;
  logo: string | null;
  cachedAt: number;
}

const META_TTL_MS = 30 * 60 * 1000;
const CATEGORIES_TTL_MS = 30 * 60 * 1000;
const SESSION_TTL_MS = 15 * 60 * 1000;

const toolkitMetaCache = new Map<string, CachedToolkitMeta>();
let categoriesCache: { items: ConnectorCategoryItem[]; cachedAt: number } | null = null;

type ComposioInstance = Composio<GoogleProvider>;
type ComposioSession = Awaited<ReturnType<ComposioInstance['sessions']['create']>>;

const browseSessionCache = new Map<string, { session: ComposioSession; createdAt: number }>();

let sharedComposioClient: ComposioInstance | null = null;
let sharedComposioKey: string | null = null;

export function getComposioApiKey(): string {
  const key = process.env.COMPOSIO_API_KEY?.trim() ?? '';
  if (!key || key === 'MY_COMPOSIO_API_KEY') return '';
  return key;
}

export function isComposioConfigured(): boolean {
  return getComposioApiKey().length > 0;
}

export function getComposioClient(): ComposioInstance {
  const apiKey = getComposioApiKey();
  if (!apiKey) {
    throw new Error('COMPOSIO_NOT_CONFIGURED');
  }
  if (!sharedComposioClient || sharedComposioKey !== apiKey) {
    sharedComposioClient = new Composio({
      apiKey,
      provider: new GoogleProvider(),
    });
    sharedComposioKey = apiKey;
    browseSessionCache.clear();
  }
  return sharedComposioClient;
}

export function normalizeUserId(raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') {
    return 'elsa-default-user';
  }
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return 'elsa-default-user';
  if (!/^[a-zA-Z0-9_-]{4,80}$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function normalizeToolkitSlug(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,80}$/.test(trimmed)) return null;
  return trimmed;
}

export function normalizeToolkitSlugs(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const slug = normalizeToolkitSlug(item);
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      out.push(slug);
      if (out.length >= 100) break;
    }
  }
  return out;
}

export function resolveCallbackOrigin(clientOrigin?: unknown): string {
  const envOriginRaw = process.env.APP_URL?.trim();
  const vercelProdUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  const vercelDeployUrl = process.env.VERCEL_URL?.trim();

  let fallbackOrigin = 'http://localhost:3000';
  if (envOriginRaw && envOriginRaw !== 'MY_APP_URL' && /^https?:\/\//i.test(envOriginRaw)) {
    fallbackOrigin = envOriginRaw.replace(/\/+$/, '');
  } else if (vercelProdUrl) {
    fallbackOrigin = `https://${vercelProdUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`;
  } else if (vercelDeployUrl) {
    fallbackOrigin = `https://${vercelDeployUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')}`;
  }

  if (typeof clientOrigin !== 'string' || !clientOrigin.trim()) {
    return fallbackOrigin;
  }

  try {
    const parsed = new URL(clientOrigin.trim());
    const isLocalhost =
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1');
    const isCloudRun =
      parsed.protocol === 'https:' && parsed.hostname.endsWith('.run.app');
    const isVercel =
      parsed.protocol === 'https:' && parsed.hostname.endsWith('.vercel.app');
    const matchesEnvOrigin = parsed.origin === fallbackOrigin;

    if (isLocalhost || isCloudRun || isVercel || matchesEnvOrigin) {
      return parsed.origin;
    }
  } catch {
    // Ignore malformed client origin and use server fallback
  }

  return fallbackOrigin;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildOAuthCallbackHtml(params: {
  toolkit: string;
  ok: boolean;
  error?: string;
}): string {
  const safePayload = JSON.stringify({
    type: 'COMPOSIO_AUTH_COMPLETE',
    toolkit: params.toolkit,
    ok: params.ok,
    error: params.error ?? null,
  }).replace(/</g, '\\u003c');

  const statusText = params.ok
    ? `Connected ${escapeHtml(params.toolkit || 'app')} successfully. This window will close automatically.`
    : `Authorization did not complete${params.error ? `: ${escapeHtml(params.error)}` : '.'}`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Elsa AI — Connector Authorization</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f3f1ec;
        color: #1c1b19;
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        margin: 0;
        padding: 24px;
      }
      .card {
        max-width: 400px;
        background: #ffffff;
        border: 1px solid #dcd9d0;
        border-radius: 16px;
        padding: 24px;
        text-align: center;
        box-shadow: 0 8px 24px rgba(28, 27, 25, 0.08);
      }
      h1 { font-size: 16px; margin: 0 0 8px; }
      p { font-size: 14px; color: #5e5a52; margin: 0; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Elsa AI Connectors</h1>
      <p>${statusText}</p>
    </div>
    <script>
      (function () {
        var payload = ${safePayload};
        var sentToApp = false;
        try {
          if (typeof BroadcastChannel !== 'undefined') {
            var channel = new BroadcastChannel('elsa_composio_auth');
            channel.postMessage(payload);
            channel.close();
            sentToApp = true;
          }
        } catch (e) {}
        try {
          if (window.opener && typeof window.opener.postMessage === 'function') {
            window.opener.postMessage(payload, '*');
            sentToApp = true;
          }
        } catch (e) {}
        setTimeout(function () {
          try {
            window.close();
          } catch (e) {}
          if (!sentToApp) {
            try {
              window.location.replace('/');
            } catch (e) {}
          }
        }, 300);
      })();
    </script>
  </body>
</html>`;
}

async function getBrowseSession(userId: string, origin: string): Promise<ComposioSession> {
  const cacheKey = `${userId}::${origin}`;
  const existing = browseSessionCache.get(cacheKey);
  if (existing && Date.now() - existing.createdAt < SESSION_TTL_MS) {
    return existing.session;
  }

  const composio = getComposioClient();
  const callbackUrl = `${origin}/api/composio/callback?userId=${encodeURIComponent(userId)}`;
  const session = await composio.sessions.create(userId, {
    manageConnections: {
      enable: true,
      callbackUrl,
    },
  });
  browseSessionCache.set(cacheKey, { session, createdAt: Date.now() });
  return session;
}

async function enrichToolkitMetadata(slugs: string[]): Promise<void> {
  const now = Date.now();
  const missing = slugs.filter((slug) => {
    const cached = toolkitMetaCache.get(slug.toLowerCase());
    return !cached || now - cached.cachedAt > META_TTL_MS;
  });

  if (missing.length === 0) return;

  try {
    const composio = getComposioClient();
    const list = await composio.toolkits.getMany(missing.slice(0, 50));
    for (const item of list) {
      toolkitMetaCache.set(item.slug.toLowerCase(), {
        description: item.meta?.description ?? '',
        categories: Array.isArray(item.meta?.categories) ? item.meta.categories : [],
        toolsCount: typeof item.meta?.toolsCount === 'number' ? item.meta.toolsCount : null,
        logo: item.meta?.logo ?? null,
        cachedAt: now,
      });
    }
  } catch {
    // Metadata enrichment is optional; continue with base toolkit fields
  }
}

export async function listComposioCategories(): Promise<ConnectorCategoryItem[]> {
  if (!isComposioConfigured()) return [];
  if (categoriesCache && Date.now() - categoriesCache.cachedAt < CATEGORIES_TTL_MS) {
    return categoriesCache.items;
  }
  const composio = getComposioClient();
  const response = await composio.toolkits.listCategories();
  const items = curateCategories(response.items ?? [], 30);
  categoriesCache = { items, cachedAt: Date.now() };
  return items;
}

const CATALOG_START_CURSOR = '__catalog_start';

function mapSessionToolkitItem(
  item: {
    slug: string;
    name: string;
    logo?: string;
    isNoAuth: boolean;
    connection?: {
      isActive?: boolean;
      connectedAccount?: { id?: string; status?: string };
    };
  },
  isPinnedRecent = false,
): ConnectorAppItem {
  const meta = toolkitMetaCache.get(item.slug.toLowerCase());
  return {
    slug: item.slug,
    name: item.name,
    logo: item.logo ?? meta?.logo ?? null,
    description: meta?.description ?? '',
    categories: meta?.categories ?? [],
    toolsCount: meta?.toolsCount ?? null,
    isNoAuth: Boolean(item.isNoAuth),
    isConnected: Boolean(item.connection?.isActive),
    connectedAccountId: item.connection?.connectedAccount?.id ?? null,
    connectionStatus: item.connection?.connectedAccount?.status ?? null,
    ...(isPinnedRecent ? { isPinnedRecent: true } : {}),
  };
}

export async function listComposioToolkits(params: {
  userId: string;
  origin: string;
  search?: string;
  category?: string;
  connectedOnly?: boolean;
  cursor?: string;
  limit?: number;
  recentSlugs?: string[];
}): Promise<{
  pinnedItems: ConnectorAppItem[];
  items: ConnectorAppItem[];
  cursor: string | null;
  totalPages: number;
}> {
  const session = await getBrowseSession(params.userId, params.origin);
  const composio = getComposioClient();
  const limit = Math.min(Math.max(params.limit ?? 20, 1), 100);
  const search = params.search?.trim() ?? '';
  const category = params.category?.trim() ?? '';
  const recentSlugs = normalizeToolkitSlugs(params.recentSlugs ?? []);

  // Category-filtered browse (strictly 20 per page, with Next/Previous pagination & utility sorting)
  if (category && category !== 'all' && !search) {
    type RawCategoryToolkit = {
      slug: string;
      name: string;
      meta?: {
        description?: string;
        categories?: Array<{ id?: string; slug?: string; name: string }>;
        tools_count?: number;
        toolsCount?: number;
        logo?: string;
      };
    };

    let rawItems: RawCategoryToolkit[] = [];
    let nextCursor: string | null = null;
    let totalPages = 1;

    const internalClient = (
      composio as unknown as {
        client?: {
          toolkits?: {
            list?: (query: Record<string, unknown>) => Promise<{
              items?: RawCategoryToolkit[];
              next_cursor?: string | null;
              total_pages?: number;
            }>;
          };
        };
      }
    ).client;

    if (internalClient?.toolkits?.list) {
      const rawRes = await internalClient.toolkits.list({
        category,
        limit,
        cursor: params.cursor || undefined,
        sort_by: 'usage',
      });
      rawItems = Array.isArray(rawRes.items) ? rawRes.items : [];
      nextCursor = rawRes.next_cursor ?? null;
      totalPages = rawRes.total_pages ?? 1;
    } else {
      const rawByCategory = await composio.toolkits.get({
        category,
        limit,
        cursor: params.cursor || undefined,
        sortBy: 'usage',
      });
      rawItems = rawByCategory as unknown as RawCategoryToolkit[];
    }

    const now = Date.now();
    for (const tk of rawItems) {
      const normalizedCats = Array.isArray(tk.meta?.categories)
        ? tk.meta.categories.map((c) => ({
            slug: c.slug ?? c.id ?? '',
            name: c.name,
          }))
        : [];
      const toolsCount =
        typeof tk.meta?.toolsCount === 'number'
          ? tk.meta.toolsCount
          : typeof tk.meta?.tools_count === 'number'
            ? tk.meta.tools_count
            : null;
      toolkitMetaCache.set(tk.slug.toLowerCase(), {
        description: tk.meta?.description ?? '',
        categories: normalizedCats,
        toolsCount,
        logo: tk.meta?.logo ?? null,
        cachedAt: now,
      });
    }

    const slugs = rawItems.map((t) => t.slug).filter(Boolean);
    if (slugs.length === 0) {
      return { pinnedItems: [], items: [], cursor: null, totalPages: 1 };
    }

    const stateRes = await session.toolkits({
      toolkits: slugs,
      limit: slugs.length,
      isConnected: params.connectedOnly ? true : undefined,
    });

    const stateMap = new Map(stateRes.items.map((item) => [item.slug.toLowerCase(), item]));
    const mapped: ConnectorAppItem[] = [];
    for (const tk of rawItems) {
      const state = stateMap.get(tk.slug.toLowerCase());
      const isConnected = Boolean(state?.connection?.isActive);
      if (params.connectedOnly && !isConnected) continue;
      const cached = toolkitMetaCache.get(tk.slug.toLowerCase());
      mapped.push({
        slug: tk.slug,
        name: tk.name,
        logo: state?.logo ?? cached?.logo ?? null,
        description: cached?.description ?? '',
        categories: cached?.categories ?? [],
        toolsCount: cached?.toolsCount ?? null,
        isNoAuth: Boolean(state?.isNoAuth),
        isConnected,
        connectedAccountId: state?.connection?.connectedAccount?.id ?? null,
        connectionStatus: state?.connection?.connectedAccount?.status ?? null,
      });
    }

    const sorted = sortToolkitsByUtility(mapped, !params.cursor ? recentSlugs : []);
    return {
      pinnedItems: [],
      items: sorted,
      cursor: nextCursor,
      totalPages,
    };
  }

  // Default Discovery Page 1: Pin recently used apps first, then sort most useful apps up (max 20 total)
  if (!params.cursor && !search && !params.connectedOnly && (!category || category === 'all')) {
    const pinnedRecentSlugs = recentSlugs.slice(0, Math.min(6, limit));
    const pinnedSet = new Set(pinnedRecentSlugs);
    const remainingSlots = Math.max(0, limit - pinnedRecentSlugs.length);
    const usefulFillSlugs = MOST_USEFUL_TOOLKIT_ORDER.filter((s) => !pinnedSet.has(s)).slice(
      0,
      remainingSlots,
    );
    const seedSlugs = [...pinnedRecentSlugs, ...usefulFillSlugs];

    const [seedRes] = await Promise.all([
      session.toolkits({
        toolkits: seedSlugs,
        limit: seedSlugs.length,
      }),
      enrichToolkitMetadata(seedSlugs),
    ]);

    const stateMap = new Map(seedRes.items.map((item) => [item.slug.toLowerCase(), item]));

    const pinnedItems: ConnectorAppItem[] = [];
    for (const slug of pinnedRecentSlugs) {
      const item = stateMap.get(slug);
      if (item) {
        pinnedItems.push(mapSessionToolkitItem(item, true));
      }
    }

    const items: ConnectorAppItem[] = [];
    for (const slug of usefulFillSlugs) {
      const item = stateMap.get(slug);
      if (item) {
        items.push(mapSessionToolkitItem(item, false));
      }
    }

    return {
      pinnedItems,
      items,
      cursor: CATALOG_START_CURSOR,
      totalPages: 50,
    };
  }

  // Subsequent pages of All Apps or Search / Connected
  const isCatalogStart = params.cursor === CATALOG_START_CURSOR;
  const page1ExcludedSlugs = new Set<string>([
    ...recentSlugs.slice(0, 6),
    ...MOST_USEFUL_TOOLKIT_ORDER.slice(0, limit),
  ]);

  const res = await session.toolkits({
    search: search || undefined,
    limit: isCatalogStart ? Math.min(limit + 14, 34) : limit,
    cursor: isCatalogStart ? undefined : params.cursor || undefined,
    isConnected: params.connectedOnly ? true : undefined,
  });

  const filteredRaw =
    !search && !params.connectedOnly
      ? res.items.filter((item) => !page1ExcludedSlugs.has(item.slug.toLowerCase()))
      : res.items;

  const slugs = filteredRaw.map((item) => item.slug);
  await enrichToolkitMetadata(slugs);

  const mapped = filteredRaw.map((item) => mapSessionToolkitItem(item, false));
  const shouldPinInList = Boolean(search || params.connectedOnly);
  const sorted = sortToolkitsByUtility(mapped, shouldPinInList ? recentSlugs : []);

  return {
    pinnedItems: [],
    items: sorted,
    cursor: res.cursor ?? null,
    totalPages: res.totalPages ?? 1,
  };
}

export async function initiateConnectorAuth(params: {
  userId: string;
  toolkitSlug: string;
  origin: string;
}): Promise<{
  toolkitSlug: string;
  connectionId: string | null;
  redirectUrl: string | null;
}> {
  const session = await getBrowseSession(params.userId, params.origin);
  const callbackUrl = `${params.origin}/api/composio/callback?toolkit=${encodeURIComponent(params.toolkitSlug)}&userId=${encodeURIComponent(params.userId)}`;

  const connectionRequest = await session.authorize(params.toolkitSlug, {
    callbackUrl,
  });

  // Invalidate cached browse session so subsequent toolkits() fetches reflect the new link
  browseSessionCache.delete(`${params.userId}::${params.origin}`);

  return {
    toolkitSlug: params.toolkitSlug,
    connectionId: connectionRequest.id ?? null,
    redirectUrl: connectionRequest.redirectUrl ?? null,
  };
}

export async function checkConnectorStatus(params: {
  userId: string;
  origin: string;
  toolkitSlug: string;
}): Promise<{
  isConnected: boolean;
  connectedAccountId: string | null;
  status: string | null;
}> {
  browseSessionCache.delete(`${params.userId}::${params.origin}`);
  const session = await getBrowseSession(params.userId, params.origin);
  const res = await session.toolkits({
    toolkits: [params.toolkitSlug],
    limit: 1,
  });
  const match = res.items.find(
    (item) => item.slug.toLowerCase() === params.toolkitSlug.toLowerCase(),
  );
  const isConnected = Boolean(match?.connection?.isActive);
  return {
    isConnected,
    connectedAccountId: match?.connection?.connectedAccount?.id ?? null,
    status: match?.connection?.connectedAccount?.status ?? null,
  };
}

export async function disconnectConnector(params: {
  userId: string;
  connectionId: string;
}): Promise<boolean> {
  const composio = getComposioClient();
  const userAccounts = await composio.connectedAccounts.list({
    userIds: [params.userId],
    limit: 100,
  });
  const owned = userAccounts.items?.some((acc) => acc.id === params.connectionId);
  if (!owned) {
    return false;
  }

  await composio.connectedAccounts.delete(params.connectionId);
  for (const key of browseSessionCache.keys()) {
    if (key.startsWith(`${params.userId}::`)) {
      browseSessionCache.delete(key);
    }
  }
  return true;
}

export interface AgentToolSession {
  tools: FunctionDeclaration[];
  executeToolCall: (fnCall: { name?: string; args?: Record<string, unknown> }) => Promise<string>;
}

export async function createAgentToolSession(params: {
  userId: string;
  enabledToolkits: string[];
  origin: string;
}): Promise<AgentToolSession | null> {
  if (!isComposioConfigured() || params.enabledToolkits.length === 0) {
    return null;
  }

  const composio = getComposioClient();
  const callbackUrl = `${params.origin}/api/composio/callback?userId=${encodeURIComponent(params.userId)}`;

  const session = await composio.sessions.create(params.userId, {
    toolkits: {
      enable: params.enabledToolkits,
    },
    manageConnections: {
      enable: true,
      callbackUrl,
    },
  });

  const wrappedTools = (await session.tools()) as unknown as FunctionDeclaration[];

  return {
    tools: wrappedTools,
    executeToolCall: async (fnCall) => {
      return composio.provider.executeToolCall(session, {
        name: fnCall.name ?? '',
        args: fnCall.args ?? {},
      });
    },
  };
}
