/**
 * Pulse — event management dashboard (host-facing).
 *
 * TODO (deferred — see DESIGN-AUDIT.md):
 * - [ ] Status-action buttons (Go Live / Cancel / Restore / Reactivate) hard-code
 *       12+ inline oklch tuples — extract to <StatusActionButton> with semantic
 *       variants (success / warning / destructive)
 * - [ ] Tab navigation should sticky on scroll for true dashboard feel
 * - [ ] Recharts components need explicit dark-theme color array using
 *       var(--chart-1..5) — defaults will look wrong on the warm dark base
 * - [ ] Mobile: tabs become bottom nav (PWA standalone target)
 * - [ ] Guest list table: uppercase column headers should use .eyebrow class
 * - [ ] Notification history rows: timestamp gets var(--text-faint), not the
 *       cool-gray oklch literal
 */
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { AmbientBackground } from "@/components/AmbientBackground";
import { WeatherWidget } from "@/components/WeatherWidget";
import { SegmentedControl } from "@/components/SegmentedControl";
import { InvitationPreview } from "@/components/InvitationPreview";
import SeatingChart from "@/components/SeatingChart";
import { ThemeToggle } from "@/components/ThemeToggle";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Copy, Check, Users, UserCheck, UserX, HelpCircle,
  Link2, MessageSquare, Calendar, MapPin, Image, Sparkles,
  Pencil, X, Save, Trash2, ChevronDown, ChevronUp, ClipboardList,
  Upload, UserPlus, Send, RotateCcw, FileText, Mail, Phone,
  ExternalLink, AlertCircle, CheckCircle2, Clock,
  BarChart3, Eye, TrendingUp, QrCode, Download, Wand2,
  Camera, Zap, BadgeCheck, Heart,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const t = { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const };

type Tab = "overview" | "analytics" | "guests" | "seating" | "notifications";

/**
 * Inline helpers for the consolidated Settings + Quick links cards.
 * These replace the previous wall of separate GlassCards (one per toggle)
 * with a single grouped surface — matches the design rule of "one glass
 * panel per logical group, not one per control."
 */
type RowIcon = React.ComponentType<{ className?: string; style?: React.CSSProperties }>;

function SettingRow({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  desc,
  checked,
  onToggle,
}: {
  icon: RowIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  desc: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="px-6 py-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3.5 min-w-0 flex-1">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: iconBg }}
        >
          <Icon className="w-4 h-4" style={{ color: iconColor }} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{label}</p>
          <p className="text-[11px] text-[oklch(0.5_0.02_265)] mt-0.5 truncate">{desc}</p>
        </div>
      </div>
      <div className="glass-toggle flex-shrink-0" data-state={checked ? "on" : "off"} onClick={onToggle}>
        <div className="glass-toggle-thumb" />
      </div>
    </div>
  );
}

function QuickLinkRow({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  desc,
  onClick,
}: {
  icon: RowIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full px-6 py-4 flex items-center gap-3.5 text-left hover:bg-[oklch(1_0_0/3%)] transition-colors"
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg }}
      >
        <Icon className="w-4 h-4" style={{ color: iconColor }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{label}</p>
        <p className="text-[11px] text-[oklch(0.5_0.02_265)] mt-0.5 truncate">{desc}</p>
      </div>
      <ExternalLink className="w-4 h-4 text-[oklch(0.5_0.02_265)] flex-shrink-0" />
    </button>
  );
}

export default function Pulse() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  // The URL param can be either a Convex `Id<"events">` (post-duplicate
  // navigation) OR a slug (post-create from Forge, which prefers the
  // shareable slug). The flexible `getByIdOrSlug` query resolves either,
  // and once we have the doc we use its real `_id` for all downstream
  // queries that demand the strict Id type.
  const idOrSlug = params.id ?? "";
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showAllRsvps, setShowAllRsvps] = useState(false);
  const [expandedRsvp, setExpandedRsvp] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // Edit form state
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editLocation, setEditLocation] = useState("");

  // Guest import state
  const [showImport, setShowImport] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [showAddGuest, setShowAddGuest] = useState(false);
  const [showInviteFriends, setShowInviteFriends] = useState(false);
  const [selectedFriendIds, setSelectedFriendIds] = useState<Set<string>>(new Set());
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestEmail, setNewGuestEmail] = useState("");
  const [newGuestPhone, setNewGuestPhone] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notification state
  const [customMessage, setCustomMessage] = useState("");
  const [copiedGuestId, setCopiedGuestId] = useState<string | null>(null);

  // QR Code state
  const [qrData, setQrData] = useState<{ dataUrl: string; downloadUrl: string; portalUrl: string } | null>(null);

  // Social Oracle state
  const [showOracle, setShowOracle] = useState(false);

  // V7 Invitation preview overlay (host-side dry run of the guest experience).
  const [previewOpen, setPreviewOpen] = useState(false);

  // ─── Convex queries ───
  // Phase 1: resolve the param (id-or-slug) to the actual event doc.
  const eventDoc = useQuery(
    api.events.getByIdOrSlug,
    idOrSlug ? { idOrSlug } : "skip",
  );
  // Once we have the resolved doc, derive the strict Convex Id for the
  // downstream queries that require it. While eventDoc is loading or the
  // event isn't found, eventId stays undefined and dependent queries skip.
  const eventId = (eventDoc?._id ?? undefined) as Id<"events"> | undefined;

  const countsData = useQuery(api.rsvps.getCounts, eventId ? { eventId } : "skip");
  const rsvpsData = useQuery(api.rsvps.list, eventId ? { eventId } : "skip");
  const guestsData = useQuery(api.guests.list, eventId ? { eventId } : "skip");
  const notificationsData = useQuery(api.notifications.list, eventId ? { eventId } : "skip");
  const analyticsData = useQuery(
    api.analytics.getStats,
    eventId && activeTab === "analytics" ? { eventId } : "skip",
  );

  // ─── Convex mutations / actions ───
  const updateEvent = useMutation(api.events.update);
  const removeEvent = useMutation(api.events.remove);
  const bulkImportGuests = useMutation(api.guests.bulkImport);
  const addGuestFn = useMutation(api.guests.add);
  const addFromFriendsFn = useMutation(api.guests.addFromFriends);
  const removeGuestFn = useMutation(api.guests.remove);
  const friendsList = useQuery(api.friends.list, {}) ?? [];
  const transitionStatus = useMutation(api.events.transitionStatus);
  const duplicateEvent = useMutation(api.events.duplicate);
  const generateQR = useAction(api.qrcode.generateAndStore);
  const mintGuestLink = useAction(api.guestTokens.mintGuestLink);
  const signGuestToken = useAction(api.guestTokens.signGuestToken);

  // Wrappers preserving the original .mutate({...}) ergonomics
  const updateMutation = {
    isPending: false,
    mutate: (args: any) => {
      const { id, ...rest } = args;
      updateEvent({ id: (id as Id<"events">) ?? eventId, ...rest })
        .then(() => { setEditing(false); toast.success("Event updated"); })
        .catch((err: Error) => toast.error(err.message));
    },
  };
  const deleteMutation = {
    mutate: () => {
      removeEvent({ id: eventId })
        .then(() => { toast.success("Event deleted"); navigate("/"); })
        .catch((err: Error) => toast.error(err.message));
    },
  };
  const regenMutation = {
    isPending: false,
    mutate: () => toast.info("Cover regeneration removed — upload your own image instead."),
  };
  const importCsvMutation = {
    isPending: false,
    mutate: async ({ csvText }: { csvText: string }) => {
      // V10 wedding-tier: header-aware CSV parser. Supports columns:
      // name, email, phone, table, seat, diet, notes, host note (any order).
      // Backward compat: if no recognized header is present, fall back to
      // the legacy `name, email, phone` ordering for first-line data.
      const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      const headers = lines[0].toLowerCase().split(",").map(h => h.trim());
      const colIndex = (names: string[]) => {
        const found = names.map(n => headers.indexOf(n)).find(i => i >= 0);
        return found ?? -1;
      };

      const nameIdx  = colIndex(["name", "full name", "guest", "guest name"]);
      const emailIdx = colIndex(["email", "e-mail"]);
      const phoneIdx = colIndex(["phone", "mobile", "cell"]);
      const tableIdx = colIndex(["table", "table number", "table #"]);
      const seatIdx  = colIndex(["seat", "seat number"]);
      const dietIdx  = colIndex(["diet", "dietary", "allergies"]);
      const noteIdx  = colIndex(["note", "notes", "guest note"]);
      const hostIdx  = colIndex(["host note", "private note", "internal"]);

      const hasHeaders = nameIdx >= 0;
      const rows = hasHeaders ? lines.slice(1) : lines;

      const guests = rows.map(line => {
        const cells = line.split(",").map(c => c.trim().replace(/^"|"$/g, ""));
        if (!hasHeaders) {
          // Legacy 3-column fallback (no header detected).
          return {
            name: cells[0] || "Guest",
            email: cells[1] || undefined,
            phone: cells[2] || undefined,
          };
        }
        return {
          name: (cells[nameIdx] ?? "").trim() || "Guest",
          email: emailIdx >= 0 ? cells[emailIdx] || undefined : undefined,
          phone: phoneIdx >= 0 ? cells[phoneIdx] || undefined : undefined,
          tableNumber: tableIdx >= 0 ? cells[tableIdx] || undefined : undefined,
          seatNumber: seatIdx >= 0 ? cells[seatIdx] || undefined : undefined,
          dietaryNotes: dietIdx >= 0 ? cells[dietIdx] || undefined : undefined,
          guestNotes: noteIdx >= 0 ? cells[noteIdx] || undefined : undefined,
          hostNotes: hostIdx >= 0 ? cells[hostIdx] || undefined : undefined,
        };
      });
      try {
        const res = await bulkImportGuests({ eventId, guests });
        toast.success(`${res.imported} guests imported${res.skipped ? ` (${res.skipped} skipped)` : ""}`);
        setCsvText(""); setShowImport(false);
      } catch (err: any) {
        toast.error(err?.message ?? "Import failed");
      }
    },
  };
  const addGuestMutation = {
    isPending: false,
    mutate: (args: { name: string; email?: string; phone?: string }) => {
      addGuestFn({ eventId, ...args })
        .then(() => {
          toast.success("Guest added");
          setNewGuestName(""); setNewGuestEmail(""); setNewGuestPhone("");
          setShowAddGuest(false);
        })
        .catch((err: Error) => toast.error(err.message));
    },
  };
  const removeGuestMutation = {
    mutate: ({ guestId }: { guestId: Id<"guests"> }) => {
      removeGuestFn({ guestId })
        .then(() => toast.success("Guest removed"))
        .catch((err: Error) => toast.error(err.message));
    },
  };
  const sendBlastMutation = { isPending: false, mutate: () => toast.info("SMS blasts coming soon — share the portal link directly for now.") };
  const resendFailedMutation = { isPending: false, mutate: () => toast.info("Resend pipeline coming soon.") };
  const changeStatusMut = {
    mutate: ({ newStatus }: { newStatus: "draft" | "active" | "past" | "cancelled" }) => {
      transitionStatus({ id: eventId, newStatus })
        .then(() => toast.success(`Status changed to ${newStatus}`))
        .catch((err: Error) => toast.error(err.message));
    },
  };
  const duplicateMut = {
    mutate: () => {
      duplicateEvent({ id: eventId, includeGuests: false })
        .then((newId: Id<"events"> | string) => { toast.success("Event duplicated as draft"); navigate(`/pulse/${newId}`); })
        .catch((err: Error) => toast.error(err.message));
    },
  };
  const qrCodeMut = {
    isPending: false,
    mutate: async () => {
      if (!event) return;
      try {
        // Mint a shareable portal token (full access, 90d) so the QR code
        // links to a portal URL the guest can actually RSVP from.
        const portalToken = await signGuestToken({
          payload: { eventId: event._id, slug: event.slug, access: "full" },
        });
        const data = await generateQR({
          eventId: event._id,
          origin: window.location.origin,
          portalToken,
        });
        setQrData({
          dataUrl: data.dataUrl,
          downloadUrl: data.downloadUrl,
          portalUrl: data.portalUrl,
        });
      } catch (err: any) {
        toast.error(err?.message || "Failed to generate QR");
      }
    },
  };
  const oracleMut = { isPending: false, data: undefined as any, mutate: () => toast.info("Social Oracle (AI guest suggestions) coming soon.") };
  // Animated invitation preview — opens the InvitationPreview overlay.
  // Kept in `mutate` shape so the existing button JSX doesn't have to change.
  const generatePreviewMut = { isPending: false, mutate: () => setPreviewOpen(true) };
  const guestLinkMutation = {
    isPending: false,
    mutateAsync: async () => {
      if (!event) throw new Error("Event not loaded");
      return { url: `${window.location.origin}/portal/${event.slug}` };
    },
  };

  // Convex docs use _id; alias to id for downstream renderers that expect numeric/string id
  const event = useMemo(() => {
    if (!eventDoc) return undefined;
    return { ...eventDoc, id: (eventDoc as any)._id } as any;
  }, [eventDoc]);
  const counts = countsData;
  const rsvpList = useMemo(
    () => (rsvpsData ?? []).map((r: any) => ({ ...r, id: r._id })),
    [rsvpsData],
  );
  const guestList = useMemo(
    () => (guestsData ?? []).map((g: any) => ({ ...g, id: g._id })),
    [guestsData],
  );
  const notificationList = useMemo(
    () => (notificationsData ?? []).map((n: any) => ({ ...n, id: n._id })),
    [notificationsData],
  );
  const analytics = analyticsData;

  const guestStats = useMemo(() => {
    const pending = guestList.filter(g => g.notificationStatus === "pending").length;
    const sent = guestList.filter(g => g.notificationStatus === "sent").length;
    const failed = guestList.filter(g => g.notificationStatus === "failed").length;
    return { pending, sent, failed, total: guestList.length };
  }, [guestList]);

  const startEditing = useCallback(() => {
    if (!event) return;
    setEditTitle(event.title);
    setEditDescription(event.description || "");
    if (event.eventDate) {
      const d = new Date(event.eventDate);
      setEditDate(d.toISOString().split("T")[0]);
      setEditTime(d.toTimeString().slice(0, 5));
    }
    setEditLocation(event.locationName || "");
    setEditing(true);
  }, [event]);

  const saveEdits = useCallback(() => {
    if (!event) return;
    let dateMs: number | undefined;
    if (editDate) {
      const dateStr = editTime ? `${editDate}T${editTime}` : `${editDate}T00:00`;
      dateMs = new Date(dateStr).getTime();
    }
    updateMutation.mutate({
      id: event.id,
      title: editTitle.trim() || undefined,
      description: editDescription.trim() || undefined,
      eventDate: dateMs,
      locationName: editLocation.trim() || undefined,
    });
  }, [event, editTitle, editDescription, editDate, editTime, editLocation, updateMutation]);

  const handleCopyLink = useCallback(async () => {
    if (!event) return;
    try {
      const result = await guestLinkMutation.mutateAsync();
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      toast.success("Guest portal link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      toast.error("Failed to generate link: " + err.message);
    }
  }, [event, guestLinkMutation]);

  const handleCopyGuestLink = useCallback(async (guestId: string) => {
    if (!event) return;
    try {
      const result = await mintGuestLink({
        guestId: guestId as Id<"guests">,
        origin: window.location.origin,
      });
      await navigator.clipboard.writeText(result.url);
      setCopiedGuestId(guestId);
      toast.success("Personal invitation link copied!");
      setTimeout(() => setCopiedGuestId(null), 2000);
    } catch (err: any) {
      toast.error(err?.message || "Failed to mint link");
    }
  }, [event, mintGuestLink]);

  const toggleSms = useCallback(() => {
    if (!event) return;
    updateMutation.mutate({ id: event.id, smsBroadcastEnabled: event.smsBroadcastEnabled === "1" ? "0" : "1" });
  }, [event, updateMutation]);

  const toggleMemoryWall = useCallback(() => {
    if (!event) return;
    updateMutation.mutate({ id: event.id, memoryWallEnabled: event.memoryWallEnabled === "1" ? "0" : "1" });
  }, [event, updateMutation]);

  // Flip public discoverability — when on, the event surfaces in Home's
  // "Find an event" search for any signed-in ivari user.
  const togglePublic = useCallback(() => {
    if (!event) return;
    updateMutation.mutate({ id: event.id, isPublic: !event.isPublic });
  }, [event, updateMutation]);

  // Toggle the public claim mode between "open" (default — one-tap join) and
  // "name-list" (visitors find their pre-loaded name and get a table).
  const toggleClaimMode = useCallback(() => {
    if (!event) return;
    const next = event.claimMode === "name-list" ? "open" : "name-list";
    updateMutation.mutate({ id: event.id, claimMode: next });
  }, [event, updateMutation]);

  const handleRegenImage = useCallback(() => {
    if (!event) return;
    regenMutation.mutate({ subject: event.title });
  }, [event, regenMutation]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { setCsvText(ev.target?.result as string || ""); setShowImport(true); };
    reader.readAsText(file);
  }, []);

  const handleImportCSV = useCallback(() => {
    if (!csvText.trim()) return;
    importCsvMutation.mutate({ eventId, csvText, origin: window.location.origin });
  }, [csvText, eventId, importCsvMutation]);

  // V10 wedding-tier: download a sample CSV with all supported columns
  // pre-filled. Mirrors the parser's column aliases so hosts can copy-edit.
  const handleDownloadSampleCsv = useCallback(() => {
    const sample = [
      "name,email,phone,table,seat,diet,notes,host note",
      "Alex Morgan,alex@example.com,555-0101,7,3,Vegan,Looking forward!,VIP - knows the host",
      "Sam Lee,sam@example.com,555-0102,7,4,,,",
    ].join("\n");
    const blob = new Blob([sample], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ivari-guests-sample.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  const handleAddGuest = useCallback(() => {
    if (!newGuestName.trim()) { toast.error("Name is required"); return; }
    addGuestMutation.mutate({ eventId, name: newGuestName.trim(), email: newGuestEmail.trim() || undefined, phone: newGuestPhone.trim() || undefined, origin: window.location.origin });
  }, [newGuestName, newGuestEmail, newGuestPhone, eventId, addGuestMutation]);

  const handleSendBlast = useCallback(() => {
    if (guestStats.pending === 0 && guestStats.failed === 0) { toast.error("No pending guests to notify"); return; }
    sendBlastMutation.mutate({ eventId, origin: window.location.origin, customMessage: customMessage.trim() || undefined, type: "invitation" });
  }, [eventId, customMessage, sendBlastMutation, guestStats]);

  const handleGenerateQR = useCallback(() => {
    if (!event) return;
    qrCodeMut.mutate();
  }, [event, qrCodeMut]);

  const handleOracle = useCallback(() => {
    if (!event) return;
    setShowOracle(true);
    oracleMut.mutate({
      eventId: event.id,
      eventTitle: event.title,
      eventDescription: event.description || undefined,
      existingGuests: guestList.map(g => g.name),
    });
  }, [event, guestList, oracleMut]);

  const surveyConfig = useMemo(() => {
    if (!event?.surveyConfig) return [];
    try { return Array.isArray(event.surveyConfig) ? event.surveyConfig : []; } catch { return []; }
  }, [event?.surveyConfig]);

  // ─── Loading ───
  if (eventDoc === undefined) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <AmbientBackground />
        <div className="flex flex-col items-center gap-4">
          <motion.div className="w-10 h-10 rounded-full border-2 border-[var(--accent,oklch(0.75_0.15_55))] border-t-transparent" animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }} />
          <span className="text-sm text-[oklch(0.5_0.02_265)]">Loading event...</span>
        </div>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <AmbientBackground />
        <GlassCard className="p-10 text-center max-w-sm">
          <h2 className="text-xl font-semibold mb-3">Event not found</h2>
          <LiquidButton onClick={() => navigate("/")} variant="ghost">Back to Events</LiquidButton>
        </GlassCard>
      </div>
    );
  }

  const attending = counts?.attending || 0;
  const maybe = counts?.maybe || 0;
  const declined = counts?.declined || 0;
  const total = counts?.total || 0;
  const maxG = event.maxCapacity || event.maxGuests || 0;
  const progressPercent = maxG > 0 ? Math.min((attending / maxG) * 100, 100) : total > 0 ? Math.min((attending / Math.max(total, 1)) * 100, 100) : 0;
  const displayedRsvps = showAllRsvps ? rsvpList : rsvpList.slice(0, 5);
  const accentColor = event.themeColor || "oklch(0.75 0.15 55)";

  const statusIcon = (s: string) => {
    if (s === "sent") return <CheckCircle2 className="w-3.5 h-3.5 text-[oklch(0.7_0.15_160)]" />;
    if (s === "failed") return <AlertCircle className="w-3.5 h-3.5 text-[oklch(0.7_0.15_25)]" />;
    return <Clock className="w-3.5 h-3.5 text-[oklch(0.55_0.12_60)]" />;
  };

  // Pie chart data for analytics
  const rsvpPieData = [
    { name: "Attending", value: attending, color: "oklch(0.7 0.15 160)" },
    { name: "Maybe", value: maybe, color: "oklch(0.7 0.12 60)" },
    { name: "Declined", value: declined, color: "oklch(0.7 0.15 25)" },
  ].filter(d => d.value > 0);

  return (
    <div className="min-h-screen relative" style={{ "--event-accent": accentColor } as React.CSSProperties}>
      <AmbientBackground />

      {/* Hero */}
      {event.imageUrl && (
        <div className="relative h-64 sm:h-80 overflow-hidden">
          <img src={event.imageUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-[oklch(0.04_0.01_285/40%)] via-transparent to-[oklch(0.04_0.01_285)]" />
          <button onClick={handleRegenImage} disabled={regenMutation.isPending} className="absolute top-4 right-4 p-2.5 rounded-xl glass text-foreground hover:bg-[oklch(1_0_0/10%)] transition-all duration-300 z-10" title="Regenerate image">
            {regenMutation.isPending ? (
              <motion.div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full" animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
          </button>
        </div>
      )}

      {/* Header */}
      <header className={`relative z-10 px-6 ${event.imageUrl ? "-mt-24" : "pt-12"}`}>
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between mb-5">
            <button onClick={() => navigate("/")} className="flex items-center gap-2 text-[var(--text-tertiary)] hover:text-foreground transition-colors duration-300">
              <ArrowLeft className="w-5 h-5" />
              <span className="text-sm font-medium">Events</span>
            </button>
            <ThemeToggle />
          </div>

          <AnimatePresence mode="wait">
            {editing ? (
              <motion.div key="editing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t} className="space-y-4">
                <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="glass-input text-2xl font-bold" />
                <textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={2} className="glass-input text-sm" placeholder="Description..." />
                <div className="grid grid-cols-2 gap-3">
                  <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} className="glass-input text-sm [color-scheme:dark]" />
                  <input type="time" value={editTime} onChange={(e) => setEditTime(e.target.value)} className="glass-input text-sm [color-scheme:dark]" />
                </div>
                <input type="text" value={editLocation} onChange={(e) => setEditLocation(e.target.value)} className="glass-input text-sm" placeholder="Location..." />
                <div className="flex gap-3">
                  <LiquidButton onClick={saveEdits} loading={updateMutation.isPending} size="sm" className="gap-2"><Save className="w-4 h-4" /> Save</LiquidButton>
                  <LiquidButton onClick={() => setEditing(false)} variant="ghost" size="sm" className="gap-2"><X className="w-4 h-4" /> Cancel</LiquidButton>
                </div>
              </motion.div>
            ) : (
              <motion.div key="display" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h1 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em]">{event.title}</h1>
                    <div className="flex items-center gap-3 mt-3 flex-wrap">
                      <span className={`text-[0.6875rem] font-semibold px-2.5 py-1 rounded-full uppercase tracking-wider ${
                        event.status === 'active' ? 'badge-active' : event.status === 'draft' ? 'badge-draft' : event.status === 'past' ? 'badge-past' : 'badge-cancelled'
                      }`}>{event.status}</span>
                      {event.status === 'draft' && (
                        <button onClick={() => changeStatusMut.mutate({ id: event.id, newStatus: 'active', origin: window.location.origin })} className="text-xs font-medium px-3 py-1 rounded-lg bg-[oklch(0.5_0.15_160/15%)] text-[oklch(0.7_0.15_160)] hover:bg-[oklch(0.5_0.15_160/25%)] transition-colors">Go Live</button>
                      )}
                      {event.status === 'active' && (
                        <>
                          <button onClick={() => changeStatusMut.mutate({ id: event.id, newStatus: 'past', origin: window.location.origin })} className="text-xs font-medium px-3 py-1 rounded-lg bg-[oklch(1_0_0/8%)] text-[oklch(0.6_0.02_265)] hover:bg-[oklch(1_0_0/12%)] transition-colors">Mark Past</button>
                          <button onClick={() => { if (confirm('Cancel this event? Guests will be notified.')) changeStatusMut.mutate({ id: event.id, newStatus: 'cancelled', origin: window.location.origin }); }} className="text-xs font-medium px-3 py-1 rounded-lg bg-[oklch(0.5_0.15_25/12%)] text-[oklch(0.7_0.15_25)] hover:bg-[oklch(0.5_0.15_25/20%)] transition-colors">Cancel</button>
                        </>
                      )}
                      {event.status === 'cancelled' && (
                        <button onClick={() => changeStatusMut.mutate({ id: event.id, newStatus: 'draft', origin: window.location.origin })} className="text-xs font-medium px-3 py-1 rounded-lg bg-[oklch(0.55_0.12_60/15%)] text-[oklch(0.7_0.12_60)] hover:bg-[oklch(0.55_0.12_60/25%)] transition-colors">Restore as Draft</button>
                      )}
                      {event.status === 'past' && (
                        <button onClick={() => changeStatusMut.mutate({ id: event.id, newStatus: 'active', origin: window.location.origin })} className="text-xs font-medium px-3 py-1 rounded-lg bg-[oklch(0.5_0.15_160/15%)] text-[oklch(0.7_0.15_160)] hover:bg-[oklch(0.5_0.15_160/25%)] transition-colors">Reactivate</button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => navigate(`/checkin/${event.id}`)} className="p-2 rounded-xl hover:bg-[oklch(0.5_0.15_160/15%)] text-[oklch(0.7_0.15_160)] transition-colors" title="Check-In Mode">
                      <UserCheck className="w-5 h-5" />
                    </button>
                    <button onClick={() => generatePreviewMut.mutate({ eventId: event.id })} disabled={generatePreviewMut.isPending} className="p-2 rounded-xl hover:bg-[oklch(0.5_0.15_55/15%)] text-[oklch(0.75_0.15_55)] transition-colors" title="Generate Invitation Preview">
                      {generatePreviewMut.isPending ? <Sparkles className="w-5 h-5 animate-spin" /> : <Camera className="w-5 h-5" />}
                    </button>
                    <button onClick={() => duplicateMut.mutate({ id: event.id, includeGuests: false })} className="p-2 rounded-xl hover:bg-[oklch(1_0_0/6%)] text-[oklch(0.5_0.02_265)] hover:text-foreground transition-colors" title="Duplicate event">
                      <Copy className="w-5 h-5" />
                    </button>
                    <button onClick={startEditing} className="p-2 rounded-xl hover:bg-[oklch(1_0_0/6%)] text-[oklch(0.5_0.02_265)] hover:text-foreground transition-colors">
                      <Pencil className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                {event.description && <p className="text-[oklch(0.55_0.02_265)] mt-2 leading-relaxed">{event.description}</p>}
                <div className="flex items-center gap-4 mt-3 text-sm text-[oklch(0.5_0.02_265)] flex-wrap">
                  {event.eventDate && (
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-[oklch(0.75_0.15_55)]" />
                      {format(new Date(event.eventDate), "EEE, MMM d 'at' h:mm a")}
                    </span>
                  )}
                  {event.locationName && (
                    <span className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-[oklch(0.75_0.15_55)]" />
                      {event.locationName}
                    </span>
                  )}
                  {maxG > 0 && (
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5 text-[oklch(0.75_0.15_55)]" />
                      {attending}/{maxG} capacity
                    </span>
                  )}
                  {event.rsvpDeadline && (
                    <span className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[oklch(0.75_0.15_55)]" />
                      RSVP by {format(new Date(event.rsvpDeadline), "MMM d")}
                    </span>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Tab Navigation — Apple iOS segmented control with sliding amber indicator */}
      <div className="relative z-10 px-6 mt-8 mb-6">
        <div className="max-w-3xl mx-auto flex justify-center sm:justify-start">
          <SegmentedControl<Tab>
            value={activeTab}
            onChange={setActiveTab}
            layoutId="pulse-tab-indicator"
            items={[
              { value: "overview", label: "Overview" },
              { value: "analytics", label: "Analytics", icon: <BarChart3 className="w-3.5 h-3.5" /> },
              { value: "guests", label: `Guests (${guestStats.total})` },
              { value: "seating", label: "Seating" },
              { value: "notifications", label: "Notifications" },
            ]}
          />
        </div>
      </div>

      {/* Tab Content */}
      <div className="relative z-10 px-6 pb-12">
        <div className="max-w-3xl mx-auto space-y-5">
          <AnimatePresence mode="wait">

            {/* ─── OVERVIEW TAB ─── */}
            {activeTab === "overview" && (
              <motion.div key="overview" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={t} className="space-y-5">
                {/* Guest Portal Link */}
                <GlassCard className="p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[oklch(0.75_0.15_55/12%)] flex items-center justify-center">
                        <Link2 className="w-5 h-5 text-[oklch(0.75_0.15_55)]" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">Guest Portal Link</p>
                        <p className="text-xs text-[oklch(0.45_0.02_265)]">JWT-signed, zero login required</p>
                      </div>
                    </div>
                    <LiquidButton onClick={handleCopyLink} loading={guestLinkMutation.isPending} size="sm" variant="glass" className="gap-2">
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? "Copied" : "Copy"}
                    </LiquidButton>
                  </div>
                </GlassCard>

                {/* QR Code Card */}
                <GlassCard className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-[oklch(0.75_0.15_55/12%)] flex items-center justify-center">
                        <QrCode className="w-5 h-5 text-[oklch(0.75_0.15_55)]" />
                      </div>
                      <div>
                        <p className="font-medium text-sm">QR Code</p>
                        <p className="text-xs text-[oklch(0.45_0.02_265)]">For physical invitations & table cards</p>
                      </div>
                    </div>
                    <LiquidButton onClick={handleGenerateQR} loading={qrCodeMut.isPending} size="sm" variant="glass" className="gap-2">
                      {qrData ? <RotateCcw className="w-4 h-4" /> : <QrCode className="w-4 h-4" />}
                      {qrData ? "Regenerate" : "Generate"}
                    </LiquidButton>
                  </div>
                  <AnimatePresence>
                    {qrData && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={t} className="overflow-hidden">
                        <div className="flex flex-col items-center gap-4 pt-4 border-t border-[oklch(1_0_0/6%)]">
                          <div className="p-4 rounded-2xl bg-[oklch(0.04_0.01_285)] border border-[oklch(1_0_0/8%)]">
                            <img src={qrData.dataUrl} alt="QR Code" className="w-48 h-48" />
                          </div>
                          <a href={qrData.downloadUrl} download className="flex items-center gap-2 text-sm text-[oklch(0.75_0.15_55)] hover:underline">
                            <Download className="w-4 h-4" /> Download high-res PNG
                          </a>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </GlassCard>

                {/* V7-W4 — host-side weather forecast (≤7 days out) */}
                {event?.eventDate && (() => {
                  const lat =
                    typeof (event as any).latitude === "number"
                      ? ((event as any).latitude as number)
                      : (event as any).locationLat
                      ? parseFloat((event as any).locationLat)
                      : undefined;
                  const lon =
                    typeof (event as any).longitude === "number"
                      ? ((event as any).longitude as number)
                      : (event as any).locationLng
                      ? parseFloat((event as any).locationLng)
                      : undefined;
                  if (
                    lat === undefined ||
                    lon === undefined ||
                    !Number.isFinite(lat) ||
                    !Number.isFinite(lon)
                  )
                    return null;
                  return (
                    <div>
                      {eventId && (
                        <WeatherWidget
                          eventId={eventId}
                          latitude={lat}
                          longitude={lon}
                          eventDateMs={event.eventDate as number}
                        />
                      )}
                    </div>
                  );
                })()}

                {/* RSVP Overview */}
                <GlassCard variant="strong" className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-[oklch(0.75_0.15_55/12%)] flex items-center justify-center">
                      <Users className="w-5 h-5 text-[oklch(0.75_0.15_55)]" />
                    </div>
                    <div>
                      <p className="font-medium">RSVP Tracking</p>
                      <p className="text-xs text-[oklch(0.45_0.02_265)]">{total} response{total !== 1 ? "s" : ""}</p>
                    </div>
                  </div>

                  <div className="mb-6">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-[oklch(0.55_0.02_265)]">{attending} attending{maxG > 0 ? ` of ${maxG}` : ""}</span>
                      <span className="text-[oklch(0.55_0.02_265)] font-medium">{Math.round(progressPercent)}%</span>
                    </div>
                    <div className="liquid-progress h-2.5 bg-[oklch(1_0_0/6%)]">
                      <motion.div className="liquid-progress-fill" initial={{ width: 0 }} animate={{ width: `${progressPercent}%` }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { icon: UserCheck, count: attending, label: "Attending", color: "oklch(0.7 0.15 160)" },
                      { icon: HelpCircle, count: maybe, label: "Maybe", color: "oklch(0.7 0.12 60)" },
                      { icon: UserX, count: declined, label: "Declined", color: "oklch(0.7 0.15 25)" },
                    ].map(({ icon: Icon, count, label, color }) => (
                      <div key={label} className="text-center p-4 rounded-xl bg-[oklch(1_0_0/3%)] border border-[oklch(1_0_0/6%)]">
                        <Icon className="w-5 h-5 mx-auto mb-2" style={{ color }} />
                        <div className="text-2xl font-bold tracking-tight">{count}</div>
                        <div className="text-[0.6875rem] text-[oklch(0.5_0.02_265)] font-medium">{label}</div>
                      </div>
                    ))}
                  </div>
                </GlassCard>

                {/* Guest Responses */}
                <GlassCard className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold">Guest Responses</h3>
                    {rsvpList.length > 5 && (
                      <button onClick={() => setShowAllRsvps(!showAllRsvps)} className="text-xs text-[oklch(0.75_0.15_55)] hover:underline flex items-center gap-1">
                        {showAllRsvps ? "Show less" : `Show all ${rsvpList.length}`}
                        {showAllRsvps ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                  {rsvpList.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="w-8 h-8 mx-auto mb-3 text-[oklch(0.35_0.02_265)]" />
                      <p className="text-sm text-[oklch(0.45_0.02_265)]">No responses yet. Share your guest portal link.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {displayedRsvps.map((rsvp) => {
                        const statusColor = rsvp.status === "attending" ? "oklch(0.7 0.15 160)" : rsvp.status === "maybe" ? "oklch(0.7 0.12 60)" : "oklch(0.7 0.15 25)";
                        const statusBg = rsvp.status === "attending" ? "oklch(0.5 0.15 160 / 12%)" : rsvp.status === "maybe" ? "oklch(0.5 0.12 60 / 12%)" : "oklch(0.5 0.15 25 / 12%)";
                        const hasDetails = rsvp.message || (rsvp.surveyResponses && typeof rsvp.surveyResponses === "object" && Object.keys(rsvp.surveyResponses as object).length > 0);
                        const isExpanded = expandedRsvp === rsvp.id;
                        return (
                          <motion.div key={rsvp.id} className={`rounded-xl border transition-colors duration-300 ${isExpanded ? "bg-[oklch(1_0_0/4%)] border-[oklch(1_0_0/10%)]" : "bg-[oklch(1_0_0/2%)] border-[oklch(1_0_0/5%)]"}`} layout>
                            <div className={`flex items-center gap-3 p-3.5 ${hasDetails ? "cursor-pointer" : ""}`} onClick={() => hasDetails && setExpandedRsvp(isExpanded ? null : rsvp.id)}>
                              <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-semibold" style={{ backgroundColor: statusBg, color: statusColor }}>
                                {rsvp.guestName.charAt(0).toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm truncate">{rsvp.guestName}</div>
                                <div className="text-xs text-[oklch(0.45_0.02_265)]">{rsvp.guestEmail || "No email"}{rsvp.plusOnes ? ` · +${rsvp.plusOnes}` : ""}</div>
                              </div>
                              <span className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize border" style={{ backgroundColor: statusBg, color: statusColor, borderColor: statusColor }}>
                                {rsvp.status}
                              </span>
                            </div>
                            <AnimatePresence>
                              {isExpanded && (hasDetails as boolean) && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={t} className="overflow-hidden">
                                  <div className="px-3.5 pb-3.5 space-y-2 border-t border-[oklch(1_0_0/6%)] pt-3">
                                    {rsvp.message && (
                                      <div className="flex items-start gap-2">
                                        <MessageSquare className="w-3.5 h-3.5 text-[oklch(0.5_0.02_265)] mt-0.5" />
                                        <p className="text-sm text-[oklch(0.65_0.02_265)]">{rsvp.message}</p>
                                      </div>
                                    )}
                                    {(rsvp.surveyResponses != null && typeof rsvp.surveyResponses === "object") && (
                                      <div className="space-y-1.5">
                                        {Object.entries(rsvp.surveyResponses as Record<string, string>).map(([key, val]) => (
                                          <div key={key} className="flex items-center gap-2 text-xs">
                                            <span className="text-[oklch(0.5_0.02_265)] font-medium">{key}:</span>
                                            <span className="text-[oklch(0.65_0.02_265)]">{String(val)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        );
                      })}
                    </div>
                  )}
                </GlassCard>

                {/* Settings — one card, three switch rows. Replaces 4 stacked
                    GlassCards with a single grouped surface. */}
                <GlassCard className="overflow-hidden">
                  <div className="px-6 pt-5 pb-3">
                    <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[oklch(0.5_0.02_265)]">
                      Settings
                    </p>
                  </div>
                  <div className="divide-y divide-[oklch(1_0_0/6%)]">
                    <SettingRow
                      icon={MessageSquare}
                      iconBg="oklch(0.75 0.15 55 / 12%)"
                      iconColor="oklch(0.75 0.15 55)"
                      label="Text blasts"
                      desc="SMS broadcast to your guest list"
                      checked={event.smsBroadcastEnabled === "1"}
                      onToggle={toggleSms}
                    />
                    <SettingRow
                      icon={Image}
                      iconBg="oklch(0.65 0.18 300 / 12%)"
                      iconColor="oklch(0.65 0.18 300)"
                      label="Memory Wall"
                      desc="Guest photo gallery + moderation"
                      checked={event.memoryWallEnabled === "1"}
                      onToggle={toggleMemoryWall}
                    />
                    <SettingRow
                      icon={Eye}
                      iconBg="oklch(0.7 0.15 220 / 12%)"
                      iconColor="oklch(0.7 0.15 220)"
                      label="Public discovery"
                      desc="Surface in the Find an event search"
                      checked={!!event.isPublic}
                      onToggle={togglePublic}
                    />
                    {event.isPublic && (
                      <div className="px-6 py-4 flex items-center justify-between gap-4 bg-[oklch(1_0_0/2%)]">
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] font-medium">Public claim flow</p>
                          <p className="text-[11px] text-[oklch(0.5_0.02_265)] mt-0.5">
                            {event.claimMode === "name-list"
                              ? "Visitors find their pre-loaded name → assigned a table"
                              : "One-tap join — anyone can RSVP"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={toggleClaimMode}
                          className="text-[10px] font-semibold uppercase tracking-[0.12em] px-3 py-2 rounded-lg bg-[oklch(1_0_0/5%)] hover:bg-[oklch(1_0_0/9%)] border border-[oklch(1_0_0/8%)] transition-colors flex-shrink-0"
                        >
                          {event.claimMode === "name-list" ? "Open RSVP" : "Name list"}
                        </button>
                      </div>
                    )}
                  </div>
                </GlassCard>

                {/* Quick links — one card, three rows. Replaces 3 nav cards. */}
                <GlassCard className="overflow-hidden">
                  <div className="px-6 pt-5 pb-3">
                    <p className="text-[10px] font-semibold tracking-[0.18em] uppercase text-[oklch(0.5_0.02_265)]">
                      Quick links
                    </p>
                  </div>
                  <div className="divide-y divide-[oklch(1_0_0/6%)]">
                    {event.memoryWallEnabled === "1" && (
                      <QuickLinkRow
                        icon={Image}
                        iconBg="oklch(0.65 0.18 300 / 12%)"
                        iconColor="oklch(0.65 0.18 300)"
                        label="View Memory Wall"
                        desc="Open the photo gallery"
                        onClick={() => navigate(`/memory/${event.slug}`)}
                      />
                    )}
                    <QuickLinkRow
                      icon={MessageSquare}
                      iconBg="oklch(0.75 0.15 55 / 12%)"
                      iconColor="oklch(0.75 0.15 55)"
                      label="Group chats"
                      desc="Host conversations with guests"
                      onClick={() => navigate(`/chats/${event.slug}`)}
                    />
                    <QuickLinkRow
                      icon={Zap}
                      iconBg="oklch(0.78 0.16 60 / 14%)"
                      iconColor="oklch(0.78 0.16 60)"
                      label="Live event mode"
                      desc="Real-time photo wall + check-in"
                      onClick={() => navigate(`/live/${event.slug}`)}
                    />
                    {surveyConfig.length > 0 && (
                      <div className="px-6 py-4 flex items-center gap-3.5">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                          style={{ background: "oklch(0.6 0.16 180 / 12%)" }}
                        >
                          <ClipboardList className="w-4 h-4" style={{ color: "oklch(0.6 0.16 180)" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">Survey questions</p>
                          <p className="text-[11px] text-[oklch(0.5_0.02_265)] mt-0.5">
                            {surveyConfig.length} active question{surveyConfig.length !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                </GlassCard>

                {/* Danger zone — kept separate, intentional visual rest. */}
                <button
                  type="button"
                  onClick={() => { if (confirm("Are you sure you want to delete this event?")) deleteMutation.mutate(); }}
                  className="w-full text-[12px] font-semibold tracking-[0.04em] text-[oklch(0.7_0.15_25)] hover:text-[oklch(0.78_0.18_25)] transition-colors py-4"
                >
                  Delete event
                </button>
              </motion.div>
            )}

            {/* ─── ANALYTICS TAB ─── */}
            {activeTab === "analytics" && (
              <motion.div key="analytics" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={t} className="space-y-5">
                {/* Key Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: "Portal Views", value: analytics?.portal?.totalViews ?? 0, icon: Eye, color: "oklch(0.75 0.15 55)" },
                    { label: "Unique Visitors", value: analytics?.portal?.uniqueVisitors ?? 0, icon: Users, color: "oklch(0.72 0.16 255)" },
                    { label: "Conversion Rate", value: `${analytics?.conversionRate ?? 0}%`, icon: TrendingUp, color: "oklch(0.7 0.15 160)" },
                    { label: "Total RSVPs", value: total, icon: UserCheck, color: "oklch(0.7 0.12 60)" },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <GlassCard key={label} variant="strong" className="p-5 text-center">
                      <Icon className="w-5 h-5 mx-auto mb-3" style={{ color }} />
                      <div className="text-2xl sm:text-3xl font-bold tracking-tight">{value}</div>
                      <div className="text-[0.6875rem] text-[oklch(0.5_0.02_265)] font-medium mt-1">{label}</div>
                    </GlassCard>
                  ))}
                </div>

                {/* RSVP Breakdown Pie */}
                {rsvpPieData.length > 0 && (
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-5 flex items-center gap-2">
                      <BarChart3 className="w-4 h-4 text-[oklch(0.75_0.15_55)]" />
                      RSVP Breakdown
                    </h3>
                    <div className="flex items-center gap-8">
                      <div className="w-40 h-40 flex-shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={rsvpPieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value" strokeWidth={0}>
                              {rsvpPieData.map((entry, idx) => (
                                <Cell key={idx} fill={entry.color} />
                              ))}
                            </Pie>
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-3 flex-1">
                        {rsvpPieData.map(({ name, value, color }) => (
                          <div key={name} className="flex items-center gap-3">
                            <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                            <span className="text-sm text-[oklch(0.6_0.02_265)] flex-1">{name}</span>
                            <span className="text-sm font-semibold">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </GlassCard>
                )}

                {/* Portal Views Timeline */}
                {analytics?.portal?.viewsByDay && analytics.portal.viewsByDay.length > 0 && (
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-5 flex items-center gap-2">
                      <Eye className="w-4 h-4 text-[oklch(0.75_0.15_55)]" />
                      Portal Views Over Time
                    </h3>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analytics.portal.viewsByDay}>
                          <defs>
                            <linearGradient id="viewsGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="oklch(0.75 0.15 55)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="oklch(0.75 0.15 55)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{ fill: "oklch(0.5 0.02 265)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "oklch(0.5 0.02 265)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <RechartsTooltip contentStyle={{ backgroundColor: "oklch(0.12 0.02 285)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, color: "oklch(0.93 0.01 90)" }} />
                          <Area type="monotone" dataKey="views" stroke="oklch(0.75 0.15 55)" fill="url(#viewsGrad)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </GlassCard>
                )}

                {/* Photo Upload Timeline */}
                {analytics?.photoTimeline && analytics.photoTimeline.length > 0 && (
                  <GlassCard className="p-6">
                    <h3 className="font-semibold mb-5 flex items-center gap-2">
                      <Camera className="w-4 h-4 text-[oklch(0.65_0.18_300)]" />
                      Photo Upload Activity
                    </h3>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={analytics.photoTimeline}>
                          <defs>
                            <linearGradient id="photosGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="oklch(0.65 0.18 300)" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="oklch(0.65 0.18 300)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <XAxis dataKey="date" tick={{ fill: "oklch(0.5 0.02 265)", fontSize: 11 }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fill: "oklch(0.5 0.02 265)", fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                          <RechartsTooltip contentStyle={{ backgroundColor: "oklch(0.12 0.02 285)", border: "1px solid oklch(1 0 0 / 10%)", borderRadius: 12, color: "oklch(0.93 0.01 90)" }} />
                          <Area type="monotone" dataKey="count" stroke="oklch(0.65 0.18 300)" fill="url(#photosGrad)" strokeWidth={2} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </GlassCard>
                )}

                {/* Guest Delivery Stats */}
                <GlassCard className="p-6">
                  <h3 className="font-semibold mb-5 flex items-center gap-2">
                    <Send className="w-4 h-4 text-[oklch(0.75_0.15_55)]" />
                    Notification Delivery
                  </h3>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: "Total", count: analytics?.guestStats?.total ?? guestStats.total, color: "oklch(0.75 0.15 55)" },
                      { label: "Pending", count: analytics?.guestStats?.pending ?? guestStats.pending, color: "oklch(0.7 0.12 60)" },
                      { label: "Sent", count: analytics?.guestStats?.sent ?? guestStats.sent, color: "oklch(0.7 0.15 160)" },
                      { label: "Failed", count: analytics?.guestStats?.failed ?? guestStats.failed, color: "oklch(0.7 0.15 25)" },
                    ].map(({ label, count, color }) => (
                      <div key={label} className="text-center p-3 rounded-xl bg-[oklch(1_0_0/3%)] border border-[oklch(1_0_0/6%)]">
                        <div className="text-xl font-bold" style={{ color }}>{count}</div>
                        <div className="text-[0.625rem] text-[oklch(0.5_0.02_265)] font-medium">{label}</div>
                      </div>
                    ))}
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {/* ─── GUESTS TAB ─── */}
            {activeTab === "guests" && (
              <motion.div key="guests" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={t} className="space-y-5">
                {/* Guest Stats */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Pending", count: guestStats.pending, color: "oklch(0.7 0.12 60)", icon: Clock },
                    { label: "Sent", count: guestStats.sent, color: "oklch(0.7 0.15 160)", icon: CheckCircle2 },
                    { label: "Failed", count: guestStats.failed, color: "oklch(0.7 0.15 25)", icon: AlertCircle },
                  ].map(({ label, count, color, icon: Icon }) => (
                    <GlassCard key={label} variant="subtle" className="p-4 text-center">
                      <Icon className="w-5 h-5 mx-auto mb-2" style={{ color }} />
                      <div className="text-2xl font-bold tracking-tight">{count}</div>
                      <div className="text-[0.6875rem] text-[oklch(0.5_0.02_265)] font-medium">{label}</div>
                    </GlassCard>
                  ))}
                </div>

                {/* Actions */}
                <GlassCard className="p-5">
                  <div className="flex flex-wrap gap-3">
                    <LiquidButton variant="glass" size="sm" onClick={() => setShowAddGuest(!showAddGuest)} className="gap-2">
                      <UserPlus className="w-4 h-4" /> Add Guest
                    </LiquidButton>
                    <LiquidButton variant="glass" size="sm" onClick={() => setShowInviteFriends(!showInviteFriends)} className="gap-2">
                      <Heart className="w-4 h-4" /> Invite Friends
                    </LiquidButton>
                    <LiquidButton variant="glass" size="sm" onClick={() => setShowImport(!showImport)} className="gap-2">
                      <Upload className="w-4 h-4" /> Import CSV
                    </LiquidButton>
                    <input type="file" ref={fileInputRef} accept=".csv,.txt,.tsv" onChange={handleFileUpload} className="hidden" />
                    <LiquidButton variant="glass" size="sm" onClick={() => fileInputRef.current?.click()} className="gap-2">
                      <FileText className="w-4 h-4" /> Upload File
                    </LiquidButton>
                    <LiquidButton variant="glass" size="sm" onClick={handleOracle} loading={oracleMut.isPending} className="gap-2">
                      <Wand2 className="w-4 h-4" /> Social Oracle
                    </LiquidButton>
                  </div>
                </GlassCard>

                {/* Social Oracle Results */}
                <AnimatePresence>
                  {showOracle && oracleMut.data && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={t}>
                      <GlassCard variant="strong" className="p-6">
                        <div className="flex items-center gap-3 mb-5">
                          <div className="w-10 h-10 rounded-xl bg-[oklch(0.65_0.18_300/12%)] flex items-center justify-center">
                            <Wand2 className="w-5 h-5 text-[oklch(0.65_0.18_300)]" />
                          </div>
                          <div>
                            <p className="font-semibold text-sm">Social Oracle Suggestions</p>
                            <p className="text-xs text-[oklch(0.45_0.02_265)]">AI-curated guest archetypes for your event</p>
                          </div>
                          <button onClick={() => setShowOracle(false)} className="ml-auto p-1.5 rounded-lg hover:bg-[oklch(1_0_0/8%)] transition-colors">
                            <X className="w-4 h-4 text-[oklch(0.5_0.02_265)]" />
                          </button>
                        </div>
                        <div className="space-y-3">
                          {(oracleMut.data.suggestions || []).map((s: any, i: number) => (
                            <motion.div
                              key={i}
                              initial={{ opacity: 0, x: -20 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ ...t, delay: i * 0.08 }}
                              className="p-4 rounded-xl bg-[oklch(1_0_0/3%)] border border-[oklch(1_0_0/6%)]"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <Zap className="w-4 h-4 text-[oklch(0.75_0.15_55)]" />
                                <span className="font-semibold text-sm">{s.role}</span>
                              </div>
                              <p className="text-sm text-[oklch(0.6_0.02_265)] mb-2">{s.reason}</p>
                              <p className="text-xs text-[oklch(0.5_0.02_265)] italic">"{s.icebreaker}"</p>
                            </motion.div>
                          ))}
                        </div>
                      </GlassCard>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Invite Friends Form */}
                <AnimatePresence>
                  {showInviteFriends && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={t}>
                      <GlassCard variant="strong" className="p-6 space-y-4">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold text-sm">Invite Friends</h4>
                          <button onClick={() => setShowInviteFriends(false)} className="p-1.5 rounded-lg hover:bg-[oklch(1_0_0/8%)] text-[oklch(0.5_0.02_265)]"><X className="w-4 h-4" /></button>
                        </div>
                        {friendsList.length === 0 ? (
                          <div className="text-center py-6">
                            <p className="text-sm text-[oklch(0.5_0.02_265)] mb-2">No friends on ivari yet.</p>
                            <button onClick={() => navigate("/profile")} className="text-xs underline text-[oklch(0.7_0.15_55)]">
                              Find people to add →
                            </button>
                          </div>
                        ) : (
                          <>
                            <p className="text-xs text-[oklch(0.5_0.02_265)]">
                              Selected friends will appear in their "I'm Attending" list automatically — no QR claim needed.
                            </p>
                            <div className="space-y-2 max-h-72 overflow-y-auto">
                              {friendsList.map((f: any) => {
                                const checked = selectedFriendIds.has(f._id);
                                return (
                                  <button
                                    key={f._id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedFriendIds((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(f._id)) next.delete(f._id);
                                        else next.add(f._id);
                                        return next;
                                      });
                                    }}
                                    className={`w-full flex items-center gap-3 p-3 rounded-xl border text-left transition-colors ${checked ? "bg-[oklch(0.75_0.15_55/12%)] border-[oklch(0.75_0.15_55/40%)]" : "bg-[oklch(1_0_0/2%)] border-[oklch(1_0_0/6%)] hover:bg-[oklch(1_0_0/4%)]"}`}
                                  >
                                    {f.avatarUrl ? (
                                      <img src={f.avatarUrl} alt="" className="w-9 h-9 rounded-full object-cover" />
                                    ) : (
                                      <div className="w-9 h-9 rounded-full bg-[oklch(1_0_0/8%)]" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <div className="text-sm font-medium truncate">{f.username ? `@${f.username}` : f.name || "ivari user"}</div>
                                      {f.email && <div className="text-xs text-[oklch(0.5_0.02_265)] truncate">{f.email}</div>}
                                    </div>
                                    <div className={`w-5 h-5 rounded-md border flex items-center justify-center flex-shrink-0 ${checked ? "bg-[oklch(0.75_0.15_55)] border-[oklch(0.75_0.15_55)]" : "border-[oklch(1_0_0/20%)]"}`}>
                                      {checked && <Check className="w-3.5 h-3.5 text-white" />}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                            <div className="flex gap-3 pt-2">
                              <LiquidButton
                                size="sm"
                                disabled={selectedFriendIds.size === 0}
                                onClick={async () => {
                                  if (!eventId) return;
                                  try {
                                    const res = await addFromFriendsFn({
                                      eventId,
                                      friendUserIds: Array.from(selectedFriendIds) as Id<"users">[],
                                    });
                                    toast.success(`Invited ${res.added} friend${res.added === 1 ? "" : "s"}${res.skipped.length ? ` · ${res.skipped.length} skipped` : ""}`);
                                    setSelectedFriendIds(new Set());
                                    setShowInviteFriends(false);
                                  } catch (err: any) {
                                    toast.error(err?.message ?? "Invite failed");
                                  }
                                }}
                                className="gap-2"
                              >
                                <UserPlus className="w-4 h-4" /> Invite {selectedFriendIds.size || ""}
                              </LiquidButton>
                              <LiquidButton size="sm" variant="ghost" onClick={() => { setSelectedFriendIds(new Set()); setShowInviteFriends(false); }}>
                                Cancel
                              </LiquidButton>
                            </div>
                          </>
                        )}
                      </GlassCard>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Add Guest Form */}
                <AnimatePresence>
                  {showAddGuest && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={t}>
                      <GlassCard variant="strong" className="p-6 space-y-4">
                        <h4 className="font-semibold text-sm">Add Guest</h4>
                        <input type="text" value={newGuestName} onChange={(e) => setNewGuestName(e.target.value)} placeholder="Name *" className="glass-input" />
                        <div className="grid grid-cols-2 gap-3">
                          <input type="email" value={newGuestEmail} onChange={(e) => setNewGuestEmail(e.target.value)} placeholder="Email" className="glass-input" />
                          <input type="tel" value={newGuestPhone} onChange={(e) => setNewGuestPhone(e.target.value)} placeholder="Phone" className="glass-input" />
                        </div>
                        <div className="flex gap-3">
                          <LiquidButton onClick={handleAddGuest} loading={addGuestMutation.isPending} size="sm" className="gap-2"><UserPlus className="w-4 h-4" /> Add</LiquidButton>
                          <LiquidButton variant="ghost" size="sm" onClick={() => setShowAddGuest(false)}>Cancel</LiquidButton>
                        </div>
                      </GlassCard>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* CSV Import */}
                <AnimatePresence>
                  {showImport && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={t}>
                      <GlassCard variant="strong" className="p-6 space-y-4">
                        <h4 className="font-semibold text-sm">Import Guest List</h4>
                        <p className="text-xs text-[oklch(0.5_0.02_265)]">
                          Supports columns: <span className="font-mono">name, email, phone, table, seat, diet, notes, host note</span>. First row should be headers.
                        </p>
                        <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={"name,email,phone,table,seat,diet,notes,host note\nAlex Morgan,alex@example.com,555-0101,7,3,Vegan,Looking forward!,VIP"} rows={6} className="glass-input font-mono text-xs" />
                        <div className="flex flex-wrap gap-3">
                          <LiquidButton onClick={handleImportCSV} loading={importCsvMutation.isPending} size="sm" className="gap-2"><Upload className="w-4 h-4" /> Import</LiquidButton>
                          <LiquidButton variant="ghost" size="sm" onClick={handleDownloadSampleCsv} className="gap-2"><Download className="w-4 h-4" /> Download sample CSV</LiquidButton>
                          <LiquidButton variant="ghost" size="sm" onClick={() => { setShowImport(false); setCsvText(""); }}>Cancel</LiquidButton>
                        </div>
                      </GlassCard>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Guest List */}
                <GlassCard className="p-6">
                  <h3 className="font-semibold mb-4">Guest List ({guestList.length})</h3>
                  {guestList.length === 0 ? (
                    <div className="text-center py-10">
                      <Users className="w-10 h-10 mx-auto mb-3 text-[oklch(0.3_0.02_265)]" />
                      <p className="text-sm text-[oklch(0.45_0.02_265)] mb-1">No guests imported yet</p>
                      <p className="text-xs text-[oklch(0.4_0.02_265)]">Add guests manually or import a CSV file</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {guestList.map((guest, i) => (
                        <motion.div
                          key={guest.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ ...t, delay: i * 0.03 }}
                          className="flex items-center gap-3 p-3.5 rounded-xl bg-[oklch(1_0_0/2%)] border border-[oklch(1_0_0/6%)] group"
                        >
                          {guest.claimerAvatarUrl ? (
                            <img src={guest.claimerAvatarUrl} alt="" className="w-9 h-9 rounded-xl object-cover" />
                          ) : (
                            <div className="w-9 h-9 rounded-xl bg-[oklch(0.75_0.15_55/12%)] flex items-center justify-center text-sm font-semibold text-[oklch(0.75_0.15_55)]">
                              {guest.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate flex items-center gap-1.5">
                              {guest.name}
                              {guest.hasIvariAccount && (
                                <span title="Has an ivari account" className="inline-flex items-center gap-0.5 text-[oklch(0.7_0.15_220)]">
                                  <BadgeCheck className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-[oklch(0.45_0.02_265)]">
                              {guest.claimerUsername && <span className="text-[oklch(0.7_0.15_220)]">@{guest.claimerUsername}</span>}
                              {guest.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{guest.email}</span>}
                              {guest.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{guest.phone}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {statusIcon(guest.notificationStatus)}
                            <button onClick={() => handleCopyGuestLink(guest.id)} className="p-1.5 rounded-lg hover:bg-[oklch(1_0_0/8%)] text-[oklch(0.5_0.02_265)] hover:text-foreground transition-colors opacity-0 group-hover:opacity-100" title="Copy portal link">
                              {copiedGuestId === guest.id ? <Check className="w-3.5 h-3.5" /> : <Link2 className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => { if (confirm(`Remove ${guest.name}?`)) removeGuestMutation.mutate({ guestId: guest.id, eventId }); }} className="p-1.5 rounded-lg hover:bg-[oklch(1_0_0/8%)] text-[oklch(0.5_0.02_265)] hover:text-[oklch(0.7_0.15_25)] transition-colors opacity-0 group-hover:opacity-100" title="Remove guest">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            )}

            {/* ─── SEATING TAB ─── */}
            {activeTab === "seating" && eventId && event && (
              <motion.div key="seating" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={t}>
                <SeatingChart
                  eventId={eventId}
                  guests={guestList}
                  tables={(event as any).tablesConfig ?? []}
                />
              </motion.div>
            )}

            {/* ─── NOTIFICATIONS TAB ─── */}
            {activeTab === "notifications" && (
              <motion.div key="notifications" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={t} className="space-y-5">
                {/* Send Blast */}
                <GlassCard variant="strong" className="p-6 space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[oklch(0.75_0.15_55/12%)] flex items-center justify-center">
                      <Send className="w-5 h-5 text-[oklch(0.75_0.15_55)]" />
                    </div>
                    <div>
                      <p className="font-semibold">Send Invitations</p>
                      <p className="text-xs text-[oklch(0.45_0.02_265)]">
                        {guestStats.pending > 0 ? `${guestStats.pending} pending guest${guestStats.pending !== 1 ? "s" : ""} to notify` : "All guests have been notified"}
                      </p>
                    </div>
                  </div>

                  <textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} placeholder="Custom message (optional) — portal link will be appended automatically" rows={3} className="glass-input text-sm" />

                  <div className="flex gap-3">
                    <LiquidButton onClick={handleSendBlast} loading={sendBlastMutation.isPending} disabled={guestStats.pending === 0 && guestStats.failed === 0} className="gap-2">
                      <Send className="w-4 h-4" />
                      Send to {guestStats.pending + guestStats.failed} Guest{(guestStats.pending + guestStats.failed) !== 1 ? "s" : ""}
                    </LiquidButton>
                    {guestStats.failed > 0 && (
                      <LiquidButton variant="glass" size="sm" onClick={() => resendFailedMutation.mutate({ eventId, origin: window.location.origin })} loading={resendFailedMutation.isPending} className="gap-2">
                        <RotateCcw className="w-4 h-4" /> Retry {guestStats.failed} Failed
                      </LiquidButton>
                    )}
                  </div>
                </GlassCard>

                {/* Delivery Summary */}
                <GlassCard className="p-6">
                  <h3 className="font-semibold mb-4">Delivery Summary</h3>
                  <div className="grid grid-cols-4 gap-3 mb-6">
                    {[
                      { label: "Total", count: guestStats.total, color: "oklch(0.75 0.15 55)" },
                      { label: "Pending", count: guestStats.pending, color: "oklch(0.7 0.12 60)" },
                      { label: "Sent", count: guestStats.sent, color: "oklch(0.7 0.15 160)" },
                      { label: "Failed", count: guestStats.failed, color: "oklch(0.7 0.15 25)" },
                    ].map(({ label, count, color }) => (
                      <div key={label} className="text-center p-3 rounded-xl bg-[oklch(1_0_0/3%)] border border-[oklch(1_0_0/6%)]">
                        <div className="text-xl font-bold" style={{ color }}>{count}</div>
                        <div className="text-[0.625rem] text-[oklch(0.5_0.02_265)] font-medium">{label}</div>
                      </div>
                    ))}
                  </div>

                  {guestStats.total > 0 && (
                    <div>
                      <div className="flex justify-between text-xs mb-1.5 text-[oklch(0.5_0.02_265)]">
                        <span>Delivery Progress</span>
                        <span>{Math.round((guestStats.sent / guestStats.total) * 100)}%</span>
                      </div>
                      <div className="liquid-progress h-2 bg-[oklch(1_0_0/6%)]">
                        <motion.div className="liquid-progress-fill" initial={{ width: 0 }} animate={{ width: `${(guestStats.sent / guestStats.total) * 100}%` }} transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }} />
                      </div>
                    </div>
                  )}
                </GlassCard>

                {/* Notification History */}
                <GlassCard className="p-6">
                  <h3 className="font-semibold mb-4">Notification History</h3>
                  {notificationList.length === 0 ? (
                    <div className="text-center py-8">
                      <Send className="w-8 h-8 mx-auto mb-3 text-[oklch(0.3_0.02_265)]" />
                      <p className="text-sm text-[oklch(0.45_0.02_265)]">No notifications sent yet</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {notificationList.map((notif) => (
                        <div key={notif.id} className="p-4 rounded-xl bg-[oklch(1_0_0/2%)] border border-[oklch(1_0_0/6%)]">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium capitalize">{notif.type}</span>
                            <span className="text-xs text-[oklch(0.45_0.02_265)]">
                              {notif.createdAt ? format(new Date(notif.createdAt), "MMM d, h:mm a") : ""}
                            </span>
                          </div>
                          <p className="text-xs text-[oklch(0.55_0.02_265)] mb-2">{notif.subject}</p>
                          <div className="flex gap-4 text-xs text-[oklch(0.5_0.02_265)]">
                            <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {notif.recipientCount} targeted</span>
                            <span className="flex items-center gap-1 text-[oklch(0.7_0.15_160)]"><CheckCircle2 className="w-3 h-3" /> {notif.sentCount} sent</span>
                            {(notif.failedCount || 0) > 0 && (
                              <span className="flex items-center gap-1 text-[oklch(0.7_0.15_25)]"><AlertCircle className="w-3 h-3" /> {notif.failedCount} failed</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* V7 Invitation preview — animated dry-run of the guest experience */}
      {event && (
        <InvitationPreview
          event={{
            _id: event.id,
            title: event.title,
            description: event.description,
            eventDate: event.eventDate,
            locationName: event.locationName,
            themeColor: event.themeColor,
            imageUrl: event.imageUrl,
          }}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      )}
    </div>
  );
}
