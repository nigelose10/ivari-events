/**
 * AdminsPanel — host-only co-host management for an event.
 *
 * Add an admin by email; the target must already have an ivari account
 * (i.e. signed in once so their `users` row exists). The server does the
 * email→user lookup and refuses if no match.
 *
 * Co-hosts inherit full Pulse access: edit event, manage guest list,
 * moderate Memory Wall, send notifications. They cannot remove the host
 * or transfer ownership.
 */
import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { Shield, Plus, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  eventId: Id<"events">;
}

export function AdminsPanel({ eventId }: Props) {
  const [email, setEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const cohosts = useQuery(api.events.listCoHosts, { eventId }) ?? [];
  const add = useMutation(api.events.addCoHostByEmail);
  const remove = useMutation(api.events.removeCoHost);

  const handleAdd = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setAdding(true);
    try {
      const res = await add({ eventId, email: trimmed });
      if (!res.ok) {
        toast.error(res.reason);
      } else {
        toast.success("Admin added");
        setEmail("");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to add admin");
    } finally {
      setAdding(false);
    }
  };

  return (
    <GlassCard className="overflow-hidden">
      <div className="px-6 pt-5 pb-3 flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-[oklch(0.7_0.15_220/12%)] flex items-center justify-center">
          <Shield className="w-3.5 h-3.5 text-[oklch(0.7_0.15_220)]" />
        </div>
        <div>
          <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[oklch(0.5_0.02_265)]">
            Admins
          </p>
          <p className="text-[11px] text-[oklch(0.5_0.02_265)] mt-0.5">
            Co-hosts with full Pulse access
          </p>
        </div>
      </div>

      <div className="px-6 pb-5">
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="email@example.com"
            className="glass-input flex-1"
            autoComplete="off"
          />
          <LiquidButton
            size="sm"
            disabled={!email.trim() || adding}
            loading={adding}
            onClick={handleAdd}
            className="gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add
          </LiquidButton>
        </div>
        <p className="text-[10px] text-[oklch(0.5_0.02_265)] mt-2 leading-relaxed">
          The person must have signed in to ivari at least once. Co-hosts can
          edit, moderate, and message — they can't remove you as the host.
        </p>
      </div>

      {cohosts.length > 0 && (
        <div className="border-t border-[oklch(1_0_0/6%)] divide-y divide-[oklch(1_0_0/6%)]">
          {cohosts.map((u) => (
            <div
              key={u._id}
              className="px-6 py-3 flex items-center gap-3 group"
            >
              {u.avatarUrl ? (
                <img
                  src={u.avatarUrl}
                  alt=""
                  className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[oklch(1_0_0/8%)] flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {u.username ? `@${u.username}` : u.name || "Co-host"}
                </p>
                {u.email && (
                  <p className="text-[11px] text-[oklch(0.5_0.02_265)] truncate">
                    {u.email}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (!confirm(`Remove ${u.name || u.email} as an admin?`)) return;
                  try {
                    await remove({ eventId, userId: u._id as Id<"users"> });
                    toast.success("Admin removed");
                  } catch (err: any) {
                    toast.error(err?.message ?? "Failed to remove");
                  }
                }}
                className="p-1.5 rounded-lg hover:bg-[oklch(0.7_0.15_25/12%)] text-[oklch(0.5_0.02_265)] hover:text-[oklch(0.7_0.15_25)] transition-colors opacity-0 group-hover:opacity-100"
                title="Remove admin"
                aria-label="Remove admin"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

export default AdminsPanel;
