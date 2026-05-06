/**
 * CreateChatSheet — host-only sheet for spinning up a new chat.
 *
 * Wraps `api.chats.createChat`. The "general" type auto-includes every guest
 * server-side, so the guest picker only renders for "custom". For "admin"
 * the host starts solo and adds admins via the (future) member panel.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { Hash, Shield, Sparkles, X, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { LiquidButton } from "@/components/LiquidButton";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type Props = {
  eventId: Id<"events"> | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (chatId: Id<"chats">) => void;
};

type ChatType = "general" | "admin" | "custom";

const TYPE_OPTIONS: { value: ChatType; label: string; hint: string; Icon: typeof Hash }[] = [
  { value: "general", label: "General", hint: "Auto-includes every guest", Icon: Hash },
  { value: "admin", label: "Admins", hint: "Just you for now — invite admins after", Icon: Shield },
  { value: "custom", label: "Custom", hint: "Pick specific guests", Icon: Sparkles },
];

export function CreateChatSheet({ eventId, open, onOpenChange, onCreated }: Props) {
  const [name, setName] = useState("");
  const [type, setType] = useState<ChatType>("general");
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const guests = useQuery(
    api.guests.list,
    eventId && open && type === "custom" ? { eventId } : "skip",
  );
  const createChat = useMutation(api.chats.createChat);

  // Reset form whenever the sheet closes.
  useEffect(() => {
    if (!open) {
      setName("");
      setType("general");
      setSelectedGuestIds(new Set());
      setFilter("");
      setSubmitting(false);
    }
  }, [open]);

  const filteredGuests = useMemo(() => {
    if (!guests) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return guests;
    return guests.filter((g) => {
      const haystack = `${g.name ?? ""} ${g.email ?? ""} ${g.phone ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [guests, filter]);

  const toggleGuest = (id: string) => {
    setSelectedGuestIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const trimmedName = name.trim();
  const canSubmit =
    Boolean(eventId) &&
    !submitting &&
    trimmedName.length >= 1 &&
    trimmedName.length <= 80 &&
    (type !== "custom" || selectedGuestIds.size > 0);

  const handleSubmit = async () => {
    if (!eventId || !canSubmit) return;
    setSubmitting(true);
    try {
      const memberGuestIds =
        type === "custom"
          ? (Array.from(selectedGuestIds) as Id<"guests">[])
          : undefined;
      const result = await createChat({
        eventId,
        name: trimmedName,
        type,
        memberGuestIds,
      });
      toast.success("Chat created");
      onCreated?.(result._id);
      onOpenChange(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not create the chat";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md flex flex-col gap-0 p-0 bg-background/95 backdrop-blur-xl"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border/40">
          <SheetTitle className="text-xl font-semibold tracking-tight">
            New chat
          </SheetTitle>
          <SheetDescription className="text-sm text-[oklch(0.55_0.02_265)]">
            Group conversations stay scoped to this event.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-[oklch(0.55_0.02_265)]">
              Chat name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Bridal party"
              autoFocus
              className={cn(
                "mt-1.5 w-full rounded-xl border border-border/40 bg-[oklch(1_0_0/4%)] px-3.5 py-2.5",
                "text-sm text-foreground placeholder:text-[oklch(0.5_0.02_265)]",
                "focus:outline-none focus:border-[oklch(0.75_0.15_55/40%)] focus:bg-[oklch(1_0_0/6%)]",
                "transition-colors",
              )}
            />
          </div>

          {/* Type */}
          <div>
            <label className="text-xs font-semibold tracking-wider uppercase text-[oklch(0.55_0.02_265)]">
              Type
            </label>
            <div className="mt-1.5 grid grid-cols-1 gap-2">
              {TYPE_OPTIONS.map(({ value, label, hint, Icon }) => {
                const active = type === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setType(value)}
                    className={cn(
                      "flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors",
                      active
                        ? "border-[oklch(0.75_0.15_55/45%)] bg-[oklch(0.75_0.15_55/12%)]"
                        : "border-border/40 bg-[oklch(1_0_0/3%)] hover:bg-[oklch(1_0_0/6%)]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                        active
                          ? "bg-[oklch(0.75_0.15_55/20%)] text-[oklch(0.75_0.15_55)]"
                          : "bg-[oklch(1_0_0/6%)] text-foreground/80",
                      )}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{label}</span>
                      <span className="text-xs text-[oklch(0.5_0.02_265)] mt-0.5">
                        {hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Guest picker — only for custom */}
          {type === "custom" && (
            <div>
              <div className="flex items-baseline justify-between">
                <label className="text-xs font-semibold tracking-wider uppercase text-[oklch(0.55_0.02_265)]">
                  Members
                </label>
                <span className="text-[0.6875rem] text-[oklch(0.5_0.02_265)]">
                  {selectedGuestIds.size} selected
                </span>
              </div>

              <div className="mt-1.5 relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[oklch(0.5_0.02_265)]" />
                <input
                  type="text"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Search guests…"
                  className={cn(
                    "w-full rounded-xl border border-border/40 bg-[oklch(1_0_0/4%)] pl-9 pr-3 py-2",
                    "text-sm text-foreground placeholder:text-[oklch(0.5_0.02_265)]",
                    "focus:outline-none focus:border-[oklch(0.75_0.15_55/40%)] transition-colors",
                  )}
                />
              </div>

              <div className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-border/30">
                {guests === undefined ? (
                  <div className="p-6 text-center text-xs text-[oklch(0.5_0.02_265)]">
                    Loading guests…
                  </div>
                ) : filteredGuests.length === 0 ? (
                  <div className="p-6 text-center text-xs text-[oklch(0.5_0.02_265)]">
                    {guests.length === 0
                      ? "No guests on this event yet."
                      : "No guests match that filter."}
                  </div>
                ) : (
                  <ul className="divide-y divide-border/30">
                    {filteredGuests.map((g) => {
                      const checked = selectedGuestIds.has(g._id);
                      return (
                        <li key={g._id}>
                          <label
                            className={cn(
                              "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                              checked
                                ? "bg-[oklch(0.75_0.15_55/10%)]"
                                : "hover:bg-[oklch(1_0_0/4%)]",
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleGuest(g._id)}
                              className="accent-[oklch(0.75_0.15_55)]"
                            />
                            <span className="flex flex-col min-w-0">
                              <span className="text-sm font-medium truncate">
                                {g.name || "(unnamed)"}
                              </span>
                              <span className="text-[0.6875rem] text-[oklch(0.5_0.02_265)] truncate">
                                {g.email || g.phone || ""}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border/40 px-6 py-4 flex items-center justify-end gap-2">
          <LiquidButton
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
            className="gap-2"
          >
            <X className="w-4 h-4" /> Cancel
          </LiquidButton>
          <LiquidButton
            variant="primary"
            size="sm"
            onClick={() => void handleSubmit()}
            loading={submitting}
            disabled={!canSubmit}
          >
            Create chat
          </LiquidButton>
        </div>
      </SheetContent>
    </Sheet>
  );
}
