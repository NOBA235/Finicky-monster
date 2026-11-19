# FINICKY

**Every monster has a secret. Can you figure out what it likes?**

FINICKY is a Reddit-native daily deduction and puzzle-creation game built with **Devvit Web**, **React 19**, **TypeScript**, **Tailwind CSS 4**, and **Hono**.

## Core Gameplay Loop

`DISCOVER → CREATE → CHALLENGE → COLLECT → DISCOVER AGAIN`

1. **Discover (Pillar A):** Encounter a curious monster with a hidden logical food rule over 27 deterministic snacks (`3 shapes × 3 colors × 3 patterns`). Feed snacks from the 21-snack Experiment Bench, observe expressive SVG & audio reactions, build a hypothesis with visual chips, and prove your deduction on a sealed **6-snack Unseen Final Examination**.
2. **Fairness Certificate Engine (Engineering Differentiator):** Every player-created monster and curated daily monster is deterministically certified against the full supported rule grammar (~1,500+ unique truth tables via exact 27-bit truth-table bitmasks). The engine rejects contradictions, tautologies, trivial 1-trait rules, ambiguous exams, and unsolvable budgets, and selects an optimal 6-snack unseen exam that maximizes discrimination against competing hypotheses.
3. **Create & Challenge (Pillars B & C):** Customize a monster's appearance, personality, and hidden rule with live 27-snack reaction preview and real-time Fairness Certification. Publish verified challenges to the Community Challenges hub (and optionally as playable Reddit custom posts) and inspect real-time creator analytics (attempts, solves, average tests, most confusing exam snacks, and common wrong assumptions).
4. **Daily Challenge & Living Menagerie:** A deterministic UTC daily schedule of 21 handcrafted monsters with calibrated difficulty progression, persistent daily streaks, spoiler-free share cards & Reddit thread comments, and a personal illustrated Menagerie of every monster you've understood.

## Project Structure

- `src/shared/engine/` — Pure, framework-agnostic TypeScript game engine (`snacks.ts`, `rules.ts`, `fairness.ts`, `monsters.ts`, `dailyCatalog.ts`, `session.ts`)
- `src/shared/api.ts` — Shared client/server API types (secret rules are never sent to clients prior to reveal)
- `src/server/` — Devvit Web Hono backend (`routes/game.ts`, `routes/challenges.ts`, `routes/telemetry.ts`, `routes/menu.ts`, `routes/triggers.ts`, `storage/redisStore.ts`, `core/post.ts`)
- `src/client/` — Illustrated React webviews (`splash.tsx` inline feed preview + `game.tsx` expanded experience)
- `src/server/*.test.ts` — Automated unit tests for the rule engine, Fairness Certificate, 21-day catalog, session state machine, persistence, concurrency, streaks, and creator analytics

## Commands

- `npm run test:unit` — Run all automated unit tests (Node built-in test runner)
- `npm run test:types` — Run strict TypeScript project build checks
- `npm run lint` — Run ESLint across client, server, and shared code
- `npm run build` — Build production Devvit client webviews and CommonJS server bundle
- `npm run dev` — Start live `devvit playtest` on your test subreddit
- `npm run deploy` — Typecheck, lint, and upload to Devvit (`devvit upload`)
