/**
 * Chats — host-facing group-chat console for an event (URL `/chats/:slug`).
 *
 * Layout:
 *   ┌──────────────┬────────────────────────────────────┐
 *   │ ChatList     │ MessageThread                      │
 *   │ (320px on    │ ─────────────────────────────────  │
 *   │  desktop;    │ Composer                           │
 *   │  full sheet  │                                    │
 *   │  on mobile)  │                                    │
 *   └──────────────┴────────────────────────────────────┘
 *
 * Convex wiring:
 *   - api.events.getBySlug   → resolve slug → event
 *   - api.chats.listForEvent → sidebar items (host-side, includes lastMessage)
 *   - api.chats.listMessages → active thread (oldest → newest)
 *   - api.chats.markRead     → on chat select & on new last message
 *
 * Auth: hosts only for now. The Convex queries themselves enforce host-owns-event,
 * so we just redirect anonymous users to Stack's sign-in.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "convex/react";
import { ArrowLeft, MessageSquare, Plus } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { AmbientBackground } from "@/components/AmbientBackground";
import { ChatList, type ChatListItem } from "@/components/chat/ChatList";
import { MessageThread } from "@/components/chat/MessageThread";
import { Composer } from "@/components/chat/Composer";
import { CreateChatSheet } from "@/components/chat/CreateChatSheet";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

const t = { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const };

export default function Chats() {
  const { user } = useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const event = useQuery(api.events.getBySlug, slug ? { slug } : "skip");
  const eventId = event?._id;

  const chatRows = useQuery(
    api.chats.listForEvent,
    eventId ? { eventId } : "skip",
  );

  const [activeChatId, setActiveChatId] = useState<Id<"chats"> | null>(null);
  const [creatingChat, setCreatingChat] = useState(false);
  // Mobile reveals the thread pane when a row is selected.
  const [mobileShowThread, setMobileShowThread] = useState(false);

  const messages = useQuery(
    api.chats.listMessages,
    activeChatId ? { chatId: activeChatId, limit: 100 } : "skip",
  );

  const markRead = useMutation(api.chats.markRead);

  // Default-select the first non-archived chat once the list resolves.
  useEffect(() => {
    if (!chatRows || chatRows.length === 0) return;
    if (activeChatId) return;
    const firstAlive = chatRows.find((c) => !c.archived);
    if (firstAlive) setActiveChatId(firstAlive._id);
  }, [chatRows, activeChatId]);

  // Mark-read whenever the active chat changes or new messages arrive.
  useEffect(() => {
    if (!activeChatId || !messages || messages.length === 0) return;
    void markRead({ chatId: activeChatId }).catch(() => {
      // markRead is best-effort; a failure here shouldn't surface to the user.
    });
  }, [activeChatId, messages, markRead]);

  // Adapt the host-side chat rows to the ChatList contract (computes unread).
  const chatItems: ChatListItem[] = useMemo(() => {
    if (!chatRows) return [];
    return chatRows.map((c) => ({
      _id: c._id,
      name: c.name,
      type: c.type,
      archived: c.archived,
      memberCount: c.memberCount,
      lastMessage: c.lastMessage
        ? {
            _id: c.lastMessage._id,
            body: c.lastMessage.body,
            authorName: c.lastMessage.authorName,
            _creationTime: c.lastMessage._creationTime,
            deletedAt: c.lastMessage.deletedAt,
          }
        : null,
      // No per-membership unread on the host-side query yet — surface "unread"
      // when there's a last message and it isn't the active chat. Coarse but
      // honest until lastReadAt lands in listForEvent.
      unread: Boolean(
        c.lastMessage && !c.archived && c._id !== activeChatId,
      ),
    }));
  }, [chatRows, activeChatId]);

  const activeChat = useMemo(
    () => chatItems.find((c) => c._id === activeChatId) ?? null,
    [chatItems, activeChatId],
  );

  // ── Loading / error states ─────────────────────────────────────────────
  if (event === undefined) {
    return (
      <div className="min-h-screen relative">
        <AmbientBackground />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <GlassCard className="p-10 text-center max-w-sm">
            <p className="text-sm text-[oklch(0.55_0.02_265)]">Loading event…</p>
          </GlassCard>
        </div>
      </div>
    );
  }

  // event === null shouldn't happen (getBySlug throws), but guard regardless.
  if (!event) {
    return (
      <div className="min-h-screen relative">
        <AmbientBackground />
        <div className="relative z-10 flex items-center justify-center min-h-screen">
          <GlassCard className="p-10 text-center max-w-sm">
            <h2 className="text-lg font-semibold mb-2">Event not found</h2>
            <p className="text-sm text-[oklch(0.55_0.02_265)] mb-5">
              The event you're looking for doesn't exist or you don't have access.
            </p>
            <LiquidButton size="sm" onClick={() => navigate("/")}>
              Back to Events
            </LiquidButton>
          </GlassCard>
        </div>
      </div>
    );
  }

  const handleSelectChat = (id: string) => {
    setActiveChatId(id as Id<"chats">);
    setMobileShowThread(true);
  };

  const handleBackToList = () => {
    setMobileShowThread(false);
  };

  return (
    <div className="min-h-screen relative flex flex-col">
      <AmbientBackground />

      {/* ─── Header ─────────────────────────────────────────────────── */}
      <header className="relative z-10 px-6 pt-8 pb-5">
        <div className="max-w-6xl mx-auto">
          <button
            onClick={() => navigate(`/pulse/${event._id}`)}
            className="flex items-center gap-2 text-[oklch(0.5_0.02_265)] hover:text-foreground transition-colors duration-300 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back to Pulse</span>
          </button>

          <p className="text-[0.6875rem] font-semibold tracking-[0.18em] uppercase text-[oklch(0.75_0.15_55)] mb-1.5">
            {event.title}
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em]">
            Group Chats
          </h1>
          <p className="text-sm text-[oklch(0.55_0.02_265)] mt-2 max-w-xl">
            Spin up dedicated channels for your guests, admins, or specific
            crews. Everyone stays aligned without phone-tag.
          </p>
        </div>
      </header>

      {/* ─── Two-pane shell ─────────────────────────────────────────── */}
      <div className="relative z-10 flex-1 px-6 pb-6">
        <div className="max-w-6xl mx-auto h-[calc(100vh-13rem)] min-h-[480px]">
          <GlassCard
            variant="strong"
            specular={false}
            className="h-full !p-0 overflow-hidden flex"
          >
            {/* Sidebar (always-visible on desktop; hidden behind thread on mobile) */}
            <aside
              className={cn(
                "w-full md:w-[320px] md:border-r border-border/40 shrink-0",
                "md:block",
                mobileShowThread ? "hidden md:block" : "block",
              )}
            >
              {chatRows === undefined ? (
                <div className="flex items-center justify-center h-full p-6">
                  <p className="text-xs text-[oklch(0.5_0.02_265)]">
                    Loading chats…
                  </p>
                </div>
              ) : (
                <ChatList
                  chats={chatItems}
                  activeChatId={activeChatId}
                  onSelect={handleSelectChat}
                  onCreate={() => setCreatingChat(true)}
                  isHost
                />
              )}
            </aside>

            {/* Thread pane */}
            <section
              className={cn(
                "flex-1 flex-col min-w-0",
                "md:flex",
                mobileShowThread ? "flex" : "hidden md:flex",
              )}
            >
              {activeChat ? (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeChat._id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={t}
                    className="flex flex-col h-full"
                  >
                    {/* Thread header */}
                    <div className="flex items-center gap-3 px-4 md:px-5 py-3.5 border-b border-border/40">
                      <button
                        onClick={handleBackToList}
                        className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-[oklch(1_0_0/6%)] transition-colors"
                        aria-label="Back to chat list"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">
                          {activeChat.name}
                        </p>
                        <p className="text-[0.6875rem] text-[oklch(0.5_0.02_265)] capitalize">
                          {activeChat.type}
                          {activeChat.memberCount !== undefined &&
                            ` · ${activeChat.memberCount} member${activeChat.memberCount === 1 ? "" : "s"}`}
                        </p>
                      </div>
                    </div>

                    <MessageThread
                      chatId={activeChat._id as Id<"chats">}
                      messages={messages}
                      currentUserId={user?.id}
                    />

                    <Composer chatId={activeChat._id as Id<"chats">} />
                  </motion.div>
                </AnimatePresence>
              ) : chatRows && chatRows.filter((c) => !c.archived).length === 0 ? (
                <EmptyChats onCreate={() => setCreatingChat(true)} />
              ) : (
                <div className="flex-1 flex items-center justify-center p-6">
                  <p className="text-xs text-[oklch(0.5_0.02_265)]">
                    Select a chat to start.
                  </p>
                </div>
              )}
            </section>
          </GlassCard>
        </div>
      </div>

      <CreateChatSheet
        eventId={eventId}
        open={creatingChat}
        onOpenChange={setCreatingChat}
        onCreated={(id) => {
          setActiveChatId(id);
          setMobileShowThread(true);
        }}
      />
    </div>
  );
}

function EmptyChats({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-5">
      <div className="w-16 h-16 rounded-2xl bg-[oklch(0.75_0.15_55/12%)] flex items-center justify-center">
        <MessageSquare className="w-7 h-7 text-[oklch(0.75_0.15_55)]" />
      </div>
      <div className="max-w-xs">
        <h3 className="text-base font-semibold">No chats yet</h3>
        <p className="text-sm text-[oklch(0.55_0.02_265)] mt-1.5">
          Start a general thread for everyone, or a private admin channel for
          your co-hosts.
        </p>
      </div>
      <LiquidButton size="sm" onClick={onCreate} className="gap-2">
        <Plus className="w-4 h-4" /> New chat
      </LiquidButton>
    </div>
  );
}
