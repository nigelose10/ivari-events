/**
 * Home — Events / unauth landing.
 *
 * TODO (deferred — see DESIGN-AUDIT.md):
 * - [ ] Replace IVARI wordmark gradient (currently blue→purple→magenta — banned).
 *       Use warm amber: from-[var(--primary)] via-[var(--rose-gold)] to-[var(--primary)]
 * - [ ] Hardcoded oklch(0.5_0.02_265) cool-gray secondary text → var(--text-secondary)
 * - [ ] Spinner loader → card shimmer skeletons in Events
 * - [ ] Increase wordmark→subhead gap from 48px to 96px (landing breathing room)
 * - [ ] EventCard hero image is too small (28–36px) — bump to 40% of card width
 * - [ ] Status badge should overlay the image top-right, not sit next to title
 * - [ ] Empty state Sparkles icon → outline-only, monochrome
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { AmbientBackground } from "@/components/AmbientBackground";
import { motion } from "framer-motion";
import {
  Plus,
  Calendar,
  MapPin,
  Users,
  LogOut,
  Sparkles,
  ArrowRight,
  Clock,
  Copy,
  LayoutGrid,
} from "lucide-react";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import { format, isPast, isToday, isTomorrow, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const t = { duration: 0.7, ease: [0.22, 1, 0.36, 1] as const };

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "badge-active"
      : status === "draft"
        ? "badge-draft"
        : status === "past"
          ? "badge-past"
          : "badge-cancelled";
  return (
    <span className={`text-[0.6875rem] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  );
}

function formatEventDate(ms: number) {
  const d = new Date(ms);
  if (isToday(d)) return `Today at ${format(d, "h:mm a")}`;
  if (isTomorrow(d)) return `Tomorrow at ${format(d, "h:mm a")}`;
  if (isPast(d)) return format(d, "MMM d, yyyy");
  return format(d, "EEE, MMM d 'at' h:mm a");
}

function formatRelative(ms: number) {
  const d = new Date(ms);
  if (isPast(d)) return "Past";
  return formatDistanceToNow(d, { addSuffix: true });
}

export default function Home() {
  const { user, loading: authLoading, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();

  const eventsQuery = trpc.events.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const duplicateMut = trpc.events.duplicate.useMutation({
    onSuccess: (data) => {
      toast.success("Event duplicated as draft");
      utils.events.list.invalidate();
      navigate(`/pulse/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  // ─── Unauthenticated Landing ───
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen relative flex flex-col">
        <AmbientBackground />
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
            className="text-center max-w-md"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="mb-12"
            >
              <h1 className="text-7xl sm:text-8xl font-extrabold tracking-[-0.04em] leading-none">
                <span className="bg-gradient-to-br from-[oklch(0.78_0.12_255)] via-[oklch(0.68_0.18_290)] to-[oklch(0.6_0.16_320)] bg-clip-text text-transparent">
                  IVARI
                </span>
              </h1>
              <motion.div
                className="h-px w-16 mx-auto mt-6 bg-gradient-to-r from-transparent via-[oklch(1_0_0/20%)] to-transparent"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.8, delay: 0.5 }}
              />
            </motion.div>

            <motion.p
              className="text-xl sm:text-2xl font-light text-[oklch(0.7_0.02_265)] leading-relaxed tracking-[-0.01em] mb-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              Craft extraordinary gatherings with
              <br />
              AI-generated environments.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.7 }}
            >
              <LiquidButton
                onClick={() => { window.location.href = getLoginUrl(); }}
                size="xl"
                className="w-full max-w-xs mx-auto gap-3"
              >
                Enter Events
                <ArrowRight className="w-5 h-5" />
              </LiquidButton>
              <p className="text-xs text-[oklch(0.45_0.02_265)] mt-4 tracking-wide">
                POWERED BY NANO BANANA
              </p>
            </motion.div>
          </motion.div>
        </div>
      </div>
    );
  }

  // ─── Loading ───
  if (authLoading || eventsQuery.isLoading) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <AmbientBackground />
        <div className="flex flex-col items-center gap-4">
          <motion.div
            className="w-10 h-10 rounded-full border-2 border-[oklch(0.72_0.16_255)] border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          />
          <span className="text-sm text-[oklch(0.5_0.02_265)] tracking-wide">Loading your events...</span>
        </div>
      </div>
    );
  }

  const events = eventsQuery.data || [];
  const activeEvents = events.filter(e => e.status === "active");
  const draftEvents = events.filter(e => e.status === "draft");
  const otherEvents = events.filter(e => e.status !== "active" && e.status !== "draft");

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />

      {/* ─── Header ─── */}
      <header className="relative z-10 pt-12 sm:pt-16 pb-8 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between mb-10">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={t}
            >
              <h1 className="text-4xl sm:text-5xl font-bold tracking-[-0.03em] leading-tight">
                Events
              </h1>
              <p className="text-[oklch(0.55_0.02_265)] mt-2 text-[0.9375rem]">
                {user?.name ? `Welcome back, ${user.name}` : "Your gatherings"}
              </p>
            </motion.div>
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              onClick={() => logout()}
              className="p-2.5 rounded-xl hover:bg-[oklch(1_0_0/6%)] transition-colors duration-300 text-[oklch(0.5_0.02_265)] hover:text-foreground"
              title="Sign out"
            >
              <LogOut className="w-5 h-5" />
            </motion.button>
          </div>

          {/* Create CTA + Gallery Link */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...t, delay: 0.1 }}
            className="flex gap-3"
          >
            <LiquidButton
              onClick={() => navigate("/forge")}
              size="lg"
              className="flex-1 gap-3"
            >
              <Plus className="w-5 h-5" />
              Open The Forge
            </LiquidButton>
            <button
              onClick={() => navigate("/gallery")}
              className="px-4 rounded-2xl border border-[oklch(1_0_0/10%)] bg-[oklch(1_0_0/4%)] backdrop-blur-xl hover:bg-[oklch(1_0_0/8%)] hover:border-[oklch(1_0_0/15%)] transition-all duration-300 text-[oklch(0.6_0.02_265)] hover:text-foreground"
              title="The Gallery"
            >
              <LayoutGrid className="w-5 h-5" />
            </button>
          </motion.div>
        </div>
      </header>

      {/* ─── Events ─── */}
      <div className="relative z-10 px-6 pb-16">
        <div className="max-w-2xl mx-auto space-y-4">
          {events.length === 0 ? (
            <GlassCard className="p-16 text-center" delay={0.2}>
              <div className="flex flex-col items-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-[oklch(1_0_0/5%)] flex items-center justify-center">
                  <Sparkles className="w-7 h-7 text-[oklch(0.5_0.02_265)]" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold tracking-tight mb-2">No events yet</h3>
                  <p className="text-[oklch(0.5_0.02_265)] text-[0.9375rem] leading-relaxed max-w-xs mx-auto">
                    Open The Forge to create your first gathering with AI-generated art.
                  </p>
                </div>
              </div>
            </GlassCard>
          ) : (
            <>
              {/* Active Events */}
              {activeEvents.length > 0 && (
                <EventSection
                  label="Active"
                  events={activeEvents}
                  navigate={navigate}
                  onDuplicate={(id) => duplicateMut.mutate({ id, includeGuests: false })}
                  startIndex={0}
                />
              )}

              {/* Draft Events */}
              {draftEvents.length > 0 && (
                <EventSection
                  label="Drafts"
                  events={draftEvents}
                  navigate={navigate}
                  onDuplicate={(id) => duplicateMut.mutate({ id, includeGuests: false })}
                  startIndex={activeEvents.length}
                />
              )}

              {/* Past / Cancelled */}
              {otherEvents.length > 0 && (
                <EventSection
                  label="Archive"
                  events={otherEvents}
                  navigate={navigate}
                  onDuplicate={(id) => duplicateMut.mutate({ id, includeGuests: false })}
                  startIndex={activeEvents.length + draftEvents.length}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function EventSection({
  label,
  events,
  navigate,
  onDuplicate,
  startIndex,
}: {
  label: string;
  events: any[];
  navigate: (p: string) => void;
  onDuplicate: (id: number) => void;
  startIndex: number;
}) {
  return (
    <div className="space-y-3">
      <motion.p
        className="text-xs font-semibold tracking-[0.15em] uppercase text-[oklch(0.5_0.02_265)] px-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        {label}
      </motion.p>
      {events.map((event, i) => (
        <EventCard
          key={event.id}
          event={event}
          index={startIndex + i}
          navigate={navigate}
          onDuplicate={onDuplicate}
        />
      ))}
    </div>
  );
}

function EventCard({
  event,
  index,
  navigate,
  onDuplicate,
}: {
  event: any;
  index: number;
  navigate: (p: string) => void;
  onDuplicate: (id: number) => void;
}) {
  return (
    <GlassCard
      className="overflow-hidden group"
      onClick={() => navigate(`/pulse/${event.id}`)}
      hover
      delay={0.15 + index * 0.06}
    >
      <div className="flex">
        {/* Hero Image */}
        {event.imageUrl ? (
          <div className="w-28 sm:w-36 flex-shrink-0 relative overflow-hidden">
            <img
              src={event.imageUrl}
              alt=""
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[oklch(0.06_0.025_275/60%)]" />
          </div>
        ) : (
          <div className="w-28 sm:w-36 flex-shrink-0 bg-gradient-to-br from-[oklch(0.15_0.03_280)] to-[oklch(0.1_0.02_260)] flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-[oklch(0.35_0.02_265)]" />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between min-h-[120px]">
          <div>
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="text-base sm:text-lg font-semibold tracking-[-0.01em] group-hover:text-[oklch(0.78_0.12_255)] transition-colors duration-500 line-clamp-1">
                {event.title}
              </h3>
              <StatusBadge status={event.status} />
            </div>
            {event.description && (
              <p className="text-sm text-[oklch(0.5_0.02_265)] line-clamp-1 mb-3 leading-relaxed">
                {event.description}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-[oklch(0.5_0.02_265)]">
              {event.eventDate && (
                <span className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 opacity-60" />
                  <span>{formatEventDate(event.eventDate)}</span>
                </span>
              )}
              {event.locationName && (
                <span className="flex items-center gap-1.5 hidden sm:flex">
                  <MapPin className="w-3.5 h-3.5 opacity-60" />
                  <span className="truncate max-w-[120px]">{event.locationName}</span>
                </span>
              )}
              {event.rsvpCounts && (
                <span className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 opacity-60" />
                  <span>{event.rsvpCounts.attending} attending</span>
                </span>
              )}
            </div>

            {/* Duplicate Button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(event.id);
              }}
              className="p-1.5 rounded-lg hover:bg-[oklch(1_0_0/8%)] transition-colors duration-300 text-[oklch(0.45_0.02_265)] hover:text-[oklch(0.7_0.12_255)] opacity-0 group-hover:opacity-100"
              title="Duplicate event"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
