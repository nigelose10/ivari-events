/**
 * weather.ts — V7-W4 weather widget data layer.
 *
 * For events ≤7 days out, fetches a daily forecast slice from Open-Meteo
 * (https://open-meteo.com — no API key required) and caches it in the
 * `weatherCache` table for ~6h.
 *
 * Design:
 * - `getForEvent` is an action because Convex queries/mutations cannot
 *   make network requests. It dispatches to internal query/mutation
 *   helpers (`lookupCache`, `writeCache`) for the DB roundtrip.
 * - Cache key is `${lat.toFixed(2)},${lon.toFixed(2)},${dateISO}` so two
 *   events at the same venue on the same day share a cached payload.
 * - We slice the response down to the single relevant day before
 *   serializing — keeps the cache row tiny and avoids leaking the full
 *   8-day forecast over the wire.
 * - Returns `null` whenever the forecast is unavailable (event past,
 *   beyond 7-day horizon, fetch failure, missing date in response). The
 *   client treats null as "render nothing".
 */
import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";

export const getForEvent = action({
  args: {
    eventId: v.id("events"),
    latitude: v.number(),
    longitude: v.number(),
    eventDateMs: v.number(),
  },
  handler: async (ctx, { latitude, longitude, eventDateMs }) => {
    const eventDate = new Date(eventDateMs);
    const daysOut = Math.ceil((eventDateMs - Date.now()) / 86400000);
    if (daysOut < 0 || daysOut > 7) return null;

    const dateISO = eventDate.toISOString().slice(0, 10);
    const cacheKey = `${latitude.toFixed(2)},${longitude.toFixed(2)},${dateISO}`;

    // Cache hit (fresh ≤6h)
    const cached: any = await ctx.runQuery(internal.weather.lookupCache, { cacheKey });
    if (cached && Date.now() - cached.fetchedAt < 6 * 3600 * 1000) {
      try {
        return JSON.parse(cached.forecastJson);
      } catch {
        // Fall through and refetch on corrupted cache row.
      }
    }

    // Cache miss → fetch from Open-Meteo
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&forecast_days=8`;
    let res: Response;
    try {
      res = await fetch(url);
    } catch {
      return null;
    }
    if (!res.ok) return null;
    const data: any = await res.json();
    const idx = data?.daily?.time?.indexOf(dateISO);
    if (idx === undefined || idx < 0) return null;

    const slice = {
      date: data.daily.time[idx],
      tempMax: data.daily.temperature_2m_max[idx],
      tempMin: data.daily.temperature_2m_min[idx],
      weatherCode: data.daily.weathercode[idx],
      timezone: data.timezone,
    };
    await ctx.runMutation(internal.weather.writeCache, {
      cacheKey,
      forecastJson: JSON.stringify(slice),
    });
    return slice;
  },
});

export const lookupCache = internalQuery({
  args: { cacheKey: v.string() },
  handler: async (ctx, { cacheKey }) => {
    return await ctx.db
      .query("weatherCache")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", cacheKey))
      .first();
  },
});

export const writeCache = internalMutation({
  args: { cacheKey: v.string(), forecastJson: v.string() },
  handler: async (ctx, { cacheKey, forecastJson }) => {
    const existing = await ctx.db
      .query("weatherCache")
      .withIndex("by_cacheKey", (q) => q.eq("cacheKey", cacheKey))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { forecastJson, fetchedAt: Date.now() });
    } else {
      await ctx.db.insert("weatherCache", {
        cacheKey,
        forecastJson,
        fetchedAt: Date.now(),
      });
    }
  },
});
