/**
 * PublicNameClaim — name-list claim UX for `/portal/:slug` when the event is
 * public AND `claimMode === "name-list"`.
 *
 * Anonymous-friendly: visitors don't need an account. They:
 *   1. Type their name (debounced typeahead against `searchGuestsByName`)
 *   2. Tap the row that matches → `claimByName` with their localStorage
 *      `deviceKey` (or Stack JWT if signed in).
 *   3. See "You're at Table X" — Portal then unlocks memory wall, friends, etc.
 *
 * If the user later signs up, we promote the claim by re-running with auth.
 *
 * Design tokens come from DESIGN.md — glass surface + Space Grotesk feel
 * (the existing app already loads Geist; we follow the existing tokens).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@stackframe/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { Search, BadgeCheck, AlertCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getDeviceKey } from "@/lib/deviceKey";

interface Props {
  slug: string;
  /** Called once a claim succeeds with the resulting table assignment. */
  onClaimed: (claim: {
    guestId: Id<"guests">;
    name: string;
    tableNumber?: string;
    seatNumber?: string;
  }) => void;
}

export function PublicNameClaim({ slug, onClaimed }: Props) {
  const stackUser = useUser();
  const [raw, setRaw] = useState("");
  const [debounced, setDebounced] = useState("");
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // Debounce 200ms — name-list searches are cheap (Convex search index)
  // but typing every keystroke still feels twitchy.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(raw.trim()), 200);
    return () => clearTimeout(t);
  }, [raw]);

  const results = useQuery(
    api.events.searchGuestsByName,
    debounced.length >= 2 ? { slug, q: debounced } : "skip",
  );

  const claim = useMutation(api.events.claimByName);

  const isLoading = debounced.length >= 2 && results === undefined;

  const stackName = useMemo(() => {
    return stackUser?.displayName ?? "";
  }, [stackUser]);

  // First render: prefill with the signed-in user's name (if any) so signed-in
  // visitors don't have to retype.
  useEffect(() => {
    if (!raw && stackName) setRaw(stackName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stackName]);

  return (
    <GlassCard variant="elevated" className="p-6 sm:p-8 space-y-5 max-w-md w-full">
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl bg-[oklch(0.78_0.13_60/14%)] flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-[oklch(0.78_0.13_60)]" />
        </div>
        <div>
          <h2 className="text-base font-semibold tracking-[-0.01em]">Find your seat</h2>
          <p className="text-xs text-[oklch(0.55_0.02_265)]">
            Type your name as it appears on the invitation
          </p>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[oklch(0.5_0.02_265)]" />
        <input
          type="text"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder="e.g. Jane Doe"
          className="glass-input pl-10"
          autoFocus
          autoComplete="off"
          aria-label="Search the guest list"
        />
      </div>

      {/* Empty state — too few chars */}
      {raw.trim().length > 0 && raw.trim().length < 2 && (
        <p className="text-xs text-[oklch(0.5_0.02_265)]">
          Keep typing — at least two characters.
        </p>
      )}

      {/* Loading */}
      {isLoading && (
        <p className="text-xs text-[oklch(0.5_0.02_265)] py-2">Searching the list…</p>
      )}

      {/* Results */}
      {results && results.length === 0 && debounced.length >= 2 && (
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[oklch(1_0_0/3%)] border border-[oklch(1_0_0/6%)]">
          <AlertCircle className="w-4 h-4 text-[oklch(0.7_0.15_25)] mt-0.5 flex-shrink-0" />
          <div className="text-xs text-[oklch(0.65_0.02_265)] leading-relaxed">
            No matches. Try just your last name, or a title like "Pastor".
            If you're still stuck, ask the host for a personal invitation link.
          </div>
        </div>
      )}

      {results && results.length > 0 && (
        <div className="space-y-2">
          {results.map((g) => {
            const taken = g.isClaimed;
            return (
              <button
                key={g._id}
                type="button"
                disabled={taken || claimingId !== null}
                onClick={async () => {
                  setClaimingId(g._id);
                  try {
                    const deviceKey = stackUser ? undefined : getDeviceKey();
                    const res = await claim({
                      slug,
                      guestId: g._id as Id<"guests">,
                      deviceKey,
                    });
                    if (res.state === "taken") {
                      toast.error("That seat is already claimed.");
                    } else {
                      onClaimed({
                        guestId: g._id as Id<"guests">,
                        name: res.name ?? g.name,
                        tableNumber: res.tableNumber ?? g.tableNumber,
                        seatNumber: res.seatNumber ?? g.seatNumber,
                      });
                    }
                  } catch (err: any) {
                    toast.error(err?.message ?? "Couldn't confirm");
                  } finally {
                    setClaimingId(null);
                  }
                }}
                className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-colors ${
                  taken
                    ? "bg-[oklch(1_0_0/2%)] border-[oklch(1_0_0/6%)] opacity-60 cursor-not-allowed"
                    : "bg-[oklch(1_0_0/3%)] border-[oklch(1_0_0/8%)] hover:bg-[oklch(0.78_0.13_60/8%)] hover:border-[oklch(0.78_0.13_60/30%)]"
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{g.name}</div>
                  <div className="text-[11px] text-[oklch(0.5_0.02_265)] mt-0.5">
                    {g.tableNumber ? `Table ${g.tableNumber}` : "Table TBD"}
                    {g.seatNumber ? ` · Seat ${g.seatNumber}` : ""}
                    {taken ? " · already claimed" : ""}
                  </div>
                </div>
                {!taken && claimingId !== g._id && (
                  <BadgeCheck className="w-4 h-4 text-[oklch(0.78_0.13_60)] flex-shrink-0" />
                )}
                {claimingId === g._id && (
                  <span className="text-[10px] uppercase tracking-[0.15em] text-[oklch(0.5_0.02_265)]">
                    Claiming…
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!stackUser && (
        <p className="text-[11px] text-[oklch(0.45_0.02_265)] leading-relaxed">
          You can confirm your name without an account. We'll remember your
          seat on this device. Sign up later if you want to host your own
          event.
        </p>
      )}
    </GlassCard>
  );
}

export default PublicNameClaim;
