import { useState, useCallback, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { AmbientBackground } from "@/components/AmbientBackground";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, MapPin, Users, Check, Heart, X, HelpCircle,
  ChevronDown, Image, Sparkles,
} from "lucide-react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";
import { format } from "date-fns";
import { PORTAL_TRANSLATIONS } from "../../../shared/i18n";

const t = { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const };

type RsvpStatus = "attending" | "declined" | "maybe";

interface SurveyQuestion {
  id: string;
  type: "text" | "select" | "multiselect";
  label: string;
  options?: string[];
  required: boolean;
}

function useTranslations(lang: string | undefined | null) {
  return useMemo(() => {
    const code = lang || "en";
    return PORTAL_TRANSLATIONS[code] || PORTAL_TRANSLATIONS["en"];
  }, [lang]);
}

export default function Portal() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const [, navigate] = useLocation();

  const searchStr = typeof window !== "undefined" ? window.location.search : "";
  const token = useMemo(() => {
    const p = new URLSearchParams(searchStr);
    return p.get("token") || "";
  }, [searchStr]);

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [status, setStatus] = useState<RsvpStatus>("attending");
  const [plusOnes, setPlusOnes] = useState(0);
  const [message, setMessage] = useState("");
  const [surveyAnswers, setSurveyAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const eventQuery = trpc.events.getBySlug.useQuery({ slug }, { enabled: !!slug });
  const countsQuery = trpc.rsvps.publicCounts.useQuery({ slug }, { enabled: !!slug });
  const submitMutation = trpc.rsvps.submit.useMutation({
    onSuccess: () => {
      setSubmitted(true);
      countsQuery.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const event = eventQuery.data;
  const counts = countsQuery.data;
  const i18n = useTranslations(event?.language);

  // Apply event's custom theme color
  useEffect(() => {
    if (event?.themeColor) {
      document.documentElement.style.setProperty('--event-accent', event.themeColor);
    }
    return () => { document.documentElement.style.removeProperty('--event-accent'); };
  }, [event?.themeColor]);

  // Track portal view for analytics
  const trackViewMut = trpc.analytics.trackView.useMutation();
  useEffect(() => {
    if (slug) {
      trackViewMut.mutate({ slug });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Deadline & capacity enforcement
  const isDeadlinePassed = event?.rsvpDeadline ? new Date(event.rsvpDeadline).getTime() < Date.now() : false;
  const isCapacityFull = (event?.maxCapacity && event.maxCapacity > 0 && counts) ? counts.attending >= event.maxCapacity : false;
  const isEventClosed = event?.status === 'cancelled' || event?.status === 'past';
  const isRsvpClosed = isDeadlinePassed || isCapacityFull || isEventClosed;

  const surveyConfig = useMemo((): SurveyQuestion[] => {
    if (!event?.surveyConfig) return [];
    try {
      return Array.isArray(event.surveyConfig) ? (event.surveyConfig as SurveyQuestion[]) : [];
    } catch { return []; }
  }, [event?.surveyConfig]);

  const handleSubmit = useCallback(() => {
    if (!guestName.trim()) { toast.error("Please enter your name"); return; }
    if (!token) { toast.error("Invalid invitation link"); return; }
    submitMutation.mutate({
      token,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim() || undefined,
      status,
      plusOnes,
      message: message.trim() || undefined,
      surveyResponses: Object.keys(surveyAnswers).length > 0 ? surveyAnswers : undefined,
    });
  }, [token, guestName, guestEmail, status, plusOnes, message, surveyAnswers, submitMutation]);

  // Loading state
  if (eventQuery.isLoading) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <AmbientBackground />
        <motion.div className="flex flex-col items-center gap-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <motion.div
            className="w-12 h-12 rounded-full border-2 border-[oklch(0.72_0.16_255)] border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
          />
        </motion.div>
      </div>
    );
  }

  // Error state
  if (!event) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <AmbientBackground />
        <GlassCard className="p-10 text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-[oklch(0.5_0.18_25/12%)] flex items-center justify-center mx-auto mb-4">
            <X className="w-7 h-7 text-[oklch(0.7_0.15_25)]" />
          </div>
          <h2 className="text-xl font-semibold mb-2">{i18n.eventNotFound}</h2>
          <p className="text-sm text-[oklch(0.5_0.02_265)]">This link may have expired or the event was removed.</p>
        </GlassCard>
      </div>
    );
  }

  // Success state
  if (submitted) {
    const thankMsg = status === "attending" ? i18n.rsvpConfirmed
      : status === "maybe" ? i18n.rsvpMaybeMsg
        : i18n.rsvpDeclinedMsg;
    return (
      <div className="min-h-screen relative flex items-center justify-center px-6">
        <AmbientBackground />
        {event.imageUrl && (
          <div className="absolute inset-0">
            <img src={event.imageUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-[oklch(0.06_0.025_275/85%)] backdrop-blur-xl" />
          </div>
        )}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ ...t, duration: 0.8 }}
          className="relative z-10 w-full max-w-md"
        >
          <GlassCard variant="elevated" className="p-10 sm:p-12 text-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 200, damping: 15 }}
              className="w-20 h-20 rounded-full bg-[oklch(0.55_0.2_160/15%)] flex items-center justify-center mx-auto mb-6"
            >
              {status === "attending" ? (
                <Heart className="w-9 h-9 text-[oklch(0.72_0.15_160)]" />
              ) : status === "maybe" ? (
                <HelpCircle className="w-9 h-9 text-[oklch(0.72_0.15_60)]" />
              ) : (
                <X className="w-9 h-9 text-[oklch(0.72_0.15_25)]" />
              )}
            </motion.div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.03em] mb-3">
              {i18n.thankYou}
            </h2>
            <p className="text-[oklch(0.55_0.02_265)] leading-relaxed mb-6">
              {thankMsg}
            </p>
            {event.memoryWallEnabled === "1" && (
              <LiquidButton
                onClick={() => navigate(`/memory/${event.slug}?token=${token}`)}
                variant="glass"
                className="gap-2"
              >
                <Image className="w-4 h-4" />
                {i18n.memoryWall}
              </LiquidButton>
            )}
          </GlassCard>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />

      {/* ─── Cinematic Hero ─── */}
      <div className="relative min-h-[50vh] sm:min-h-[55vh] flex items-end overflow-hidden">
        {event.imageUrl ? (
          <>
            <motion.img
              src={event.imageUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[oklch(0.06_0.025_275/30%)] via-[oklch(0.06_0.025_275/40%)] to-[oklch(0.06_0.025_275)]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-[oklch(0.12_0.04_275)] to-[oklch(0.06_0.025_275)]" />
        )}

        {/* Hero Content */}
        <div className="relative z-10 w-full px-6 pb-10 sm:pb-14">
          <div className="max-w-lg mx-auto text-center">
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...t, delay: 0.2 }}
              className="text-xs font-semibold tracking-[0.25em] uppercase text-[oklch(0.72_0.16_255)] mb-4"
            >
              {i18n.youreInvited}
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...t, delay: 0.35 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-[-0.04em] leading-[1.05] mb-5"
            >
              {event.title}
            </motion.h1>
            {event.description && (
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...t, delay: 0.5 }}
                className="text-lg text-[oklch(0.65_0.02_265)] font-light leading-relaxed max-w-md mx-auto"
              >
                {event.description}
              </motion.p>
            )}
          </div>
        </div>
      </div>

      {/* ─── Event Details Bar ─── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...t, delay: 0.6 }}
        className="relative z-10 px-6 -mt-5"
      >
        <div className="max-w-lg mx-auto">
          <GlassCard variant="elevated" className="p-5">
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm">
              {event.eventDate && (
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[oklch(0.55_0.2_260/12%)] flex items-center justify-center">
                    <Calendar className="w-4 h-4 text-[oklch(0.72_0.16_255)]" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{format(new Date(event.eventDate), "EEEE, MMM d")}</p>
                    <p className="text-xs text-[oklch(0.5_0.02_265)]">{format(new Date(event.eventDate), "h:mm a")}</p>
                  </div>
                </div>
              )}
              {event.locationName && (
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[oklch(0.65_0.18_300/12%)] flex items-center justify-center">
                    <MapPin className="w-4 h-4 text-[oklch(0.65_0.18_300)]" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{event.locationName}</p>
                  </div>
                </div>
              )}
              {counts && (
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[oklch(0.55_0.2_160/12%)] flex items-center justify-center">
                    <Users className="w-4 h-4 text-[oklch(0.72_0.15_160)]" />
                  </div>
                  <div>
                    <p className="font-medium text-sm">{counts.attending} {i18n.attending}</p>
                    <p className="text-xs text-[oklch(0.5_0.02_265)]">{counts.total} {i18n.rsvpTitle.toLowerCase()}</p>
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        </div>
      </motion.div>

      {/* ─── RSVP Closed Notice ─── */}
      {isRsvpClosed && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...t, delay: 0.75 }}
          className="relative z-10 px-6 py-10 sm:py-14"
        >
          <div className="max-w-lg mx-auto">
            <GlassCard variant="elevated" className="p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[oklch(0.5_0.12_60/12%)] flex items-center justify-center mx-auto mb-5">
                <X className="w-8 h-8 text-[oklch(0.7_0.12_60)]" />
              </div>
              <h2 className="text-2xl font-bold tracking-[-0.03em] mb-3">
                {isEventClosed ? i18n.rsvpClosed : isCapacityFull ? i18n.eventFull : i18n.rsvpDeadlinePassed}
              </h2>
              <p className="text-[oklch(0.55_0.02_265)] leading-relaxed">
                {isEventClosed
                  ? (event?.status === 'cancelled' ? i18n.cancelledMessage : i18n.eventNotActive)
                  : isCapacityFull
                    ? i18n.eventFull
                    : i18n.rsvpDeadlinePassed}
              </p>
            </GlassCard>
          </div>
        </motion.div>
      )}

      {/* ─── RSVP Form ─── */}
      {!isRsvpClosed && (
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...t, delay: 0.75 }}
        className="relative z-10 px-6 py-10 sm:py-14"
      >
        <div className="max-w-lg mx-auto space-y-5">
          {/* Capacity/Deadline Info */}
          {(event?.maxCapacity && event.maxCapacity > 0 || event?.rsvpDeadline) && (
            <GlassCard variant="subtle" className="p-4">
              <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-[oklch(0.55_0.02_265)]">
                {event?.maxCapacity && event.maxCapacity > 0 && counts && (
                  <span className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-[oklch(0.72_0.16_255)]" />
                    {event.maxCapacity - counts.attending} {i18n.spotsRemaining}
                  </span>
                )}
                {event?.rsvpDeadline && (
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-[oklch(0.72_0.16_255)]" />
                    {i18n.deadline} {format(new Date(event.rsvpDeadline), "MMM d 'at' h:mm a")}
                  </span>
                )}
              </div>
            </GlassCard>
          )}

          {/* Status Selection */}
          <div className="text-center mb-8">
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-[oklch(0.5_0.02_265)] mb-5">{i18n.rsvpTitle}</p>
            <div className="flex justify-center gap-3">
              {([
                { value: "attending" as const, icon: Heart, label: i18n.attending, hue: "160" },
                { value: "maybe" as const, icon: HelpCircle, label: i18n.maybe, hue: "60" },
                { value: "declined" as const, icon: X, label: i18n.declined, hue: "25" },
              ]).map(({ value, icon: Icon, label, hue }) => {
                const active = status === value;
                return (
                  <button
                    key={value}
                    onClick={() => setStatus(value)}
                    className={`relative flex flex-col items-center gap-2 px-6 py-4 rounded-2xl transition-all duration-500 ${
                      active
                        ? `bg-[oklch(0.5_0.15_${hue}/15%)] border-2 border-[oklch(0.5_0.15_${hue}/30%)] shadow-[0_0_30px_oklch(0.5_0.15_${hue}/15%)]`
                        : "bg-[oklch(1_0_0/3%)] border-2 border-transparent hover:bg-[oklch(1_0_0/6%)]"
                    }`}
                  >
                    <Icon className={`w-6 h-6 transition-colors duration-300 ${
                      active ? `text-[oklch(0.72_0.15_${hue})]` : "text-[oklch(0.4_0.02_265)]"
                    }`} />
                    <span className={`text-xs font-semibold tracking-wide transition-colors duration-300 ${
                      active ? "text-foreground" : "text-[oklch(0.5_0.02_265)]"
                    }`}>{label}</span>
                    {active && (
                      <motion.div
                        layoutId="rsvp-indicator"
                        className={`absolute -bottom-1 w-8 h-1 rounded-full bg-[oklch(0.55_0.15_${hue})]`}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Name & Email */}
          <GlassCard className="p-6 sm:p-8 space-y-4">
            <div>
              <label className="text-xs font-semibold tracking-[0.15em] uppercase text-[oklch(0.5_0.02_265)] mb-2 block">{i18n.yourName} *</label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder={i18n.yourName}
                className="glass-input text-lg"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs font-semibold tracking-[0.15em] uppercase text-[oklch(0.5_0.02_265)] mb-2 block">{i18n.yourEmail}</label>
              <input
                type="email"
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                placeholder="your@email.com"
                className="glass-input"
              />
            </div>
          </GlassCard>

          {/* Plus Ones & Message */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl bg-[oklch(1_0_0/3%)] border border-[oklch(1_0_0/6%)] text-sm text-[oklch(0.55_0.02_265)] hover:bg-[oklch(1_0_0/5%)] transition-colors"
          >
            <span>{i18n.plusOnes} & {i18n.message}</span>
            <motion.div animate={{ rotate: showDetails ? 180 : 0 }} transition={{ duration: 0.3 }}>
              <ChevronDown className="w-4 h-4" />
            </motion.div>
          </button>

          <AnimatePresence>
            {showDetails && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={t}
                className="overflow-hidden"
              >
                <GlassCard variant="subtle" className="p-6 space-y-4">
                  <div>
                    <label className="text-xs font-semibold tracking-[0.15em] uppercase text-[oklch(0.5_0.02_265)] mb-2 block">{i18n.plusOnes}</label>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setPlusOnes(Math.max(0, plusOnes - 1))}
                        className="w-10 h-10 rounded-xl bg-[oklch(1_0_0/5%)] border border-[oklch(1_0_0/8%)] flex items-center justify-center text-lg hover:bg-[oklch(1_0_0/8%)] transition-colors"
                      >
                        −
                      </button>
                      <span className="text-xl font-semibold w-8 text-center">{plusOnes}</span>
                      <button
                        onClick={() => setPlusOnes(Math.min(10, plusOnes + 1))}
                        className="w-10 h-10 rounded-xl bg-[oklch(1_0_0/5%)] border border-[oklch(1_0_0/8%)] flex items-center justify-center text-lg hover:bg-[oklch(1_0_0/8%)] transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold tracking-[0.15em] uppercase text-[oklch(0.5_0.02_265)] mb-2 block">{i18n.message}</label>
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder={i18n.messagePlaceholder}
                      rows={3}
                      className="glass-input resize-none"
                    />
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Survey Questions */}
          {surveyConfig.length > 0 && (
            <GlassCard className="p-6 sm:p-8 space-y-5">
              <p className="text-xs font-semibold tracking-[0.15em] uppercase text-[oklch(0.5_0.02_265)]">
                <Sparkles className="w-3.5 h-3.5 inline mr-1.5 text-[oklch(0.72_0.16_255)]" />
                Questions from your host
              </p>
              {surveyConfig.map((q) => (
                <div key={q.id}>
                  <label className="text-sm font-medium mb-2 block">
                    {q.label}
                    {q.required && <span className="text-[oklch(0.7_0.15_25)] ml-1">*</span>}
                  </label>
                  {q.type === "text" ? (
                    <input
                      type="text"
                      value={surveyAnswers[q.label] || ""}
                      onChange={(e) => setSurveyAnswers(prev => ({ ...prev, [q.label]: e.target.value }))}
                      className="glass-input"
                      placeholder="Your answer..."
                    />
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(q.options || []).map(opt => {
                        const selected = surveyAnswers[q.label] === opt;
                        return (
                          <button
                            key={opt}
                            onClick={() => setSurveyAnswers(prev => ({ ...prev, [q.label]: opt }))}
                            className={`px-4 py-2 rounded-xl text-sm transition-all duration-300 ${
                              selected
                                ? "bg-[oklch(0.55_0.2_260/20%)] text-[oklch(0.72_0.16_255)] border border-[oklch(0.55_0.2_260/30%)]"
                                : "bg-[oklch(1_0_0/4%)] text-[oklch(0.6_0.02_265)] border border-[oklch(1_0_0/8%)] hover:bg-[oklch(1_0_0/7%)]"
                            }`}
                          >
                            {selected && <Check className="w-3 h-3 inline mr-1" />}
                            {opt}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </GlassCard>
          )}

          {/* Submit */}
          <div className="pt-2">
            <LiquidButton
              onClick={handleSubmit}
              loading={submitMutation.isPending}
              disabled={!guestName.trim() || !token}
              size="xl"
              className="w-full gap-3"
            >
              {status === "attending" ? (
                <>
                  <Heart className="w-5 h-5" />
                  {i18n.attending}
                </>
              ) : status === "maybe" ? (
                <>
                  <HelpCircle className="w-5 h-5" />
                  {i18n.maybe}
                </>
              ) : (
                <>
                  <X className="w-5 h-5" />
                  {i18n.declined}
                </>
              )}
            </LiquidButton>
          </div>

          {/* Footer */}
          <div className="text-center pt-6">
            <p className="text-xs text-[oklch(0.35_0.02_265)]">Powered by IVARI</p>
          </div>
        </div>
      </motion.div>
      )}
    </div>
  );
}
