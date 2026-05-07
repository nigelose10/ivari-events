/**
 * NSFWJS-based image preflight — runs BEFORE we upload to Convex storage.
 *
 * Why client-side:
 *   - Saves the round-trip + storage write for content we'd reject anyway.
 *   - The model + weights are cached by the service worker on first load,
 *     so subsequent sessions are zero-cost.
 *   - NSFWJS is MIT-licensed, ~93% accurate on the mid model, and runs
 *     entirely in the browser via TensorFlow.js — no server, no API keys.
 *
 * Threshold tuning:
 *   We treat `Porn + Hentai + Sexy` summed > 0.6 as auto-reject, and the
 *   `Hentai` class alone > 0.85 as auto-reject. The rest stays in the
 *   existing host-moderation queue. Hosts can override by re-uploading
 *   directly via the host Add Photo flow (same threshold doesn't gate them
 *   because the upload path is different).
 *
 * Lazy-load:
 *   The library + weights are ~1.5 MB. We only import on first use to
 *   avoid bloating the main bundle.
 */

const REJECT_THRESHOLDS = {
  combinedSexual: 0.6,
  hentaiAbsolute: 0.85,
};

type ModerationResult =
  | { ok: true; scores: Record<string, number> }
  | { ok: false; reason: string; scores: Record<string, number> };

let modelPromise: Promise<{
  classify: (
    img: HTMLImageElement | HTMLCanvasElement | ImageData,
  ) => Promise<Array<{ className: string; probability: number }>>;
}> | null = null;

/** Lazy-load the model exactly once per page session. */
async function getModel() {
  if (!modelPromise) {
    modelPromise = (async () => {
      // Pulled in lazily — `nsfwjs` itself imports `@tensorflow/tfjs`.
      const nsfwjs = await import("nsfwjs");
      // The default model is fine; the mid model is the published default.
      // No server-side weights needed — nsfwjs ships its own CDN URL.
      return nsfwjs.load();
    })();
  }
  return modelPromise;
}

/** Reads a File into a decoded HTMLImageElement, ready for classify. */
function fileToImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

export async function moderateImage(file: File): Promise<ModerationResult> {
  if (!file.type.startsWith("image/")) {
    return { ok: true, scores: {} }; // non-images aren't NSFW-classifiable
  }
  let model;
  try {
    model = await getModel();
  } catch (err) {
    // Loading failed (offline, CDN error). Fail open — let the upload
    // proceed and rely on host moderation. Soft failure logged once.
    // eslint-disable-next-line no-console
    console.warn("[moderation] model load failed; deferring to host queue", err);
    return { ok: true, scores: {} };
  }

  let img;
  try {
    img = await fileToImage(file);
  } catch {
    return { ok: true, scores: {} };
  }

  const predictions = await model.classify(img);
  const scores: Record<string, number> = {};
  for (const p of predictions) scores[p.className] = p.probability;

  const sexual =
    (scores.Porn ?? 0) + (scores.Hentai ?? 0) + (scores.Sexy ?? 0);
  if (sexual > REJECT_THRESHOLDS.combinedSexual) {
    return {
      ok: false,
      reason: "This photo looks NSFW. Try a different shot.",
      scores,
    };
  }
  if ((scores.Hentai ?? 0) > REJECT_THRESHOLDS.hentaiAbsolute) {
    return {
      ok: false,
      reason: "This photo looks NSFW. Try a different shot.",
      scores,
    };
  }
  return { ok: true, scores };
}
