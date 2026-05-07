/**
 * MemoryWall — public, moderated photo gallery.
 *
 * Doubles as the post-event photo wall AND the during-event Gallery surface.
 * The moderation layer (V7) means guests see only photos a host has approved;
 * the upload affordance still works, but submissions go through a queue.
 *
 * Auth model on this page:
 *   - Guests arrive via `/memory/:slug?token=…`. The token gates uploads.
 *   - Hosts arrive via `/memory/:slug` (no token). They get a "Moderate"
 *     button that opens the PhotoModerationPanel sheet.
 *
 * Data:
 *   - List: `api.photos.listApproved` (Convex, reactive). Featured photos
 *     surface first in a slightly larger frame.
 *   - Guest upload: `api.photos.requestUploadUrl` (action) → direct POST
 *     → `api.photos.submitGuestPhoto` (action). Status lands as "pending".
 *   - Host upload: `api.photos.generateUploadUrl` + `submitHostPhoto`.
 *
 * Legacy: the old tRPC `photos.upload` path is still wired through
 * `submitGuestPhoto` server-side — old clients keep working.
 *
 * TODO (deferred — see DESIGN-AUDIT.md):
 * - [ ] Audit masonry gap — should be var(--space-6) for breathing rhythm
 * - [ ] Lightbox transition: layoutId + custom enter/exit instead of default fade
 * - [ ] Photo frames: drop the hard border, use only the inset highlight from
 *       .glass for refraction-edge feel
 * - [ ] Empty state: show ghost masonry skeletons (.shimmer) until first upload
 * - [ ] Upload preview: full-screen sheet on mobile, side-panel on desktop
 */
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { useUser } from "@stackframe/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { moderateImage } from "@/lib/moderation";
import { GlassCard } from "@/components/GlassCard";
import { LiquidButton } from "@/components/LiquidButton";
import { AmbientBackground } from "@/components/AmbientBackground";
import { PhotoModerationPanel } from "@/components/PhotoModerationPanel";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  X,
  Upload,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Shield,
  Star,
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
  const [showModeration, setShowModeration] = useState(false);
  const [uploaderName, setUploaderName] = useState("");
  const [caption, setCaption] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Resolve the event by slug (reactive — also gives us its _id for the
  // moderation panel and listApproved). The legacy tRPC fields aren't all
  // present here, so we use the slimmer Convex shape.
  const event = useQuery(api.events.getBySlug, slug ? { slug } : "skip");
  const photos = useQuery(
    api.photos.listApproved,
    event?._id ? { eventId: event._id as Id<"events"> } : "skip",
  );
  // Host detection — `false` for guests/anon, never throws.
  const hostInfo = useQuery(
    api.events.isHostBySlug,
    slug ? { slug } : "skip",
  );
  const isHost = hostInfo?.isHost ?? false;
  const eventId = event?._id as Id<"events"> | undefined;

  // Upload pipeline. Three flavors:
  //   - host (signed-in, owns event): direct mutation, lands "approved"
  //   - signed-in user (not host, may or may not be a claimed guest): direct
  //     mutation under their identity, lands "pending"
  //   - token-only guest (anonymous claim via gt= JWT): action chain
  // The signed-in user path is what makes "your username + photo posts
  // automatically" actually work.
  const stackUser = useUser();
  const requestGuestUploadUrl = useAction(api.photos.requestUploadUrl);
  const submitGuest = useAction(api.photos.submitGuestPhoto);
  const generateHostUploadUrl = useMutation(api.photos.generateUploadUrl);
  const submitHost = useMutation(api.photos.submitHostPhoto);
  const submitUser = useMutation(api.photos.submitUserPhoto);
  const me = useQuery(api.users.me, stackUser ? {} : "skip");

  // Auto-fill the uploader name from the signed-in user's profile so they
  // never have to type it in. They can still override before submit.
  useEffect(() => {
    if (uploaderName) return; // don't clobber a manual edit
    if (me?.username) {
      setUploaderName(`@${me.username}`);
    } else if (me?.name) {
      setUploaderName(me.name);
    }
    // The dependency on uploaderName is intentional — this only runs on the
    // first render where me arrives. Subsequent renders see uploaderName set
    // and bail at the top.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  const isLoading = event === undefined || photos === undefined;
  const photoList = photos ?? [];

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large (max 10MB)");
      return;
    }

    // Auto-curation preflight — NSFWJS runs entirely in the browser,
    // weights cached after first load. Reject obviously NSFW content
    // before it ever hits Convex storage. Soft-fails to "ok" if the model
    // can't load so a flaky CDN never blocks a legitimate upload — the
    // host moderation queue stays as the safety net.
    const verdict = await moderateImage(file);
    if (!verdict.ok) {
      toast.error(verdict.reason);
      return;
    }

    setSelectedFile(file);
    const reader = new FileReader();
    reader.onload = () => setPreviewUrl(reader.result as string);
    reader.readAsDataURL(file);
    setShowUpload(true);
  }, []);

  // Three upload paths share two phases (mint → POST), differ at persist.
  // Pre-resolve which one we're on so the body reads top-down.
  const isSignedInUser = !!stackUser && !isHost;

  const handleUpload = useCallback(async () => {
    if (!selectedFile || !eventId) return;
    setUploading(true);
    try {
      // Step 1: mint an upload URL.
      //   - host or signed-in user: direct mutation (auth via Stack JWT)
      //   - token-only guest: action chain that verifies the gt= JWT first
      const uploadUrl =
        isHost || isSignedInUser
          ? await generateHostUploadUrl()
          : await requestGuestUploadUrl({ token });

      // Step 2: direct POST the binary to the URL Convex returned.
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": selectedFile.type || "image/jpeg" },
        body: selectedFile,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: Id<"_storage"> };

      // Step 3: persist. Host → approved. Signed-in user → pending, with
      // username + avatar denormalized into the row server-side. Token-only
      // guest → pending, with the manual-typed name.
      if (isHost) {
        await submitHost({
          eventId,
          storageId,
          uploaderName: uploaderName.trim() || undefined,
          caption: caption.trim() || undefined,
        });
        toast.success("Photo published");
      } else if (isSignedInUser) {
        await submitUser({
          eventId,
          storageId,
          caption: caption.trim() || undefined,
        });
        toast.success("Posted — pending host approval");
      } else {
        await submitGuest({
          guestToken: token,
          storageId,
          uploaderName: uploaderName.trim() || undefined,
          caption: caption.trim() || undefined,
        });
        toast.success("Submitted — pending host approval");
      }

      setShowUpload(false);
      setPreviewUrl(null);
      setSelectedFile(null);
      setCaption("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }, [
    selectedFile,
    eventId,
    isHost,
    isSignedInUser,
    token,
    uploaderName,
    caption,
    requestGuestUploadUrl,
    generateHostUploadUrl,
    submitGuest,
    submitHost,
    submitUser,
  ]);

  const openLightbox = (index: number) => setLightboxIndex(index);
  const closeLightbox = () => setLightboxIndex(null);
  const nextPhoto = () => {
    if (lightboxIndex !== null && lightboxIndex < photoList.length - 1)
      setLightboxIndex(lightboxIndex + 1);
  };
  const prevPhoto = () => {
    if (lightboxIndex !== null && lightboxIndex > 0)
      setLightboxIndex(lightboxIndex - 1);
  };

  // Loading
  if (isLoading) {
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

  // Guests can upload only with a token. Hosts always can.
  const canUpload = isHost || !!token;

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
            onClick={() => navigate(token ? `/portal/${slug}?token=${token}` : "/")}
            className="flex items-center gap-2 text-[oklch(0.5_0.02_265)] hover:text-foreground transition-colors mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">{token ? "Back to Invitation" : "Back"}</span>
          </button>
          <div className="flex items-end justify-between gap-4 mb-8">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-[-0.03em]">The Memory Wall</h1>
              <p className="text-[oklch(0.5_0.02_265)] mt-1">{event.title} · {photoList.length} memories</p>
            </div>
            <div className="flex flex-shrink-0 gap-2">
              {isHost && eventId && (
                <LiquidButton
                  onClick={() => setShowModeration(true)}
                  variant="glass"
                  className="gap-2"
                  aria-label="Open moderation panel"
                >
                  <Shield className="w-4 h-4" />
                  Moderate
                </LiquidButton>
              )}
              {canUpload && (
                <LiquidButton onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <Camera className="w-4 h-4" />
                  Add Photo
                </LiquidButton>
              )}
            </div>
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

      {/* Photo Grid — Masonry. Featured photos render in a wider column-span. */}
      <div className="relative z-10 px-6 pb-16">
        <div className="max-w-5xl mx-auto">
          {photoList.length === 0 ? (
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
                {canUpload
                  ? "Be the first to share a moment from this event."
                  : "Photos will appear here once the host shares them."}
              </p>
              {canUpload && (
                <LiquidButton onClick={() => fileInputRef.current?.click()} className="gap-2 mt-6" variant="glass">
                  <Camera className="w-4 h-4" />
                  Upload First Photo
                </LiquidButton>
              )}
            </motion.div>
          ) : (
            <div className="columns-2 sm:columns-3 lg:columns-4 gap-3 space-y-3">
              {photoList.map((photo, index) => {
                const isFeatured = photo.featured === true;
                return (
                  <motion.div
                    key={photo._id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...t, delay: Math.min(index * 0.05, 0.5) }}
                    className={`break-inside-avoid group cursor-pointer ${
                      isFeatured ? "ring-1 ring-[oklch(0.75_0.15_55/40%)] rounded-2xl" : ""
                    }`}
                    onClick={() => openLightbox(index)}
                  >
                    <div className="relative rounded-2xl overflow-hidden border border-[oklch(1_0_0/8%)] bg-[oklch(1_0_0/3%)]">
                      <img
                        src={photo.imageUrl}
                        alt={photo.caption || "Memory"}
                        className={`w-full object-cover transition-transform duration-700 group-hover:scale-105 ${
                          isFeatured ? "min-h-[280px]" : ""
                        }`}
                        loading="lazy"
                      />
                      {isFeatured && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-[oklch(0.06_0.025_275/70%)] backdrop-blur-md text-[oklch(0.85_0.15_55)] border border-[oklch(0.75_0.15_55/40%)] text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1">
                          <Star className="w-3 h-3" /> Featured
                        </div>
                      )}
                      {/* Glass overlay on hover */}
                      <div className="absolute inset-0 bg-gradient-to-t from-[oklch(0.06_0.025_275/70%)] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          {photo.caption && (
                            <p className="text-sm text-foreground font-medium line-clamp-2 mb-1">{photo.caption}</p>
                          )}
                          <div className="flex items-center gap-2">
                            {(photo as any).uploaderAvatarUrl ? (
                              <img
                                src={(photo as any).uploaderAvatarUrl}
                                alt=""
                                className="w-5 h-5 rounded-full object-cover border border-[oklch(1_0_0/15%)]"
                              />
                            ) : null}
                            <p className="text-xs text-[oklch(0.55_0.02_265)]">
                              {photo.uploaderName || "Anonymous"}
                            </p>
                          </div>
                        </div>
                      </div>
                      {/* Refractive glass frame */}
                      <div className="absolute inset-0 rounded-2xl border border-[oklch(1_0_0/10%)] pointer-events-none" />
                    </div>
                  </motion.div>
                );
              })}
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
                  <h3 className="text-lg font-semibold">
                    {isHost ? "Add a photo" : "Upload Memory"}
                  </h3>
                  <button onClick={() => setShowUpload(false)} className="p-2 rounded-xl hover:bg-[oklch(1_0_0/6%)] transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {previewUrl && (
                  <div className="relative rounded-xl overflow-hidden aspect-video">
                    <img src={previewUrl} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}

                {!isHost && (
                  <p className="text-xs text-[oklch(0.55_0.02_265)] -mt-2">
                    Your photo will appear in the gallery after the host approves it.
                  </p>
                )}

                {isSignedInUser ? (
                  <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-[oklch(1_0_0/4%)] border border-[oklch(1_0_0/8%)]">
                    {me?.avatarUrl ? (
                      <img
                        src={me.avatarUrl}
                        alt=""
                        className="w-8 h-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[oklch(1_0_0/8%)]" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {me?.username ? `@${me.username}` : me?.name || "ivari user"}
                      </p>
                      <p className="text-[10px] uppercase tracking-[0.15em] text-[oklch(0.5_0.02_265)]">
                        Posting as your account
                      </p>
                    </div>
                  </div>
                ) : (
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
                )}
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
                  loading={uploading}
                  className="w-full gap-2"
                  size="lg"
                >
                  <Upload className="w-4 h-4" />
                  {isHost ? "Publish" : "Submit"}
                </LiquidButton>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Lightbox with Navigation ─── */}
      <AnimatePresence>
        {lightboxIndex !== null && photoList[lightboxIndex] && (
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
            {lightboxIndex < photoList.length - 1 && (
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
                src={photoList[lightboxIndex].imageUrl}
                alt={photoList[lightboxIndex].caption || "Memory"}
                className="max-w-full max-h-[80vh] object-contain rounded-2xl"
              />
              <div className="mt-4 text-center">
                {photoList[lightboxIndex].caption && (
                  <p className="text-foreground font-medium mb-1">{photoList[lightboxIndex].caption}</p>
                )}
                <p className="text-sm text-[oklch(0.5_0.02_265)]">
                  by {photoList[lightboxIndex].uploaderName || "Anonymous"} · {lightboxIndex + 1} of {photoList.length}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Host Moderation Sheet ─── */}
      {isHost && eventId && (
        <PhotoModerationPanel
          eventId={eventId}
          open={showModeration}
          onOpenChange={setShowModeration}
        />
      )}
    </div>
  );
}
