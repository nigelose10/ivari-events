/**
 * ChatList — left rail of the Chats page.
 *
 * Shows every chat for an event grouped by type (General / Admins / Custom).
 * Highlights the active chat, surfaces unread badges (membership.lastReadAt
 * vs message _creationTime), and exposes a "New chat" CTA for hosts.
 *
 * The chat type icon is purely decorative — chosen to feel domain-native
 * (Hash for general, Shield for admin, Sparkles for custom). No emoji.
 */
import { GlassCard } from "@/components/GlassCard";
import { cn } from "@/lib/utils";
import { Hash, Plus, Shield, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

export type ChatListItem = {
  _id: string;
  name: string;
  type: "general" | "admin" | "custom";
  archived?: boolean;
  memberCount?: number;
  lastMessage: {
    _id: string;
    body: string;
    authorName: string;
    _creationTime: number;
    deletedAt?: number;
  } | null;
  unread?: boolean;
};

type Props = {
  chats: ChatListItem[];
  activeChatId: string | null;
  onSelect: (chatId: string) => void;
  onCreate?: () => void; // hosts only
  isHost: boolean;
  emptyState?: ReactNode;
};

const TYPE_LABEL: Record<ChatListItem["type"], string> = {
  general: "General",
  admin: "Admins",
  custom: "Custom",
};

const TYPE_ICON: Record<ChatListItem["type"], typeof Hash> = {
  general: Hash,
  admin: Shield,
  custom: Sparkles,
};

function groupByType(chats: ChatListItem[]) {
  const groups: Record<ChatListItem["type"], ChatListItem[]> = {
    general: [],
    admin: [],
    custom: [],
  };
  for (const c of chats) {
    if (c.archived) continue;
    groups[c.type].push(c);
  }
  return groups;
}

export function ChatList({
  chats,
  activeChatId,
  onSelect,
  onCreate,
  isHost,
  emptyState,
}: Props) {
  const groups = groupByType(chats);
  const isEmpty = chats.filter((c) => !c.archived).length === 0;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-5 pt-6 pb-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Chats</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isHost
              ? "Group conversations for this event"
              : "Conversations you're part of"}
          </p>
        </div>
        {isHost && onCreate ? (
          <button
            onClick={onCreate}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/40 backdrop-blur transition-colors hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : null}
      </header>

      <div className="flex-1 overflow-y-auto px-3 pb-6">
        {isEmpty ? (
          <div className="px-2 pt-6">
            {emptyState ?? (
              <GlassCard variant="subtle" specular={false} className="p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {isHost
                    ? "No chats yet. Start a general or admin chat to keep your guests aligned."
                    : "Your host hasn't started a group chat yet."}
                </p>
              </GlassCard>
            )}
          </div>
        ) : (
          (Object.keys(groups) as ChatListItem["type"][]).map((type) => {
            const items = groups[type];
            if (items.length === 0) return null;
            return (
              <section key={type} className="mb-3">
                <div className="px-2 pt-3 pb-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground/80">
                  {TYPE_LABEL[type]}
                </div>
                <ul className="space-y-1">
                  {items.map((chat) => (
                    <li key={chat._id}>
                      <ChatRow
                        chat={chat}
                        active={chat._id === activeChatId}
                        onClick={() => onSelect(chat._id)}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

function ChatRow({
  chat,
  active,
  onClick,
}: {
  chat: ChatListItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = TYPE_ICON[chat.type];
  const preview = formatPreview(chat.lastMessage);
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
        "hover:bg-accent/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-accent/50",
      )}
    >
      <span
        className={cn(
          "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-background/30",
          active && "border-primary/40 bg-primary/10",
        )}
      >
        <Icon className="h-4 w-4 text-foreground/80" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{chat.name}</span>
          {chat.unread ? (
            <span
              className="ml-auto inline-block h-2 w-2 rounded-full bg-primary"
              aria-label="Unread messages"
            />
          ) : null}
        </span>
        <span className="truncate text-xs text-muted-foreground mt-0.5">
          {preview}
        </span>
      </span>
    </button>
  );
}

function formatPreview(last: ChatListItem["lastMessage"]) {
  if (!last) return "No messages yet";
  if (last.deletedAt) return `${last.authorName}: [message removed]`;
  const body = last.body.replace(/\s+/g, " ").trim();
  if (!body) return `${last.authorName}: [attachment]`;
  const truncated = body.length > 60 ? `${body.slice(0, 60)}…` : body;
  return `${last.authorName}: ${truncated}`;
}
