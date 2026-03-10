import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { AmbientBackground } from "@/components/AmbientBackground";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { motion, AnimatePresence } from "framer-motion";
import { useParams, useLocation } from "wouter";
import { useState, useMemo } from "react";
import {
  ArrowLeft, UserCheck, UserX, Search, Users, CheckCircle2,
  Clock, Sparkles, QrCode
} from "lucide-react";
import { getLoginUrl } from "@/const";

export default function CheckIn() {
  const { id } = useParams<{ id: string }>();
  const eventId = parseInt(id || "0");
  const { user, loading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [showConfetti, setShowConfetti] = useState<number | null>(null);

  const { data, isLoading, refetch } = trpc.checkin.getStats.useQuery(
    { eventId },
    { enabled: !!user && eventId > 0, refetchInterval: 5000 }
  );

  const checkInMut = trpc.checkin.checkIn.useMutation({
    onSuccess: (_, vars) => {
      setShowConfetti(vars.guestId);
      setTimeout(() => setShowConfetti(null), 2000);
      refetch();
    },
  });

  const uncheckMut = trpc.checkin.uncheckIn.useMutation({
    onSuccess: () => refetch(),
  });

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <AmbientBackground />
        <div className="glass-card p-8 animate-pulse">
          <div className="h-6 w-48 bg-white/10 rounded mb-4" />
          <div className="h-4 w-32 bg-white/10 rounded" />
        </div>
      </div>
    );
  }

  if (!user) {
    window.location.href = getLoginUrl();
    return null;
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center relative">
        <AmbientBackground />
        <GlassCard className="p-8 text-center">
          <p className="text-white/60">Event not found or you don't have access.</p>
          <LiquidButton onClick={() => navigate("/")} className="mt-4">Back to Ledger</LiquidButton>
        </GlassCard>
      </div>
    );
  }

  const { stats, guests, rsvps, event } = data;
  const percentage = stats.total > 0 ? Math.round((stats.checkedIn / stats.total) * 100) : 0;

  // Merge guests with RSVP data for display
  const guestList = guests.map(g => {
    const rsvp = rsvps.find(r =>
      r.guestName.toLowerCase() === g.name.toLowerCase() ||
      (r.guestEmail && g.email && r.guestEmail.toLowerCase() === g.email.toLowerCase())
    );
    return {
      ...g,
      rsvpStatus: rsvp?.status || "unknown",
      isCheckedIn: g.checkedIn === "1",
    };
  });

  // Also include RSVPs that aren't in the guest list
  const guestEmails = new Set(guests.map(g => g.email?.toLowerCase()).filter(Boolean));
  const guestNames = new Set(guests.map(g => g.name.toLowerCase()));
  const standaloneRsvps = rsvps.filter(r =>
    !guestNames.has(r.guestName.toLowerCase()) &&
    !(r.guestEmail && guestEmails.has(r.guestEmail.toLowerCase()))
  );

  const filteredGuests = search
    ? guestList.filter(g =>
        g.name.toLowerCase().includes(search.toLowerCase()) ||
        g.email?.toLowerCase().includes(search.toLowerCase())
      )
    : guestList;

  const filteredRsvps = search
    ? standaloneRsvps.filter(r =>
        r.guestName.toLowerCase().includes(search.toLowerCase()) ||
        r.guestEmail?.toLowerCase().includes(search.toLowerCase())
      )
    : standaloneRsvps;

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />

      {/* Header */}
      <div className="relative z-10">
        <div className="max-w-2xl mx-auto px-4 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => navigate(`/pulse/${eventId}`)}
              className="glass-card p-2 rounded-full hover:bg-white/10 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-white/70" />
            </button>
            <div className="flex-1">
              <h1 className="text-xl font-semibold text-white tracking-tight">Check-In Mode</h1>
              <p className="text-sm text-white/50">{event.title}</p>
            </div>
            <div className="glass-card px-3 py-1.5 rounded-full flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-white/70 font-medium">LIVE</span>
            </div>
          </div>

          {/* Stats Ring */}
          <GlassCard className="p-6 mb-6">
            <div className="flex items-center gap-6">
              {/* Circular Progress */}
              <div className="relative w-24 h-24 flex-shrink-0">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke="url(#checkinGradient)" strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${percentage * 2.64} ${264 - percentage * 2.64}`}
                    className="transition-all duration-1000 ease-out"
                  />
                  <defs>
                    <linearGradient id="checkinGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#34d399" />
                      <stop offset="100%" stopColor="#10b981" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-white">{percentage}%</span>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-3 gap-3">
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-400">{stats.checkedIn}</div>
                  <div className="text-xs text-white/50 mt-1">Arrived</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-400">{stats.pending}</div>
                  <div className="text-xs text-white/50 mt-1">Pending</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-white/70">{stats.total}</div>
                  <div className="text-xs text-white/50 mt-1">Total</div>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
            <input
              type="text"
              placeholder="Search guests..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 glass-card rounded-xl text-white placeholder:text-white/30 text-sm focus:outline-none focus:ring-1 focus:ring-white/20"
            />
          </div>

          {/* Guest List */}
          <div className="space-y-2">
            <AnimatePresence mode="popLayout">
              {filteredGuests.map((guest, i) => (
                <motion.div
                  key={`guest-${guest.id}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.02, duration: 0.3 }}
                >
                  <div className={`glass-card rounded-xl p-4 flex items-center gap-3 transition-all duration-300 ${
                    guest.isCheckedIn ? "border border-emerald-500/30 bg-emerald-500/5" : ""
                  }`}>
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold ${
                      guest.isCheckedIn
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-white/10 text-white/60"
                    }`}>
                      {guest.isCheckedIn ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        guest.name.charAt(0).toUpperCase()
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white truncate">{guest.name}</span>
                        {guest.rsvpStatus === "attending" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">RSVP'd</span>
                        )}
                        {guest.rsvpStatus === "maybe" && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Maybe</span>
                        )}
                      </div>
                      {guest.email && (
                        <p className="text-xs text-white/40 truncate">{guest.email}</p>
                      )}
                      {guest.isCheckedIn && guest.checkedInAt && (
                        <p className="text-[10px] text-emerald-400/60 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          {new Date(guest.checkedInAt).toLocaleTimeString()}
                        </p>
                      )}
                    </div>

                    {/* Action Button */}
                    <button
                      onClick={() => {
                        if (guest.isCheckedIn) {
                          uncheckMut.mutate({ eventId, guestId: guest.id });
                        } else {
                          checkInMut.mutate({ eventId, guestId: guest.id });
                        }
                      }}
                      disabled={checkInMut.isPending || uncheckMut.isPending}
                      className={`relative px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                        guest.isCheckedIn
                          ? "bg-white/5 text-white/40 hover:bg-red-500/10 hover:text-red-400"
                          : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                      }`}
                    >
                      {guest.isCheckedIn ? (
                        <span className="flex items-center gap-1.5">
                          <UserX className="w-4 h-4" />
                          Undo
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5">
                          <UserCheck className="w-4 h-4" />
                          Check In
                        </span>
                      )}

                      {/* Confetti burst */}
                      {showConfetti === guest.id && (
                        <motion.div
                          initial={{ scale: 0, opacity: 1 }}
                          animate={{ scale: 3, opacity: 0 }}
                          transition={{ duration: 0.8 }}
                          className="absolute inset-0 rounded-xl border-2 border-emerald-400"
                        />
                      )}
                    </button>
                  </div>
                </motion.div>
              ))}

              {/* Standalone RSVPs (not in guest list) */}
              {filteredRsvps.length > 0 && (
                <div className="pt-4">
                  <p className="text-xs text-white/30 uppercase tracking-wider mb-2 px-1">Walk-in RSVPs</p>
                  {filteredRsvps.map((rsvp, i) => (
                    <motion.div
                      key={`rsvp-${rsvp.id}`}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02, duration: 0.3 }}
                      className="glass-card rounded-xl p-4 flex items-center gap-3 mb-2"
                    >
                      <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold text-white/60">
                        {rsvp.guestName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-white truncate block">{rsvp.guestName}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                          rsvp.status === "attending" ? "bg-emerald-500/20 text-emerald-400" :
                          rsvp.status === "maybe" ? "bg-amber-500/20 text-amber-400" :
                          "bg-red-500/20 text-red-400"
                        }`}>
                          {rsvp.status}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </AnimatePresence>

            {filteredGuests.length === 0 && filteredRsvps.length === 0 && (
              <GlassCard className="p-8 text-center">
                <Users className="w-8 h-8 text-white/20 mx-auto mb-3" />
                <p className="text-white/40 text-sm">
                  {search ? "No guests match your search" : "No guests added yet. Add guests in The Pulse."}
                </p>
              </GlassCard>
            )}
          </div>

          <div className="h-20" />
        </div>
      </div>
    </div>
  );
}
