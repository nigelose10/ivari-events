/**
 * LiveEvent — V9 wedge: "Live Event Mode".
 *
 * URL: `/live/:slug` (public, no Stack Auth required).
 *
 * Window: only accessible from `eventDate - 2h` through `eventDate + 8h`.
 * Outside that window we render a calm "not yet" / "ended" panel so
 * deep links don't 404 awkwardly.
 *
 * Auth: same JWT pattern as Portal — guests arrive with `?gt=<token>` and
 * use it to upload photos via the existing `photos.requestUploadUrl` +
 * `photos.savePhotoRecord` action chain. No new Convex code added.
 *
 * Realtime feel: `useQuery(api.photos.list)` is reactive. Approved uploads
 * surface to every device the moment a host (or auto-mod) green-lights them.
 *
 * Live counter pill: derived from `api.rsvps.publicCounts` (the only
 * guest-safe count surface — `rsvps.list` is host-auth-gated).
 */
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { AmbientBackground } from "@/components/AmbientBackground";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  X,
  ChevronLeft,
  Users,
  Sparkles,
  Clock,
} from "lucide-react";
import { useParams } from "wouter";
import { toast } from "sonner";

const t = { duration: 0.5, ease: [0.22, 1, 0.36, 1] as const };

// Live window — opens 2h before, closes 8h after.
const PRE_WINDOW_MS = 2 * 60 * 60 * 1000;
const POST_WINDOW_MS = 8 * 60 * 60 * 1000;

// Stable per-photo polaroid tilt: hash the id so the tilt doesn't reshuffle
// every render (which would feel jittery on auto-refetch).
function tiltFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 41) - 20) / 10; // -2.0 ... +2.0 deg
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "Live now";
  const totalMin = Math.floor(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `Starts in ${h}h ${m}m`;
  return `Starts in ${m}m`;
}

export default function LiveEvent() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";

  // Token (`?gt=…` per the brief — Portal uses `?token=…`, this surface uses `?gt=…`).
  const searchStr = typeof window !== "undefined" ? window.location.search : "";
  const token = useMemo(() => {
    const p = new URLSearchParams(searchStr);
    return p.get("gt") || p.get("token") || "";
  }, [searchStr]);

  // Reactive event lookup. Public-safe (`getBySlug` returns guest-safe fields).
  const event = useQuery(api.events.getBySlug, slug ? { slug } : "skip");
  const eventId = event?._id as Id<"events"> | undefined;

  // Public, moderated photo feed. Auto-subscribes — new approvals stream in.
  const photos = useQuery(
    api.photos.listApproved,
    eventId ? { eventId } : "skip",
  );

  // Public RSVP counts (only guest-safe surface). Used for the "Live counter".
  const counts = useQuery(
    api.rsvps.publicCounts,
    slug ? { slug } : "skip",
  );

  // Avatar bubbles — claimed/checked-in attendees with avatars + first names.
  // Public-safe surface (this whole page is /live/:slug, no auth required).
  const liveAttendees = useQuery(
    api.guests.liveAttendees,
    eventId ? { eventId } : "skip",
  );

  // Upload pipeline — guest path only (this surface is for attendees, not hosts).
  const requestUploadUrl = useAction(api.photos.requestUploadUrl);
  const savePhotoRecord = useAction(api.photos.savePhotoRecord);

  // Local state
  const [now, setNow] = useState(() => Date.now());
  const [uploading, setUploading] = useState(false);
  const [pendingCount, setPendingCount] = useState(0); // local-only "review queue" hint
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tick once a minute so the countdown animates without burning CPU.
  useEffect(() => {
    const i = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(i);
  }, []);

  // Derived window state
  const eventDate = event?.eventDate ?? 0;
  const windowOpensAt = eventDate ? eventDate - PRE_WINDOW_MS : 0;
  const windowClosesAt = eventDate ? eventDate + POST_WINDOW_MS : 0;
  const isBefore = !!eventDate && now < windowOpensAt;
  const isAfter = !!eventDate && now > windowClosesAt;
  const isLive = !!eventDate && !isBefore && !isAfter;
  const msUntilStart = eventDate ? eventDate - now : 0;

  const photoList = photos ?? [];
  const isLoading = event === undefined;

  // Upload handler — opens native camera input, runs the guest-token action chain.
  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      // Reset input so re-picking the same file still triggers `change`.
      if (fileInputRef.current) fileInputRef.current.value = "";
      if (!file) return;
      if (!token) {
        toast.error("You need an invitation link to share photos");
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File too large (max 10MB)");
        return;
      }
      setUploading(true);
      setPendingCount((c) => c + 1);
      try {
        const uploadUrl = await requestUploadUrl({ token });
        const res = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": file.type || "image/jpeg" },
          body: file,
        });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        const { storageId } = (await res.json()) as {
          storageId: Id<"_storage">;
        };
        await savePhotoRecord({ token, storageId });
        toast.success("Shared — will appear once approved");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Upload failed";
        toast.error(message);
        setPendingCount((c) => Math.max(0, c - 1));
      } finally {
        setUploading(false);
      }
    },
    [token, requestUploadUrl, savePhotoRecord],
  );

  // Loading shell
  if (isLoading) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <AmbientBackground />
        <motion.div
          className="w-10 h-10 rounded-full border-2 border-[oklch(0.78_0.13_60)] border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-6">
        <AmbientBackground />
        <GlassCard className="p-10 text-center max-w-sm">
          <h2 className="text-xl font-semibold mb-2">Not Found</h2>
          <p className="text-sm text-[oklch(0.5_0.02_265)]">
            This live event doesn't exist.
          </p>
        </GlassCard>
      </div>
    );
  }

  // Pre-window: gentle "starts in" panel.
  if (isBefore) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-6">
        <AmbientBackground />
        <GlassCard variant="elevated" className="p-10 text-center max-w-md">
          <div className="w-14 h-14 rounded-2xl bg-[oklch(0.78_0.13_60/14%)] flex items-center justify-center mx-auto mb-5">
            <Clock className="w-7 h-7 text-[oklch(0.78_0.13_60)]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] mb-2">
            {event.title}
          </h1>
          <p className="text-sm text-[oklch(0.55_0.02_265)] mb-6">
            Live mode opens 2 hours before the event.
          </p>
          <p className="text-base font-medium text-[oklch(0.78_0.13_60)]">
            {formatCountdown(msUntilStart)}
          </p>
        </GlassCard>
      </div>
    );
  }

  // Post-window: archived state.
  if (isAfter) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-6">
        <AmbientBackground />
        <GlassCard variant="elevated" className="p-10 text-center max-w-md">
          <div className="w-14 h-14 rounded-2xl bg-[oklch(0.6_0.08_60/14%)] flex items-center justify-center mx-auto mb-5">
            <Sparkles className="w-7 h-7 text-[oklch(0.7_0.08_60)]" />
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] mb-2">
            {event.title}
          </h1>
          <p className="text-sm text-[oklch(0.55_0.02_265)] mb-6">
            This event has ended. Memories live on the wall.
          </p>
          <LiquidButton
            variant="glass"
            onClick={() => {
              window.location.href = `/memory/${slug}${
                token ? `?token=${token}` : ""
              }`;
            }}
          >
            View Memory Wall
          </LiquidButton>
        </GlassCard>
      </div>
    );
  }

  // ── LIVE: full-screen takeover ──────────────────────────────────────────
  const hereCount = counts?.attending ?? 0;

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />

      {/* Top bar — title + countdown */}
      <div className="sticky top-0 z-30 px-4 sm:px-6 pt-4 pb-3 backdrop-blur-xl bg-[oklch(0.06_0.025_60/55%)] border-b border-[oklch(1_0_0/6%)]">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => {
                window.location.href = token
                  ? `/portal/${slug}?token=${token}`
                  : "/";
              }}
              className="p-2 -ml-2 rounded-xl hover:bg-[oklch(1_0_0/6%)] text-[oklch(0.6_0.02_60)] hover:text-foreground transition-colors flex-shrink-0"
              aria-label="Back"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold tracking-[-0.02em] truncate">
                {event.title}
              </h1>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[oklch(0.78_0.16_60)] opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[oklch(0.78_0.16_60)]" />
                </span>
                <span className="text-[0.6875rem] uppercase tracking-[0.12em] text-[oklch(0.78_0.13_60)] font-medium">
                  {isLive && msUntilStart > 0
                    ? formatCountdown(msUntilStart)
                    : "Live now"}
                </span>
              </div>
            </div>
          </div>

          {/* Live counter pill (top-right) */}
          <GlassCard variant="subtle" className="px-3 py-1.5 flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[oklch(0.78_0.13_60)]" />
              <span className="text-xs font-semibold tabular-nums">
                {hereCount}
              </span>
              <span className="text-[0.6875rem] text-[oklch(0.55_0.02_60)]">
                here
              </span>
            </div>
          </GlassCard>
        </div>
      </div>

      {/* Avatar bubble row — claimed/checked-in attendees stream live. */}
      {liveAttendees && liveAttendees.length > 0 && (
        <div className="relative z-10 px-4 sm:px-6 pt-3">
          <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {liveAttendees.map((a) => (
                <div
                  key={a._id}
                  className="flex flex-col items-center gap-1 flex-shrink-0"
                  title={`${a.name}${a.checkedIn ? " · here" : ""}${a.hasIvariAccount ? " · ivari" : ""}`}
                >
                  <div className="relative">
                    {a.avatarUrl ? (
                      <img
                        src={a.avatarUrl}
                        alt=""
                        className={`w-10 h-10 rounded-full object-cover border-2 ${a.checkedIn ? "border-[oklch(0.78_0.13_60)]" : "border-[oklch(1_0_0/12%)]"}`}
                      />
                    ) : (
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold border-2 ${a.checkedIn ? "border-[oklch(0.78_0.13_60)] bg-[oklch(0.78_0.13_60/16%)] text-[oklch(0.78_0.13_60)]" : "border-[oklch(1_0_0/12%)] bg-[oklch(1_0_0/6%)]"}`}>
                        {(a.name ?? "?").slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    {a.checkedIn && (
                      <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[oklch(0.78_0.13_60)] border-2 border-[oklch(0.06_0.025_275)]" />
                    )}
                  </div>
                  <span className="text-[10px] text-[oklch(0.55_0.02_60)] max-w-[60px] truncate">
                    {a.name?.split(" ")[0]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pending-review hint (local-only — counts this device's uploads). */}
      <AnimatePresence>
        {pendingCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={t}
            className="relative z-20 px-4 sm:px-6 pt-3"
          >
            <div className="max-w-5xl mx-auto">
              <GlassCard variant="subtle" className="px-4 py-2.5">
                <p className="text-xs text-[oklch(0.6_0.06_60)]">
                  {pendingCount} photo{pendingCount === 1 ? "" : "s"} pending
                  review — they'll appear once approved.
                </p>
              </GlassCard>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Photo wall */}
      <div className="relative z-10 px-4 sm:px-6 pt-5 pb-32">
        <div className="max-w-5xl mx-auto">
          {photoList.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={t}
              className="text-center py-24"
            >
              <div className="w-20 h-20 rounded-2xl bg-[oklch(1_0_0/5%)] flex items-center justify-center mx-auto mb-5">
                <Camera className="w-10 h-10 text-[oklch(0.3_0.02_60)]" />
              </div>
              <h3 className="text-xl font-semibold mb-2">
                Be the first to share
              </h3>
              <p className="text-sm text-[oklch(0.5_0.02_60)] max-w-xs mx-auto">
                Tap the camera button to drop a photo onto the live wall.
              </p>
            </motion.div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              <AnimatePresence initial={false}>
                {photoList.map((p, i) => {
                  const tilt = tiltFor(String(p._id));
                  return (
                    <motion.div
                      key={String(p._id)}
                      layoutId={`live-photo-${p._id}`}
                      layout
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0, rotate: tilt }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      transition={{
                        ...t,
                        delay: Math.min(i, 6) * 0.02,
                      }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setLightboxIndex(i)}
                      className="cursor-pointer"
                    >
                      <div className="glass-subtle rounded-2xl p-1.5 overflow-hidden">
                        <div className="aspect-square w-full overflow-hidden rounded-xl bg-[oklch(0.1_0.02_60)]">
                          <img
                            src={p.imageUrl}
                            alt={p.caption ?? ""}
                            loading="lazy"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        {p.caption && (
                          <p className="text-[0.6875rem] text-[oklch(0.6_0.02_60)] px-1.5 pt-1.5 pb-0.5 truncate">
                            {p.caption}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Floating Action Button — native camera */}
      {token && (
        <motion.button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...t, delay: 0.15 }}
          whileTap={{ scale: 0.94 }}
          className="fixed bottom-6 right-6 z-40 w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br from-[oklch(0.82_0.16_60)] to-[oklch(0.7_0.18_45)] shadow-[0_10px_40px_oklch(0.7_0.18_45/45%)] disabled:opacity-60 disabled:cursor-wait"
          aria-label="Share a photo"
        >
          {uploading ? (
            <motion.div
              className="w-6 h-6 rounded-full border-2 border-white border-t-transparent"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          ) : (
            <Camera className="w-7 h-7 text-white" />
          )}
        </motion.button>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Lightbox — swipe to dismiss via Framer drag */}
      <AnimatePresence>
        {lightboxIndex !== null && photoList[lightboxIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={t}
            className="fixed inset-0 z-50 bg-[oklch(0.04_0.02_60/92%)] backdrop-blur-2xl flex items-center justify-center p-4"
            onClick={() => setLightboxIndex(null)}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setLightboxIndex(null);
              }}
              className="absolute top-5 right-5 w-10 h-10 rounded-full glass-subtle flex items-center justify-center text-foreground hover:bg-[oklch(1_0_0/10%)] transition-colors z-10"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <motion.div
              layoutId={`live-photo-${photoList[lightboxIndex]._id}`}
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={0.4}
              onDragEnd={(_, info) => {
                if (Math.abs(info.offset.y) > 120) setLightboxIndex(null);
              }}
              onClick={(e) => e.stopPropagation()}
              className="max-w-3xl w-full"
            >
              <img
                src={photoList[lightboxIndex].imageUrl}
                alt={photoList[lightboxIndex].caption ?? ""}
                className="w-full h-auto max-h-[85vh] object-contain rounded-2xl"
              />
              {photoList[lightboxIndex].caption && (
                <p className="text-center text-sm text-[oklch(0.7_0.02_60)] mt-3">
                  {photoList[lightboxIndex].caption}
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
