/**
 * Composer — sticky message input for a chat thread.
 *
 * Uses `api.chats.postMessage` (the host-side Stack-Auth-gated mutation).
 * The textarea auto-grows to a 32-line cap, Enter sends, Shift+Enter inserts
 * a newline. We trim before submit; the backend would re-trim and reject
 * empties, so the disabled state is purely UX polish.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { LiquidButton } from "@/components/LiquidButton";
import { cn } from "@/lib/utils";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

type Props = {
  chatId: Id<"chats">;
  onSent?: () => void;
};

export function Composer({ chatId, onSent }: Props) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const postMessage = useMutation(api.chats.postMessage);

  // Auto-resize the textarea up to ~max-h-32.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [value]);

  // Reset focus when the active chat changes.
  useEffect(() => {
    setValue("");
    textareaRef.current?.focus();
  }, [chatId]);

  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !sending;

  const send = useCallback(async () => {
    if (!canSend) return;
    setSending(true);
    try {
      await postMessage({ chatId, body: trimmed });
      setValue("");
      // Refocus after React commits the cleared value.
      requestAnimationFrame(() => textareaRef.current?.focus());
      onSent?.();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Could not send the message";
      toast.error(msg);
    } finally {
      setSending(false);
    }
  }, [canSend, postMessage, chatId, trimmed, onSent]);

  return (
    <div
      className={cn(
        "sticky bottom-0 border-t border-border/40 bg-background/70 backdrop-blur-xl",
        "px-3 pt-3",
      )}
      style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
    >
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          placeholder="Type a message…"
          disabled={sending}
          className={cn(
            "flex-1 resize-none rounded-2xl border border-border/40 bg-[oklch(1_0_0/4%)] px-4 py-2.5",
            "text-sm leading-relaxed text-foreground placeholder:text-[oklch(0.5_0.02_265)]",
            "focus:outline-none focus:border-[oklch(0.75_0.15_55/40%)] focus:bg-[oklch(1_0_0/6%)]",
            "transition-colors max-h-32",
          )}
        />
        <LiquidButton
          variant="primary"
          size="sm"
          onClick={() => void send()}
          disabled={!canSend}
          loading={sending}
          className="h-10 w-10 !p-0 flex items-center justify-center shrink-0"
        >
          <Send className="w-4 h-4" />
        </LiquidButton>
      </div>
    </div>
  );
}
