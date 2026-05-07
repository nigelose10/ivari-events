/**
 * EventDiscovery — public-event search with one-tap join.
 *
 * Lives on Home above the events list (signed-in users only). Debounced
 * typeahead against `api.events.searchPublic` — Convex full-text search,
 * no extra library. Each hit shows title, date, location, guest count, and
 * a Join button that calls `api.events.joinPublicEvent`.
 *
 * After a successful join, we navigate to the event's portal so the user
 * lands on the event detail. Their `myClaimedEvents` query (Home) will
 * already include the new event by the time they navigate back.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useLocation } from "wouter";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { Search, Calendar, MapPin, Users, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function EventDiscovery() {
  const [, navigate] = useLocation();
  const [raw, setRaw] = useState("");
  const [debounced, setDebounced] = useState("");
  const [joining, setJoining] = useState<string | null>(null);

  // 250 ms debounce — keeps the search index from running on every keypress
  // without making the result feel sluggish.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(raw.trim()), 250);
    return () => clearTimeout(t);
  }, [raw]);

  const results = useQuery(
    api.events.searchPublic,
    debounced.length >= 2 ? { q: debounced } : "skip",
  );

  const joinPublic = useMutation(api.events.joinPublicEvent);

  const isLoading = debounced.length >= 2 && results === undefined;

  const showResults = useMemo(() => raw.trim().length >= 2, [raw]);

  return (
    <div className="space-y-3 mb-6" data-tour="home-discover">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[oklch(0.5_0.02_265)]" />
        <input
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="Find an event by name…"
          className="glass-input pl-10"
          aria-label="Find a public event"
        />
      </div>

      {showResults && (
        <GlassCard variant="subtle" className="p-3">
          {isLoading ? (
            <p className="text-xs text-[oklch(0.5_0.02_265)] py-2 px-2">Searching…</p>
          ) : (results?.length ?? 0) === 0 ? (
            <p className="text-xs text-[oklch(0.5_0.02_265)] py-2 px-2">
              No public events match. Ask the host for an invite link.
            </p>
          ) : (
            <div className="space-y-2">
              {results!.map((e) => {
                const date =
                  typeof e.eventDate === "number"
                    ? format(new Date(e.eventDate), "EEE, MMM d 'at' h:mm a")
                    : null;
                return (
                  <div
                    key={e._id}
                    className="flex items-stretch gap-3 p-2.5 rounded-xl bg-[oklch(1_0_0/3%)] border border-[oklch(1_0_0/6%)]"
                  >
                    {e.imageUrl ? (
                      <img
                        src={e.imageUrl}
                        alt=""
                        className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                      />
                    ) : (
                      <div
                        className="w-14 h-14 rounded-lg flex-shrink-0"
                        style={{
                          background: e.themeColor
                            ? `linear-gradient(135deg, ${e.themeColor}40, ${e.themeColor}10)`
                            : "oklch(1 0 0 / 6%)",
                        }}
                      />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{e.title}</div>
                      <div className="flex items-center gap-3 text-[11px] text-[oklch(0.5_0.02_265)] mt-0.5">
                        {date && (
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {date}
                          </span>
                        )}
                        {e.locationName && (
                          <span className="inline-flex items-center gap-1 truncate">
                            <MapPin className="w-3 h-3" /> {e.locationName}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3 h-3" /> {e.guestCount}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span title="Open event">
                        <LiquidButton
                          size="sm"
                          variant="glass"
                          onClick={() => navigate(`/portal/${e.slug}`)}
                        >
                          <ArrowRight className="w-4 h-4" />
                        </LiquidButton>
                      </span>
                      <LiquidButton
                        size="sm"
                        loading={joining === e._id}
                        onClick={async () => {
                          setJoining(e._id);
                          try {
                            const res = await joinPublic({
                              eventId: e._id as Id<"events">,
                            });
                            if (res.state === "you-host-this") {
                              toast.info("You host this event");
                            } else if (res.state === "already-joined") {
                              toast.info("You're already on the list");
                            } else {
                              toast.success("Added to your events");
                            }
                            navigate(`/portal/${e.slug}`);
                            setRaw("");
                          } catch (err: any) {
                            toast.error(err?.message ?? "Couldn't join");
                          } finally {
                            setJoining(null);
                          }
                        }}
                      >
                        Join
                      </LiquidButton>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>
      )}
    </div>
  );
}
