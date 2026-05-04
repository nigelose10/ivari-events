/**
 * MemoryWall — post-event photographic surface.
 *
 * TODO (deferred — see DESIGN-AUDIT.md):
 * - [ ] Audit masonry gap — should be var(--space-6) for breathing rhythm
 * - [ ] Lightbox transition: layoutId + custom enter/exit instead of default fade
 * - [ ] Photo frames: drop the hard border, use only the inset highlight from
 *       .glass for refraction-edge feel
 * - [ ] Empty state: show ghost masonry skeletons (.shimmer) until first upload
 * - [ ] Upload preview: full-screen sheet on mobile, side-panel on desktop
 */
import { useState, useCallback, useMemo, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { AmbientBackground } from "@/components/AmbientBackground";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  X,
  Upload,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
} from "lucide-react";
import { useParams, useLocation } from "wouter";
import { toast } from "sonner";

const t = { duration: 0.6, ease: [0.22, 1, 0.36, 1] as const };

export default function MemoryWall() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug || "";
  const [, navigate] = useLocation();

  const searchStr = typeof window !== "undefined" ? window.location.search : "";
  const token = useMemo(() => {
    const p = new URLSearchParams(searchStr);
    return p.get("token") || "";
  }, [searchStr]);

  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploaderName, setUploaderName] = useState("");
  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const eventQuery = trpc.events.getBySlug.useQuery({ slug }, { enabled: !!slug });
  const photosQuery = trpc.photos.list.useQuery({ slug }, { enabled: !!slug });
  const uploadMutation = trpc.photos.upload.useMutation({
    onSuccess: () => {
      photosQuery.refetch();
      setShowUpload(false);
      setPreviewUrl(null);
      setSelectedFile(null);
      setCaption("");
      toast.success("Photo uploaded!");
    },
    onError: (err) => toast.error(err.message),
  });

  const event = eventQuery.data;
  const photos = photosQuery.data || [];

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10MB)");
      return;
    }
    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
    setShowUpload(true);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !token) return;
    setUploading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(selectedFile);
      });
      await uploadMutation.mutateAsync({
        token,
        uploaderName: uploaderName.trim() || undefined,
        caption: caption.trim() || undefined,
        imageBase64: base64,
        mimeType: selectedFile.type || "image/jpeg",
      });
    } catch {
      // handled by mutation
    } finally {
      setUploading(false);
    }
  }, [selectedFile, token, uploaderName, caption, uploadMutation]);

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const nextPhoto = () => {
    if (lightboxIndex !== null && lightboxIndex < photos.length - 1) setLightboxIndex(lightboxIndex + 1);
  };
  const prevPhoto = () => {
    if (lightboxIndex !== null && lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1);
  };

  // Loading
  if (eventQuery.isLoading) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <AmbientBackground />
        <motion.div
          className="w-10 h-10 rounded-full border-2 border-[oklch(0.72_0.16_255)] border-t-transparent"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
        />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        <AmbientBackground />
        <GlassCard className="p-10 text-center max-w-sm">
          <h2 className="text-xl font-semibold mb-2">Not Found</h2>
          <p className="text-sm text-[oklch(0.5_0.02_265)]">This memory wall doesn't exist.</p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      <AmbientBackground />

      {/* Hero Banner */}
      <div className="relative h-48 sm:h-64 overflow-hidden">
        {event.imageUrl ? (
          <>
            <img src={event.imageUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-b from-[oklch(0.06_0.025_275/50%)] to-[oklch(0.06_0.025_275)]" />
          </>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-[oklch(0.12_0.04_275)] to-[oklch(0.06_0.025_275)]" />
        )}
      </div>

      {/* Header */}
      <div className="relative z-10 px-6 -mt-20">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => navigate(`/portal/${slug}?token=${token}`)}
            className="flex items-center gap-2 text-[oklch(0.5_0.02_265)] hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back to Invitation</span>
          </button>
          <div className="flex items-end justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em]">The Memory Wall</h1>
              <p className="text-[oklch(0.5_0.02_265)] mt-1">{event.title} · {photos.length} memories</p>
            </div>
            {token && (
              <LiquidButton onClick={() => fileInputRef.current?.click()} className="gap-2 flex-shrink-0">
                <Camera className="w-4 h-4" />
                Add Photo
              </LiquidButton>
            )}
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Photo Grid — Masonry */}
      <div className="relative z-10 px-6 pb-16">
        <div className="max-w-5xl mx-auto">
          {photos.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={t}
              className="text-center py-24"
            >
              <div className="w-20 h-20 rounded-2xl bg-[oklch(1_0_0/5%)] flex items-center justify-center mx-auto mb-5">
                <ImageIcon className="w-10 h-10 text-[oklch(0.3_0.02_265)]" />
              </div>
              <h3 className="text-xl font-semibold mb-2">No memories yet</h3>
              <p className="text-sm text-[oklch(0.45_0.02_265)] max-w-xs mx-auto">
                Be the first to share a moment from this event.
              </p>
              {token && (
                <LiquidButton onClick={() => fileInputRef.current?.click()} className="gap-2 mt-6" variant="glass">
                  <Camera className="w-4 h-4" />
                  Upload First Photo
                </LiquidButton>
              )}
            </motion.div>
          ) : (
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
              {photos.map((photo, index) => (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...t, delay: Math.min(index * 0.05, 0.5) }}
                  className="break-inside-avoid group cursor-pointer"
                  onClick={() => openLightbox(index)}
                >
                  <div className="relative rounded-2xl overflow-hidden border border-[oklch(1_0_0/8%)] bg-[oklch(1_0_0/3%)]">
                    <img
                      src={photo.imageUrl}
                      alt={photo.caption || "Memory"}
                      className="w-full object-cover transition-transform duration-700 group-hover:scale-105"
                      loading="lazy"
                    />
                    {/* Glass overlay on hover */}
                    <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.06_0.025_275/70%)] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        {photo.caption && (
                          <p className="text-sm text-foreground font-medium line-clamp-2 mb-1">{photo.caption}</p>
                        )}
                        <p className="text-xs text-[oklch(0.55_0.02_265)]">
                          {photo.uploaderName || "Anonymous"}
                        </p>
                      </div>
                    </div>
                    {/* Refractive glass frame */}
                    <div className="absolute inset-0 rounded-2xl border border-[oklch(1_0_0/10%)] pointer-events-none" />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Upload Modal ─── */}
      <AnimatePresence>
        {showUpload && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-[oklch(0_0_0/60%)] backdrop-blur-xl"
            onClick={() => setShowUpload(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={t}
              className="w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <GlassCard variant="elevated" className="p-6 sm:p-8 space-y-5">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Upload Memory</h3>
                  <button onClick={() => setShowUpload(false)} className="p-2 rounded-xl hover:bg-[oklch(1_0_0/6%)] transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {previewUrl && (
                  <div className="relative rounded-xl overflow-hidden aspect-video">
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold tracking-[0.15em] uppercase text-[oklch(0.5_0.02_265)] mb-2 block">Your Name</label>
                  <input
                    type="text"
                    value={uploaderName}
                    onChange={(e) => setUploaderName(e.target.value)}
                    placeholder="Anonymous"
                    className="glass-input"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold tracking-[0.15em] uppercase text-[oklch(0.5_0.02_265)] mb-2 block">Caption</label>
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="A moment to remember..."
                    className="glass-input"
                  />
                </div>

                <LiquidButton
                  onClick={handleUpload}
                  loading={uploadMutation.isPending || uploading}
                  className="w-full gap-2"
                  size="lg"
                >
                  <Upload className="w-4 h-4" />
                  Upload
                </LiquidButton>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Lightbox with Navigation ─── */}
      <AnimatePresence>
        {lightboxIndex !== null && photos[lightboxIndex] && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[oklch(0_0_0/85%)] backdrop-blur-2xl"
            onClick={closeLightbox}
          >
            {/* Close */}
            <button
              onClick={closeLightbox}
              className="absolute top-4 right-4 z-10 p-3 rounded-xl bg-[oklch(1_0_0/5%)] backdrop-blur-md border border-[oklch(1_0_0/10%)] text-foreground hover:bg-[oklch(1_0_0/10%)] transition-colors"
            >
              <X className="w-6 h-6" />
            </button>

            {/* Prev */}
            {lightboxIndex > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-xl bg-[oklch(1_0_0/5%)] backdrop-blur-md border border-[oklch(1_0_0/10%)] text-foreground hover:bg-[oklch(1_0_0/10%)] transition-colors"
              >
                <ChevronLeft className="w-6 h-6" />
              </button>
            )}
            {/* Next */}
            {lightboxIndex < photos.length - 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-3 rounded-xl bg-[oklch(1_0_0/5%)] backdrop-blur-md border border-[oklch(1_0_0/10%)] text-foreground hover:bg-[oklch(1_0_0/10%)] transition-colors"
              >
                <ChevronRight className="w-6 h-6" />
              </button>
            )}

            {/* Image */}
            <motion.div
              key={lightboxIndex}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={t}
              className="max-w-[90vw] max-h-[85vh] relative"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={photos[lightboxIndex].imageUrl}
                alt={photos[lightboxIndex].caption || "Memory"}
                className="max-w-full max-h-[80vh] object-contain rounded-2xl"
              />
              <div className="mt-4 text-center">
                {photos[lightboxIndex].caption && (
                  <p className="text-foreground font-medium mb-1">{photos[lightboxIndex].caption}</p>
                )}
                <p className="text-sm text-[oklch(0.5_0.02_265)]">
                  by {photos[lightboxIndex].uploaderName || "Anonymous"} · {lightboxIndex + 1} of {photos.length}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
