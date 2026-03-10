import { useState, useRef, useCallback, useMemo } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { AmbientBackground } from "@/components/AmbientBackground";
import { MapView } from "@/components/Map";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, ArrowRight, Sparkles, MapPin, Calendar, Check, Plus, Trash2,
  ClipboardList, Image, Wand2, LayoutTemplate, Users, Palette,
} from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type Step = "template" | "describe" | "visualize" | "details" | "survey" | "review";
const STEPS: Step[] = ["template", "describe", "visualize", "details", "survey", "review"];
const STEP_LABELS: Record<Step, string> = {
  template: "Theme", describe: "Vibe", visualize: "Vision", details: "Details", survey: "Questions", review: "Launch",
};
const STEP_ICONS: Record<Step, typeof Sparkles> = {
  template: LayoutTemplate, describe: Wand2, visualize: Image, details: Calendar, survey: ClipboardList, review: Check,
};

const t = { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const };

interface SurveyQuestion {
  id: string;
  type: "text" | "select" | "multiselect";
  label: string;
  options?: string[];
  required: boolean;
}

const PRESET_QUESTIONS: SurveyQuestion[] = [
  { id: "dietary", type: "select", label: "Dietary Restrictions", options: ["None", "Vegetarian", "Vegan", "Gluten-Free", "Halal", "Kosher", "Other"], required: false },
  { id: "song", type: "text", label: "Song Request", required: false },
  { id: "allergies", type: "text", label: "Allergies", required: false },
  { id: "transport", type: "select", label: "Transportation", options: ["Driving", "Uber/Lyft", "Public Transit", "Need a Ride"], required: false },
];

const COLOR_PRESETS = [
  { name: "Amber Gold", value: "#D4A853" },
  { name: "Rose Quartz", value: "#C4788E" },
  { name: "Emerald", value: "#50A67B" },
  { name: "Sapphire", value: "#5B7FC4" },
  { name: "Amethyst", value: "#9B72CF" },
  { name: "Coral", value: "#D4725C" },
  { name: "Teal", value: "#4DA8A0" },
  { name: "Ivory", value: "#E8DCC8" },
];

export default function Forge() {
  useAuth({ redirectOnUnauthenticated: true });
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>("template");
  const stepIndex = STEPS.indexOf(step);

  // Template state
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const templatesQuery = trpc.templates.list.useQuery();
  const templateDetailQuery = trpc.templates.get.useQuery(
    { id: selectedTemplateId || "" },
    { enabled: !!selectedTemplateId }
  );

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [locationName, setLocationName] = useState("");
  const [locationLat, setLocationLat] = useState("");
  const [locationLng, setLocationLng] = useState("");
  const [locationPlaceId, setLocationPlaceId] = useState("");
  const [maxCapacity, setMaxCapacity] = useState(0);
  const [rsvpDeadlineDate, setRsvpDeadlineDate] = useState("");
  const [rsvpDeadlineTime, setRsvpDeadlineTime] = useState("");
  const [surveyQuestions, setSurveyQuestions] = useState<SurveyQuestion[]>([]);
  const [customLabel, setCustomLabel] = useState("");
  const [customType, setCustomType] = useState<"text" | "select">("text");
  const [customOptions, setCustomOptions] = useState("");
  const [themeColor, setThemeColor] = useState("#D4A853");
  const [language, setLanguage] = useState("en");

  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const autocompleteInputRef = useRef<HTMLInputElement | null>(null);

  const generateMutation = trpc.nanoBanana.generate.useMutation({
    onSuccess: (data) => {
      setImageUrl(data.imageUrl || null);
      setImagePrompt(data.prompt);
    },
    onError: (err) => toast.error("Image generation failed: " + err.message),
  });

  const createMutation = trpc.events.create.useMutation({
    onSuccess: (data) => {
      toast.success("Event launched!");
      navigate(`/pulse/${data.id}`);
    },
    onError: (err) => toast.error("Failed to create event: " + err.message),
  });

  const applyTemplate = useCallback(() => {
    if (!templateDetailQuery.data) return;
    const tpl = templateDetailQuery.data;
    if (!title) setTitle(tpl.titlePlaceholder);
    if (!description) setDescription(tpl.suggestedDescription);
    if (surveyQuestions.length === 0 && tpl.surveyQuestions.length > 0) {
      setSurveyQuestions(tpl.surveyQuestions);
    }
    if (tpl.accentColor) setThemeColor(tpl.accentColor);
  }, [templateDetailQuery.data, title, description, surveyQuestions.length]);

  const handleGenerate = useCallback(() => {
    if (!title.trim()) { toast.error("Enter a title first"); return; }
    const tpl = templateDetailQuery.data;
    const subject = tpl ? `${title.trim()}, ${tpl.nanoBananaPrompt}` : title.trim();
    generateMutation.mutate({ subject });
  }, [title, generateMutation, templateDetailQuery.data]);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    if (autocompleteInputRef.current && window.google) {
      const autocomplete = new google.maps.places.Autocomplete(
        autocompleteInputRef.current,
        { types: ["establishment", "geocode"] }
      );
      autocomplete.bindTo("bounds", map);
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place.geometry?.location) return;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        setLocationName(place.name || place.formatted_address || "");
        setLocationLat(String(lat));
        setLocationLng(String(lng));
        setLocationPlaceId(place.place_id || "");
        map.setCenter({ lat, lng });
        map.setZoom(15);
        if (markerRef.current) {
          markerRef.current.position = { lat, lng };
        } else {
          markerRef.current = new google.maps.marker.AdvancedMarkerElement({ map, position: { lat, lng } });
        }
      });
    }
  }, []);

  const handleCreate = useCallback(() => {
    if (!title.trim()) return;
    let dateMs: number | undefined;
    if (eventDate) {
      const dateStr = eventTime ? `${eventDate}T${eventTime}` : `${eventDate}T00:00`;
      dateMs = new Date(dateStr).getTime();
    }
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      imageUrl: imageUrl || undefined,
      imagePrompt: imagePrompt || undefined,
      eventDate: dateMs,
      locationName: locationName || undefined,
      locationLat: locationLat || undefined,
      locationLng: locationLng || undefined,
      locationPlaceId: locationPlaceId || undefined,
      maxCapacity: maxCapacity || undefined,
      rsvpDeadline: rsvpDeadlineDate ? new Date(rsvpDeadlineTime ? `${rsvpDeadlineDate}T${rsvpDeadlineTime}` : `${rsvpDeadlineDate}T23:59`).getTime() : undefined,
      surveyConfig: surveyQuestions.length > 0 ? surveyQuestions : undefined,
      status: "active",
      templateId: selectedTemplateId || undefined,
      themeColor: themeColor || undefined,
      language: language || undefined,
    });
  }, [title, description, imageUrl, imagePrompt, eventDate, eventTime, locationName, locationLat, locationLng, locationPlaceId, maxCapacity, rsvpDeadlineDate, rsvpDeadlineTime, surveyQuestions, createMutation, selectedTemplateId, themeColor, language]);

  const addPresetQuestion = (preset: SurveyQuestion) => {
    if (surveyQuestions.find(q => q.id === preset.id)) { toast.error("Already added"); return; }
    setSurveyQuestions(prev => [...prev, { ...preset }]);
  };

  const addCustomQuestion = () => {
    if (!customLabel.trim()) { toast.error("Enter a question"); return; }
    const q: SurveyQuestion = {
      id: `custom_${Date.now()}`,
      type: customType,
      label: customLabel.trim(),
      options: customType === "select" ? customOptions.split(",").map(s => s.trim()).filter(Boolean) : undefined,
      required: false,
    };
    setSurveyQuestions(prev => [...prev, q]);
    setCustomLabel("");
    setCustomOptions("");
  };

  const removeQuestion = (id: string) => {
    setSurveyQuestions(prev => prev.filter(q => q.id !== id));
  };

  const canNext = useMemo(() => {
    if (step === "describe") return title.trim().length > 0;
    return true;
  }, [step, title]);

  const goNext = () => {
    if (stepIndex >= STEPS.length - 1) return;
    if (step === "template" && selectedTemplateId && templateDetailQuery.data) {
      applyTemplate();
    }
    setStep(STEPS[stepIndex + 1]);
  };
  const goBack = () => { if (stepIndex > 0) setStep(STEPS[stepIndex - 1]); };

  const templates = templatesQuery.data || [];

  // Dynamic accent style
  const accentStyle = { "--event-accent": themeColor, "--event-accent-glow": `${themeColor}33` } as React.CSSProperties;

  return (
    <div className="min-h-screen relative" style={accentStyle}>
      <AmbientBackground />

      {/* ─── Minimal Header ─── */}
      <header className="relative z-10 pt-8 sm:pt-12 pb-2 px-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-warm-muted hover:text-foreground transition-colors duration-500">
            <ArrowLeft className="w-4 h-4" />
            <span className="text-xs font-medium tracking-[0.08em] uppercase">Ledger</span>
          </button>
          <h1 className="text-sm font-semibold tracking-[0.12em] uppercase text-warm-muted">The Forge</h1>
          <div className="w-16" />
        </div>
      </header>

      {/* ─── Step Indicator — Minimal Dots ─── */}
      <div className="relative z-10 px-6 mb-8">
        <div className="max-w-2xl mx-auto flex items-center justify-center gap-3">
          {STEPS.map((s, i) => {
            const active = i === stepIndex;
            const done = i < stepIndex;
            return (
              <div key={s} className="flex flex-col items-center gap-1.5">
                <motion.div
                  className="rounded-full"
                  animate={{
                    width: active ? 32 : 8,
                    height: 8,
                    backgroundColor: active ? themeColor : done ? `${themeColor}80` : "rgba(255,255,255,0.1)",
                  }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                />
                {active && (
                  <motion.span
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-[10px] font-medium tracking-[0.1em] uppercase"
                    style={{ color: themeColor }}
                  >
                    {STEP_LABELS[s]}
                  </motion.span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Step Content ─── */}
      <div className="relative z-10 px-6 pb-32">
        <div className="max-w-2xl mx-auto">
          <AnimatePresence mode="wait">
            {/* ─── STEP 0: Template Selector ─── */}
            {step === "template" && (
              <motion.div key="template" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={t} className="space-y-8">
                <div className="text-center space-y-4">
                  <h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.04em] text-foreground">Choose a Theme</h2>
                  <p className="text-warm-muted text-lg font-light tracking-[-0.01em]">Or start from scratch</p>
                </div>

                {/* Blank Canvas Option */}
                <motion.button
                  onClick={() => { setSelectedTemplateId(null); goNext(); }}
                  className={`w-full p-6 rounded-2xl glass-subtle text-left transition-all duration-500 hover:bg-[oklch(1_0_0/5%)] group`}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-[oklch(1_0_0/5%)] flex items-center justify-center text-2xl group-hover:bg-[oklch(1_0_0/8%)] transition-colors">
                      ✨
                    </div>
                    <div>
                      <p className="font-semibold text-foreground tracking-[-0.01em]">Blank Canvas</p>
                      <p className="text-sm text-warm-muted">Start with a clean slate</p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-warm-muted ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </motion.button>

                {/* Template Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {templates.map((tpl, i) => (
                    <motion.button
                      key={tpl.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ ...t, delay: i * 0.08 }}
                      onClick={() => { setSelectedTemplateId(tpl.id); goNext(); }}
                      className={`p-5 rounded-2xl glass text-left transition-all duration-500 hover:bg-[oklch(1_0_0/6%)] group relative overflow-hidden`}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      {/* Accent glow */}
                      <div
                        className="absolute top-0 right-0 w-24 h-24 rounded-full blur-[60px] opacity-20 group-hover:opacity-40 transition-opacity"
                        style={{ background: tpl.accentColor }}
                      />
                      <div className="relative z-10">
                        <span className="text-3xl mb-3 block">{tpl.emoji}</span>
                        <p className="font-semibold text-foreground tracking-[-0.01em] mb-1">{tpl.name}</p>
                        <p className="text-xs text-warm-muted leading-relaxed">{tpl.tagline}</p>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* ─── STEP 1: Vibe Engine — Full-Screen Input ─── */}
            {step === "describe" && (
              <motion.div key="describe" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={t} className="space-y-8">
                <div className="text-center space-y-4">
                  <h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.04em] text-foreground">Describe the Vibe</h2>
                  <p className="text-warm-muted text-lg font-light">What are you bringing to life?</p>
                </div>

                {/* Full-screen focused input */}
                <div className="relative">
                  <GlassCard variant="elevated" className="p-8 sm:p-10">
                    <textarea
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Luxury Yacht Dinner at Sunset..."
                      className="w-full bg-transparent text-2xl sm:text-3xl font-light text-foreground placeholder:text-[oklch(0.35_0.015_75)] outline-none resize-none min-h-[120px] leading-relaxed tracking-[-0.02em]"
                      rows={3}
                      autoFocus
                    />
                    <div className="mt-6 pt-6 border-t border-[oklch(1_0_0/6%)]">
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Add more details about the mood, dress code, or anything special..."
                        className="w-full bg-transparent text-base text-warm-muted placeholder:text-[oklch(0.3_0.01_75)] outline-none resize-none min-h-[60px] leading-relaxed font-light"
                        rows={2}
                      />
                    </div>
                  </GlassCard>

                  {/* Glowing accent line */}
                  <div className="absolute -bottom-px left-1/4 right-1/4 h-px" style={{ background: `linear-gradient(90deg, transparent, ${themeColor}40, transparent)` }} />
                </div>

                {/* Color Picker */}
                <GlassCard variant="subtle" className="p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <Palette className="w-4 h-4" style={{ color: themeColor }} />
                    <span className="text-xs font-semibold tracking-[0.12em] uppercase text-warm-muted">Event Accent</span>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    {COLOR_PRESETS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => setThemeColor(c.value)}
                        className="relative w-9 h-9 rounded-full transition-all duration-300 hover:scale-110"
                        style={{ background: c.value, boxShadow: themeColor === c.value ? `0 0 0 2px ${c.value}, 0 0 20px ${c.value}40` : "none" }}
                        title={c.name}
                      >
                        {themeColor === c.value && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="absolute inset-0 flex items-center justify-center">
                            <Check className="w-4 h-4 text-black/70" />
                          </motion.div>
                        )}
                      </button>
                    ))}
                    <div className="relative">
                      <input
                        type="color"
                        value={themeColor}
                        onChange={(e) => setThemeColor(e.target.value)}
                        className="w-9 h-9 rounded-full cursor-pointer border-2 border-[oklch(1_0_0/10%)] appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-none"
                      />
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            )}

            {/* ─── STEP 2: Nano Banana Visualization ─── */}
            {step === "visualize" && (
              <motion.div key="visualize" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={t} className="space-y-8">
                <div className="text-center space-y-4">
                  <h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.04em] text-foreground">Generate Vision</h2>
                  <p className="text-warm-muted text-lg font-light">Nano Banana creates your event's visual identity</p>
                </div>

                {/* Image Preview / Generator */}
                <div className="relative">
                  <GlassCard variant="elevated" className="overflow-hidden">
                    <div className="aspect-[16/9] relative">
                      {imageUrl ? (
                        <>
                          <motion.img
                            src={imageUrl}
                            alt="Generated vision"
                            className="w-full h-full object-cover"
                            initial={{ opacity: 0, scale: 1.05 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.04_0.01_280/90%)] via-transparent to-[oklch(0.04_0.01_280/30%)]" />
                          <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                            <p className="text-xs font-medium tracking-[0.1em] uppercase mb-2" style={{ color: themeColor }}>Nano Banana</p>
                            <p className="text-xl sm:text-2xl font-bold tracking-[-0.02em]">{title}</p>
                          </div>
                        </>
                      ) : generateMutation.isPending ? (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-4">
                          <motion.div
                            className="w-16 h-16 rounded-full border-2 border-t-transparent"
                            style={{ borderColor: `${themeColor}40`, borderTopColor: "transparent" }}
                            animate={{ rotate: 360 }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                          />
                          <p className="text-sm text-warm-muted font-light">Generating your vision...</p>
                          <div className="w-48 h-1 rounded-full overflow-hidden bg-[oklch(1_0_0/5%)]">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: themeColor }}
                              animate={{ x: ["-100%", "100%"] }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-6 p-8">
                          <div className="w-20 h-20 rounded-full bg-[oklch(1_0_0/4%)] flex items-center justify-center">
                            <Sparkles className="w-8 h-8" style={{ color: themeColor }} />
                          </div>
                          <div className="text-center space-y-2">
                            <p className="text-lg font-medium text-foreground">Ready to visualize</p>
                            <p className="text-sm text-warm-muted font-light max-w-sm">
                              Nano Banana will generate cinematic art for <strong className="text-foreground">{title || "your event"}</strong>
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </GlassCard>
                </div>

                {/* Generate Button */}
                <div className="flex justify-center">
                  <motion.button
                    onClick={handleGenerate}
                    disabled={generateMutation.isPending || !title.trim()}
                    className="relative px-8 py-3.5 rounded-full font-semibold text-sm tracking-[0.05em] transition-all duration-600 disabled:opacity-40"
                    style={{
                      background: `linear-gradient(135deg, ${themeColor}20, ${themeColor}40)`,
                      border: `1px solid ${themeColor}50`,
                      color: themeColor,
                      boxShadow: `0 0 30px ${themeColor}15`,
                    }}
                    whileHover={{ scale: 1.03, boxShadow: `0 0 40px ${themeColor}25` }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Sparkles className="w-4 h-4 inline mr-2" />
                    {generateMutation.isPending ? "Generating..." : imageUrl ? "Regenerate Vision" : "Generate Vibe"}
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* ─── STEP 3: Details ─── */}
            {step === "details" && (
              <motion.div key="details" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={t} className="space-y-6">
                <div className="text-center space-y-4">
                  <h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.04em] text-foreground">When & Where</h2>
                  <p className="text-warm-muted text-lg font-light">Set the stage for your gathering</p>
                </div>

                <GlassCard className="p-6 sm:p-8 space-y-5">
                  <div className="flex items-center gap-3">
                    <Calendar className="w-5 h-5" style={{ color: themeColor }} />
                    <span className="font-medium text-foreground">Date & Time</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-warm-muted mb-1.5 block tracking-[0.08em] uppercase">Date</label>
                      <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} className="glass-input [color-scheme:dark]" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-warm-muted mb-1.5 block tracking-[0.08em] uppercase">Time</label>
                      <input type="time" value={eventTime} onChange={(e) => setEventTime(e.target.value)} className="glass-input [color-scheme:dark]" />
                    </div>
                  </div>
                </GlassCard>

                <GlassCard className="p-6 sm:p-8 space-y-5">
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5" style={{ color: themeColor }} />
                    <span className="font-medium text-foreground">Location</span>
                  </div>
                  <input
                    ref={autocompleteInputRef}
                    type="text"
                    placeholder="Search for a venue..."
                    defaultValue={locationName}
                    className="glass-input"
                  />
                  <div className="rounded-xl overflow-hidden border border-[oklch(1_0_0/6%)]">
                    <MapView className="h-[200px]" initialZoom={12} onMapReady={handleMapReady} />
                  </div>
                </GlassCard>

                <GlassCard className="p-6 sm:p-8 space-y-5">
                  <div className="flex items-center gap-3">
                    <Users className="w-5 h-5" style={{ color: themeColor }} />
                    <span className="font-medium text-foreground">Capacity & Deadline</span>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-warm-muted mb-1.5 block tracking-[0.08em] uppercase">Max Capacity (0 = unlimited)</label>
                    <input type="number" min={0} value={maxCapacity} onChange={(e) => setMaxCapacity(Number(e.target.value))} className="glass-input" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-warm-muted mb-1.5 block tracking-[0.08em] uppercase">RSVP Deadline</label>
                      <input type="date" value={rsvpDeadlineDate} onChange={(e) => setRsvpDeadlineDate(e.target.value)} className="glass-input [color-scheme:dark]" />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-warm-muted mb-1.5 block tracking-[0.08em] uppercase">Deadline Time</label>
                      <input type="time" value={rsvpDeadlineTime} onChange={(e) => setRsvpDeadlineTime(e.target.value)} className="glass-input [color-scheme:dark]" />
                    </div>
                  </div>
                </GlassCard>

                {/* Language Selector */}
                <GlassCard className="p-6 sm:p-8 space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">🌐</span>
                    <span className="font-medium text-foreground">Portal Language</span>
                  </div>
                  <p className="text-xs text-warm-muted">Choose the language for your guest invitation portal</p>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="glass-input w-full"
                  >
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="it">Italiano</option>
                    <option value="pt">Português</option>
                    <option value="ja">日本語</option>
                    <option value="ko">한국어</option>
                    <option value="zh">中文</option>
                    <option value="ar">العربية</option>
                  </select>
                </GlassCard>
              </motion.div>
            )}

            {/* ─── STEP 4: Survey Builder ─── */}
            {step === "survey" && (
              <motion.div key="survey" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={t} className="space-y-6">
                <div className="text-center space-y-4">
                  <h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.04em] text-foreground">Guest Questions</h2>
                  <p className="text-warm-muted text-lg font-light">Ask your guests anything during RSVP</p>
                </div>

                {selectedTemplateId && surveyQuestions.length > 0 && (
                  <div className="text-center text-xs text-warm-muted">
                    Pre-filled from your <strong className="text-foreground">{templateDetailQuery.data?.name}</strong> template
                  </div>
                )}

                <GlassCard className="p-6 sm:p-8 space-y-4">
                  <p className="text-xs font-semibold tracking-[0.12em] uppercase text-warm-muted">Quick Add</p>
                  <div className="flex flex-wrap gap-2">
                    {PRESET_QUESTIONS.map(pq => {
                      const added = surveyQuestions.find(q => q.id === pq.id);
                      return (
                        <button
                          key={pq.id}
                          onClick={() => addPresetQuestion(pq)}
                          disabled={!!added}
                          className={`px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 ${
                            added
                              ? "text-foreground border"
                              : "bg-[oklch(1_0_0/4%)] text-warm-muted border border-[oklch(1_0_0/6%)] hover:bg-[oklch(1_0_0/7%)] hover:text-foreground"
                          }`}
                          style={added ? { background: `${themeColor}15`, borderColor: `${themeColor}30`, color: themeColor } : undefined}
                        >
                          {added ? <Check className="w-3.5 h-3.5 inline mr-1.5" /> : <Plus className="w-3.5 h-3.5 inline mr-1.5" />}
                          {pq.label}
                        </button>
                      );
                    })}
                  </div>
                </GlassCard>

                <GlassCard variant="subtle" className="p-6 sm:p-8 space-y-4">
                  <p className="text-xs font-semibold tracking-[0.12em] uppercase text-warm-muted">Custom Question</p>
                  <input type="text" value={customLabel} onChange={(e) => setCustomLabel(e.target.value)} placeholder="e.g., What's your t-shirt size?" className="glass-input" />
                  <div className="flex gap-3">
                    <select value={customType} onChange={(e) => setCustomType(e.target.value as "text" | "select")} className="glass-input flex-1">
                      <option value="text">Free Text</option>
                      <option value="select">Multiple Choice</option>
                    </select>
                    <LiquidButton onClick={addCustomQuestion} variant="glass" size="sm" className="gap-1.5 flex-shrink-0">
                      <Plus className="w-4 h-4" /> Add
                    </LiquidButton>
                  </div>
                  {customType === "select" && (
                    <input type="text" value={customOptions} onChange={(e) => setCustomOptions(e.target.value)} placeholder="Options (comma-separated)" className="glass-input text-sm" />
                  )}
                </GlassCard>

                {surveyQuestions.length > 0 && (
                  <GlassCard className="p-6 sm:p-8 space-y-3">
                    <p className="text-xs font-semibold tracking-[0.12em] uppercase text-warm-muted">
                      {surveyQuestions.length} Question{surveyQuestions.length !== 1 ? "s" : ""}
                    </p>
                    {surveyQuestions.map((q, i) => (
                      <motion.div key={q.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...t, delay: i * 0.05 }}
                        className="flex items-center gap-3 p-3.5 rounded-xl bg-[oklch(1_0_0/3%)] border border-[oklch(1_0_0/5%)]"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{q.label}</p>
                          <p className="text-xs text-warm-muted">{q.type === "text" ? "Free text" : q.options?.join(", ")}{q.required && " · Required"}</p>
                        </div>
                        <button onClick={() => removeQuestion(q.id)} className="p-1.5 rounded-lg hover:bg-[oklch(1_0_0/6%)] text-warm-muted hover:text-[oklch(0.7_0.12_25)] transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </GlassCard>
                )}

                {surveyQuestions.length === 0 && (
                  <div className="text-center py-4">
                    <p className="text-sm text-warm-muted font-light">No questions added yet. This step is optional.</p>
                  </div>
                )}
              </motion.div>
            )}

            {/* ─── STEP 5: Review & Launch ─── */}
            {step === "review" && (
              <motion.div key="review" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} transition={t} className="space-y-8">
                <div className="text-center space-y-4">
                  <h2 className="text-4xl sm:text-5xl font-bold tracking-[-0.04em] text-foreground">Review & Launch</h2>
                  <p className="text-warm-muted text-lg font-light">Everything looks right?</p>
                </div>

                <GlassCard variant="elevated" className="overflow-hidden">
                  {imageUrl && (
                    <div className="relative aspect-[16/9]">
                      <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.04_0.01_280/95%)] via-[oklch(0.04_0.01_280/30%)] to-transparent" />
                      <div className="absolute bottom-0 left-0 right-0 p-6 sm:p-8">
                        <p className="text-xs font-medium tracking-[0.1em] uppercase mb-2" style={{ color: themeColor }}>
                          {selectedTemplateId && templateDetailQuery.data ? templateDetailQuery.data.name : "Custom Event"}
                        </p>
                        <h3 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em]">{title}</h3>
                      </div>
                    </div>
                  )}
                  <div className="p-6 sm:p-8 space-y-5">
                    {!imageUrl && <h3 className="text-2xl font-bold tracking-[-0.02em]">{title}</h3>}
                    {description && <p className="text-warm-muted leading-relaxed font-light">{description}</p>}

                    <div className="flex flex-wrap gap-4 text-sm text-warm-muted">
                      {eventDate && (
                        <span className="flex items-center gap-2">
                          <Calendar className="w-4 h-4" style={{ color: themeColor }} />
                          {new Date(eventDate + (eventTime ? `T${eventTime}` : "")).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                          {eventTime && ` at ${eventTime}`}
                        </span>
                      )}
                      {locationName && (
                        <span className="flex items-center gap-2">
                          <MapPin className="w-4 h-4" style={{ color: themeColor }} />
                          {locationName}
                        </span>
                      )}
                    </div>

                    {/* Theme color preview */}
                    <div className="flex items-center gap-3 pt-3 border-t border-[oklch(1_0_0/6%)]">
                      <div className="w-5 h-5 rounded-full" style={{ background: themeColor }} />
                      <span className="text-xs text-warm-muted">Event accent color</span>
                      {maxCapacity > 0 && <span className="text-xs text-warm-muted ml-auto">Max {maxCapacity} guests</span>}
                    </div>

                    {surveyQuestions.length > 0 && (
                      <div className="pt-3 border-t border-[oklch(1_0_0/6%)]">
                        <p className="text-xs font-semibold tracking-[0.12em] uppercase text-warm-muted mb-2">
                          Guest Questions ({surveyQuestions.length})
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {surveyQuestions.map(q => (
                            <span key={q.id} className="text-xs px-3 py-1.5 rounded-lg bg-[oklch(1_0_0/4%)] text-warm-muted border border-[oklch(1_0_0/6%)]">
                              {q.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </GlassCard>

                <div className="flex justify-center pt-2">
                  <motion.button
                    onClick={handleCreate}
                    disabled={createMutation.isPending}
                    className="relative px-10 py-4 rounded-full font-semibold text-base tracking-[0.02em] transition-all duration-600 disabled:opacity-40"
                    style={{
                      background: `linear-gradient(135deg, ${themeColor}, ${themeColor}CC)`,
                      color: "#0A0A0A",
                      boxShadow: `0 0 40px ${themeColor}30, 0 8px 32px ${themeColor}20`,
                    }}
                    whileHover={{ scale: 1.03, boxShadow: `0 0 60px ${themeColor}40, 0 12px 40px ${themeColor}30` }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <Sparkles className="w-5 h-5 inline mr-2" />
                    {createMutation.isPending ? "Launching..." : "Launch Event"}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ─── Navigation Footer ─── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <GlassCard variant="elevated" className="p-3.5 flex items-center justify-between">
            <button
              onClick={goBack}
              disabled={stepIndex === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-warm-muted hover:text-foreground transition-all duration-300 disabled:opacity-30"
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <div className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <div
                  key={s}
                  className="w-1.5 h-1.5 rounded-full transition-all duration-400"
                  style={{
                    background: i === stepIndex ? themeColor : i < stepIndex ? `${themeColor}60` : "rgba(255,255,255,0.1)",
                    transform: i === stepIndex ? "scale(1.5)" : "scale(1)",
                  }}
                />
              ))}
            </div>
            {step !== "review" ? (
              <button
                onClick={goNext}
                disabled={!canNext}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-300 disabled:opacity-30"
                style={{ color: themeColor }}
              >
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-20" />
            )}
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
