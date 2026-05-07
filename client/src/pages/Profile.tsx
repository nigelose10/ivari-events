/**
 * Profile — account-management surface.
 *
 * What lives here (ivari-side):
 *   - Username (the public handle on Memory Wall posts and friend search)
 *   - Tagline (one-line bio)
 *   - Friends list + pending requests + add-by-username search
 *
 * What lives at Stack Auth `/handler/account-settings` (linked from this page):
 *   - Display name, email, password, profile picture, OAuth links, sign-out
 *
 * Two surfaces because Stack owns auth-grade identity (canonical source for
 * name/email/avatar) and we own social/app metadata. Splitting them keeps
 * Stack updates flowing in via `ensureUser` without us second-guessing.
 */
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { useUser } from "@stackframe/react";
import { useLocation } from "wouter";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { AmbientBackground } from "@/components/AmbientBackground";
import { ArrowLeft, ExternalLink, UserPlus, Check, X, Search } from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const [, navigate] = useLocation();
  const stackUser = useUser();
  const me = useQuery(api.users.me, stackUser ? {} : "skip");

  const [usernameDraft, setUsernameDraft] = useState("");
  const [taglineDraft, setTaglineDraft] = useState("");
  const [searchQ, setSearchQ] = useState("");

  // Hydrate drafts from server data once it arrives.
  const username = me?.username ?? "";
  const tagline = me?.tagline ?? "";
  // useMemo so we don't reset drafts on every render.
  useMemo(() => {
    setUsernameDraft(username);
    setTaglineDraft(tagline);
  }, [username, tagline]);

  const friends = useQuery(api.friends.list, stackUser ? {} : "skip") ?? [];
  const pending = useQuery(api.friends.pendingRequests, stackUser ? {} : "skip") ?? [];
  const searchResults = useQuery(
    api.friends.searchUsers,
    searchQ.trim().length >= 2 ? { prefix: searchQ.trim() } : "skip",
  );

  const updateProfile = useMutation(api.users.updateProfile);
  const sendRequest = useMutation(api.friends.sendRequest);
  const acceptRequest = useMutation(api.friends.acceptRequest);
  const removeFriend = useMutation(api.friends.removeFriend);

  const [saving, setSaving] = useState(false);

  if (!stackUser) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <AmbientBackground />
        <GlassCard className="p-10 text-center max-w-sm">
          <h2 className="text-xl font-semibold mb-3">Sign in</h2>
          <p className="text-sm text-[oklch(0.5_0.02_265)] mb-6">
            Sign in with your ivari account to manage your profile.
          </p>
          <LiquidButton onClick={() => navigate("/handler/sign-in")} className="w-full">
            Continue
          </LiquidButton>
        </GlassCard>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        username: usernameDraft.trim() || undefined,
        tagline: taglineDraft.trim() || undefined,
      });
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

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

        <div className="flex items-center gap-4 mb-8">
          {me?.avatarUrl ? (
            <img
              src={me.avatarUrl}
              alt=""
              className="w-16 h-16 rounded-full object-cover border border-[oklch(1_0_0/15%)]"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[oklch(1_0_0/8%)]" />
          )}
          <div>
            <h1 className="text-3xl font-bold tracking-[-0.03em]">
              {me?.name || stackUser.displayName || "Your profile"}
            </h1>
            <p className="text-sm text-[oklch(0.5_0.02_265)]">
              {me?.email || stackUser.primaryEmail}
            </p>
          </div>
        </div>

        {/* ─── ivari-side fields ─── */}
        <GlassCard className="p-6 sm:p-8 space-y-5 mb-6">
          <h2 className="text-base font-semibold">Public profile</h2>

          <div>
            <label className="text-xs font-semibold tracking-[0.15em] uppercase text-[oklch(0.5_0.02_265)] mb-2 block">
              Username
            </label>
            <input
              type="text"
              value={usernameDraft}
              onChange={(e) => setUsernameDraft(e.target.value)}
              placeholder="your-handle"
              className="glass-input"
              maxLength={24}
            />
            <p className="text-[10px] text-[oklch(0.5_0.02_265)] mt-2">
              3–24 characters. Letters, numbers, _ and . only. Shown on Memory Wall posts.
            </p>
          </div>

          <div>
            <label className="text-xs font-semibold tracking-[0.15em] uppercase text-[oklch(0.5_0.02_265)] mb-2 block">
              Tagline
            </label>
            <input
              type="text"
              value={taglineDraft}
              onChange={(e) => setTaglineDraft(e.target.value)}
              placeholder="One line about you"
              className="glass-input"
              maxLength={140}
            />
          </div>

          <LiquidButton onClick={handleSave} loading={saving} className="w-full">
            Save changes
          </LiquidButton>
        </GlassCard>

        {/* ─── Stack-side link-out ─── */}
        <GlassCard className="p-6 sm:p-8 mb-6">
          <h2 className="text-base font-semibold mb-2">Account &amp; security</h2>
          <p className="text-sm text-[oklch(0.5_0.02_265)] mb-4">
            Display name, email, password, photo, and connected accounts live in your
            ivari account settings.
          </p>
          <button
            onClick={() => navigate("/handler/account-settings")}
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-[oklch(0.85_0.15_55)] transition-colors"
          >
            Open account settings
            <ExternalLink className="w-4 h-4" />
          </button>
        </GlassCard>

        {/* ─── Friends ─── */}
        <GlassCard className="p-6 sm:p-8 mb-6">
          <h2 className="text-base font-semibold mb-4">Friends</h2>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[oklch(0.5_0.02_265)]" />
            <input
              type="text"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              placeholder="Search by username"
              className="glass-input pl-10"
            />
          </div>

          {searchQ.trim().length >= 2 && (
            <div className="space-y-2 mb-6">
              {(searchResults ?? []).length === 0 ? (
                <p className="text-xs text-[oklch(0.5_0.02_265)]">No matches.</p>
              ) : (
                (searchResults ?? []).map((u) => (
                  <FriendRow
                    key={u._id}
                    name={u.username ? `@${u.username}` : u.name || "ivari user"}
                    sub={u.tagline}
                    avatarUrl={u.avatarUrl}
                    action={
                      <LiquidButton
                        size="sm"
                        variant="glass"
                        onClick={async () => {
                          try {
                            const r = await sendRequest({ targetUserId: u._id as Id<"users"> });
                            if (r.state === "request-sent") toast.success("Friend request sent");
                            else if (r.state === "already-friends") toast.info("Already friends");
                            else if (r.state === "request-already-sent") toast.info("Request already sent");
                            else toast.success("You're now friends");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed");
                          }
                        }}
                      >
                        <UserPlus className="w-4 h-4" />
                        Add
                      </LiquidButton>
                    }
                  />
                ))
              )}
            </div>
          )}

          {/* Pending requests */}
          {pending.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[oklch(0.5_0.02_265)] mb-2">
                Pending requests
              </h3>
              <div className="space-y-2">
                {pending.map((u) => (
                  <FriendRow
                    key={u._id}
                    name={u.username ? `@${u.username}` : u.name || "ivari user"}
                    avatarUrl={u.avatarUrl}
                    action={
                      <div className="flex gap-1">
                        <LiquidButton
                          size="sm"
                          onClick={async () => {
                            try {
                              await acceptRequest({ fromUserId: u._id as Id<"users"> });
                              toast.success("Friend added");
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Failed");
                            }
                          }}
                        >
                          <Check className="w-4 h-4" />
                        </LiquidButton>
                        <LiquidButton
                          size="sm"
                          variant="glass"
                          onClick={async () => {
                            try {
                              await removeFriend({ otherUserId: u._id as Id<"users"> });
                              toast.success("Request removed");
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Failed");
                            }
                          }}
                        >
                          <X className="w-4 h-4" />
                        </LiquidButton>
                      </div>
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* Accepted */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-[0.15em] text-[oklch(0.5_0.02_265)] mb-2">
              Your friends ({friends.length})
            </h3>
            {friends.length === 0 ? (
              <p className="text-xs text-[oklch(0.5_0.02_265)]">
                No friends yet. Search above to find people on ivari.
              </p>
            ) : (
              <div className="space-y-2">
                {friends.map((u) => (
                  <FriendRow
                    key={u._id}
                    name={u.username ? `@${u.username}` : u.name || "ivari user"}
                    sub={u.tagline}
                    avatarUrl={u.avatarUrl}
                    action={
                      <LiquidButton
                        size="sm"
                        variant="glass"
                        onClick={async () => {
                          try {
                            await removeFriend({ otherUserId: u._id as Id<"users"> });
                            toast.success("Removed");
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed");
                          }
                        }}
                      >
                        Remove
                      </LiquidButton>
                    }
                  />
                ))}
              </div>
            )}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function FriendRow({
  name,
  sub,
  avatarUrl,
  action,
}: {
  name: string;
  sub?: string;
  avatarUrl?: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[oklch(1_0_0/3%)] border border-[oklch(1_0_0/6%)]">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
      ) : (
        <div className="w-9 h-9 rounded-full bg-[oklch(1_0_0/8%)]" />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        {sub ? (
          <p className="text-xs text-[oklch(0.5_0.02_265)] truncate">{sub}</p>
        ) : null}
      </div>
      <div className="flex-shrink-0">{action}</div>
    </div>
  );
}
