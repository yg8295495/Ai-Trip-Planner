# AI Road Trip Planner — Design Spec

**Date:** 2026-06-12
**Status:** Approved
**Reference:** roadtrip-planner-architecture.md (original architecture by Claude)

---

## [S1] Overview

AI-powered self-driving trip planner. User chats with AI to collect trip parameters, AI recommends stops along the corridor, map displays route and pins live, itinerary strip updates in real-time. Three-panel dashboard: Chat | Map | Itinerary.

**Core principles (from original architecture):**
- Itinerary is always live, not an output
- Map is the decision tool
- AI holds constraints and enforces them
- Cascade effects are visible immediately

---

## [S2] Approved Tech Stack

| Layer | Technology | Reason |
|-------|-----------|--------|
| Frontend framework | Vue 3 + TypeScript | User familiar, mature ecosystem |
| State management | Pinia | Vue official, lightweight |
| Styling | Tailwind CSS | Rapid layout, consistent tokens |
| Map | 高德地图 JS API | China-friendly, free tier generous |
| Routing | 高德路线规划API | Chinese, free, integrated |
| Geocoding | 高德地理编码API | Chinese, free |
| AI backend | mimo auto (pluggable) | Current default, swappable later |
| Build tool | Vite | Fast, Vue official |
| Backend | None | Personal use, API key exposure acceptable |

---

## [S3] Architecture Adaptations

### What changes from original architecture

1. **React → Vue 3**: All components use Vue SFC (`.vue` files), Composition API with `<script setup>`
2. **Zustand → Pinia**: Store uses `defineStore`, same slice concept
3. **Leaflet/OSM → 高德地图**: Map rendering, routing, geocoding all via 高德 JS API
4. **OSRM/Nominatim → 高德 APIs**: Single provider for all map services
5. **No backend**: All API calls from browser (acceptable for personal use)

### What stays the same

1. Three-panel layout (Chat | Map | Itinerary)
2. Data models (TripParams, Location, DrivingLeg, ItineraryDay, etc.)
3. AI orchestration concept (Collecting → Planning modes)
4. ResponseParser envelope format
5. ItineraryCalculator logic (pure function, recalc on every change)
6. PromptManager structure (system prompt + state + history + message)
7. Development phases (6 phases)
8. Coding guidelines (TypeScript strict, no logic in components, etc.)

---

## [S4] Module Specifications

### 4.1 ChatPanel
Renders conversation history, handles user input. Messages: user right, AI left. Loading indicator during AI response. Enter to send, Shift+Enter for newline.

### 4.2 MapPanel
Renders 高德地图 with route polyline and location pins. Pin colors by category (green=confirmed, blue=suggestion, yellow=food, purple=hotel). Click pin opens info card with toggle. Route redraws on confirmed stop change. Over-limit segments turn red.

### 4.3 ItineraryStrip
Always-live day-by-day summary. One card per day, horizontal scroll. Shows day number, date, overnight city, driving time, stops count. Drive time bar turns red if over limit. Click day highlights map segment.

### 4.4 AIOrchestrator
Core engine. Two-phase mode: COLLECTING (asking questions) → PLANNING (generating). On every user message: build prompt → call AI → parse response → dispatch state updates.

### 4.5 PromptManager
Builds complete prompt: system prompt + trip state + history + user message. System prompts stored in `/src/prompts/v1/` as versioned files.

### 4.6 ResponseParser
Extracts structured data from AI responses. Envelope: `{ chat, status, tripParamUpdates, locationUpdates, itineraryNotes, missingFields }`. Plain-text fallback on parse failure.

### 4.7 ItineraryCalculator
Pure function. Takes locations + constraints + driving legs → produces ItineraryDay[]. Called via Pinia subscription on every location/leg change.

### 4.8 RoutingService
Wraps 高德路线规划API. Caches results by waypoint key. Returns driving time and distance per leg. Note: 高德 returns `AMap.DrivingResult` with `routes[0].steps[]` — must translate to `DrivingLeg[]` format.

### 4.9 GeocodingService
Wraps 高德地理编码API. Converts place names to coordinates. Caches all results. 350ms delay between sequential requests (rate limit).

---

## [S5] Data Models

All interfaces in `/src/types/index.ts`:

```typescript
interface TripParams {
  origin: GeocodedPlace | null
  destination: GeocodedPlace | null
  totalDays: number | null
  departureDate: Date | null
  dailyDrivingLimitHours: number       // default 5
  hotelBudget: 'budget' | 'mid' | 'luxury'
  travelStyle: TravelStyleTag[]
}

type TravelStyleTag = 'nature' | 'culture' | 'food' | 'adventure' | 'cities' | 'relaxed'

interface Location {
  id: string
  name: string
  shortName: string
  lat: number
  lon: number
  category: 'city' | 'scenic' | 'food' | 'nature' | 'culture' | 'hotel'
  description: string
  suggested: boolean
  selected: boolean
  dayHint: number | null
}

interface DrivingLeg {
  fromId: string
  toId: string
  distanceKm: number
  durationHours: number
}

interface ItineraryDay {
  dayNumber: number
  date: Date | null
  overnightLocation: Location
  stops: Location[]
  totalDriveHours: number
  totalDistanceKm: number
  isOverLimit: boolean
}

interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: Date
  rawPayload?: AIResponseEnvelope
}

interface GeocodedPlace {
  query: string
  lat: number
  lon: number
  shortName: string
  fullName: string
}
```

---

## [S6] Folder Structure

```
/src
  /components
    /ChatPanel
      ChatPanel.vue
      MessageBubble.vue
      ChatInput.vue
    /MapPanel
      MapPanel.vue
      LocationPin.vue
      PinInfoCard.vue
      RoutePolyline.vue
    /ItineraryStrip
      ItineraryStrip.vue
      DayCard.vue
      DriveTimeBar.vue
    /Layout
      AppLayout.vue

  /services
    /ai
      AIOrchestrator.ts
      PromptManager.ts
      ResponseParser.ts
    /routing
      RoutingService.ts
    /geocoding
      GeocodingService.ts

  /store
    tripStore.ts

  /logic
    ItineraryCalculator.ts
    FeasibilityChecker.ts

  /prompts
    /v1
      role.txt
      format.txt
      constraints.txt
      collection.txt

  /types
    index.ts

  /constants
    defaults.ts
    categories.ts

  /composables
    useAI.ts
    useMap.ts
```

---

## [S7] Implementation Phases

### Phase 1 — Layout Shell (no AI)
- Vue 3 + Vite project scaffold
- Three-panel layout with placeholder content
- Static mock trip data rendered in all panels
- 高德地图 renders with static pins and polyline

### Phase 2 — Information Collection
- Chat panel wired to AI (mimo auto)
- AIOrchestrator in COLLECTING mode
- Detects when required fields complete
- Updates TripParams in store

### Phase 3 — Corridor Discovery
- AI generates initial location suggestions
- ResponseParser extracts locationUpdates
- Pins appear on map, itinerary skeleton generated

### Phase 4 — Live Recalculation
- 高德 RoutingService integrated
- ItineraryCalculator wired to Pinia subscription
- Itinerary strip updates on every turn
- Over-limit days flagged visually

### Phase 5 — Refinement Loop
- User can toggle pins on/off
- Pin info cards with descriptions
- Chat continues to refine
- Cascade visible in real time

### Phase 6 — Final Itinerary Export
- "Finalize" action generates detailed day-by-day plan
- Printable/shareable itinerary view
- 高德地图 deep-link for each day's drive

---

## [S8] Key Decisions

1. **No backend**: All API calls from browser. 高德 API key exposed but acceptable for personal use.
2. **Pluggable AI**: AIOrchestrator uses an interface, mimo auto is the current implementation. Easy to swap to Claude/OpenAI later.
3. **Pinia over Zustand**: Vue ecosystem native, same concept, less friction.
4. **高德 over Leaflet/OSM**: Better Chinese data, integrated geocoding/routing, free tier sufficient.
5. **Tailwind CSS**: Keep from original architecture. Fast styling, consistent tokens.
6. **TypeScript strict mode**: No `any` types, as per original architecture guidelines.

---

*End of design spec. Ready for implementation planning.*
