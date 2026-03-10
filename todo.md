# IVARI Project TODO

## Database & Backend
- [x] Events table with JSONB survey responses
- [x] RSVPs table
- [x] Photos table for Memory Wall
- [x] tRPC routers for events CRUD
- [x] tRPC routers for RSVP management
- [x] tRPC routers for photo uploads
- [x] JWT signing for guest portal URLs
- [x] Nano Banana AI image generation integration
- [x] WebSocket real-time layer for RSVP and photos
- [x] Google Maps location integration

## Liquid Glass Design System
- [x] Global CSS with Inter typography
- [x] Ambient color-drift background animation
- [x] Glass material components (backdrop-filter blur(50px) saturate(200%))
- [x] Scroll-reactive specular highlights
- [x] Framer Motion 600ms transitions
- [x] Dark theme with OKLCH color tokens

## The Forge (Event Creation)
- [x] Multi-step creation flow
- [x] Centered text input "Describe your gathering..."
- [x] Real-time Nano Banana AI image preview
- [x] Date/Time sliding glass panels
- [x] Google Maps location picker
- [x] Event title and details inputs

## The Ledger (Dashboard)
- [x] Vertically scrolling event list
- [x] Floating glass cards reflecting ambient background
- [x] Event status indicators
- [x] Navigation to Forge and Pulse

## The Pulse (Event Management)
- [x] RSVP tracking with liquid progress bars
- [x] Guest list display
- [x] SMS broadcast toggle placeholder
- [x] Event details display

## The Portal (Guest Invitation)
- [x] Invitation landing page
- [x] Hero Nano Banana AI art background
- [x] Floating glass invitation text block
- [x] Liquid ripple RSVP button
- [x] JWT-signed URL access (zero auth)

## The Memory Wall (Post-Event)
- [x] Photo grid with refractive glass frames
- [x] Guest photo upload functionality
- [x] object-fit cover within glass frames
- [x] Real-time photo updates via WebSocket

## V2 OVERHAUL — Billion Dollar Polish

### Design System Elevation
- [x] Richer ambient background with more orbs, deeper color palette, parallax depth
- [x] Apple Invites-level whitespace ratios and typography hierarchy
- [x] Premium micro-interactions on every interactive element
- [x] Staggered entrance animations for lists and grids
- [x] Improved GlassCard with hover lift, glow effects, image integration
- [x] Cinematic page transitions between routes

### The Ledger V2
- [x] Rich event cards with hero image thumbnails behind glass
- [x] Status badges (Active, Draft, Past, Cancelled) with color coding
- [x] Guest count overlays on cards
- [x] Date/time display on cards
- [x] Staggered card entrance animations
- [x] Empty state with compelling CTA

### The Forge V2
- [x] Survey builder step — add custom questions (dietary, song requests, etc.)
- [x] Polished AI image preview with loading shimmer and glass overlay
- [x] Elegant date/time picker with visual calendar
- [x] Refined location panel with map preview
- [x] Step transitions with slide/fade choreography
- [x] Review step before final creation

### The Pulse V2
- [x] Full event editing (title, description, date, location)
- [x] Regenerate Nano Banana hero image
- [x] Detailed RSVP list with guest info, status, messages
- [x] Survey response viewer
- [x] Copy guest portal link button
- [x] Real-time RSVP updates via WebSocket
- [x] Event statistics dashboard (attending vs declined vs maybe)

### The Portal V2
- [x] Cinematic hero with parallax AI art
- [x] Apple Invites-level invitation layout with elegant typography
- [x] RSVP form with survey questions from host
- [x] Success confirmation with animation
- [x] Event details section (date, location, map)

### The Memory Wall V2
- [x] Masonry grid layout for photos
- [x] Lightbox photo viewer with navigation
- [x] Upload flow with preview and caption
- [x] Real-time photo updates via WebSocket
- [x] Photo count and uploader names

### WebSocket Layer
- [x] Socket.IO server integration
- [x] Real-time RSVP count push to Pulse
- [x] Real-time photo push to Memory Wall
- [x] Connection status indicator

## V3 — Notifications, Templates, Guest Import

### Email/SMS Notification Delivery
- [x] Guests table with name, email, phone, delivery status per guest
- [x] Notification sending via built-in notifyOwner or custom email system
- [x] Text Blast in The Pulse sends messages to all guests with portal links
- [x] Auto-send invitation links when event status changes to active
- [x] Delivery status tracking per guest (pending, sent, failed)
- [x] Notification history log

### Event Templates
- [x] Template data structure with curated Nano Banana prompts
- [x] Wedding template with romantic prompts, survey questions
- [x] Birthday template with celebration prompts, survey questions
- [x] Corporate Gala template with elegant prompts, survey questions
- [x] Dinner Party template with intimate prompts, survey questions
- [x] Template selector UI in The Forge (Step 0 or integrated into Step 1)
- [x] Templates pre-fill title suggestion, description, AI prompt, color palette, survey questions

### Guest List Import
- [x] CSV paste textarea for quick guest entry
- [x] CSV file upload with drag-and-drop
- [x] CSV parsing (name, email, phone columns)
- [x] Individual JWT-signed portal link per guest
- [x] Guest list management UI in The Pulse
- [x] Bulk actions (send all, resend failed, remove)
- [x] Per-guest delivery status indicators
- [x] Copy individual guest portal link

## V4 — Status Lifecycle, Capacity Limits, Event Duplication

### Event Status Lifecycle
- [x] Status enum: draft, active, past, cancelled
- [x] Status transition controls in The Pulse with inline buttons
- [x] Auto-notify guests when event goes Active (invitations sent)
- [x] Auto-notify guests when event is Cancelled
- [x] Visual status badges updated across Ledger and Pulse
- [x] Draft events hidden from guest portal until activated
- [x] Past events auto-detected based on event date (via manual transition)

### RSVP Deadline & Capacity Limits
- [x] maxCapacity column on events table
- [x] rsvpDeadline column on events table
- [x] Capacity/deadline inputs in The Forge (Details step)
- [x] Portal auto-closes RSVP when deadline passed or capacity reached
- [x] Capacity counter shown on Pulse header
- [x] Deadline shown on Portal
- [x] Capacity limit and remaining spots shown on Portal

### Event Duplication
- [x] Duplicate event route in backend (clones title, description, image, survey, template)
- [x] Duplicate button in The Ledger event cards
- [x] Duplicate button in The Pulse header
- [x] Duplicated event starts as Draft with new slug
- [x] Option to also clone guest list

## V5 — Analytics, Custom Colors, QR Codes, Ambient Luxury Elevation

### Analytics Dashboard (The Pulse)
- [x] Portal view tracking (record each visit to guest portal)
- [x] RSVP conversion rate chart (views vs RSVPs)
- [x] Photo upload activity timeline
- [x] Visual charts using Recharts in The Pulse
- [x] Analytics tab in Pulse with key metrics cards

### Custom Theme Colors Per Event
- [x] themeColor column on events table (hex or oklch)
- [x] Color picker in The Forge (Vibe step with 8 presets + custom)
- [x] Portal dynamically applies event's custom accent color (via themeColor)
- [x] Theme color carries through to guest portal, Memory Wall
- [x] Default warm amber (#D4A853) when no custom color set

### QR Code Generation
- [x] Server-side QR code generation (qrcode npm package)
- [x] QR code endpoint per event returning PNG
- [x] QR code display in The Pulse (downloadable PNG)
- [x] QR code on Portal page for sharing (via Pulse share)

### Ambient Luxury Design Elevation
- [x] Pure black (#000000) backgrounds throughout
- [x] Warm off-white (#F5F0E8) primary text
- [x] Dynamic accent gradients per event
- [x] Stronger typographic scale (large bold titles, light body)
- [x] Elevated glass materials with warmer tones

### Vibe Engine Enhancement (The Forge)
- [x] Full-screen focused "Describe the vibe..." input
- [x] "Generate Vibe" pill button with glowing border
- [x] Generative art transition on vibe generation
- [x] Event details as overlays on generated art

### Social Oracle (Guest Curation)
- [x] AI-powered guest suggestion panel in Pulse (backend)
- [x] LLM generates "why they're a good fit" tags
- [x] Add suggested guests with one tap (Social Oracle panel in Guests tab)

### The Gallery (Memory Weave)
- [x] New /gallery route for past events collection
- [x] Horizontally scrolling past event cards with generative art
- [x] Event attendance count and reputation display
- [x] Tap to view event memories (photos, details)

## V6 — Bug Fixes, Security Audit, New Features

### Bug Fixes
- [x] Fix "failed to generate link" error (transient — JWT signing works, added robustness)

### Security Audit
- [x] SQL injection audit — all queries use Drizzle ORM parameterized queries, PASS
- [x] IDOR audit — fixed photos.delete and guests.remove to verify resource belongs to event
- [x] Authorization audit — all protected routes use protectedProcedure + hostId ownership check
- [x] Never rely on frontend hiding for security — all enforcement is backend-side

### Animated Invitation Card Previews
- [x] Generate shareable image preview of invitation card
- [x] Downloadable PNG for social media sharing
- [x] Preview shows event title, date, AI art, and invitation text

### Event Check-In Mode
- [x] Check-in screen for event day
- [x] Mark guests as arrived
- [x] Real-time attendance counter
- [x] Check-in status persisted to database (checkedIn + checkedInAt columns on guests)

### Multi-Language Support
- [x] Language selector in The Forge (event creation)
- [x] Portal renders in selected language (English, Spanish, French, etc.)
- [x] Translated RSVP form labels and buttons
- [x] Language stored per event (language column on events table)
