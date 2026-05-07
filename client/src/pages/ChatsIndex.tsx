/**
 * ChatsIndex — `/chats` (no slug). Lists every event the user can chat in
 * (events they host + events they're attending) and routes them into the
 * per-event Chats console at `/chats/:slug` on tap.
 *
 * Why a separate page: the existing `/chats/:slug` console is event-scoped,
 * but the bottom-nav "Chat" tab needs an entry point that isn't tied to
 * a specific event. This is that entry point.
 */
import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery } from "convex/react";
import { ArrowLeft, MessageCircle, Calendar, Users } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth } from "@/_core/hooks/useAuth";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { AmbientBackground } from "@/components/AmbientBackground";
import { api } from "../../../convex/_generated/api";
import { format } from "date-fns";

const t = { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const };

export default function ChatsIndex() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  const hostedRaw = useQuery(api.events.list, isAuthenticated ? {} : "skip");
  const claimedRaw = useQuery(
    api.events.myClaimedEvents,
    isAuthenticated ? {} : "skip",
  );

  // Merge — host events take precedence over duplicates by slug.
  const allEvents = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{
      _id: string;
      slug: string;
      title: string;
      eventDate?: number;
      imageUrl?: string;
      themeColor?: string;
      role: "host" | "guest";
    }> = [];
    for (const e of hostedRaw ?? []) {
      if (seen.has(e.slug)) continue;
      seen.add(e.slug);
      out.push({
        _id: e._id,
        slug: e.slug,
        title: e.title,
        eventDate: e.eventDate,
        imageUrl: e.imageUrl ?? undefined,
        themeColor: e.themeColor ?? undefined,
        role: "host",
      });
    }
    for (const e of claimedRaw ?? []) {
      if (seen.has(e.slug)) continue;
      seen.add(e.slug);
      out.push({
        _id: e._id,
        slug: e.slug,
        title: e.title,
        eventDate: e.eventDate,
        imageUrl: e.imageUrl ?? undefined,
        themeColor: e.themeColor ?? undefined,
        role: "guest",
      });
    }
    return out;
  }, [hostedRaw, claimedRaw]);

  if (!authLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-6">
        <AmbientBackground />
        <GlassCard className="p-10 text-center max-w-sm">
          <h2 className="text-xl font-semibold mb-3">Sign in to chat</h2>
          <p className="text-sm text-[oklch(0.5_0.02_265)] mb-6">
            Group chats are tied to your ivari account. Sign in to see chats
            for events you host or are attending.
          </p>
          <LiquidButton onClick={() => navigate("/handler/sign-in")} className="w-full">
            Continue
          </LiquidButton>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative pb-32">
      <AmbientBackground />

      <div className="relative z-10 max-w-2xl mx-auto px-6 pt-10">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-[oklch(0.5_0.02_265)] hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">Back</span>
        </button>

        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-2xl bg-[oklch(0.78_0.13_60/12%)] flex items-center justify-center">
            <MessageCircle className="w-5 h-5 text-[oklch(0.78_0.13_60)]" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-[-0.02em]">Chats</h1>
            <p className="text-xs text-[oklch(0.5_0.02_265)]">
              Pick an event to open its group chat
            </p>
          </div>
        </div>

        {allEvents.length === 0 ? (
          <GlassCard className="p-10 text-center mt-8">
            <p className="text-sm text-[oklch(0.5_0.02_265)] mb-2">
              No chats yet
            </p>
            <p className="text-xs text-[oklch(0.45_0.02_265)] leading-relaxed max-w-xs mx-auto">
              Chats live inside events. Create an event in Forge or claim a
              seat at one to unlock its group chat.
            </p>
          </GlassCard>
        ) : (
          <div className="space-y-2.5 mt-6">
            {allEvents.map((e, i) => (
              <motion.button
                key={e._id}
                type="button"
                onClick={() => navigate(`/chats/${e.slug}`)}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...t, delay: i * 0.04 }}
                className="w-full flex items-center gap-3.5 p-3.5 rounded-2xl bg-[oklch(1_0_0/3%)] border border-[oklch(1_0_0/6%)] hover:bg-[oklch(1_0_0/5%)] hover:border-[oklch(1_0_0/10%)] transition-colors text-left"
              >
                {e.imageUrl ? (
                  <img
                    src={e.imageUrl}
                    alt=""
                    className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                  />
                ) : (
                  <div
                    className="w-12 h-12 rounded-xl flex-shrink-0"
                    style={{
                      background: e.themeColor
                        ? `linear-gradient(135deg, ${e.themeColor}40, ${e.themeColor}10)`
                        : "oklch(1 0 0 / 6%)",
                    }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{e.title}</div>
                  <div className="flex items-center gap-2.5 text-[11px] text-[oklch(0.5_0.02_265)] mt-0.5">
                    {typeof e.eventDate === "number" && (
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {format(new Date(e.eventDate), "MMM d")}
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-[0.1em] ${
                        e.role === "host"
                          ? "bg-[oklch(0.78_0.13_60/14%)] text-[oklch(0.78_0.13_60)]"
                          : "bg-[oklch(0.7_0.15_220/14%)] text-[oklch(0.7_0.15_220)]"
                      }`}
                    >
                      {e.role === "host" ? "Host" : "Attending"}
                    </span>
                  </div>
                </div>
                <MessageCircle className="w-4 h-4 text-[oklch(0.5_0.02_265)] flex-shrink-0" />
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
