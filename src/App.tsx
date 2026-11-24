import { useCallback, useEffect, useRef, useState } from 'react';
import { Menu, Plus } from 'lucide-react';
import { ChatComposer } from './components/ChatComposer';
import { ConnectorsModal } from './components/ConnectorsModal';
import { MessageList } from './components/MessageList';
import { Sidebar } from './components/Sidebar';
import {
  formatConversationTitle,
  shouldTriggerBackgroundRename,
  type ChatMessage,
} from './lib/promptBuilder';
import {
  createId,
  getOrCreateElsaUserId,
  loadConversations,
  loadEnabledConnectors,
  saveConversations,
  saveEnabledConnectors,
  type Conversation,
} from './utils/storage';

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversations(),
  );

  const [activeId, setActiveId] = useState<string | null>(() => conversations[0]?.id ?? null);
  const [recentlyRenamedId, setRecentlyRenamedId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [activeToolStatus, setActiveToolStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isConnectorsOpen, setIsConnectorsOpen] = useState(false);
  const [userId] = useState<string>(() => getOrCreateElsaUserId());
  const [enabledConnectors, setEnabledConnectors] = useState<string[]>(() =>
    loadEnabledConnectors(),
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const renameAttemptedRef = useRef<Set<string>>(new Set());
  const renameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeConversation = activeId
    ? (conversations.find((c) => c.id === activeId) ?? null)
    : null;
  const activeMessages = activeConversation?.messages ?? [];

  useEffect(() => {
    saveConversations(conversations);
  }, [conversations]);

  useEffect(() => {
    saveEnabledConnectors(enabledConnectors);
  }, [enabledConnectors]);

  const handleToggleConnector = useCallback((slug: string, enable: boolean) => {
    const clean = slug.trim().toLowerCase();
    if (!clean) return;
    setEnabledConnectors((prev) => {
      if (enable) {
        return prev.includes(clean) ? prev : [...prev, clean];
      }
      return prev.filter((item) => item !== clean);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (renameTimerRef.current) {
        clearTimeout(renameTimerRef.current);
      }
    };
  }, []);

  const handleNewChat = () => {
    if (isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    setErrorMessage(null);
    setActiveId(null);
    setInput('');
  };

  const handleSelectConversation = (id: string) => {
    if (isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    setErrorMessage(null);
    setActiveId(id);
  };

  const handleDeleteConversation = (id: string) => {
    if (id === activeConversation?.id && isStreaming) {
      abortControllerRef.current?.abort();
      setIsStreaming(false);
    }
    setConversations((prev) => {
      const remaining = prev.filter((c) => c.id !== id);
      if (id === activeId) {
        setActiveId(remaining[0]?.id ?? null);
      }
      return remaining;
    });
  };

  const streamReply = async (
    targetConvId: string,
    historyForRequest: ChatMessage[],
  ) => {
    const assistantMsgId = createId('msg');
    const placeholderAssistant: ChatMessage = {
      id: assistantMsgId,
      role: 'model',
      text: '',
      createdAt: Date.now(),
    };

    setConversations((prev) =>
      prev.map((conv) =>
        conv.id === targetConvId
          ? {
              ...conv,
              messages: [...historyForRequest, placeholderAssistant],
              updatedAt: Date.now(),
            }
          : conv,
      ),
    );

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsStreaming(true);
    setActiveToolStatus(null);
    setErrorMessage(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          userId,
          enabledToolkits: enabledConnectors,
          clientOrigin: window.location.origin,
          messages: historyForRequest.map((m) => ({
            role: m.role,
            text: m.text,
          })),
        }),
      });

      if (!response.ok) {
        let serverError = 'ምላሽ ማግኘት አልተቻለም። እባክዎ እንደገና ይሞክሩ።';
        try {
          const errJson = (await response.json()) as { error?: string };
          if (errJson?.error) serverError = errJson.error;
        } catch {
          // keep fallback
        }
        throw new Error(serverError);
      }

      if (!response.body) {
        throw new Error('ምላሽ ማግኘት አልተቻለም። እባክዎ እንደገና ይሞክሩ።');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const part of parts) {
          const line = part
            .split('\n')
            .find((l) => l.startsWith('data: '));
          if (!line) continue;

          const jsonText = line.slice(6).trim();
          if (!jsonText) continue;

          const event = JSON.parse(jsonText) as {
            type: 'chunk' | 'tool_status' | 'done' | 'error';
            text?: string;
            message?: string;
            tools?: string[];
          };

          if (event.type === 'tool_status') {
            setActiveToolStatus('ከተገናኙ መተግበሪያዎች ጋር በመሥራት ላይ...');
          } else if (event.type === 'chunk' && typeof event.text === 'string') {
            setActiveToolStatus(null);
            accumulatedText += event.text;
            setConversations((prev) =>
              prev.map((conv) => {
                if (conv.id !== targetConvId) return conv;
                return {
                  ...conv,
                  messages: conv.messages.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, text: m.text + event.text }
                      : m,
                  ),
                  updatedAt: Date.now(),
                };
              }),
            );
          } else if (event.type === 'error') {
            throw new Error(
              event.message || 'ኤልሳ AI ምላሽ መስጠት አልቻለችም። እባክዎ እንደገና ይሞክሩ።',
            );
          }
        }
      }

      if (!accumulatedText.trim()) {
        throw new Error('ምላሽ አልተገኘም። እባክዎ እንደገና ይሞክሩ።');
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message =
        err instanceof Error
          ? err.message
          : 'ያልተጠበቀ ስህተት ተፈጥሯል። እባክዎ እንደገና ይሞክሩ።';
      setErrorMessage(message);

      setConversations((prev) =>
        prev.map((conv) => {
          if (conv.id !== targetConvId) return conv;
          return {
            ...conv,
            messages: conv.messages.filter(
              (m) => !(m.id === assistantMsgId && m.text.trim() === ''),
            ),
          };
        }),
      );
    } finally {
      setIsStreaming(false);
      setActiveToolStatus(null);
      abortControllerRef.current = null;
    }
  };

  const renameSessionInBackground = async (
    targetConvId: string,
    historySnapshot: ChatMessage[],
  ) => {
    try {
      const response = await fetch('/api/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: historySnapshot.map((m) => ({
            role: m.role,
            text: m.text,
          })),
        }),
      });
      if (!response.ok) return;
      const data = (await response.json()) as { title?: string | null };
      const generatedTitle = typeof data?.title === 'string' ? data.title.trim() : '';
      if (!generatedTitle) return;

      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === targetConvId
            ? {
                ...conv,
                title: generatedTitle,
                isRenamedByAi: true,
              }
            : conv,
        ),
      );

      setRecentlyRenamedId(targetConvId);
      if (renameTimerRef.current) {
        clearTimeout(renameTimerRef.current);
      }
      renameTimerRef.current = setTimeout(() => {
        setRecentlyRenamedId((prev) => (prev === targetConvId ? null : prev));
      }, 2200);
    } catch {
      // Background rename failure must never interrupt chat
    }
  };

  const sendMessageText = async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isStreaming) return;

    const userMsg: ChatMessage = {
      id: createId('msg'),
      role: 'user',
      text: trimmed,
      createdAt: Date.now(),
    };

    const existingConv = activeConversation;
    const targetConvId = existingConv ? existingConv.id : createId('conv');
    const nextHistory = existingConv ? [...existingConv.messages, userMsg] : [userMsg];

    if (!existingConv) {
      const createdConv: Conversation = {
        id: targetConvId,
        title: formatConversationTitle(trimmed),
        messages: nextHistory,
        updatedAt: Date.now(),
        isRenamedByAi: false,
      };
      setConversations((prev) => [createdConv, ...prev]);
      setActiveId(targetConvId);
    } else {
      const nextTitle =
        existingConv.messages.length === 0
          ? formatConversationTitle(trimmed)
          : existingConv.title;
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === targetConvId
            ? {
                ...conv,
                title: nextTitle,
                messages: nextHistory,
                updatedAt: Date.now(),
              }
            : conv,
        ),
      );
    }

    setInput('');

    const shouldRenameNow =
      shouldTriggerBackgroundRename(nextHistory, Boolean(existingConv?.isRenamedByAi)) &&
      !renameAttemptedRef.current.has(targetConvId);

    if (shouldRenameNow) {
      renameAttemptedRef.current.add(targetConvId);
      // Fire AI-2 background session naming simultaneously with AI-1 chat response
      void renameSessionInBackground(targetConvId, nextHistory);
    }

    await streamReply(targetConvId, nextHistory);
  };

  const handleRegenerate = async () => {
    if (isStreaming || !activeConversation || activeConversation.messages.length === 0) {
      return;
    }
    const msgs = [...activeConversation.messages];
    if (msgs[msgs.length - 1]?.role === 'model') {
      msgs.pop();
    }
    if (msgs.length === 0 || msgs[msgs.length - 1]?.role !== 'user') return;
    await streamReply(activeConversation.id, msgs);
  };

  const handleRetryError = async () => {
    if (isStreaming || !activeConversation) return;
    const msgs = activeConversation.messages;
    if (msgs.length === 0) return;
    const cleaned =
      msgs[msgs.length - 1]?.role === 'model' && !msgs[msgs.length - 1].text
        ? msgs.slice(0, -1)
        : msgs;
    if (cleaned.length === 0 || cleaned[cleaned.length - 1]?.role !== 'user') return;
    await streamReply(activeConversation.id, cleaned);
  };

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#F3F1EC] text-[#1C1B19]">
      <Sidebar
        conversations={conversations}
        activeId={activeConversation?.id ?? null}
        recentlyRenamedId={recentlyRenamedId}
        isOpenMobile={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onDeleteConversation={handleDeleteConversation}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-[#E2DFD6] bg-[#F8F7F3] px-4 py-3 sm:px-6">
          <div className="flex items-center">
            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(true)}
              aria-label="Open conversation sidebar"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#DCD9D0] bg-[#FAF9F5] text-[#4A4740] hover:bg-[#EAE7DF] hover:text-[#1C1B19] lg:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
          </div>

          <span className="text-center text-[15px] font-bold tracking-[-0.01em] text-[#1C1B19] whitespace-nowrap shrink-0">
            ኤልሳ AI
          </span>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={handleNewChat}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1B19] px-3.5 text-xs font-medium text-[#FAF9F5] shadow-[0_1px_2px_rgba(28,27,25,0.16)] transition-colors hover:bg-[#33312D] focus-visible:ring-2 focus-visible:ring-[#1C1B19] focus-visible:outline-none whitespace-nowrap shrink-0 lg:hidden"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>አዲስ ውይይት</span>
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col bg-[#F3F1EC]">
          <MessageList
            messages={activeMessages}
            isStreaming={isStreaming}
            activeToolStatus={activeToolStatus}
            errorMessage={errorMessage}
            onRegenerate={() => {
              void handleRegenerate();
            }}
            onRetryError={() => {
              void handleRetryError();
            }}
          />

          <ChatComposer
            value={input}
            isStreaming={isStreaming}
            enabledConnectorsCount={enabledConnectors.length}
            onChange={setInput}
            onSubmit={() => {
              void sendMessageText(input);
            }}
            onStop={() => {
              abortControllerRef.current?.abort();
              setIsStreaming(false);
            }}
            onOpenConnectors={() => setIsConnectorsOpen(true)}
          />
        </main>
      </div>

      <ConnectorsModal
        isOpen={isConnectorsOpen}
        userId={userId}
        enabledConnectors={enabledConnectors}
        onToggleConnector={handleToggleConnector}
        onClose={() => setIsConnectorsOpen(false)}
      />
    </div>
  );
}
