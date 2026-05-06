/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as analytics from "../analytics.js";
import type * as chats from "../chats.js";
import type * as events from "../events.js";
import type * as geocoding from "../geocoding.js";
import type * as guestTokens from "../guestTokens.js";
import type * as guests from "../guests.js";
import type * as http from "../http.js";
import type * as lib_permissions from "../lib/permissions.js";
import type * as notificationActions from "../notificationActions.js";
import type * as notifications from "../notifications.js";
import type * as photos from "../photos.js";
import type * as qrcode from "../qrcode.js";
import type * as rsvps from "../rsvps.js";
import type * as templates from "../templates.js";
import type * as users from "../users.js";
import type * as weather from "../weather.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  analytics: typeof analytics;
  chats: typeof chats;
  events: typeof events;
  geocoding: typeof geocoding;
  guestTokens: typeof guestTokens;
  guests: typeof guests;
  http: typeof http;
  "lib/permissions": typeof lib_permissions;
  notificationActions: typeof notificationActions;
  notifications: typeof notifications;
  photos: typeof photos;
  qrcode: typeof qrcode;
  rsvps: typeof rsvps;
  templates: typeof templates;
  users: typeof users;
  weather: typeof weather;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
