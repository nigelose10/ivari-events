/**
 * WeatherWidget — V7-W4
 *
 * Differentiator: Apple Invites only shows weather for iOS users. We show
 * forecasts for ANY user (iOS Calendar, Google Cal, Outlook, web) for events
 * within the 7-day Open-Meteo forecast window.
 *
 * Behavior:
 * - If lat/lon missing or event >7 days out → render nothing
 * - On mount, calls api.weather.getForEvent (cached 6h server-side)
 * - Shows a small "Checking forecast…" pill while loading
 * - On success, displays a glass pill with weather emoji + high/low °F
 *
 * Style:
 * - Refined glass surface (matches GlassCard tokens from index.css)
 * - Warm amber accent on temperatures (oklch ~78/0.13/65 — V7 palette)
 * - Pill height ~32px, hugs its content
 *
 * Open-Meteo weathercode map (WMO 4677 codes):
 *   0          → clear
 *   1–3        → partly cloudy
 *   45–48      → fog
 *   51–67      → rain (drizzle/rain)
 *   71–77      → snow
 *   80–82      → rain showers
 *   95–99      → thunderstorm
 */
import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { motion } from "framer-motion";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface WeatherWidgetProps {
  eventId: Id<"events">;
  latitude?: number;
  longitude?: number;
  eventDateMs: number;
}

interface Forecast {
  tempMax: number;
  tempMin: number;
  weatherCode: number;
}

function emojiForCode(code: number): string {
  if (code === 0) return "☀️"; // ☀️
  if (code >= 1 && code <= 3) return "⛅"; // ⛅
  if (code >= 45 && code <= 48) return "🌫️"; // 🌫️
  if (code >= 51 && code <= 67) return "🌧️"; // 🌧️
  if (code >= 71 && code <= 77) return "🌨️"; // 🌨️
  if (code >= 80 && code <= 82) return "🌧️"; // 🌧️
  if (code >= 95 && code <= 99) return "⛈️"; // ⛈️
  return "☁️"; // ☁️ fallback
}

function cToF(c: number): number {
  return Math.round((c * 9) / 5 + 32);
}

export function WeatherWidget({
  eventId,
  latitude,
  longitude,
  eventDateMs,
}: WeatherWidgetProps) {
  // Hooks must run unconditionally — gate via early-return AFTER state setup.
  const getForEvent = useAction(api.weather.getForEvent);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const daysOut = Math.ceil((eventDateMs - Date.now()) / 86400000);
  const inWindow =
    latitude !== undefined &&
    longitude !== undefined &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    daysOut >= 0 &&
    daysOut <= 7;

  useEffect(() => {
    if (!inWindow) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getForEvent({
      eventId,
      latitude: latitude as number,
      longitude: longitude as number,
      eventDateMs,
    })
      .then((data: any) => {
        if (cancelled) return;
        if (data && typeof data.tempMax === "number") {
          setForecast({
            tempMax: data.tempMax,
            tempMin: data.tempMin,
            weatherCode: data.weatherCode,
          });
        } else {
          setForecast(null);
        }
      })
      .catch(() => {
        if (!cancelled) setForecast(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eventId/lat/lon/date are the cache key; only re-run when they change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, latitude, longitude, eventDateMs, inWindow]);

  // Out-of-window or missing coords → render nothing.
  if (!inWindow) return null;
  // Forecast unavailable after load → also render nothing (graceful degrade).
  if (!loading && !forecast) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="inline-flex items-center gap-2 h-8 px-3 rounded-full border border-[oklch(1_0_0/8%)] bg-[oklch(1_0_0/4%)] backdrop-blur-xl text-xs font-medium text-[var(--text-secondary)] shadow-[0_1px_0_oklch(1_0_0/4%)_inset]"
      aria-live="polite"
    >
      {loading || !forecast ? (
        <>
          <span
            className="w-2 h-2 rounded-full bg-[oklch(0.78_0.13_65)] opacity-70"
            aria-hidden
          />
          <span className="tracking-wide">Checking forecast…</span>
        </>
      ) : (
        <>
          <span className="text-base leading-none" aria-hidden>
            {emojiForCode(forecast.weatherCode)}
          </span>
          <span className="text-[oklch(0.78_0.13_65)] font-semibold tabular-nums">
            {cToF(forecast.tempMax)}°
          </span>
          <span className="text-[var(--text-tertiary)] tabular-nums">
            / {cToF(forecast.tempMin)}°
          </span>
          <span className="sr-only">
            High {cToF(forecast.tempMax)} degrees, low {cToF(forecast.tempMin)} degrees
            Fahrenheit.
          </span>
        </>
      )}
    </motion.div>
  );
}

export default WeatherWidget;
