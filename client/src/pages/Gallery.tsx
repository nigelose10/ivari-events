/**
 * Gallery — preview/sharing surface.
 *
 * TODO (deferred — see DESIGN-AUDIT.md):
 * - [ ] Lock grid to 12-column with var(--space-6) gap
 * - [ ] Replace any `text-[oklch(...265)]` cool-gray literals with --text-secondary
 * - [ ] Apply .display-3 to section heading
 * - [ ] Card hover: lift + glow, never scale (per tokens)
 */
import { useAuth } from "@/_core/hooks/useAuth";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useMemo } from "react";
import { GlassCard } from "@/components/GlassCard";
import { AmbientBackground } from "@/components/AmbientBackground";
import { motion } from "framer-motion";
import {
  ArrowLeft, Users, Calendar, Image, ChevronRight, Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";
import { format } from "date-fns";

const t = { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const };

export default function Gallery() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const eventsRaw = useQuery(api.events.list);
  const events = useMemo(
    () => (eventsRaw ?? []).map((e: any) => ({ ...e, id: e._id })),
    [eventsRaw],
  );

  const pastEvents = events.filter(e => e.status === "past");
  const activeEvents = events.filter(e => e.status === "active");
  const allEvents = events.filter(e => e.status !== "cancelled");

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />

      {/* Header */}
      <header className="relative z-10 px-6 pt-12 pb-8">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 text-[oklch(0.5_0.02_265)] hover:text-foreground transition-colors duration-300 mb-8"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Events</span>
          </button>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={t}
          >
            <p className="text-xs font-semibold tracking-[0.3em] uppercase text-[oklch(0.75_0.15_55)] mb-3">
              Memory Weave
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold tracking-[-0.04em] mb-3">
              The Gallery
            </h1>
            <p className="text-[oklch(0.55_0.02_265)] text-lg font-light max-w-lg">
              A tapestry of gatherings past and present. Each event leaves an imprint.
            </p>
          </motion.div>
        </div>
      </header>

      {/* Active Events Section */}
      {activeEvents.length > 0 && (
        <section className="relative z-10 px-6 mb-12">
          <div className="max-w-5xl mx-auto">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...t, delay: 0.15 }}
              className="text-xs font-semibold tracking-[0.25em] uppercase text-[oklch(0.5_0.02_265)] mb-5"
            >
              Currently Live
            </motion.h2>
            <div className="flex gap-5 overflow-x-auto pb-4 -mx-6 px-6 snap-x snap-mandatory scrollbar-hide">
              {activeEvents.map((event, i) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...t, delay: 0.2 + i * 0.08 }}
                  className="snap-start flex-shrink-0 w-[320px] sm:w-[380px] cursor-pointer group"
                  onClick={() => navigate(`/pulse/${event.id}`)}
                >
                  <div className="relative rounded-2xl overflow-hidden border border-[oklch(1_0_0/8%)] bg-[oklch(1_0_0/3%)] backdrop-blur-xl transition-all duration-500 group-hover:border-[oklch(0.75_0.15_55/30%)] group-hover:shadow-[0_0_40px_oklch(0.75_0.15_55/10%)]">
                    {/* Hero Image */}
                    <div className="relative h-48 overflow-hidden">
                      {event.imageUrl ? (
                        <>
                          <img src={event.imageUrl} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                          <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.04_0.01_285)] via-transparent to-transparent" />
                        </>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[oklch(0.12_0.04_55)] to-[oklch(0.08_0.02_285)]" />
                      )}
                      <div className="absolute top-3 left-3">
                        <span className="text-[0.625rem] font-semibold px-2.5 py-1 rounded-full bg-[oklch(0.5_0.15_160/20%)] text-[oklch(0.7_0.15_160)] border border-[oklch(0.5_0.15_160/30%)] backdrop-blur-md">
                          LIVE
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      <h3 className="font-bold text-lg tracking-[-0.02em] mb-2 group-hover:text-[oklch(0.75_0.15_55)] transition-colors duration-300">
                        {event.title}
                      </h3>
                      <div className="flex items-center gap-4 text-xs text-[oklch(0.5_0.02_265)]">
                        {event.eventDate && (
                          <span className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            {format(new Date(event.eventDate), "MMM d")}
                          </span>
                        )}
                        <span className="flex items-center gap-1.5">
                          <Users className="w-3 h-3" />
                          {event.rsvpCounts?.total || 0} RSVPs
                        </span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Past Events Section — Memory Weave */}
      <section className="relative z-10 px-6 mb-12">
        <div className="max-w-5xl mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...t, delay: 0.25 }}
            className="text-xs font-semibold tracking-[0.25em] uppercase text-[oklch(0.5_0.02_265)] mb-5"
          >
            Past Gatherings
          </motion.h2>

          {pastEvents.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...t, delay: 0.3 }}
            >
              <GlassCard className="p-12 text-center">
                <Sparkles className="w-10 h-10 mx-auto mb-4 text-[oklch(0.3_0.02_265)]" />
                <h3 className="text-lg font-semibold mb-2">No memories yet</h3>
                <p className="text-sm text-[oklch(0.45_0.02_265)] max-w-sm mx-auto">
                  When events conclude, they appear here as part of your gathering history.
                </p>
              </GlassCard>
            </motion.div>
          ) : (
            <div className="flex gap-5 overflow-x-auto pb-4 -mx-6 px-6 snap-x snap-mandatory scrollbar-hide">
              {pastEvents.map((event, i) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ ...t, delay: 0.3 + i * 0.08 }}
                  className="snap-start flex-shrink-0 w-[320px] sm:w-[380px] cursor-pointer group"
                  onClick={() => event.memoryWallEnabled === "1" ? navigate(`/memory/${event.slug}`) : navigate(`/pulse/${event.id}`)}
                >
                  <div className="relative rounded-2xl overflow-hidden border border-[oklch(1_0_0/6%)] bg-[oklch(1_0_0/2%)] backdrop-blur-xl transition-all duration-500 group-hover:border-[oklch(1_0_0/12%)] group-hover:shadow-[0_0_30px_oklch(1_0_0/5%)]">
                    {/* Hero Image with Desaturated Overlay */}
                    <div className="relative h-48 overflow-hidden">
                      {event.imageUrl ? (
                        <>
                          <img src={event.imageUrl} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 grayscale-[30%] group-hover:grayscale-0" />
                          <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.04_0.01_285)] via-[oklch(0.04_0.01_285/40%)] to-transparent" />
                        </>
                      ) : (
                        <div className="w-full h-full bg-gradient-to-br from-[oklch(0.1_0.02_55)] to-[oklch(0.06_0.01_285)]" />
                      )}
                      {event.memoryWallEnabled === "1" && (
                        <div className="absolute top-3 right-3">
                          <span className="text-[0.625rem] font-semibold px-2.5 py-1 rounded-full bg-[oklch(0.65_0.18_300/15%)] text-[oklch(0.65_0.18_300)] border border-[oklch(0.65_0.18_300/25%)] backdrop-blur-md flex items-center gap-1">
                            <Image className="w-3 h-3" /> Photos
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="p-5">
                      <h3 className="font-bold text-lg tracking-[-0.02em] mb-2 group-hover:text-foreground transition-colors duration-300 text-[oklch(0.7_0.02_265)]">
                        {event.title}
                      </h3>
                      {event.description && (
                        <p className="text-xs text-[oklch(0.45_0.02_265)] line-clamp-2 mb-3">{event.description}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-xs text-[oklch(0.45_0.02_265)]">
                          {event.eventDate && (
                            <span className="flex items-center gap-1.5">
                              <Calendar className="w-3 h-3" />
                              {format(new Date(event.eventDate), "MMM d, yyyy")}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <Users className="w-3 h-3" />
                            {event.rsvpCounts?.total || 0}
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[oklch(0.35_0.02_265)] group-hover:text-[oklch(0.75_0.15_55)] transition-colors duration-300" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* All Events Grid */}
      {allEvents.length > 0 && (
        <section className="relative z-10 px-6 pb-16">
          <div className="max-w-5xl mx-auto">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...t, delay: 0.35 }}
              className="text-xs font-semibold tracking-[0.25em] uppercase text-[oklch(0.5_0.02_265)] mb-5"
            >
              All Events ({allEvents.length})
            </motion.h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {allEvents.map((event, i) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...t, delay: 0.4 + i * 0.05 }}
                  className="cursor-pointer group"
                  onClick={() => navigate(`/pulse/${event.id}`)}
                >
                  <GlassCard hover className="overflow-hidden">
                    {event.imageUrl && (
                      <div className="h-32 overflow-hidden">
                        <img src={event.imageUrl} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-[0.5625rem] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          event.status === 'active' ? 'badge-active' : event.status === 'draft' ? 'badge-draft' : event.status === 'past' ? 'badge-past' : 'badge-cancelled'
                        }`}>{event.status}</span>
                      </div>
                      <h3 className="font-semibold text-sm truncate mb-1">{event.title}</h3>
                      <div className="flex items-center gap-3 text-[0.6875rem] text-[oklch(0.45_0.02_265)]">
                        {event.eventDate && (
                          <span>{format(new Date(event.eventDate), "MMM d")}</span>
                        )}
                        <span>{event.rsvpCounts?.total || 0} RSVPs</span>
                      </div>
                    </div>
                  </GlassCard>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
