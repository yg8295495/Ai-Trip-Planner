# AI Road Trip Planner — Architecture & Engineering Guidelines

**Version:** 1.0  
**Status:** Pre-development  
**Last Updated:** June 2026

---

## 1. Product Vision

An AI-powered self-driving trip planner where the user has a natural conversation with an AI travel advisor. The AI collects trip parameters, researches the route corridor, recommends stops, and maintains a **live itinerary** that updates in real time after every conversational turn. The user never fills out a form — they talk, and the system responds by updating a three-panel dashboard simultaneously.

### Core Design Principles

- **The itinerary is always live.** It is not an output at the end. It exists from the first complete input and recalculates after every AI response.
- **The map is the decision tool.** Visual route inspection replaces manual reasoning about detours and distance.
- **The AI holds the constraints.** The user states them once (driving limit, budget). The AI enforces them throughout without being asked.
- **Cascade effects are visible immediately.** Adding or removing a stop reshapes the entire itinerary. The user sees this happen, not just the result.

---

## 2. System Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        USER INTERFACE                        │
│                                                             │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  CHAT PANEL  │  │    MAP PANEL     │  │  ITINERARY   │  │
│  │              │  │                  │  │    STRIP     │  │
│  │ Conversation │  │ Route + Pins     │  │ Day-by-day   │  │
│  │ history      │  │ Live updates     │  │ Always live  │  │
│  │ Input box    │  │ Pin info cards   │  │ Flags overrun│  │
│  └──────────────┘  └──────────────────┘  └──────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  APP STATE CORE │
                    │                 │
                    │  TripState      │
                    │  Conversation   │
                    │  MapState       │
                    │  ItineraryState │
                    └────────┬────────┘
                             │
           ┌─────────────────┼─────────────────┐
           │                 │                 │
  ┌────────▼───────┐ ┌───────▼──────┐ ┌───────▼──────┐
  │  AI ORCHESTR.  │ │   ROUTING    │ │  GEOCODING   │
  │                │ │   SERVICE    │ │  SERVICE     │
  │  Claude API    │ │              │ │              │
  │  Web Search    │ │  OSRM API    │ │  Nominatim   │
  │  Prompt Mgr    │ │  Drive time  │ │  OSM         │
  │  Response Pars.│ │  Feasibility │ │              │
  └────────────────┘ └──────────────┘ └──────────────┘
```

### Data Flow on Every Conversation Turn

```
User sends message
       │
       ▼
ConversationManager builds full prompt
(system prompt + trip state + history + user message)
       │
       ▼
Claude API call (with web_search tool enabled)
       │
       ▼
ResponseParser extracts:
  ├── chatText     → Chat Panel
  ├── locationDiff → MapPanel (add/remove/update pins)
  ├── itineraryDiff → ItineraryCalculator
  └── tripParams   → TripState (if new info detected)
       │
       ▼
ItineraryCalculator runs full recalculation
(OSRM calls for driving time per leg)
       │
       ▼
All three panels update simultaneously
```

---

## 3. Technology Stack

### Frontend
| Layer | Technology | Reason |
|---|---|---|
| Framework | React 18 | Component model fits three-panel live updates |
| State | Zustand | Lightweight, no boilerplate, easy cross-panel sync |
| Styling | Tailwind CSS | Rapid layout, consistent design tokens |
| Map | Leaflet.js + OpenStreetMap | Free, no API key, full-featured |
| Map Routing Display | Leaflet Routing Machine | Draw route polylines on Leaflet |
| Icons | Lucide React | Consistent, tree-shakeable |

### Backend Services (all external APIs)
| Service | Provider | Cost | Purpose |
|---|---|---|---|
| AI + Web Search | Anthropic Claude API (claude-sonnet-4-6) | Pay per token | Core intelligence, recommendations |
| Driving Routes | OSRM public API | Free | Drive time and distance per leg |
| Geocoding | Nominatim / OpenStreetMap | Free | Convert place names to coordinates |
| Map Tiles | OpenStreetMap / CartoDB | Free | Map background rendering |

### Optional Upgrades (future)
| Upgrade | Provider | When to add |
|---|---|---|
| Better map tiles | Mapbox | When visual quality matters |
| Place details + photos | Google Places API | When richer POI data needed |
| Real hotel pricing | Booking.com API or similar | When booking integration needed |
| Traffic-aware routing | Google Maps Directions | When live traffic data needed |

### Build & Deployment
- **Build tool:** Vite
- **Deployment:** Any static host (Vercel, Netlify, Cloudflare Pages)
- **No backend required** — all API calls made from the browser

---

## 4. Module Specifications

### 4.1 ChatPanel

**Responsibility:** Renders the conversation history and handles user input.

**Key behaviors:**
- Displays messages in chronological order (user right, AI left)
- Shows loading state while AI is responding (typing indicator)
- Input field supports Enter to send, Shift+Enter for newlines
- Does not process or interpret AI responses — only renders text
- Scroll-to-bottom on new messages

**Props / state consumed:** `conversationMessages`, `isLoading`  
**Events emitted:** `onUserMessage(text: string)`

---

### 4.2 MapPanel

**Responsibility:** Renders the live map with route polyline and candidate location pins.

**Key behaviors:**
- Initializes with a world view, zooms to trip corridor once origin/destination are known
- Renders each location as a colored pin by category:
  - 🟢 Green — confirmed stop (user selected)
  - 🔵 Blue — AI suggestion (candidate)
  - 🟡 Yellow — food / restaurant
  - 🟣 Purple — hotel / overnight
  - ⚫ Grey — removed / skipped
- Clicking a pin opens an info card with the AI's description, category, and a toggle to include/exclude
- Route polyline redraws whenever confirmed stops change
- If a day segment exceeds the driving limit, that polyline segment turns red

**Props / state consumed:** `locations[]`, `confirmedRoute`, `selectedDayHighlight`  
**Events emitted:** `onLocationToggle(id)`, `onPinClick(id)`

---

### 4.3 ItineraryStrip

**Responsibility:** Renders the always-live day-by-day trip summary.

**Key behaviors:**
- Visible from the moment trip parameters are collected (not just at the end)
- One card per day, scrollable horizontally if many days
- Each card shows:
  - Day number and date
  - Overnight city
  - Driving time for that day
  - Number of stops
  - Drive time bar (visual, turns red if over limit)
- Clicking a day card highlights that day's segment on the map
- "Not yet planned" placeholder cards for days with no content yet

**Props / state consumed:** `itinerary[]`, `drivingLimitHours`, `departureDate`  
**Events emitted:** `onDaySelect(dayNumber)`

---

### 4.4 AIOrchestrator

**Responsibility:** The core engine. Manages all communication with the Claude API, constructs prompts, parses responses, and dispatches state updates.

**Key behaviors:**
- Maintains a two-phase internal mode:
  - **COLLECTING** — trip parameters incomplete, AI asks follow-up questions
  - **PLANNING** — parameters complete, AI generates and refines
- On every user message:
  1. Builds full prompt (system + trip state + history + user message)
  2. Calls Claude API with web search enabled
  3. Parses structured response
  4. Dispatches updates to all state slices
- Never lets raw API JSON leak to the UI layers

**Internal checklist for COLLECTING → PLANNING transition:**
```
Required fields before switching to PLANNING mode:
  ✓ origin (geocodeable place name)
  ✓ destination (geocodeable place name)
  ✓ totalDays (integer > 0)

Optional fields (use defaults if absent):
  - dailyDrivingLimitHours (default: 5)
  - hotelBudget (default: 'mid')
  - travelStyle (default: 'balanced')
  - departureDate (default: null — dates shown as Day 1, Day 2...)
```

---

### 4.5 PromptManager

**Responsibility:** Builds the complete prompt sent to Claude on every turn.

**Prompt structure (assembled in order):**
```
[SYSTEM PROMPT]
  - Role definition
  - Response format specification (JSON envelope + text)
  - Constraint enforcement rules
  - Information collection template

[TRIP STATE BLOCK]
  - Current trip parameters
  - Current confirmed locations
  - Current itinerary snapshot
  - Any constraint violations

[CONVERSATION HISTORY]
  - All prior messages (user + assistant)
  - Older messages summarized if > 20 turns

[CURRENT USER MESSAGE]
```

**Prompt versioning:** All system prompts are stored in `/src/prompts/` as versioned `.txt` files, not hardcoded in components.

---

### 4.6 ResponseParser

**Responsibility:** Extracts structured data from every Claude API response.

Every AI response must conform to this envelope. The system prompt instructs Claude to always respond in this format:

```json
{
  "chat": "The natural language message shown to the user.",
  "status": "collecting | planning | refining",
  "tripParamUpdates": {
    "origin": "Shanghai, China",
    "destination": "Chengdu, China",
    "totalDays": 10,
    "dailyDrivingLimitHours": 5,
    "hotelBudget": "mid",
    "travelStyle": ["nature", "food"]
  },
  "locationUpdates": [
    {
      "action": "add | remove | update",
      "id": "loc_hangzhou_westlake",
      "name": "West Lake",
      "shortName": "West Lake, Hangzhou",
      "lat": 30.2500,
      "lon": 120.1500,
      "category": "scenic",
      "description": "UNESCO-listed lake surrounded by pagodas and tea plantations. Allow 3–4 hours.",
      "suggested": true,
      "selected": false,
      "dayHint": 2
    }
  ],
  "itineraryNotes": "Day 4 is currently 6.2h — over your 5h limit. Consider splitting Wuyishan across two days.",
  "missingFields": ["departureDate"]
}
```

**Parser rules:**
- Extract JSON block from response (strip markdown fences if present)
- If parsing fails, treat entire response as `chat` text only — never crash
- Validate all `lat/lon` values are plausible numbers
- Ignore unknown fields silently

---

### 4.7 ItineraryCalculator

**Responsibility:** Pure function that takes the full location list + constraints and produces the complete itinerary. Called after every state update.

```typescript
function calculateItinerary(
  locations: Location[],       // All selected locations in order
  constraints: TripConstraints, // dailyDrivingLimit, totalDays, etc.
  drivingLegs: DrivingLeg[]    // Pre-fetched OSRM data for each leg
): ItineraryDay[]
```

**Logic:**
1. Walk the selected locations in sequence
2. Accumulate driving time per day
3. When adding the next leg would exceed `dailyDrivingLimitHours`, close the current day and start a new one
4. Assign an overnight stop at the end of each day (last location of that day)
5. Flag any day where driving time > limit (can happen if a single leg is already over the limit)
6. Return array of `ItineraryDay` objects

**This function is pure — no API calls, no side effects.** OSRM data is fetched separately by the RoutingService and passed in.

---

### 4.8 RoutingService

**Responsibility:** All calls to the OSRM routing API.

```typescript
// Get driving time and distance between two points
async function getDrivingLeg(from: LatLon, to: LatLon): Promise<DrivingLeg>

// Get all legs for a full route in one call
async function getFullRoute(waypoints: LatLon[]): Promise<DrivingLeg[]>
```

**Caching:** Cache results by `"lat1,lon1→lat2,lon2"` key in memory. OSRM results don't change — no need to re-fetch the same leg.

**Rate limiting:** OSRM public server has no strict rate limit but requests should be batched where possible.

---

### 4.9 GeocodingService

**Responsibility:** Convert place name strings to coordinates using Nominatim.

```typescript
async function geocode(query: string): Promise<GeocodedPlace>
async function geocodeAll(queries: string[]): Promise<GeocodedPlace[]>
```

**Rules:**
- Add 350ms delay between sequential Nominatim requests (rate limit compliance)
- Cache all results in memory by query string
- On failure, throw descriptive error: `"Cannot find 'X'. Try a more specific name."`
- Extract short display name from address components (city + country)

---

## 5. Data Models

```typescript
// ── Core trip parameters ──────────────────────────────────────
interface TripParams {
  origin: GeocodedPlace | null
  destination: GeocodedPlace | null
  totalDays: number | null
  departureDate: Date | null           // optional
  dailyDrivingLimitHours: number       // default 5
  hotelBudget: 'budget' | 'mid' | 'luxury'
  travelStyle: TravelStyleTag[]
}

type TravelStyleTag = 'nature' | 'culture' | 'food' | 'adventure' | 'cities' | 'relaxed'

// ── Locations (pins on map) ───────────────────────────────────
interface Location {
  id: string                           // stable, unique e.g. "loc_xian_terracotta"
  name: string                         // display name
  shortName: string                    // city, country format
  lat: number
  lon: number
  category: 'city' | 'scenic' | 'food' | 'nature' | 'culture' | 'hotel'
  description: string                  // AI-written, 2–3 sentences
  suggested: boolean                   // AI proposed
  selected: boolean                    // user confirmed
  dayHint: number | null               // AI suggestion for which day
}

// ── Driving data ──────────────────────────────────────────────
interface DrivingLeg {
  fromId: string
  toId: string
  distanceKm: number
  durationHours: number
}

// ── Itinerary (recalculated live) ─────────────────────────────
interface ItineraryDay {
  dayNumber: number
  date: Date | null
  overnightLocation: Location
  stops: Location[]
  totalDriveHours: number
  totalDistanceKm: number
  isOverLimit: boolean
}

// ── Conversation ──────────────────────────────────────────────
interface ConversationMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: Date
  rawPayload?: AIResponseEnvelope       // stored for debugging
}

// ── Geocoded place ────────────────────────────────────────────
interface GeocodedPlace {
  query: string
  lat: number
  lon: number
  shortName: string
  fullName: string
}
```

---

## 6. AI Orchestration Design

### 6.1 System Prompt Architecture

The system prompt has four sections, loaded from versioned files:

```
/src/prompts/
  v1/
    role.txt          ← Who the AI is and what it's doing
    format.txt        ← The JSON envelope spec (exact schema)
    constraints.txt   ← How to enforce driving limits, budget
    collection.txt    ← Information collection behavior rules
```

**Role definition (summary):**  
You are an expert road trip travel advisor. Your job is to help the user plan a self-driving trip from A to B. You maintain awareness of all trip constraints (daily driving limit, budget) at all times and proactively flag violations. You search the web for real, current recommendations — not generic suggestions.

**Format enforcement:**  
Every single response must be valid JSON conforming to the AIResponseEnvelope schema. Wrap the entire response in the envelope. Never respond with plain text only.

**Constraint enforcement:**  
If the recalculated itinerary would have any day exceeding `dailyDrivingLimitHours`, you must note this in `itineraryNotes` and propose a resolution. Never silently accept a constraint violation.

### 6.2 Web Search Strategy

Web search is used at two moments:

**During initial corridor discovery (PLANNING mode entry):**  
Search for notable stops, scenic routes, and food destinations along the specific corridor. Search queries should be specific: `"best stops driving Shanghai to Chengdu scenic route"`, `"natural scenery Sichuan road trip"`.

**When the user asks about a specific place:**  
Search for current details: opening hours, admission prices, seasonal notes, recent visitor reviews.

**Web search is NOT used for:**
- Driving time calculations (use OSRM)
- Geocoding (use Nominatim)
- General geography facts the model already knows

### 6.3 Conversation Context Management

- Keep the last 20 turns in full
- Summarize turns 21+ into a `[TRIP SUMMARY SO FAR]` block
- Always include the full current `TripState` JSON in every prompt regardless of conversation length — this is the ground truth
- The model should treat the TripState block as more authoritative than anything said in older conversation turns

---

## 7. State Management

Using **Zustand** with three slices, all derived from a single store:

```typescript
// store/tripStore.ts
interface TripStore {
  // Trip parameters
  params: TripParams
  setParam: (key, value) => void

  // Locations
  locations: Location[]
  addLocation: (loc: Location) => void
  toggleLocation: (id: string) => void
  removeLocation: (id: string) => void

  // Driving data (cached)
  drivingLegs: DrivingLeg[]
  setDrivingLeg: (leg: DrivingLeg) => void

  // Itinerary (derived, recalculated by ItineraryCalculator)
  itinerary: ItineraryDay[]
  recalculateItinerary: () => void    // calls ItineraryCalculator, then sets itinerary

  // Conversation
  messages: ConversationMessage[]
  addMessage: (msg: ConversationMessage) => void

  // UI state
  isLoading: boolean
  selectedDay: number | null
  selectedLocationId: string | null
  planningStatus: 'collecting' | 'planning' | 'refining'
}
```

**Update cascade rule:**  
Whenever `locations` or `drivingLegs` changes, `recalculateItinerary()` is called automatically via a Zustand subscription. This ensures the itinerary strip is always in sync.

---

## 8. Folder Structure

```
/src
  /components
    /ChatPanel
      ChatPanel.tsx
      MessageBubble.tsx
      ChatInput.tsx
    /MapPanel
      MapPanel.tsx
      LocationPin.tsx
      PinInfoCard.tsx
      RoutePolyline.tsx
    /ItineraryStrip
      ItineraryStrip.tsx
      DayCard.tsx
      DriveTimeBar.tsx
    /Layout
      AppLayout.tsx          ← Three-panel grid layout

  /services
    /ai
      AIOrchestrator.ts      ← Main AI call + dispatch
      PromptManager.ts       ← Builds prompts from parts
      ResponseParser.ts      ← Parses JSON envelope
    /routing
      RoutingService.ts      ← OSRM calls + cache
    /geocoding
      GeocodingService.ts    ← Nominatim calls + cache

  /store
    tripStore.ts             ← Zustand store

  /logic
    ItineraryCalculator.ts   ← Pure recalculation function
    FeasibilityChecker.ts    ← Validates constraint compliance

  /prompts
    /v1
      role.txt
      format.txt
      constraints.txt
      collection.txt

  /types
    index.ts                 ← All interfaces in one file

  /constants
    defaults.ts              ← DAILY_LIMIT_DEFAULT, BUDGET_DEFAULT, etc.
    categories.ts            ← Pin colors, category labels

  /hooks
    useAI.ts                 ← Wraps AIOrchestrator, returns {send, isLoading}
    useMap.ts                ← Map instance ref, viewport helpers
```

---

## 9. Coding Guidelines

### 9.1 General

- **TypeScript strict mode on.** No `any` types.
- **All API calls wrapped in try/catch.** Errors must surface as user-readable messages in the chat panel, never as console-only errors.
- **No business logic in components.** Components render state and emit events. All logic lives in services, stores, or utility functions.
- **Constants never hardcoded in components.** All magic numbers (default driving limit, API URLs, zoom levels) live in `/constants`.

### 9.2 AI Response Handling

```typescript
// ✅ CORRECT — always parse through ResponseParser, never trust raw output
const envelope = ResponseParser.parse(rawAPIResponse)
if (!envelope) {
  // Fallback: treat as plain text, do not crash
  addMessage({ role: 'assistant', text: rawAPIResponse })
  return
}
dispatch(envelope)

// ❌ WRONG — never access raw API response fields directly in components
const text = apiResponse.content[0].text  // do not do this outside ResponseParser
```

### 9.3 Itinerary Recalculation

```typescript
// ✅ CORRECT — pure function, always recalculate from scratch
const newItinerary = ItineraryCalculator.calculate(
  locations.filter(l => l.selected),
  constraints,
  drivingLegs
)

// ❌ WRONG — never mutate the existing itinerary array
itinerary[3].stops.push(newStop)  // do not do this
```

### 9.4 Map Updates

- Never call Leaflet methods directly from components. Use the `useMap` hook.
- Pin additions/removals must be diffed — do not clear and re-add all pins on every update.
- Route polyline is redrawn only when the confirmed stops list changes (not on every render).

### 9.5 Prompts

- Prompts are strings loaded from `/src/prompts/v1/*.txt` at build time.
- Never construct prompt strings with template literals inside components.
- When changing prompt behavior, create `/src/prompts/v2/` — never edit v1 in place.
- The current TripState JSON is always injected by `PromptManager.buildStateBlock()` — never manually serialize state elsewhere.

### 9.6 OSRM / Nominatim Calls

- All results cached in memory by key. Never fetch the same leg or geocoding twice in a session.
- Nominatim calls must have a 350ms minimum gap between sequential requests.
- OSRM calls can be parallelized (multiple legs at once) via `Promise.all`.

---

## 10. Development Phases

### Phase 1 — Layout Shell (no AI)
- Three-panel layout with placeholder content
- Static mock trip data rendered in all three panels
- Map renders with Leaflet, static pins, static polyline
- Confirms the UI layout is correct before any real data

### Phase 2 — Information Collection
- Chat panel wired to Claude API (no web search yet)
- AIOrchestrator in COLLECTING mode
- Detects when required fields are complete
- Updates TripParams in store on each turn
- ItineraryStrip shows placeholders until PLANNING begins

### Phase 3 — Corridor Discovery
- Web search enabled in Claude API
- AI generates initial location suggestions for the corridor
- ResponseParser extracts locationUpdates
- Pins appear on map, itinerary skeleton generated

### Phase 4 — Live Recalculation
- RoutingService integrated (OSRM)
- ItineraryCalculator wired to store subscription
- Itinerary strip updates on every turn
- Over-limit days flagged visually

### Phase 5 — Refinement Loop
- User can toggle pins on/off
- Pin info cards with descriptions
- Chat continues to refine (AI adds/removes suggestions based on conversation)
- Cascade visible in real time

### Phase 6 — Final Itinerary Export
- "Finalize" action generates detailed day-by-day plan
- Printable / shareable itinerary view
- Google Maps deep-link for each day's drive

---

## 11. Key Technical Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Claude returns malformed JSON | AI response drops silently | ResponseParser has plain-text fallback; never crashes |
| OSRM leg missing for remote route | Itinerary cannot be calculated | Show "route not found" on that segment; don't block other days |
| Nominatim geocoding fails for ambiguous place name | Location pin cannot be placed | AI re-asks user for more specific name; stores raw query |
| Context window exceeded on long trips | AI loses early trip context | TripState JSON always injected fresh; early messages summarized |
| Single leg already exceeds daily limit | Constraint enforcement impossible | Flag clearly; AI proposes overnight stop mid-leg at nearest city |
| Web search returns outdated spot info | Wrong opening hours, closed sites | AI always notes search date; user encouraged to verify before visiting |

---

*End of document. Next step: Phase 1 — Layout Shell.*
