import { MessageSquare, Plus, Trash2, X } from 'lucide-react';
import { ElsaMark } from './ElsaMark';
import type { Conversation } from '../utils/storage';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  recentlyRenamedId?: string | null;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onDeleteConversation: (id: string) => void;
}

function formatShortTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function Sidebar({
  conversations,
  activeId,
  recentlyRenamedId = null,
  isOpenMobile,
  onCloseMobile,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
}: SidebarProps) {
  const savedConversations = conversations.filter((conv) => conv.messages.length > 0);

  const sidebarContent = (
    <div className="flex h-full w-72 flex-col border-r border-[#E2DFD6] bg-[#F8F7F3]">
      <div className="flex items-center justify-between border-b border-[#EAE7DF] px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <ElsaMark size="sm" />
          <span className="text-[15px] font-bold tracking-[-0.01em] text-[#1C1B19] whitespace-nowrap">
            ኤልሳ AI
          </span>
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation drawer"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-[#5E5A52] hover:bg-[#EAE7DF] hover:text-[#1C1B19] lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-3">
        <button
          type="button"
          onClick={() => {
            onNewChat();
            onCloseMobile();
          }}
          className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-[#1C1B19] px-4 text-sm font-medium text-[#FAF9F5] shadow-[0_1px_2px_rgba(28,27,25,0.16)] transition-colors hover:bg-[#33312D] focus-visible:ring-2 focus-visible:ring-[#1C1B19] focus-visible:ring-offset-2 focus-visible:ring-offset-[#F8F7F3] focus-visible:outline-none whitespace-nowrap"
        >
          <Plus className="h-4 w-4 shrink-0" />
          <span>አዲስ ውይይት</span>
        </button>
      </div>

      <div className="px-4 pt-1 pb-2 text-xs font-medium text-[#6B675E]">
        የቀድሞ ውይይቶች
      </div>

      <nav
        aria-label="Conversation history"
        className="flex-1 overflow-y-auto px-2.5 pb-4"
      >
        {savedConversations.length === 0 ? (
          <p className="px-2 py-4 text-xs text-[#7D796F]">
            እስካሁን የተቀመጠ ውይይት የለም።
          </p>
        ) : (
          <ul className="space-y-1">
            {savedConversations.map((conv) => {
              const isActive = conv.id === activeId;
              const isRecentlyRenamed = conv.id === recentlyRenamedId;
              const msgCount = conv.messages.length;
              return (
                <li
                  key={conv.id}
                  data-renamed={isRecentlyRenamed ? 'true' : undefined}
                  className={`group flex items-center gap-1 rounded-xl transition-colors ${
                    isActive
                      ? 'bg-[#EAE7DF] text-[#1C1B19]'
                      : 'text-[#3F3D37] hover:bg-[#EFECE5]'
                  } ${isRecentlyRenamed ? 'elsa-rename-row' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectConversation(conv.id);
                      onCloseMobile();
                    }}
                    className="flex min-w-0 flex-1 items-start gap-2.5 rounded-xl px-2.5 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-[#1C1B19] focus-visible:outline-none"
                  >
                    <MessageSquare
                      aria-hidden="true"
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        isActive ? 'text-[#1C1B19]' : 'text-[#878278]'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div
                        key={`${conv.id}-${conv.title}`}
                        className={`truncate text-[13px] font-medium ${
                          isRecentlyRenamed ? 'elsa-rename-text' : ''
                        }`}
                      >
                        {conv.title}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-[#6B675E] font-mono tabular-nums">
                        <span>{msgCount} መልእክቶች</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatShortTime(conv.updatedAt)}</span>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeleteConversation(conv.id)}
                    aria-label={`Delete conversation ${conv.title}`}
                    className="mr-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#878278] opacity-75 transition-colors hover:bg-[#DFDBD1] hover:text-[#9F2D2D] group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-[#1C1B19] focus-visible:outline-none"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </nav>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:block lg:shrink-0">{sidebarContent}</aside>

      {isOpenMobile && (
        <div
          className="fixed inset-0 z-40 flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Conversation sidebar"
        >
          <div
            className="fixed inset-0 bg-[#1C1B19]/25 backdrop-blur-[1px]"
            onClick={onCloseMobile}
          />
          <div className="relative z-10 h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
