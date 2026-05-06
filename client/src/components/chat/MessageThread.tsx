/**
 * MessageThread — render a chat's messages with auto-scroll on append.
 *
 * Receives the already-loaded messages array (oldest → newest, the order
 * that `api.chats.listMessages` returns). The parent owns the query so
 * the thread can be dropped in next to the composer without re-fetching.
 *
 * Self-vs-other styling pivots on `currentUserId`. We compare against
 * `authorUserId` rather than `authorName` so that a host whose displayName
 * collides with a guest can't masquerade visually.
 */
import { useEffect, useRef } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Id } from "../../../../convex/_generated/dataModel";

type Message = {
  _id: Id<"messages">;
  _creationTime: number;
  chatId: Id<"chats">;
  authorUserId?: Id<"users">;
  authorGuestId?: Id<"guests">;
  authorName: string;
  body: string;
  attachmentUrl?: string | null;
  editedAt?: number;
  deletedAt?: number;
};

type Props = {
  chatId: Id<"chats">;
  messages: Message[] | undefined;
  currentUserId: string | undefined;
};

function formatTimestamp(ms: number): string {
  const d = new Date(ms);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return `Yesterday ${format(d, "h:mm a")}`;
  return format(d, "MMM d, h:mm a");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function MessageThread({ chatId: _chatId, messages, currentUserId }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastIdRef = useRef<string | null>(null);

  // Smooth-scroll to bottom on a new last message; jump on first paint.
  useEffect(() => {
    if (!messages || messages.length === 0) {
      lastIdRef.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    if (!scrollRef.current) return;
    const node = scrollRef.current;
    const isFirstPaint = lastIdRef.current === null;
    if (lastIdRef.current !== last._id) {
      node.scrollTo({
        top: node.scrollHeight,
        behavior: isFirstPaint ? "auto" : "smooth",
      });
      lastIdRef.current = last._id;
    }
  }, [messages]);

  // Loading state.
  if (messages === undefined) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="inline-block h-2 w-2 rounded-full bg-[oklch(0.75_0.15_55)] animate-pulse"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // Empty state.
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[oklch(0.75_0.15_55/12%)] flex items-center justify-center">
          <MessageSquare className="w-6 h-6 text-[oklch(0.75_0.15_55)]" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">No messages yet</p>
          <p className="text-xs text-[oklch(0.55_0.02_265)] mt-1">
            Send the first one.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-3">
      {messages.map((m, i) => {
        const isSelf =
          Boolean(currentUserId) && m.authorUserId === currentUserId;
        const prev = i > 0 ? messages[i - 1] : null;
        const sameAuthorAsPrev =
          prev !== null &&
          prev.authorUserId === m.authorUserId &&
          prev.authorGuestId === m.authorGuestId &&
          m._creationTime - prev._creationTime < 5 * 60 * 1000;

        return (
          <div
            key={m._id}
            className={cn(
              "flex gap-3 items-end",
              isSelf ? "flex-row-reverse" : "flex-row",
            )}
          >
            {/* Avatar (or spacer when consecutive) */}
            {sameAuthorAsPrev ? (
              <span className="w-8 shrink-0" aria-hidden />
            ) : (
              <span
                className={cn(
                  "w-8 h-8 shrink-0 rounded-full border border-border/60 bg-[oklch(0.75_0.15_55/15%)] flex items-center justify-center text-[0.6875rem] font-semibold text-[oklch(0.75_0.15_55)]",
                )}
                aria-hidden
              >
                {initials(m.authorName)}
              </span>
            )}

            <div
              className={cn(
                "flex flex-col min-w-0 max-w-[78%]",
                isSelf ? "items-end" : "items-start",
              )}
            >
              {!sameAuthorAsPrev && (
                <div
                  className={cn(
                    "flex items-baseline gap-2 mb-1 px-1",
                    isSelf && "flex-row-reverse",
                  )}
                >
                  <span className="text-xs font-medium text-foreground/90">
                    {m.authorName}
                  </span>
                  <span className="text-[0.6875rem] text-[oklch(0.5_0.02_265)]">
                    {formatTimestamp(m._creationTime)}
                  </span>
                </div>
              )}

              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words",
                  isSelf
                    ? "bg-[oklch(0.75_0.15_55/15%)] border border-[oklch(0.75_0.15_55/25%)] text-foreground"
                    : "glass border border-border/40 text-foreground",
                )}
              >
                {m.deletedAt ? (
                  <span className="italic text-[oklch(0.5_0.02_265)]">
                    [message removed]
                  </span>
                ) : (
                  <>
                    {m.attachmentUrl && (
                      <a
                        href={m.attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mb-2"
                      >
                        <img
                          src={m.attachmentUrl}
                          alt="attachment"
                          className="max-w-full max-h-60 rounded-lg object-cover"
                        />
                      </a>
                    )}
                    {m.body && (
                      <span className="whitespace-pre-wrap">{m.body}</span>
                    )}
                    {m.editedAt && (
                      <span className="ml-2 text-[0.625rem] text-[oklch(0.5_0.02_265)]">
                        (edited)
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
