/**
 * SeatingChart — V10 wedding-tier live seating editor.
 *
 * Apple Numbers / Mural-quality drag-drop polish, real-time multi-host sync
 * via Convex (`useQuery` auto-subscribes — peer hosts editing the same event
 * see changes within ~100ms).
 *
 * Layout
 * ──────
 * - Top bar: Add Table, Auto-arrange, Export CSV.
 * - Left rail: "Unassigned" guests (vertical list of draggable cards).
 * - Right canvas: tables. Each table is a droppable zone; assigned guests
 *   render as smaller chips inside, also draggable (table→table or table→rail).
 *
 * Drag UX (powered by @dnd-kit/core)
 * ──────────────────────────────────
 * - Drag a guest from the rail → drop on a table → assignTable mutation.
 * - Drag a guest from a table → another table → re-assigns.
 * - Drag a guest from a table → back to "Unassigned" rail → unassigns.
 * - PointerSensor + KeyboardSensor + activation distance (8px) means small
 *   taps still register as clicks, not drags.
 * - DragOverlay shows a polished ghost preview that follows the cursor.
 * - Active drop target gets an amber glow ring (warm brand palette — never
 *   blue per the design system).
 * - Mobile fallback: dnd-kit's TouchSensor handles long-press to pick up,
 *   then drop. (Pure dnd-kit interaction; no custom modal needed.)
 *
 * Real-time + optimistic updates
 * ──────────────────────────────
 * - The component reads from `props.guests` which the parent wires via
 *   useQuery(api.guests.list). Convex subscriptions push updates to all
 *   open clients automatically.
 * - When `assignTable` is called, dnd-kit's natural pattern is for the UI
 *   to update on the next render after the mutation resolves. To get
 *   "feels-instant" we keep a small `optimisticOverrides` map keyed by
 *   guestId that survives until the server-confirmed value matches.
 *
 * Security
 * ────────
 * - All mutations are IDOR-checked server-side (assignTable re-loads guest,
 *   re-loads its event, asserts hostId === user._id).
 * - `updateTablesConfig` requires event ownership.
 */
import { useMemo, useState, useCallback, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  closestCenter,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { motion, AnimatePresence } from "framer-motion";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import {
  Plus,
  Sparkles,
  Download,
  Users,
  GripVertical,
  Utensils,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export interface SeatingGuest {
  id: string;
  _id?: string;
  name: string;
  tableNumber?: string;
  seatNumber?: string;
  dietaryNotes?: string;
}

export interface SeatingTable {
  id: string;
  label: string;
  capacity?: number;
  shape?: "round" | "rect" | "oval";
}

interface SeatingChartProps {
  eventId: Id<"events">;
  guests: SeatingGuest[];
  tables: SeatingTable[];
}

const UNASSIGNED_ID = "__unassigned__";
const EASE = [0.22, 1, 0.36, 1] as const;

// Warm amber — brand palette. Mirrors the tokens in index.css. We use raw
// oklch here so the drop-target glow matches existing GlassCard amber accents.
const AMBER = "oklch(0.75 0.15 55)";

// ───────────────────────────────────────────────────────────────────────────
// Initials helper — colored avatar circles for guests.
// ───────────────────────────────────────────────────────────────────────────
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

// ───────────────────────────────────────────────────────────────────────────
// Draggable guest card (used in BOTH the rail and inside tables).
// ───────────────────────────────────────────────────────────────────────────
interface GuestCardProps {
  guest: SeatingGuest;
  compact?: boolean; // table-chip variant
  isDragging?: boolean;
}

function GuestCardInner({ guest, compact, isDragging }: GuestCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-xl transition-shadow select-none",
        compact
          ? "px-2.5 py-1.5 bg-[oklch(0.12_0.01_285)] border border-[oklch(1_0_0/8%)]"
          : "px-3 py-2.5 bg-[oklch(0.10_0.01_285)] border border-[oklch(1_0_0/6%)]",
        isDragging && "shadow-2xl shadow-[oklch(0.75_0.15_55/30%)]",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full font-semibold shrink-0",
          compact
            ? "w-6 h-6 text-[10px]"
            : "w-8 h-8 text-[11px]",
        )}
        style={{
          background:
            "linear-gradient(135deg, oklch(0.75 0.15 55) 0%, oklch(0.65 0.18 35) 100%)",
          color: "oklch(0.04 0.01 285)",
        }}
      >
        {initials(guest.name)}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-medium",
            compact ? "text-[12px]" : "text-[13px]",
          )}
        >
          {guest.name}
        </p>
        {!compact && guest.dietaryNotes && (
          <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] text-[oklch(0.65_0.12_55)]">
            <Utensils className="w-2.5 h-2.5" /> {guest.dietaryNotes}
          </span>
        )}
      </div>
      {!compact && (
        <GripVertical className="w-3.5 h-3.5 text-[oklch(0.45_0.02_265)] shrink-0" />
      )}
    </div>
  );
}

function DraggableGuest({ guest, compact }: GuestCardProps) {
  const { attributes, listeners, setNodeRef, isDragging, transform } =
    useDraggable({ id: guest.id, data: { guest } });

  // Hide the original while dragging — the DragOverlay renders the visible ghost.
  const style: React.CSSProperties = {
    opacity: isDragging ? 0 : 1,
    transform: transform
      ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
      : undefined,
    cursor: "grab",
    touchAction: "none", // critical for mobile: prevents page scroll on drag
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <GuestCardInner guest={guest} compact={compact} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Droppable surfaces
// ───────────────────────────────────────────────────────────────────────────
interface DroppableProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  isOver?: boolean;
}

function DroppableSurface({ id, children, className }: DroppableProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative transition-all",
        isOver && "ring-2 ring-offset-0",
        className,
      )}
      style={
        isOver
          ? {
              boxShadow: `0 0 0 2px ${AMBER}, 0 0 32px 0 ${AMBER}55`,
              background: "oklch(0.75 0.15 55 / 6%)",
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Table card — a droppable zone with assigned guests rendered inside.
// ───────────────────────────────────────────────────────────────────────────
interface TableCardProps {
  table: SeatingTable;
  guests: SeatingGuest[];
  onRename: (id: string, label: string) => void;
  onDelete: (id: string) => void;
  onCapacityChange: (id: string, capacity: number | undefined) => void;
}

function TableCard({
  table,
  guests,
  onRename,
  onDelete,
  onCapacityChange,
}: TableCardProps) {
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(table.label);
  const filled = guests.length;
  const capacity = table.capacity ?? 0;
  const overCapacity = capacity > 0 && filled > capacity;
  const shape = table.shape ?? "round";

  return (
    <DroppableSurface id={`table:${table.id}`} className="rounded-3xl">
      <GlassCard className="p-4 min-h-[180px]" hover={false}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div
              className={cn(
                "flex items-center justify-center shrink-0 border-2",
                shape === "round" && "rounded-full w-8 h-8",
                shape === "rect" && "rounded-md w-8 h-8",
                shape === "oval" && "rounded-full w-10 h-7",
              )}
              style={{
                borderColor: overCapacity
                  ? "oklch(0.65 0.20 30)"
                  : "oklch(0.75 0.15 55 / 50%)",
              }}
            >
              <Users
                className="w-3.5 h-3.5"
                style={{
                  color: overCapacity
                    ? "oklch(0.65 0.20 30)"
                    : "oklch(0.75 0.15 55)",
                }}
              />
            </div>
            {editingLabel ? (
              <input
                autoFocus
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                onBlur={() => {
                  setEditingLabel(false);
                  if (labelDraft.trim() && labelDraft !== table.label) {
                    onRename(table.id, labelDraft.trim());
                  } else {
                    setLabelDraft(table.label);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") {
                    setLabelDraft(table.label);
                    setEditingLabel(false);
                  }
                }}
                className="bg-transparent border-b border-[oklch(0.75_0.15_55/40%)] outline-none text-sm font-semibold py-0.5 min-w-0 flex-1"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingLabel(true)}
                className="text-sm font-semibold truncate hover:text-[oklch(0.75_0.15_55)] transition-colors text-left min-w-0 flex-1"
                title="Click to rename"
              >
                {table.label}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              if (
                guests.length > 0 &&
                !confirm(`Delete ${table.label}? Guests will be unassigned.`)
              ) {
                return;
              }
              onDelete(table.id);
            }}
            className="opacity-40 hover:opacity-100 transition-opacity p-1 rounded hover:bg-[oklch(1_0_0/4%)]"
            title="Delete table"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] uppercase tracking-wider text-[oklch(0.45_0.02_265)]">
            {filled}
            {capacity > 0 && ` / ${capacity}`} seated
          </span>
          <input
            type="number"
            min={0}
            placeholder="Capacity"
            value={capacity || ""}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              onCapacityChange(table.id, Number.isFinite(n) ? n : undefined);
            }}
            className="w-14 bg-transparent border border-[oklch(1_0_0/8%)] rounded px-1.5 py-0.5 text-[11px] text-right outline-none focus:border-[oklch(0.75_0.15_55/60%)]"
          />
        </div>

        <div className="space-y-1.5">
          <AnimatePresence initial={false}>
            {guests.map((g) => (
              <motion.div
                key={g.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, ease: EASE }}
              >
                <DraggableGuest guest={g} compact />
              </motion.div>
            ))}
          </AnimatePresence>
          {guests.length === 0 && (
            <p className="text-[11px] text-[oklch(0.40_0.02_265)] italic py-3 text-center">
              Drop guests here
            </p>
          )}
        </div>
      </GlassCard>
    </DroppableSurface>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Main component
// ───────────────────────────────────────────────────────────────────────────
export default function SeatingChart({
  eventId,
  guests,
  tables: tablesProp,
}: SeatingChartProps) {
  // Optimistic per-guest overrides — `{ guestId: tableId | null }`. Cleared
  // once the server-truth `guests` array reflects the change.
  const [optimisticOverrides, setOptimisticOverrides] = useState<
    Record<string, string | null>
  >({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const assignTable = useMutation(api.guests.assignTable);
  const updateTables = useMutation(api.events.updateTablesConfig);

  // Local optimistic copy of tablesConfig — keeps the UI snappy when the
  // host adds/renames/deletes a table (the server roundtrip can lag a beat).
  const [localTables, setLocalTables] = useState<SeatingTable[]>(tablesProp);
  useEffect(() => {
    setLocalTables(tablesProp);
  }, [tablesProp]);

  // Effective table assignment per guest, merging server truth + optimistic.
  const effectiveTableFor = useCallback(
    (g: SeatingGuest): string | undefined => {
      if (g.id in optimisticOverrides) {
        const v = optimisticOverrides[g.id];
        return v === null ? undefined : v;
      }
      return g.tableNumber;
    },
    [optimisticOverrides],
  );

  // Reconcile optimistic overrides — once server matches, drop the override.
  useEffect(() => {
    setOptimisticOverrides((curr) => {
      const next: typeof curr = {};
      for (const [gid, override] of Object.entries(curr)) {
        const g = guests.find((x) => x.id === gid);
        const serverVal = g?.tableNumber;
        const overrideMatches =
          (override === null && !serverVal) || override === serverVal;
        if (!overrideMatches) next[gid] = override;
      }
      return next;
    });
  }, [guests]);

  const unassigned = useMemo(
    () => guests.filter((g) => !effectiveTableFor(g)),
    [guests, effectiveTableFor],
  );

  const guestsByTable = useMemo(() => {
    const map = new Map<string, SeatingGuest[]>();
    for (const t of localTables) map.set(t.id, []);
    for (const g of guests) {
      const t = effectiveTableFor(g);
      if (!t) continue;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(g);
    }
    return map;
  }, [guests, localTables, effectiveTableFor]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 6 },
    }),
    useSensor(KeyboardSensor),
  );

  const activeGuest = activeId
    ? guests.find((g) => g.id === activeId)
    : null;

  // ── Drag handlers ──────────────────────────────────────────────────────
  const handleDragStart = useCallback((evt: DragStartEvent) => {
    setActiveId(String(evt.active.id));
  }, []);

  const handleDragEnd = useCallback(
    async (evt: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = evt;
      if (!over) return;
      const guestId = String(active.id);
      const overId = String(over.id);
      const guest = guests.find((g) => g.id === guestId);
      if (!guest) return;

      let newTable: string | undefined;
      if (overId === UNASSIGNED_ID) {
        newTable = undefined;
      } else if (overId.startsWith("table:")) {
        newTable = overId.slice("table:".length);
      } else {
        return;
      }

      const currentTable = effectiveTableFor(guest);
      if (currentTable === newTable) return;

      // Optimistic update — stamp override immediately.
      setOptimisticOverrides((curr) => ({
        ...curr,
        [guestId]: newTable ?? null,
      }));

      try {
        await assignTable({
          guestId: guest.id as Id<"guests">,
          tableNumber: newTable,
          seatNumber: undefined,
        });
      } catch (err) {
        // Roll back optimistic on failure.
        setOptimisticOverrides((curr) => {
          const { [guestId]: _, ...rest } = curr;
          return rest;
        });
        toast.error(
          `Failed to assign: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    },
    [guests, assignTable, effectiveTableFor],
  );

  // ── Table CRUD (host-side) ────────────────────────────────────────────
  const persistTables = useCallback(
    async (next: SeatingTable[]) => {
      setLocalTables(next);
      try {
        await updateTables({ id: eventId, tables: next });
      } catch (err) {
        toast.error(
          `Couldn't save layout: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
        // Revert on failure.
        setLocalTables(tablesProp);
      }
    },
    [updateTables, eventId, tablesProp],
  );

  const handleAddTable = useCallback(() => {
    const n = localTables.length + 1;
    const id = `table-${Date.now().toString(36)}`;
    const next: SeatingTable[] = [
      ...localTables,
      { id, label: `Table ${n}`, capacity: 8, shape: "round" },
    ];
    persistTables(next);
  }, [localTables, persistTables]);

  const handleRenameTable = useCallback(
    (id: string, label: string) => {
      persistTables(
        localTables.map((t) => (t.id === id ? { ...t, label } : t)),
      );
    },
    [localTables, persistTables],
  );

  const handleCapacityChange = useCallback(
    (id: string, capacity: number | undefined) => {
      persistTables(
        localTables.map((t) => (t.id === id ? { ...t, capacity } : t)),
      );
    },
    [localTables, persistTables],
  );

  const handleDeleteTable = useCallback(
    async (id: string) => {
      // Unassign any guest seated at this table first.
      const seated = guests.filter((g) => effectiveTableFor(g) === id);
      for (const g of seated) {
        setOptimisticOverrides((curr) => ({ ...curr, [g.id]: null }));
        try {
          await assignTable({
            guestId: g.id as Id<"guests">,
            tableNumber: undefined,
            seatNumber: undefined,
          });
        } catch {
          // Continue — other guests still need clearing.
        }
      }
      persistTables(localTables.filter((t) => t.id !== id));
    },
    [
      guests,
      effectiveTableFor,
      assignTable,
      localTables,
      persistTables,
    ],
  );

  // Auto-arrange — naive grouping. Spreads unassigned guests across tables
  // respecting capacity (or even-fill when no capacities are set).
  const handleAutoArrange = useCallback(async () => {
    if (localTables.length === 0) {
      toast.error("Add at least one table first");
      return;
    }
    const queue = [...unassigned];
    const fillCounts = new Map(
      localTables.map((t) => [t.id, guestsByTable.get(t.id)?.length ?? 0]),
    );

    const assignments: { guestId: string; tableId: string }[] = [];
    for (const g of queue) {
      // Pick the table with smallest fill count that isn't at capacity.
      let pick: SeatingTable | undefined;
      let minFill = Infinity;
      for (const t of localTables) {
        const fc = fillCounts.get(t.id) ?? 0;
        const cap = t.capacity ?? Infinity;
        if (fc >= cap) continue;
        if (fc < minFill) {
          minFill = fc;
          pick = t;
        }
      }
      if (!pick) break;
      assignments.push({ guestId: g.id, tableId: pick.id });
      fillCounts.set(pick.id, (fillCounts.get(pick.id) ?? 0) + 1);
    }

    // Optimistic + fire mutations in parallel.
    setOptimisticOverrides((curr) => {
      const next = { ...curr };
      for (const a of assignments) next[a.guestId] = a.tableId;
      return next;
    });
    await Promise.allSettled(
      assignments.map((a) =>
        assignTable({
          guestId: a.guestId as Id<"guests">,
          tableNumber: a.tableId,
          seatNumber: undefined,
        }),
      ),
    );
    toast.success(`Auto-seated ${assignments.length} guests`);
  }, [
    localTables,
    unassigned,
    guestsByTable,
    assignTable,
  ]);

  // CSV export — name, email-not-included-here (this is a seating chart),
  // table label, seat. Fast download via Blob.
  const handleExportCsv = useCallback(() => {
    const tableLabel = (id?: string) =>
      id ? localTables.find((t) => t.id === id)?.label ?? id : "Unassigned";
    const rows = [["Name", "Table", "Seat", "Dietary"]];
    for (const g of guests) {
      const t = effectiveTableFor(g);
      rows.push([
        g.name,
        tableLabel(t),
        g.seatNumber ?? "",
        g.dietaryNotes ?? "",
      ]);
    }
    const csv = rows
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seating-chart-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Seating chart exported");
  }, [guests, localTables, effectiveTableFor]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="space-y-4">
        {/* ─── Top action bar ─────────────────────────────────────────── */}
        <GlassCard className="p-4">
          <div className="flex flex-wrap items-center gap-2 justify-between">
            <div>
              <h3 className="font-semibold text-sm">Seating Chart</h3>
              <p className="text-[11px] text-[oklch(0.45_0.02_265)] mt-0.5">
                Drag guests onto tables. Changes sync live to every host.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <LiquidButton
                onClick={handleAddTable}
                size="sm"
                variant="glass"
                className="gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add table
              </LiquidButton>
              <LiquidButton
                onClick={handleAutoArrange}
                size="sm"
                variant="glass"
                className="gap-1.5"
                disabled={unassigned.length === 0}
              >
                <Sparkles className="w-3.5 h-3.5" /> Auto-arrange
              </LiquidButton>
              <LiquidButton
                onClick={handleExportCsv}
                size="sm"
                variant="glass"
                className="gap-1.5"
              >
                <Download className="w-3.5 h-3.5" /> Export
              </LiquidButton>
            </div>
          </div>
        </GlassCard>

        {/* ─── Main grid: rail + canvas ───────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-4">
          {/* Left rail — unassigned */}
          <DroppableSurface id={UNASSIGNED_ID} className="rounded-3xl">
            <GlassCard className="p-4 min-h-[300px]" hover={false}>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-[11px] uppercase tracking-wider font-semibold text-[oklch(0.55_0.02_265)]">
                  Unassigned
                </h4>
                <span className="text-[11px] text-[oklch(0.55_0.02_265)] tabular-nums">
                  {unassigned.length}
                </span>
              </div>
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {unassigned.map((g) => (
                    <motion.div
                      key={g.id}
                      layout
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -8 }}
                      transition={{ duration: 0.2, ease: EASE }}
                    >
                      <DraggableGuest guest={g} />
                    </motion.div>
                  ))}
                </AnimatePresence>
                {unassigned.length === 0 && (
                  <p className="text-[12px] text-[oklch(0.40_0.02_265)] italic text-center py-8">
                    Everyone is seated.
                  </p>
                )}
              </div>
            </GlassCard>
          </DroppableSurface>

          {/* Right canvas — tables */}
          <div>
            {localTables.length === 0 ? (
              <GlassCard className="p-10 text-center" hover={false}>
                <Users className="w-8 h-8 mx-auto mb-3 text-[oklch(0.55_0.02_265)]" />
                <p className="text-sm text-[oklch(0.55_0.02_265)] mb-3">
                  No tables yet. Add your first table to start seating.
                </p>
                <LiquidButton onClick={handleAddTable} size="sm">
                  <Plus className="w-4 h-4" /> Add table
                </LiquidButton>
              </GlassCard>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {localTables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    guests={guestsByTable.get(table.id) ?? []}
                    onRename={handleRenameTable}
                    onDelete={handleDeleteTable}
                    onCapacityChange={handleCapacityChange}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Drag overlay — the floating ghost that follows the cursor. */}
      <DragOverlay
        dropAnimation={{
          duration: 250,
          easing: "cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        {activeGuest ? (
          <div className="rotate-2">
            <GuestCardInner guest={activeGuest} isDragging />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
