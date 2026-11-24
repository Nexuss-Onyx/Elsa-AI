import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  ExternalLink,
  Loader2,
  Puzzle,
  Search,
  Unlink,
  X,
} from 'lucide-react';

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

interface ConnectorsModalProps {
  isOpen: boolean;
  userId: string;
  enabledConnectors: string[];
  onToggleConnector: (slug: string, enable: boolean) => void;
  onClose: () => void;
}

export function ConnectorsModal({
  isOpen,
  userId,
  enabledConnectors,
  onToggleConnector,
  onClose,
}: ConnectorsModalProps) {
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'connected'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [categories, setCategories] = useState<ConnectorCategoryItem[]>([]);
  const [items, setItems] = useState<ConnectorAppItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [configured, setConfigured] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [connectingSlug, setConnectingSlug] = useState<string | null>(null);
  const [disconnectingSlug, setDisconnectingSlug] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [fallbackAuthUrl, setFallbackAuthUrl] = useState<{
    slug: string;
    url: string;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const popupWatchTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 240);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!isOpen) return;
    const focusTimer = setTimeout(() => {
      searchInputRef.current?.focus();
    }, 40);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    return () => {
      if (popupWatchTimerRef.current) {
        clearInterval(popupWatchTimerRef.current);
      }
    };
  }, []);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/composio/categories');
      if (!res.ok) return;
      const data = (await res.json()) as {
        configured?: boolean;
        categories?: ConnectorCategoryItem[];
      };
      if (Array.isArray(data.categories)) {
        setCategories(data.categories);
      }
    } catch {
      // Categories are optional
    }
  }, []);

  const fetchToolkits = useCallback(
    async (opts?: { nextCursor?: string | null; append?: boolean }) => {
      if (!isOpen) return;
      const append = Boolean(opts?.append);
      if (append) {
        setIsLoadingMore(true);
      } else {
        setIsLoading(true);
        setModalError(null);
      }

      try {
        const params = new URLSearchParams({
          userId,
          limit: '36',
          clientOrigin: window.location.origin,
        });
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (selectedCategory !== 'all' && !debouncedSearch) {
          params.set('category', selectedCategory);
        }
        if (activeTab === 'connected') {
          params.set('connectedOnly', 'true');
        }
        if (opts?.nextCursor) {
          params.set('cursor', opts.nextCursor);
        }

        const res = await fetch(`/api/composio/toolkits?${params.toString()}`);
        const data = (await res.json()) as {
          configured?: boolean;
          items?: ConnectorAppItem[];
          cursor?: string | null;
          error?: string;
        };

        if (data.configured === false) {
          setConfigured(false);
          setItems([]);
          setCursor(null);
          return;
        }

        setConfigured(true);
        if (data.error) {
          setModalError(data.error);
        }

        const fetchedItems = Array.isArray(data.items) ? data.items : [];
        if (append) {
          setItems((prev) => {
            const seen = new Set(prev.map((p) => p.slug));
            const merged = [...prev];
            for (const item of fetchedItems) {
              if (!seen.has(item.slug)) {
                merged.push(item);
              }
            }
            return merged;
          });
        } else {
          setItems(fetchedItems);
        }
        setCursor(data.cursor ?? null);
      } catch {
        setModalError('Failed to load connectors. Please try again.');
      } finally {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    },
    [isOpen, userId, debouncedSearch, selectedCategory, activeTab],
  );

  useEffect(() => {
    if (!isOpen) return;
    void fetchCategories();
  }, [isOpen, fetchCategories]);

  useEffect(() => {
    if (!isOpen) return;
    void fetchToolkits();
  }, [isOpen, fetchToolkits]);

  useEffect(() => {
    if (!isOpen) return;
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (
        origin !== window.location.origin &&
        !origin.endsWith('.run.app') &&
        !origin.includes('localhost')
      ) {
        return;
      }
      const data = event.data as
        | { type?: string; toolkit?: string; ok?: boolean; error?: string | null }
        | undefined;
      if (data?.type !== 'COMPOSIO_AUTH_COMPLETE') return;

      if (popupWatchTimerRef.current) {
        clearInterval(popupWatchTimerRef.current);
        popupWatchTimerRef.current = null;
      }
      setConnectingSlug(null);
      setFallbackAuthUrl(null);

      if (data.ok && data.toolkit) {
        onToggleConnector(data.toolkit.toLowerCase(), true);
      } else if (data.error) {
        setModalError(data.error);
      }
      void fetchToolkits();
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [isOpen, fetchToolkits, onToggleConnector]);

  const handleConnect = async (app: ConnectorAppItem) => {
    if (app.isNoAuth) {
      onToggleConnector(app.slug, !enabledConnectors.includes(app.slug));
      return;
    }

    setConnectingSlug(app.slug);
    setModalError(null);
    setFallbackAuthUrl(null);

    try {
      const res = await fetch('/api/composio/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          toolkitSlug: app.slug,
          clientOrigin: window.location.origin,
        }),
      });
      const data = (await res.json()) as {
        redirectUrl?: string | null;
        error?: string;
      };

      if (!res.ok || !data.redirectUrl) {
        throw new Error(data.error || `Could not start authorization for ${app.name}.`);
      }

      const popup = window.open(
        data.redirectUrl,
        'composio_oauth_popup',
        'width=620,height=720,noopener=no',
      );

      if (!popup) {
        setFallbackAuthUrl({ slug: app.slug, url: data.redirectUrl });
        setConnectingSlug(null);
        return;
      }

      if (popupWatchTimerRef.current) {
        clearInterval(popupWatchTimerRef.current);
      }
      let elapsedMs = 0;
      popupWatchTimerRef.current = setInterval(() => {
        elapsedMs += 700;
        if (popup.closed || elapsedMs >= 120_000) {
          if (popupWatchTimerRef.current) {
            clearInterval(popupWatchTimerRef.current);
            popupWatchTimerRef.current = null;
          }
          setConnectingSlug(null);
          void (async () => {
            await fetchToolkits();
            try {
              const checkRes = await fetch(
                `/api/composio/toolkits?userId=${encodeURIComponent(userId)}&connectedOnly=true&limit=100`,
              );
              if (checkRes.ok) {
                const checkData = (await checkRes.json()) as {
                  items?: ConnectorAppItem[];
                };
                const isNowConnected = checkData.items?.some(
                  (item) => item.slug === app.slug && item.isConnected,
                );
                if (isNowConnected) {
                  onToggleConnector(app.slug, true);
                }
              }
            } catch {
              // ignore background refresh error
            }
          })();
        }
      }, 700);
    } catch (err) {
      setConnectingSlug(null);
      setModalError(
        err instanceof Error ? err.message : 'Failed to connect app.',
      );
    }
  };

  const handleDisconnect = async (app: ConnectorAppItem) => {
    if (!app.connectedAccountId) return;
    setDisconnectingSlug(app.slug);
    setModalError(null);

    try {
      const res = await fetch(
        `/api/composio/connections/${encodeURIComponent(app.connectedAccountId)}?userId=${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      );
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to disconnect account.');
      }
      onToggleConnector(app.slug, false);
      await fetchToolkits();
    } catch (err) {
      setModalError(
        err instanceof Error ? err.message : 'Failed to disconnect account.',
      );
    } finally {
      setDisconnectingSlug(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Connectors"
    >
      <div
        className="fixed inset-0 bg-[#1C1B19]/30 backdrop-blur-[2px]"
        onClick={onClose}
      />

      <div className="relative z-10 flex max-h-[85dvh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#DCD9D0] bg-[#FAF9F5] shadow-[0_24px_64px_rgba(28,27,25,0.18)]">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[#E5E2D9] bg-[#F8F7F3] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#DCD9D0] bg-[#FFFFFF] text-[#1C1B19]">
              <Puzzle className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-[16px] font-bold tracking-[-0.01em] text-[#1C1B19]">
                Connectors
              </h2>
              <p className="text-xs text-[#5E5A52]">
                Connect 1,000+ prebuilt apps & tools for Elsa AI
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Connectors modal"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#5E5A52] transition-colors hover:bg-[#EAE7DF] hover:text-[#1C1B19] focus-visible:ring-2 focus-visible:ring-[#1C1B19] focus-visible:outline-none"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Search & Filters */}
        {configured && (
          <div className="flex flex-col gap-3 border-b border-[#E5E2D9] bg-[#FAF9F5] px-5 py-3.5 sm:px-6">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#747067]" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search 1,000+ apps (Gmail, GitHub, Slack, Notion...)"
                  className="h-9.5 w-full rounded-xl border border-[#DCD9D0] bg-[#FFFFFF] pr-3 pl-9 text-sm text-[#1C1B19] placeholder:text-[#878278] focus:border-[#1C1B19] focus:ring-2 focus:ring-[#1C1B19]/10 focus:outline-none"
                />
              </div>

              {categories.length > 0 && !debouncedSearch && (
                <select
                  aria-label="Filter by category"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="h-9.5 rounded-xl border border-[#DCD9D0] bg-[#FFFFFF] px-3 text-xs font-medium text-[#1C1B19] focus:border-[#1C1B19] focus:ring-2 focus:ring-[#1C1B19]/10 focus:outline-none sm:w-44"
                >
                  <option value="all">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-[#E2DFD6] bg-[#F3F1EC] p-0.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    activeTab === 'all'
                      ? 'bg-[#FFFFFF] text-[#1C1B19] shadow-xs'
                      : 'text-[#5E5A52] hover:text-[#1C1B19]'
                  }`}
                >
                  All Apps
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('connected')}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    activeTab === 'connected'
                      ? 'bg-[#FFFFFF] text-[#1C1B19] shadow-xs'
                      : 'text-[#5E5A52] hover:text-[#1C1B19]'
                  }`}
                >
                  Connected
                </button>
              </div>

              {enabledConnectors.length > 0 && (
                <span className="text-xs font-medium text-[#5E5A52]">
                  {enabledConnectors.length} enabled for chat
                </span>
              )}
            </div>
          </div>
        )}

        {/* Banners */}
        {modalError && (
          <div className="mx-5 mt-3 rounded-xl border border-[#DFB9B9] bg-[#F7ECEC] px-3.5 py-2.5 text-xs text-[#6E1F1F] sm:mx-6">
            {modalError}
          </div>
        )}

        {fallbackAuthUrl && (
          <div className="mx-5 mt-3 flex items-center justify-between gap-3 rounded-xl border border-[#DCD9D0] bg-[#FFFFFF] px-3.5 py-2.5 text-xs text-[#1C1B19] sm:mx-6">
            <span>Popup was blocked by your browser. Continue authorization in a new tab:</span>
            <a
              href={fallbackAuthUrl.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setFallbackAuthUrl(null)}
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#1C1B19] px-2.5 py-1.5 font-medium text-[#FAF9F5] hover:bg-[#33312D]"
            >
              <span>Authorize</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {!configured ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#D5D1C7] bg-[#FFFFFF] px-6 py-12 text-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F3F1EC] text-[#1C1B19]">
                <Puzzle className="h-5 w-5" />
              </div>
              <h3 className="mt-3.5 text-sm font-semibold text-[#1C1B19]">
                Composio Connectors Ready to Configure
              </h3>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-[#5E5A52]">
                Add <code className="rounded bg-[#F3F1EC] px-1.5 py-0.5 font-mono text-[#1C1B19]">COMPOSIO_API_KEY</code> in{' '}
                <strong className="font-semibold text-[#1C1B19]">Settings &gt; Secrets</strong>{' '}
                to unlock 1,000+ prebuilt app integrations (Gmail, Slack, GitHub, Notion, Google Calendar, and more).
              </p>
            </div>
          ) : isLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div
                  key={idx}
                  className="h-28 animate-pulse rounded-xl border border-[#E5E2D9] bg-[#F3F1EC]/70"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-[#E5E2D9] bg-[#FFFFFF] px-6 py-12 text-center">
              <p className="text-sm font-medium text-[#1C1B19]">
                {activeTab === 'connected'
                  ? 'No connected apps yet'
                  : 'No matching connectors found'}
              </p>
              <p className="mt-1 text-xs text-[#6B675E]">
                {activeTab === 'connected'
                  ? 'Switch to All Apps to search and connect from 1,000+ integrations.'
                  : 'Try a different search term or category.'}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {items.map((app) => {
                  const isEnabled = enabledConnectors.includes(app.slug);
                  const isBusy =
                    connectingSlug === app.slug || disconnectingSlug === app.slug;
                  const canToggle = app.isConnected || app.isNoAuth;

                  return (
                    <div
                      key={app.slug}
                      className="flex flex-col justify-between gap-3 rounded-xl border border-[#DFDCD2] bg-[#FFFFFF] p-3.5 transition-colors hover:border-[#C6C1B5]"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#EAE7DF] bg-[#F8F7F3]">
                          {app.logo ? (
                            <img
                              src={app.logo}
                              alt={`${app.name} logo`}
                              className="h-6 w-6 object-contain"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-sm font-bold text-[#1C1B19]">
                              {app.name.slice(0, 1).toUpperCase()}
                            </span>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <h3 className="truncate text-sm font-semibold text-[#1C1B19]">
                              {app.name}
                            </h3>
                            {app.isConnected && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#E7F3EA] px-1.5 py-0.5 text-[11px] font-medium text-[#1D5E33]">
                                <Check className="h-3 w-3" />
                                Connected
                              </span>
                            )}
                          </div>

                          <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[#5E5A52]">
                            {app.description ||
                              `${app.name} tools & actions for Elsa AI`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-2 border-t border-[#F0EDE5] pt-2.5">
                        <div className="flex items-center gap-2 text-[11px] text-[#747067]">
                          {typeof app.toolsCount === 'number' && app.toolsCount > 0 ? (
                            <span>{app.toolsCount} tools</span>
                          ) : app.isNoAuth ? (
                            <span>No auth required</span>
                          ) : (
                            <span>OAuth</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {app.isConnected && app.connectedAccountId && (
                            <button
                              type="button"
                              onClick={() => {
                                void handleDisconnect(app);
                              }}
                              disabled={isBusy}
                              title={`Disconnect ${app.name}`}
                              aria-label={`Disconnect ${app.name}`}
                              className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-[#6B675E] transition-colors hover:bg-[#F7ECEC] hover:text-[#9F2D2D] disabled:opacity-50"
                            >
                              {disconnectingSlug === app.slug ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Unlink className="h-3.5 w-3.5" />
                              )}
                            </button>
                          )}

                          {canToggle ? (
                            <button
                              type="button"
                              role="switch"
                              aria-checked={isEnabled}
                              aria-label={`Enable ${app.name} for Elsa AI`}
                              onClick={() => onToggleConnector(app.slug, !isEnabled)}
                              className={`relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:ring-2 focus-visible:ring-[#1C1B19] focus-visible:outline-none ${
                                isEnabled ? 'bg-[#1C1B19]' : 'bg-[#DCD9D0]'
                              }`}
                            >
                              <span
                                className={`inline-block h-4.5 w-4.5 transform rounded-full bg-[#FFFFFF] shadow-xs transition-transform ${
                                  isEnabled ? 'translate-x-4.5' : 'translate-x-0.5'
                                }`}
                              />
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => {
                                void handleConnect(app);
                              }}
                              className="inline-flex h-7.5 items-center gap-1.5 rounded-lg bg-[#1C1B19] px-3 text-xs font-medium text-[#FAF9F5] transition-colors hover:bg-[#33312D] focus-visible:ring-2 focus-visible:ring-[#1C1B19] focus-visible:outline-none disabled:opacity-60"
                            >
                              {connectingSlug === app.slug ? (
                                <>
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                  <span>Connecting...</span>
                                </>
                              ) : (
                                <span>Connect</span>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {cursor && (
                <div className="mt-4 flex justify-center">
                  <button
                    type="button"
                    disabled={isLoadingMore}
                    onClick={() => {
                      void fetchToolkits({ nextCursor: cursor, append: true });
                    }}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#DCD9D0] bg-[#FFFFFF] px-4 text-xs font-medium text-[#1C1B19] transition-colors hover:bg-[#EAE7DF] disabled:opacity-60"
                  >
                    {isLoadingMore && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>Load more apps</span>
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
