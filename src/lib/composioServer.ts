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
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage(payload, '*');
            setTimeout(function () { window.close(); }, 350);
          } else {
            window.location.replace('/');
          }
        } catch (e) {
          window.close();
        }
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
    const cached = toolkitMetaCache.get(slug);
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
  const items = (response.items ?? []).map((cat) => ({
    id: cat.id,
    name: cat.name,
  }));
  categoriesCache = { items, cachedAt: Date.now() };
  return items;
}

export async function listComposioToolkits(params: {
  userId: string;
  origin: string;
  search?: string;
  category?: string;
  connectedOnly?: boolean;
  cursor?: string;
  limit?: number;
}): Promise<{
  items: ConnectorAppItem[];
  cursor: string | null;
  totalPages: number;
}> {
  const session = await getBrowseSession(params.userId, params.origin);
  const composio = getComposioClient();
  const limit = Math.min(Math.max(params.limit ?? 36, 1), 100);
  const search = params.search?.trim() ?? '';
  const category = params.category?.trim() ?? '';

  if (category && category !== 'all' && !search) {
    const rawByCategory = await composio.toolkits.get({
      category,
      limit,
      cursor: params.cursor || undefined,
      sortBy: 'usage',
    });

    const now = Date.now();
    for (const tk of rawByCategory) {
      toolkitMetaCache.set(tk.slug.toLowerCase(), {
        description: tk.meta?.description ?? '',
        categories: Array.isArray(tk.meta?.categories) ? tk.meta.categories : [],
        toolsCount: typeof tk.meta?.toolsCount === 'number' ? tk.meta.toolsCount : null,
        logo: tk.meta?.logo ?? null,
        cachedAt: now,
      });
    }

    const slugs = rawByCategory.map((t) => t.slug).filter(Boolean);
    if (slugs.length === 0) {
      return { items: [], cursor: null, totalPages: 1 };
    }

    const stateRes = await session.toolkits({
      toolkits: slugs,
      limit: slugs.length,
      isConnected: params.connectedOnly ? true : undefined,
    });

    const stateMap = new Map(stateRes.items.map((item) => [item.slug.toLowerCase(), item]));
    const mapped: ConnectorAppItem[] = [];
    for (const tk of rawByCategory) {
      const state = stateMap.get(tk.slug.toLowerCase());
      const isConnected = Boolean(state?.connection?.isActive);
      if (params.connectedOnly && !isConnected) continue;
      mapped.push({
        slug: tk.slug,
        name: tk.name,
        logo: state?.logo ?? tk.meta?.logo ?? null,
        description: tk.meta?.description ?? '',
        categories: Array.isArray(tk.meta?.categories) ? tk.meta.categories : [],
        toolsCount: typeof tk.meta?.toolsCount === 'number' ? tk.meta.toolsCount : null,
        isNoAuth: Boolean(state?.isNoAuth),
        isConnected,
        connectedAccountId: state?.connection?.connectedAccount?.id ?? null,
        connectionStatus: state?.connection?.connectedAccount?.status ?? null,
      });
    }

    return {
      items: mapped,
      cursor: null,
      totalPages: 1,
    };
  }

  const res = await session.toolkits({
    search: search || undefined,
    limit,
    cursor: params.cursor || undefined,
    isConnected: params.connectedOnly ? true : undefined,
  });

  const slugs = res.items.map((item) => item.slug);
  await enrichToolkitMetadata(slugs);

  const items: ConnectorAppItem[] = res.items.map((item) => {
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
    };
  });

  return {
    items,
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
