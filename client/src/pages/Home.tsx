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
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useState, useMemo, useEffect } from "react";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { AmbientBackground } from "@/components/AmbientBackground";
import { ThemeToggle } from "@/components/ThemeToggle";
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
import { runHomeTour } from "@/lib/onboarding";
import EventDiscovery from "@/components/EventDiscovery";
import { Skeleton } from "boneyard-js/react";
import { getDeviceKey } from "@/lib/deviceKey";

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

  // Convex reactive query — auto-subscribes; pass "skip" when unauthenticated.
  const eventsRaw = useQuery(api.events.list, isAuthenticated ? {} : "skip");
  const events = useMemo(
    () => (eventsRaw ?? []).map((e: any) => ({ ...e, id: e._id })),
    [eventsRaw],
  );
  const eventsQuery = {
    data: events,
    isLoading: isAuthenticated && eventsRaw === undefined,
  };

  // V11 — "I'm Attending" — events the user (or this device) has claimed.
  // Pass the deviceKey too so anon name-list claims also surface here, no
  // sign-in required.
  const deviceKey = useMemo(() => getDeviceKey(), []);
  const claimedEventsRaw = useQuery(api.events.myClaimedEvents, {
    deviceKey: deviceKey || undefined,
  });
  // "We think you're on the guest list" — fuzzy match the signed-in user's
  // display name against unclaimed guests on public name-list events.
  const claimSuggestions = useQuery(
    api.events.guessClaimsForMe,
    isAuthenticated ? {} : "skip",
  );
  const claimByName = useMutation(api.events.claimByName);
  const claimedEvents = useMemo(
    () => (claimedEventsRaw ?? []).map((e: any) => ({ ...e, id: e._id })),
    [claimedEventsRaw],
  );

  // First-run onboarding tour — driver.js, gated by localStorage flag.
  // Wait until we know the user is authenticated and events have loaded
  // (the tour points at the events section, which only paints once).
  useEffect(() => {
    if (!isAuthenticated || authLoading) return;
    if (eventsRaw === undefined) return;
    runHomeTour();
  }, [isAuthenticated, authLoading, eventsRaw]);

  const duplicateEvent = useMutation(api.events.duplicate);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const duplicateMut = {
    isPending: isDuplicating,
    mutate: async (input: { id: string; includeGuests?: boolean }) => {
      setIsDuplicating(true);
      try {
        const result = await duplicateEvent({ id: input.id as any, includeGuests: input.includeGuests ?? false });
        const newId = (result as any)?._id ?? (result as any)?.id ?? result;
        toast.success("Event duplicated as draft");
        navigate(`/pulse/${newId}`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Duplicate failed");
      } finally {
        setIsDuplicating(false);
      }
    },
  };

  // ─── Unauthenticated Landing ───
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen relative flex flex-col">
        <AmbientBackground />
        <div className="absolute top-6 right-6 z-20">
          <ThemeToggle />
        </div>
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
                <span className="bg-gradient-to-br from-[var(--primary)] via-[var(--rose-gold)] to-[var(--primary)] bg-clip-text text-transparent">
                  IVARI
                </span>
              </h1>
              <motion.div
                className="h-px w-16 mx-auto mt-6 bg-gradient-to-r from-transparent via-[var(--border-strong)] to-transparent"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.8, delay: 0.5 }}
              />
            </motion.div>

            <motion.p
              className="text-xl sm:text-2xl font-light text-[var(--text-secondary)] leading-relaxed tracking-[-0.01em] mb-12"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              Craft extraordinary gatherings —
              <br />
              effortless invitations, unforgettable nights.
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
              <p className="text-xs text-[var(--text-faint)] mt-4 tracking-wide">
                CRAFT EXTRAORDINARY GATHERINGS
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
            className="w-10 h-10 rounded-full border-2 border-[var(--primary)] border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          />
          <span className="text-sm text-[var(--text-tertiary)] tracking-wide">Loading your events...</span>
        </div>
      </div>
    );
  }

  const eventList: any[] = (eventsQuery.data || []) as any[];
  const activeEvents = eventList.filter((e: any) => e.status === "active");
  const draftEvents = eventList.filter((e: any) => e.status === "draft");
  const otherEvents = eventList.filter((e: any) => e.status !== "active" && e.status !== "draft");

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />

      {/* ─── Header — minimal: title left, theme + sign-out right.
          The Forge / Gallery / Chat / You actions live in the bottom nav,
          not in the hero. One CTA per surface, not three. */}
      <header className="relative z-10 pt-14 sm:pt-20 pb-10 px-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start justify-between">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={t}
            >
              <p className="text-[11px] font-semibold tracking-[0.2em] uppercase text-[oklch(0.5_0.02_265)] mb-2">
                {user?.name ? `Welcome, ${user.name.split(" ")[0]}` : "Welcome"}
              </p>
              <h1 className="text-4xl sm:text-5xl font-semibold tracking-[-0.035em] leading-[1.05]">
                Your events
              </h1>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="flex items-center gap-1"
            >
              <ThemeToggle />
              <button
                onClick={() => logout()}
                className="p-2.5 rounded-xl hover:bg-[oklch(1_0_0/5%)] transition-colors text-[oklch(0.5_0.02_265)] hover:text-foreground"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </motion.div>
          </div>
        </div>
      </header>

      {/* ─── Events ─── */}
      <div className="relative z-10 px-6 pb-24 pt-2">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Public-event discovery — type-to-find. Anon-tolerant. */}
          <EventDiscovery />

          {/* Name-match suggestion banner — surfaces when your display
              name fuzzy-matches an unclaimed guest row on a public event. */}
          {(claimSuggestions ?? []).length > 0 && (
            <div className="space-y-2">
              {(claimSuggestions ?? []).slice(0, 2).map((s: any) => (
                <button
                  key={`${s.eventSlug}-${s.guestId}`}
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await claimByName({
                        slug: s.eventSlug,
                        guestId: s.guestId,
                      });
                      if (res.state === "claimed" || res.state === "already-yours") {
                        toast.success(
                          s.tableNumber
                            ? `Confirmed — Table ${s.tableNumber}`
                            : "You're on the list",
                        );
                      } else {
                        toast.info("That seat is already claimed.");
                      }
                    } catch (err: any) {
                      toast.error(err?.message ?? "Couldn't confirm");
                    }
                  }}
                  className="w-full text-left p-4 rounded-2xl bg-[oklch(0.78_0.13_60/8%)] border border-[oklch(0.78_0.13_60/24%)] hover:bg-[oklch(0.78_0.13_60/14%)] transition-colors"
                >
                  <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[oklch(0.78_0.13_60)] mb-1">
                    Looks like you're on the list
                  </p>
                  <p className="text-sm font-medium">
                    Claim <span className="text-[oklch(0.85_0.13_60)]">{s.guestName}</span> on {s.eventTitle}
                    {s.tableNumber && (
                      <span className="text-[oklch(0.55_0.02_265)] font-normal"> · Table {s.tableNumber}</span>
                    )}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Loading state — boneyard skeleton replaces the legacy spinner.
              The fallback below renders pre-capture; once `pnpm boneyard:build`
              runs against the live dev server, real bones overlay this. */}
          {eventsQuery.isLoading ? (
            <Skeleton
              name="home-events-list"
              loading
              animate="shimmer"
              fallback={
                <div className="space-y-3">
                  {[0, 1, 2].map((i) => (
                    <div
                      key={i}
                      className="rounded-2xl bg-[oklch(1_0_0/3%)] border border-[oklch(1_0_0/6%)] p-4 flex gap-4 shimmer"
                      style={{ animationDelay: `${i * 0.08}s` }}
                    >
                      <div className="w-20 h-20 rounded-xl bg-[oklch(1_0_0/4%)] flex-shrink-0" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-4 rounded-md bg-[oklch(1_0_0/4%)] w-3/4" />
                        <div className="h-3 rounded-md bg-[oklch(1_0_0/3%)] w-1/2" />
                        <div className="h-3 rounded-md bg-[oklch(1_0_0/3%)] w-2/3" />
                      </div>
                    </div>
                  ))}
                </div>
              }
            >
              <div />
            </Skeleton>
          ) : eventList.length === 0 ? (
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

          {/* V11 — "I'm Attending" — events claimed by sign-in from a
              per-guest invitation link. Only renders when there's at least
              one — empty state stays hidden so it doesn't clutter the page
              for hosts who never RSVP'd to anything. */}
          {claimedEvents.length > 0 && (
            <ClaimedEventsSection
              events={claimedEvents}
              navigate={navigate}
              startIndex={eventList.length}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ClaimedEventsSection({
  events,
  navigate,
  startIndex,
}: {
  events: any[];
  navigate: (p: string) => void;
  startIndex: number;
}) {
  return (
    <div className="space-y-3 pt-8">
      <motion.p
        className="text-xs font-semibold tracking-[0.15em] uppercase text-[oklch(0.5_0.02_265)] px-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
      >
        I&apos;m Attending
      </motion.p>
      {events.map((event, i) => (
        <ClaimedEventCard
          key={event.id}
          event={event}
          index={startIndex + i}
          navigate={navigate}
        />
      ))}
    </div>
  );
}

function ClaimedEventCard({
  event,
  index,
  navigate,
}: {
  event: any;
  index: number;
  navigate: (p: string) => void;
}) {
  return (
    <GlassCard
      className="overflow-hidden group"
      onClick={() => navigate(`/portal/${event.slug}?guest=${event.asGuestId}`)}
      hover
      delay={0.15 + index * 0.06}
    >
      <div className="flex">
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
        <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between min-h-[120px]">
          <div>
            <h3 className="text-base sm:text-lg font-semibold tracking-[-0.01em] group-hover:text-[oklch(0.78_0.12_255)] transition-colors duration-500 line-clamp-1">
              {event.title}
            </h3>
            {event.tableNumber && (
              <p className="text-xs text-[oklch(0.65_0.10_70)] mt-1 font-medium tracking-wide uppercase">
                Your table: {event.tableNumber}
                {event.seatNumber ? ` · Seat ${event.seatNumber}` : ""}
              </p>
            )}
          </div>
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
            {event.guestName && (
              <span className="flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 opacity-60" />
                <span>RSVP&apos;d as {event.guestName}</span>
              </span>
            )}
          </div>
        </div>
      </div>
    </GlassCard>
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
  onDuplicate: (id: string) => void;
  startIndex: number;
}) {
  return (
    <div className="space-y-3" data-tour="home-events-section">
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
  onDuplicate: (id: string) => void;
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
