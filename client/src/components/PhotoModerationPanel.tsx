/**
 * PhotoModerationPanel — host-only sheet for triaging the guest photo queue.
 *
 * Surface: vaul Drawer (already wrapped in `@/components/ui/drawer`). Mounted
 * from MemoryWall (top-right "Moderate" button) and Pulse (Moderation tab
 * CTA). Reactive — Convex `listPending`/`listAll` re-run when any photo
 * mutates.
 *
 * UX:
 *   - Three tabs: Pending (count badge) / Approved / Rejected.
 *   - Each card has Approve / Reject / Feature inline.
 *   - Bulk-select with checkboxes for batch approve/reject — useful at scale
 *     for popular events.
 *   - Reject optionally captures a free-text reason. Skipping it is fine.
 *
 * Data flow:
 *   - Reads: api.photos.listPending, api.photos.listAll.
 *   - Writes: api.photos.{approvePhoto,rejectPhoto,featurePhoto,
 *     unfeaturePhoto,removePhoto}.
 *
 * Optimistic updates: not implemented — Convex's reactive query refresh is
 * fast enough that the user sees the row move within ~50ms. We can revisit
 * once latency telemetry says otherwise.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Check, X, Star, StarOff, Trash2, Image as ImageIcon } from "lucide-react";

type PhotoRow = {
  _id: Id<"photos">;
  _creationTime: number;
  eventId: Id<"events">;
  imageUrl: string;
  caption?: string;
  uploaderName?: string;
  status?: "pending" | "approved" | "rejected";
  featured?: boolean;
  moderationNote?: string;
};

type Tab = "pending" | "approved" | "rejected";

interface Props {
  eventId: Id<"events">;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PhotoModerationPanel({ eventId, open, onOpenChange }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectingId, setRejectingId] = useState<Id<"photos"> | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  // Pull pending always (so the badge stays accurate), pull `all` only when
  // the host opens the panel — saves a query for the common closed-panel case.
  const pending = useQuery(api.photos.listPending, open ? { eventId } : "skip");
  const all = useQuery(api.photos.listAll, open ? { eventId } : "skip");

  const approve = useMutation(api.photos.approvePhoto);
  const reject = useMutation(api.photos.rejectPhoto);
  const feature = useMutation(api.photos.featurePhoto);
  const unfeature = useMutation(api.photos.unfeaturePhoto);
  const remove = useMutation(api.photos.removePhoto);

  const approved = useMemo(
    () => (all ?? []).filter((p) => p.status === "approved" || p.status === undefined),
    [all],
  );
  const rejected = useMemo(
    () => (all ?? []).filter((p) => p.status === "rejected"),
    [all],
  );

  const visible: PhotoRow[] = useMemo(() => {
    if (activeTab === "pending") return (pending ?? []) as PhotoRow[];
    if (activeTab === "approved") return approved as PhotoRow[];
    return rejected as PhotoRow[];
  }, [activeTab, pending, approved, rejected]);

  const toggleSelect = (id: Id<"photos">) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const bulkApprove = async () => {
    const ids = [...selected] as Id<"photos">[];
    if (ids.length === 0) return;
    await Promise.all(ids.map((photoId) => approve({ photoId, eventId })));
    toast.success(`${ids.length} approved`);
    clearSelection();
  };

  const bulkReject = async () => {
    const ids = [...selected] as Id<"photos">[];
    if (ids.length === 0) return;
    await Promise.all(ids.map((photoId) => reject({ photoId, eventId })));
    toast.success(`${ids.length} rejected`);
    clearSelection();
  };

  const handleApprove = async (photoId: Id<"photos">) => {
    await approve({ photoId, eventId });
    toast.success("Approved");
  };

  const handleRejectConfirm = async () => {
    if (!rejectingId) return;
    await reject({
      photoId: rejectingId,
      eventId,
      note: rejectNote.trim() || undefined,
    });
    toast.success("Rejected");
    setRejectingId(null);
    setRejectNote("");
  };

  const handleFeatureToggle = async (photo: PhotoRow) => {
    if (photo.featured) {
      await unfeature({ photoId: photo._id, eventId });
      toast.success("Unfeatured");
    } else {
      await feature({ photoId: photo._id, eventId });
      toast.success("Featured");
    }
  };

  const handleRemove = async (photoId: Id<"photos">) => {
    if (!confirm("Permanently remove this photo?")) return;
    await remove({ photoId, eventId });
    toast.success("Removed");
  };

  const pendingCount = pending?.length ?? 0;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[90vh]">
        <DrawerHeader>
          <DrawerTitle>Photo Moderation</DrawerTitle>
          <DrawerDescription>
            Review guest submissions. Approved photos appear in the public gallery.
          </DrawerDescription>
        </DrawerHeader>

        <div className="px-4 sm:px-6 pb-6 overflow-y-auto">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as Tab)}>
            <TabsList className="mb-4">
              <TabsTrigger value="pending" className="gap-2">
                Pending
                {pendingCount > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                    {pendingCount}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="approved">
                Approved ({approved.length})
              </TabsTrigger>
              <TabsTrigger value="rejected">
                Rejected ({rejected.length})
              </TabsTrigger>
            </TabsList>

            {/* Bulk action bar — visible when selections exist. */}
            {selected.size > 0 && (
              <div className="flex items-center justify-between mb-4 p-3 rounded-xl bg-[oklch(1_0_0/4%)] border border-[oklch(1_0_0/8%)]">
                <span className="text-sm">{selected.size} selected</span>
                <div className="flex gap-2">
                  {activeTab !== "approved" && (
                    <Button size="sm" onClick={bulkApprove} className="gap-1">
                      <Check className="w-3.5 h-3.5" /> Approve
                    </Button>
                  )}
                  {activeTab !== "rejected" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={bulkReject}
                      className="gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={clearSelection}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            <TabsContent value="pending">
              <PhotoList
                photos={visible}
                selected={selected}
                onToggleSelect={toggleSelect}
                onApprove={handleApprove}
                onRejectStart={(id) => setRejectingId(id)}
                onFeatureToggle={handleFeatureToggle}
                onRemove={handleRemove}
                emptyText="No pending photos. The queue is empty."
              />
            </TabsContent>
            <TabsContent value="approved">
              <PhotoList
                photos={visible}
                selected={selected}
                onToggleSelect={toggleSelect}
                onApprove={handleApprove}
                onRejectStart={(id) => setRejectingId(id)}
                onFeatureToggle={handleFeatureToggle}
                onRemove={handleRemove}
                emptyText="No approved photos yet."
                showFeatureControl
              />
            </TabsContent>
            <TabsContent value="rejected">
              <PhotoList
                photos={visible}
                selected={selected}
                onToggleSelect={toggleSelect}
                onApprove={handleApprove}
                onRejectStart={(id) => setRejectingId(id)}
                onFeatureToggle={handleFeatureToggle}
                onRemove={handleRemove}
                emptyText="No rejected photos."
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Reject-with-reason inline modal. Lightweight — keeps everything
            inside the same drawer so we don't need a second portal. */}
        {rejectingId && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6">
            <div className="w-full max-w-sm rounded-2xl bg-background p-5 border border-[oklch(1_0_0/10%)]">
              <h4 className="font-semibold mb-2">Reject photo</h4>
              <p className="text-sm text-muted-foreground mb-3">
                Optional — add a note for your records.
              </p>
              <Textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="e.g. duplicate, off-topic, NSFW"
                rows={3}
                maxLength={500}
              />
              <div className="flex justify-end gap-2 mt-4">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRejectingId(null);
                    setRejectNote("");
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleRejectConfirm}>Reject</Button>
              </div>
            </div>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

interface PhotoListProps {
  photos: PhotoRow[];
  selected: Set<string>;
  onToggleSelect: (id: Id<"photos">) => void;
  onApprove: (id: Id<"photos">) => void;
  onRejectStart: (id: Id<"photos">) => void;
  onFeatureToggle: (photo: PhotoRow) => void;
  onRemove: (id: Id<"photos">) => void;
  emptyText: string;
  showFeatureControl?: boolean;
}

function PhotoList({
  photos,
  selected,
  onToggleSelect,
  onApprove,
  onRejectStart,
  onFeatureToggle,
  onRemove,
  emptyText,
  showFeatureControl,
}: PhotoListProps) {
  if (photos.length === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        <ImageIcon className="w-8 h-8 mx-auto mb-3 opacity-40" />
        {emptyText}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {photos.map((photo) => {
        const isSelected = selected.has(photo._id);
        return (
          <div
            key={photo._id}
            className={`relative rounded-xl overflow-hidden border transition-all ${
              isSelected
                ? "border-[oklch(0.75_0.15_55/60%)] shadow-[0_0_0_2px_oklch(0.75_0.15_55/30%)]"
                : "border-[oklch(1_0_0/8%)]"
            }`}
          >
            {/* Select checkbox — top-left. */}
            <div className="absolute top-2 left-2 z-10">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect(photo._id)}
                aria-label="Select photo"
              />
            </div>

            {/* Featured pin — visual badge if featured. */}
            {photo.featured && (
              <div className="absolute top-2 right-2 z-10 px-2 py-0.5 rounded-full bg-[oklch(0.75_0.15_55/20%)] text-[oklch(0.85_0.15_55)] border border-[oklch(0.75_0.15_55/40%)] text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1">
                <Star className="w-3 h-3" /> Featured
              </div>
            )}

            <div className="aspect-square bg-[oklch(1_0_0/3%)]">
              <img
                src={photo.imageUrl}
                alt={photo.caption || "Photo"}
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>

            <div className="p-3 space-y-2">
              <div>
                <p className="text-xs text-muted-foreground truncate">
                  by {photo.uploaderName || "Anonymous"}
                </p>
                {photo.caption && (
                  <p className="text-sm line-clamp-2">{photo.caption}</p>
                )}
                {photo.moderationNote && (
                  <p className="text-[11px] text-muted-foreground italic mt-1">
                    Note: {photo.moderationNote}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {photo.status !== "approved" && (
                  <Button
                    size="sm"
                    onClick={() => onApprove(photo._id)}
                    className="h-7 px-2.5 text-xs gap-1"
                  >
                    <Check className="w-3 h-3" /> Approve
                  </Button>
                )}
                {photo.status !== "rejected" && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onRejectStart(photo._id)}
                    className="h-7 px-2.5 text-xs gap-1"
                  >
                    <X className="w-3 h-3" /> Reject
                  </Button>
                )}
                {(showFeatureControl || photo.status === "approved") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onFeatureToggle(photo)}
                    className="h-7 px-2.5 text-xs gap-1"
                  >
                    {photo.featured ? (
                      <>
                        <StarOff className="w-3 h-3" /> Unfeature
                      </>
                    ) : (
                      <>
                        <Star className="w-3 h-3" /> Feature
                      </>
                    )}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemove(photo._id)}
                  className="h-7 px-2 text-xs gap-1 text-destructive hover:text-destructive"
                  aria-label="Remove permanently"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
