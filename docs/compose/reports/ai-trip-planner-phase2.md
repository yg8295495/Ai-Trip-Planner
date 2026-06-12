---
feature: ai-trip-planner-phase2
status: delivered
specs:
  - docs/compose/specs/2026-06-12-ai-trip-planner-design.md
plans:
  - docs/compose/plans/2026-06-12-phase2-information-collection.md
branch: master
commits: b8b0ba2..a495222
---

# AI Road Trip Planner — Phase 2 Final Report

## What Was Built

Phase 2 wires the chat panel to an OpenAI-compatible AI backend, implementing the COLLECTING mode that gathers trip parameters through natural conversation. The system automatically detects origin, destination, and total days from user messages, updates the trip state in real-time, and transitions from COLLECTING to PLANNING mode when all required parameters are collected.

The AI integration includes a mock fallback — when no API key is configured, the system responds with simulated AI behavior, making development and testing possible without an active API subscription.

## Architecture

**New Services:**
```
src/services/ai/
  AIOrchestrator.ts    — Calls OpenAI-compatible API, handles errors, mock fallback
  PromptManager.ts     — Builds system prompts from versioned files
  ResponseParser.ts    — Extracts structured JSON from AI responses

src/logic/
  TripParamDetector.ts — Regex-based extraction of origin/destination/days from text

src/composables/
  useAI.ts             — Chat integration, parameter auto-detection, state updates
```

**Data Flow:**
```
User types message
  → useAI.sendMessage()
    → TripParamDetector extracts params from text
    → AIOrchestrator calls API (or mock)
    → ResponseParser extracts JSON envelope
    → Store updated (messages, params, status)
    → UI re-renders
```

**Environment Variables:**
- `VITE_AI_API_BASE_URL` — API endpoint (default: OpenAI)
- `VITE_AI_API_KEY` — API key (mock fallback if not set)
- `VITE_AI_MODEL` — Model name (default: gpt-4o)

### Design Decisions

- **Mock fallback over hard failure:** When API key is missing or invalid, the system falls back to mock responses instead of showing errors. This enables development without API access.
- **Regex-based param detection:** Simple regex patterns extract origin/destination/days from Chinese text. No NLP dependency, works offline, fast.
- **COLLECTING → PLANNING transition:** Automatic when all required fields (origin, destination, totalDays) are collected. User never sees the transition — it's seamless.

## Usage

```bash
# Configure AI API (optional - mock works without it)
cp .env.example .env
# Edit .env with your API key

# Development
npm run dev

# Build
npm run build
```

**Test the mock flow:**
1. Type "我想从上海去成都，10天"
2. System auto-detects: origin=上海, destination=成都, totalDays=10
3. AI responds confirming the parameters
4. Status changes from "收集信息中..." to "规划中..."

## Verification

- ✅ `npx vue-tsc --noEmit` — No TypeScript errors
- ✅ `npm run build` — Production build succeeds (88.23 KB JS)
- ✅ Mock flow works without API key
- ✅ ChatPanel shows loading state during AI response
- ✅ TripParams auto-detected from user messages
- ✅ Status indicator shows collecting/planning state

## Journey Log

- [lesson] OpenAI compatible API format is the most flexible choice — works with Claude, local models, and any OpenAI-compatible endpoint.
- [lesson] Mock fallback is essential for development — allows testing without API costs or network dependency.

## Source Materials

| File | Role | Notes |
|------|------|-------|
| `docs/compose/specs/2026-06-12-ai-trip-planner-design.md` | Design spec | §4.4-4.6 covered |
| `docs/compose/plans/2026-06-12-phase2-information-collection.md` | Implementation plan | 9 tasks, all completed |
