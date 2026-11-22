import { useEffect, useRef } from 'react';
import { ArrowUp, Square } from 'lucide-react';

interface ChatComposerProps {
  value: string;
  isStreaming: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
}

export function ChatComposer({
  value,
  isStreaming,
  onChange,
  onSubmit,
  onStop,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && value.trim()) {
        onSubmit();
      }
    }
  };

  const canSend = value.trim().length > 0 && !isStreaming;

  return (
    <div className="bg-[#F3F1EC] px-4 pt-2 pb-4 sm:px-6 sm:pb-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isStreaming) {
            onStop();
          } else if (canSend) {
            onSubmit();
          }
        }}
        className="mx-auto max-w-3xl"
      >
        <div className="flex items-end gap-2.5 rounded-2xl border border-[#C6C1B5] bg-[#FFFFFF] p-2.5 shadow-[0_8px_24px_rgba(28,27,25,0.08),0_1px_3px_rgba(28,27,25,0.06)] transition-all focus-within:border-[#1C1B19] focus-within:ring-2 focus-within:ring-[#1C1B19]/12">
          <label htmlFor="chat-input" className="sr-only">
            መልእክትዎን በአማርኛ ይጻፉ
          </label>
          <textarea
            ref={textareaRef}
            id="chat-input"
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ለኤልሳ AI በአማርኛ ይጻፉ..."
            className="max-h-40 min-h-[42px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] leading-normal text-[#1C1B19] placeholder:text-[#747067] focus:outline-none"
          />

          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              aria-label="Stop response"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1C1B19] text-[#FFFFFF] shadow-sm transition-colors hover:bg-[#33312D] focus-visible:ring-2 focus-visible:ring-[#1C1B19] focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send message"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#1C1B19] text-[#FFFFFF] shadow-sm transition-colors hover:bg-[#33312D] focus-visible:ring-2 focus-visible:ring-[#1C1B19] focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-[#E5E2D9] disabled:text-[#9A958B] disabled:shadow-none"
            >
              <ArrowUp className="h-4.5 w-4.5" />
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
