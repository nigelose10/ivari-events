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
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { AmbientBackground } from "@/components/AmbientBackground";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Copy, Check, Users, UserCheck, UserX, HelpCircle,
  Link2, MessageSquare, Calendar, MapPin, Image, Sparkles,
  Pencil, X, Save, Trash2, ChevronDown, ChevronUp, ClipboardList,
  Upload, UserPlus, Send, RotateCcw, FileText, Mail, Phone,
  ExternalLink, AlertCircle, CheckCircle2, Clock,
  BarChart3, Eye, TrendingUp, QrCode, Download, Wand2,
  Camera, Zap,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

const t = { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const };

type Tab = "overview" | "analytics" | "guests" | "notifications";

export default function Pulse() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const params = useParams<{ id: string }>();
  const eventId = Number(params.id);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showAllRsvps, setShowAllRsvps] = useState(false);
  const [expandedRsvp, setExpandedRsvp] = useState<number | null>(null);
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
  const [newGuestName, setNewGuestName] = useState("");
  const [newGuestEmail, setNewGuestEmail] = useState("");
  const [newGuestPhone, setNewGuestPhone] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notification state
  const [customMessage, setCustomMessage] = useState("");
  const [copiedGuestId, setCopiedGuestId] = useState<number | null>(null);

  // QR Code state
  const [qrData, setQrData] = useState<{ dataUrl: string; downloadUrl: string; portalUrl: string } | null>(null);

  // Social Oracle state
  const [showOracle, setShowOracle] = useState(false);

  // Queries
  const eventQuery = trpc.events.get.useQuery({ id: eventId }, { enabled: !!eventId });
  const rsvpCountsQuery = trpc.rsvps.counts.useQuery({ eventId }, { enabled: !!eventId });
  const rsvpsQuery = trpc.rsvps.list.useQuery({ eventId }, { enabled: !!eventId });
  const guestsQuery = trpc.guests.list.useQuery({ eventId }, { enabled: !!eventId });
  const notificationsQuery = trpc.notifications.list.useQuery({ eventId }, { enabled: !!eventId });
  const analyticsQuery = trpc.analytics.getStats.useQuery({ eventId }, { enabled: !!eventId && activeTab === "analytics" });

  const utils = trpc.useUtils();

  // Mutations
  const guestLinkMutation = trpc.events.getGuestLink.useMutation();
  const updateMutation = trpc.events.update.useMutation({
    onSuccess: () => { eventQuery.refetch(); setEditing(false); toast.success("Event updated"); },
    onError: (err) => toast.error(err.message),
  });
  const regenMutation = trpc.nanoBanana.generate.useMutation({
    onSuccess: (data) => {
      if (event) updateMutation.mutate({ id: event.id, imageUrl: data.imageUrl, imagePrompt: data.prompt });
      toast.success("New image generated!");
    },
    onError: (err) => toast.error(err.message),
  });
  const deleteMutation = trpc.events.delete.useMutation({
    onSuccess: () => { toast.success("Event deleted"); navigate("/"); },
    onError: (err) => toast.error(err.message),
  });
  const importCsvMutation = trpc.guests.importCSV.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.imported} guests imported`);
      setCsvText(""); setShowImport(false);
      utils.guests.list.invalidate({ eventId });
    },
    onError: (err) => toast.error(err.message),
  });
  const addGuestMutation = trpc.guests.add.useMutation({
    onSuccess: () => {
      toast.success("Guest added");
      setNewGuestName(""); setNewGuestEmail(""); setNewGuestPhone("");
      setShowAddGuest(false);
      utils.guests.list.invalidate({ eventId });
    },
    onError: (err) => toast.error(err.message),
  });
  const removeGuestMutation = trpc.guests.remove.useMutation({
    onSuccess: () => { toast.success("Guest removed"); utils.guests.list.invalidate({ eventId }); },
    onError: (err) => toast.error(err.message),
  });
  const sendBlastMutation = trpc.notifications.sendBlast.useMutation({
    onSuccess: (data) => {
      toast.success(`Sent to ${data.sent} of ${data.total} guests`);
      utils.guests.list.invalidate({ eventId });
      utils.notifications.list.invalidate({ eventId });
      setCustomMessage("");
    },
    onError: (err) => toast.error(err.message),
  });
  const resendFailedMutation = trpc.notifications.resendFailed.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.reset} guests reset for retry`);
      utils.guests.list.invalidate({ eventId });
    },
    onError: (err) => toast.error(err.message),
  });
  const changeStatusMut = trpc.events.changeStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`Status changed to ${data.newStatus}`);
      eventQuery.refetch();
      utils.guests.list.invalidate({ eventId });
      utils.notifications.list.invalidate({ eventId });
    },
    onError: (err) => toast.error(err.message),
  });
  const duplicateMut = trpc.events.duplicate.useMutation({
    onSuccess: (data) => {
      toast.success("Event duplicated as draft");
      navigate(`/pulse/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });
  const qrCodeMut = trpc.qrcode.generate.useMutation({
    onSuccess: (data) => setQrData(data),
    onError: (err) => toast.error(err.message),
  });
  const oracleMut = trpc.guests.suggest.useMutation({
    onError: (err) => toast.error(err.message),
  });
  const generatePreviewMut = trpc.invitationPreview.generate.useMutation({
    onSuccess: (data) => {
      window.open(data.url, "_blank");
      toast.success("Invitation preview generated! Opening in new tab.");
    },
    onError: (err) => toast.error("Preview generation failed: " + err.message),
  });

  const event = eventQuery.data;
  const counts = rsvpCountsQuery.data;
  const rsvpList = rsvpsQuery.data || [];
  const guestList = guestsQuery.data || [];
  const notificationList = notificationsQuery.data || [];
  const analytics = analyticsQuery.data;

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
      const result = await guestLinkMutation.mutateAsync({ id: event.id, origin: window.location.origin });
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
      toast.success("Guest portal link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch (err: any) {
      toast.error("Failed to generate link: " + err.message);
    }
  }, [event, guestLinkMutation]);

  const handleCopyGuestLink = useCallback(async (guestId: number) => {
    if (!event) return;
    try {
      const result = await fetch(`/api/trpc/guests.getLink?input=${encodeURIComponent(JSON.stringify({ guestId, eventId: event.id, origin: window.location.origin }))}`);
      const json = await result.json();
      const url = json?.result?.data?.url;
      if (url) {
        await navigator.clipboard.writeText(url);
        setCopiedGuestId(guestId);
        toast.success("Guest link copied!");
        setTimeout(() => setCopiedGuestId(null), 2000);
      }
    } catch {
      toast.error("Failed to copy link");
    }
  }, [event]);

  const toggleSms = useCallback(() => {
    if (!event) return;
    updateMutation.mutate({ id: event.id, smsBroadcastEnabled: event.smsBroadcastEnabled === "1" ? "0" : "1" });
  }, [event, updateMutation]);

  const toggleMemoryWall = useCallback(() => {
    if (!event) return;
    updateMutation.mutate({ id: event.id, memoryWallEnabled: event.memoryWallEnabled === "1" ? "0" : "1" });
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
    qrCodeMut.mutate({ eventId: event.id, origin: window.location.origin });
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
  if (eventQuery.isLoading) {
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
          <LiquidButton onClick={() => navigate("/")} variant="ghost">Back to Ledger</LiquidButton>
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
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-[oklch(0.5_0.02_265)] hover:text-foreground transition-colors duration-300 mb-5">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">The Ledger</span>
          </button>

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

      {/* Tab Navigation */}
      <div className="relative z-10 px-6 mt-8 mb-6">
        <div className="max-w-3xl mx-auto">
          <GlassCard variant="subtle" className="p-1.5 inline-flex gap-1 flex-wrap">
            {(["overview", "analytics", "guests", "notifications"] as Tab[]).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-500 capitalize flex items-center gap-2 ${
                  activeTab === tab
                    ? "bg-[oklch(0.75_0.15_55/15%)] text-foreground shadow-[0_0_12px_oklch(0.75_0.15_55/10%)]"
                    : "text-[oklch(0.5_0.02_265)] hover:text-foreground hover:bg-[oklch(1_0_0/5%)]"
                }`}
              >
                {tab === "analytics" && <BarChart3 className="w-3.5 h-3.5" />}
                {tab === "guests" ? `Guests (${guestStats.total})` : tab}
              </button>
            ))}
          </GlassCard>
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

                {/* Controls Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <GlassCard variant="subtle" className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[oklch(0.75_0.15_55/12%)] flex items-center justify-center">
                          <MessageSquare className="w-4 h-4 text-[oklch(0.75_0.15_55)]" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">Text Blasts</p>
                          <p className="text-[0.6875rem] text-[oklch(0.45_0.02_265)]">SMS broadcast</p>
                        </div>
                      </div>
                      <div className="glass-toggle" data-state={event.smsBroadcastEnabled === "1" ? "on" : "off"} onClick={toggleSms}>
                        <div className="glass-toggle-thumb" />
                      </div>
                    </div>
                  </GlassCard>

                  <GlassCard variant="subtle" className="p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[oklch(0.65_0.18_300/12%)] flex items-center justify-center">
                          <Image className="w-4 h-4 text-[oklch(0.65_0.18_300)]" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">Memory Wall</p>
                          <p className="text-[0.6875rem] text-[oklch(0.45_0.02_265)]">Photo gallery</p>
                        </div>
                      </div>
                      <div className="glass-toggle" data-state={event.memoryWallEnabled === "1" ? "on" : "off"} onClick={toggleMemoryWall}>
                        <div className="glass-toggle-thumb" />
                      </div>
                    </div>
                  </GlassCard>

                  {event.memoryWallEnabled === "1" && (
                    <GlassCard variant="subtle" className="p-5 cursor-pointer" onClick={() => navigate(`/memory/${event.slug}`)} hover>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[oklch(0.65_0.18_300/12%)] flex items-center justify-center">
                          <ExternalLink className="w-4 h-4 text-[oklch(0.65_0.18_300)]" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">View Memory Wall</p>
                          <p className="text-[0.6875rem] text-[oklch(0.45_0.02_265)]">Open photo gallery</p>
                        </div>
                      </div>
                    </GlassCard>
                  )}

                  {surveyConfig.length > 0 && (
                    <GlassCard variant="subtle" className="p-5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-[oklch(0.6_0.16_180/12%)] flex items-center justify-center">
                          <ClipboardList className="w-4 h-4 text-[oklch(0.6_0.16_180)]" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">Survey Questions</p>
                          <p className="text-[0.6875rem] text-[oklch(0.45_0.02_265)]">{surveyConfig.length} question{surveyConfig.length !== 1 ? "s" : ""} active</p>
                        </div>
                      </div>
                    </GlassCard>
                  )}
                </div>

                {/* Danger Zone */}
                <GlassCard variant="subtle" className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[oklch(0.5_0.18_25/12%)] flex items-center justify-center">
                        <Trash2 className="w-4 h-4 text-[oklch(0.7_0.15_25)]" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-[oklch(0.7_0.15_25)]">Delete Event</p>
                        <p className="text-[0.6875rem] text-[oklch(0.45_0.02_265)]">This cannot be undone</p>
                      </div>
                    </div>
                    <LiquidButton variant="danger" size="sm" onClick={() => { if (confirm("Are you sure you want to delete this event?")) deleteMutation.mutate({ id: event.id }); }} loading={deleteMutation.isPending}>
                      Delete
                    </LiquidButton>
                  </div>
                </GlassCard>
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
                        <p className="text-xs text-[oklch(0.5_0.02_265)]">Paste CSV with columns: Name, Email, Phone. Headers are auto-detected.</p>
                        <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={"Name, Email, Phone\nJohn Doe, john@example.com, +1234567890"} rows={6} className="glass-input font-mono text-xs" />
                        <div className="flex gap-3">
                          <LiquidButton onClick={handleImportCSV} loading={importCsvMutation.isPending} size="sm" className="gap-2"><Upload className="w-4 h-4" /> Import</LiquidButton>
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
                          <div className="w-9 h-9 rounded-xl bg-[oklch(0.75_0.15_55/12%)] flex items-center justify-center text-sm font-semibold text-[oklch(0.75_0.15_55)]">
                            {guest.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{guest.name}</div>
                            <div className="flex items-center gap-3 text-xs text-[oklch(0.45_0.02_265)]">
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
    </div>
  );
}
