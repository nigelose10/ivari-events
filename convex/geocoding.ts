/**
 * Geocoding — turns a free-text `locationName` into latitude/longitude using
 * Open-Meteo's free, no-API-key geocoding service. Same vendor as the weather
 * forecast (`weather.getForEvent`), so coordinates round-trip cleanly into
 * the WeatherWidget.
 *
 * Flow:
 *   1. `events.create` / `events.update` schedule `geocodeAndAttach` after
 *      a successful write (only when `locationName` is set or changed).
 *   2. `geocodeAndAttach` (action) hits the Open-Meteo geocoding API, then
 *      calls `attachCoords` (internalMutation) to patch the event row.
 *   3. `geocodedFrom` records the exact string we resolved, so re-geocoding
 *      is skipped until the user actually changes `locationName`.
 *
 * Failure mode: any non-200 response, network error, or empty result set
 * returns `null` and leaves the event untouched. The widget tolerates
 * missing coords (renders nothing).
 */
import { v } from "convex/values";
import { action, internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/** Public action: geocode a free-text place name and patch the event doc. */
export const geocodeAndAttach = action({
  args: { eventId: v.id("events"), locationName: v.string() },
  handler: async (
    ctx,
    { eventId, locationName },
  ): Promise<{ latitude: number; longitude: number } | null> => {
    if (!locationName || locationName.trim().length < 2) return null;

    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&format=json`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const data: any = await res.json();
      const hit = data.results?.[0];
      if (!hit?.latitude || !hit?.longitude) return null;

      await ctx.runMutation(internal.geocoding.attachCoords, {
        eventId,
        latitude: hit.latitude,
        longitude: hit.longitude,
        geocodedFrom: locationName,
      });
      return { latitude: hit.latitude, longitude: hit.longitude };
    } catch {
      return null;
    }
  },
});

export const attachCoords = internalMutation({
  args: {
    eventId: v.id("events"),
    latitude: v.number(),
    longitude: v.number(),
    geocodedFrom: v.string(),
  },
  handler: async (
    ctx,
    { eventId, latitude, longitude, geocodedFrom },
  ) => {
    await ctx.db.patch(eventId, { latitude, longitude, geocodedFrom });
  },
});
