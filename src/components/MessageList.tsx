import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  Check,
  Copy,
  RefreshCw,
} from 'lucide-react';
import type { ChatMessage } from '../lib/promptBuilder';
import { MarkdownLite } from '../utils/markdownLite';
import { ElsaMark } from './ElsaMark';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  errorMessage: string | null;
  onRegenerate: () => void;
  onRetryError: () => void;
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function MessageList({
  messages,
  isStreaming,
  errorMessage,
  onRegenerate,
  onRetryError,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, messages[messages.length - 1]?.text, errorMessage]);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distanceFromBottom > 140);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => {
        setCopiedId((prev) => (prev === id ? null : prev));
      }, 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-start overflow-y-auto px-4 pt-8 pb-12 sm:px-6 sm:pt-14">
        <div className="flex w-full max-w-2xl flex-col items-center text-center">
          <ElsaMark size="lg" />
          <h1 className="mt-4 text-2xl font-bold tracking-[-0.02em] text-[#1C1B19] sm:text-3xl">
            ኤልሳ AI
          </h1>

          <div className="mt-6 max-w-xl">
            <h2 className="text-lg font-semibold text-[#1C1B19] sm:text-xl">
              እንኳን በደህና መጡ
            </h2>
            <p className="mt-2 text-[15px] leading-[1.7] text-[#4A4740]">
              ኤልሳ AI በአማርኛ የሚያግዝዎት ብልህ ረዳት ናት። በጽሑፍ ዝግጅት፣ በትርጉም፣
              በዕውቀት ማብራሪያ እና በዕለት ተዕለት የሥራ ወይም የጥናት ጉዳዮች ፈጣንና ግልጽ
              እገዛ ታደርግልዎታለች።
            </p>
          </div>

          <div className="mt-8 grid w-full grid-cols-1 gap-x-8 gap-y-5 border-t border-[#DFDCD2] pt-6 text-left sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-[#1C1B19]">
                የጽሑፍ ዝግጅትና አርትዖት
              </h3>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#5E5A52]">
                ኢሜይሎችን፣ ደብዳቤዎችን፣ ማመልከቻዎችን እና ንግግሮችን በተስተካከለ አማርኛ ማዘጋጀት።
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#1C1B19]">
                ትርጉምና ማጠቃለያ
              </h3>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#5E5A52]">
                ረጃጅም ጽሑፎችን በአጭሩ ማጠቃለልና ሀሳቦችን ወደ አማርኛ ወይም ሌሎች ቋንቋዎች መተርጎም።
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#1C1B19]">
                ጥያቄና መልስ
              </h3>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#5E5A52]">
                በታሪክ፣ በሳይንስ፣ በቴክኖሎጂ እና በትምህርት ጉዳዮች ዙሪያ ግልጽ ማብራሪያ መስጠት።
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#1C1B19]">
                ሀሳብ ማፍለቅና እቅድ
              </h3>
              <p className="mt-1 text-[13px] leading-[1.6] text-[#5E5A52]">
                ለፕሮጀክቶች፣ ለንግድ ሥራ እና ለዕለት ተዕለት ተግባራት የተደራጀ እቅድና ሀሳብ ማቅረብ።
              </p>
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="mt-6 flex w-full max-w-md items-start gap-3 rounded-2xl border border-[#DFB9B9] bg-[#F7ECEC] p-4 text-left text-sm text-[#6E1F1F]"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D2D]" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
        data-testid="message-list"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-5">
          {messages.map((msg, idx) => {
            const isUser = msg.role === 'user';
            const isLastModel = !isUser && idx === messages.length - 1;

            if (isUser) {
              return (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl border border-[#DFDCD2] bg-[#FAF9F5] px-4 py-3 text-[15px] leading-[1.72] text-[#1C1B19] sm:max-w-[78%]">
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    <div className="mt-1.5 flex items-center justify-end gap-1.5 text-[11px] text-[#6B675E]">
                      <span>እርስዎ</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {formatTime(msg.createdAt)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            }

            const isWaitingFirstChunk = isStreaming && isLastModel && !msg.text;

            return (
              <div key={msg.id} className="group/msg flex items-start gap-3">
                <div className="mt-0.5">
                  <ElsaMark size="sm" />
                </div>
                <div className="max-w-[85%] rounded-2xl border border-[#D8D4C9] bg-[#EAE8E1] px-5 py-4 shadow-[0_1px_2px_rgba(28,27,25,0.03)] sm:max-w-[78%]">
                  {isWaitingFirstChunk ? (
                    <div
                      aria-label="Loading response"
                      className="flex items-center gap-1.5 py-2"
                    >
                      <span className="elsa-dot-1 h-2 w-2 rounded-full bg-[#1C1B19]" />
                      <span className="elsa-dot-2 h-2 w-2 rounded-full bg-[#1C1B19]" />
                      <span className="elsa-dot-3 h-2 w-2 rounded-full bg-[#1C1B19]" />
                    </div>
                  ) : (
                    <MarkdownLite content={msg.text} />
                  )}

                  <div className="mt-3.5 flex flex-col border-t border-transparent pt-0 text-[11px] text-[#5E5A52] transition-all duration-200 group-hover/msg:border-[#DCD8CD]">
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 opacity-0 max-h-0 overflow-hidden transition-all duration-200 ease-out group-hover/msg:opacity-100 group-hover/msg:max-h-24">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-[#1C1B19]">ኤልሳ AI</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatTime(msg.createdAt)}
                        </span>
                      </div>

                      {msg.text && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleCopy(msg.id, msg.text)}
                            aria-label="Copy response"
                            className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-[#4A4740] transition-colors hover:bg-[#DFDCD3] hover:text-[#1C1B19] focus-visible:ring-2 focus-visible:ring-[#1C1B19] focus-visible:outline-none whitespace-nowrap"
                          >
                            {copiedId === msg.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-[#1C1B19]" />
                                <span className="text-[#1C1B19]">ተቀድቷል</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>ቅዳ</span>
                              </>
                            )}
                          </button>

                          {isLastModel && !isStreaming && (
                            <button
                              type="button"
                              onClick={onRegenerate}
                              aria-label="Regenerate response"
                              className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-[#4A4740] transition-colors hover:bg-[#DFDCD3] hover:text-[#1C1B19] focus-visible:ring-2 focus-visible:ring-[#1C1B19] focus-visible:outline-none whitespace-nowrap"
                            >
                              <RefreshCw className="h-3.5 w-3.5" />
                              <span>እንደገና</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start justify-between gap-3 rounded-2xl border border-[#DFB9B9] bg-[#F7ECEC] p-4 text-sm text-[#6E1F1F]"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#9F2D2D]" />
                <span>{errorMessage}</span>
              </div>
              <button
                type="button"
                onClick={onRetryError}
                className="h-8 shrink-0 rounded-lg border border-[#D4A7A7] bg-[#FAF9F5] px-3 text-xs font-medium text-[#6E1F1F] transition-colors hover:bg-[#F1DFDF] focus-visible:ring-2 focus-visible:ring-[#9F2D2D] focus-visible:outline-none whitespace-nowrap"
              >
                እንደገና ሞክር
              </button>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {showScrollBottom && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Scroll to latest message"
          className="absolute right-6 bottom-4 flex h-9 w-9 items-center justify-center rounded-full border border-[#D8D4CA] bg-[#FFFFFF] text-[#1C1B19] shadow-sm transition-colors hover:bg-[#EAE8E1] focus-visible:ring-2 focus-visible:ring-[#1C1B19] focus-visible:outline-none"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
