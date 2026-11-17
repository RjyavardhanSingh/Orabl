# DESIGN.md — Orabl

The single reference for how Orabl looks, sounds and behaves, what is already built, and what to
build next. Read it before adding a screen, a feature, a prompt or a table. If a change conflicts
with this file, either change the code or change this file in the same pull request — never leave
them disagreeing.

Sources: `orabl_product_direction_strategy` (Oct 2026), `PRD.md` v0.1, and the code at the commit
that added this file. `PRD_CHECKLIST.md` predates the frontend and the follow-up work and is out of
date; section 6 below replaces its status column.

---

## 1. What Orabl is

**Orabl is an AI skill examiner.** It makes people explain what they know out loud, probes the edge
of that knowledge, finds misconceptions and false confidence, and keeps an evidence-backed record of
what they actually understand over time.

> Learn anywhere. Prove it in Orabl.

| A user who says…  | wants…            | and gets from Orabl                          |
| ----------------- | ----------------- | -------------------------------------------- |
| "I don't know."   | a tutor           | not our job — send them to their material     |
| "Did I remember?" | a quiz            | not our job either                            |
| "I think I know." | proof             | an examination that confirms or breaks that   |

What Orabl is **not**: "chat with your PDF", a generic AI tutor, a flashcard app, an AI interviewer as
the whole identity. If a feature only makes sense for one of those, it does not belong here.

### The loop everything serves

```
material + objective → concepts → question → spoken answer → evidence-grounded evaluation
   → adaptive follow-up → misconception diagnosis → mastery update → scheduled re-examination
```

### Working principles (use them to settle arguments)

1. Examine more than you explain.
2. Evidence over opaque scores.
3. Concepts over isolated questions.
4. Misconceptions over generic weakness labels.
5. Retention over one-session performance.
6. Adaptive probing over fixed quizzes.
7. Replaceable models, persistent learner state.
8. Useful feedback for individuals; restrained analytics for organisations.

---

## 2. What "AI slop" means here, and the rules against it

Slop is anything that looks produced rather than decided: generic output that could belong to any
product, numbers without evidence, decoration without purpose, code that exists because a model
offered it. Every rule below is concrete enough to check in review.

### 2.1 Product slop

- **No chat surface.** Orabl asks; the learner answers. No message bubbles, no "Ask Orabl anything",
  no assistant persona chatting back.
- **No score without evidence.** A number on screen must be traceable to the answers that produced
  it. Show how many answers back it (`3 answers`) when that is small. When evidence is thin, show a
  band ("Needs work", "Solid") instead of a precise percentage.
- **No praise padding.** Never "Great job!", "Awesome!", "You're doing amazing". State what was right
  and what was missing.
- **No generic weakness labels.** "Needs work on Photosynthesis" is not feedback; "You said the light
  reactions make glucose — they make ATP and NADPH" is.
- **No features the strategy says not to overbuild yet:** generated course libraries, more file
  formats, social feeds, streaks/badges/XP, certificates, enterprise integrations, big dashboards.
  The primary experience stays: speak, be challenged, see what changed.
- **No internals in the UI.** Users never see: agent, rubric, ontology, knowledge graph, RAG,
  embeddings, policy, model, prompt, token, LLM. Use the "Do say" column in §3.

### 2.2 Visual slop

- No cards-in-cards, drop-shadowed panels, glassmorphism, blurred blobs, or decorative gradients in
  the app. (The landing page's maroon block is the brand surface, not a pattern to copy.)
- No purple/blue "AI" palette, no sparkles ✨ icon, no robot-brain icons, no emoji as UI.
- No grays. Every neutral is an opacity of the ink (`text-ink/60`, `border-line`).
- No pills and no circles: `rounded-full` is not used anywhere — keep it that way. Avatars are square
  tiles.
- No centred hero-style layouts inside the app. Signed-in pages are left-aligned ledgers.
- No stock illustrations or 3D renders. The only illustration voice is the line-drawn clarity rail.

### 2.3 Copy slop

Banned words: *unlock, supercharge, seamless, elevate, empower, revolutionise, harness, journey,
dive in, effortless, magic, AI-powered, next-level, game-changer, delve*. Also banned: exclamation
marks in the app, "Oops!", and sentences that restate the heading.

### 2.4 Code slop

- Read the neighbouring code first and reuse it: `buttonVariants`, `classes.ts`, `page.tsx`,
  `flow-step.tsx`, `api.ts`, the service layer. A second button style, a second page shell or a
  second fetch wrapper is a bug.
- No speculative abstractions, no unused props, no dead branches, no commented-out code, no
  `TODO` without an issue.
- Comments explain a constraint or a non-obvious decision (see `index.css` and
  `button-variants.ts`). They never narrate the code.
- Every LLM response is parsed against a schema and normalised (`_normalize_questions`,
  `_normalize_follow_up`). A malformed response degrades to a deterministic fallback; it never
  reaches the user raw.
- The answer key never leaves the server (see §6.4 for the open gap).
- New behaviour lands with a test in `tests/`; CI runs `ruff check`, `ruff format --check` and
  `pytest`. Frontend changes must pass `bun run build` and `bun run lint`.

---

## 3. Voice and copy

Orabl speaks like a good examiner: brief, specific, calm, never chummy and never hostile.

| Don't say                       | Do say                                   |
| ------------------------------- | ---------------------------------------- |
| Knowledge graph / ontology      | Topics we'll cover                       |
| Rubric / scoring criteria       | What a strong answer covers              |
| Agent / AI / model              | Orabl                                    |
| RAG / retrieval / chunks        | See sources                              |
| Adaptive questioning policy     | Next question based on your answer       |
| Misconception detected          | Common mix-ups we noticed                |
| Mastery score 73.4%             | Solid · 4 answers                        |
| Session complete! 🎉            | How You Did                              |

Mechanics, matching the code today:

- **Headings and buttons are Title Case**: "Say It Out Loud", "Retest Weak Areas", "Skip for Now".
- **Overlines** are uppercase, tracked, and carry position: `Step 05 / 05 · Results`.
- **Counts are zero-padded and tabular** in figures: `03/10`, `02` topics.
- Body copy is sentence case, one idea per sentence, no exclamation marks.
- Examiner questions are one sentence where possible and never contain the answer.
- Feedback names the concept and the specific wrong or missing claim.

---

## 4. Visual system — Editorial Ledger

The app reads like a printed ledger: content sits on the paper, structure comes from type and rules,
not boxes. Tokens live in `web/src/index.css`; primitives in `web/src/components`.

### 4.1 Colour

| Role         | Light            | Dark                         | Use                                  |
| ------------ | ---------------- | ---------------------------- | ------------------------------------ |
| `canvas`     | `#ebe5d9` beige  | maroon 32% into black        | page background                      |
| `ink`        | `#451017` maroon | `#ebe5d9` beige              | text, and every neutral via opacity  |
| `strong`     | black            | white                        | emphasised text                      |
| `primary`    | maroon           | beige                        | the one main action                  |
| `rule`       | black            | beige                        | heavy rule that opens a section      |
| `line`       | ink 20%          | ink 20%                      | hairlines between rows               |
| `paper` / `maroon` | fixed      | fixed                        | brand blocks (landing, CTA)          |

There is no success green or error red. State is carried by fill vs outline and by words: a solid
maroon score tag cleared the bar, an outlined one needs work, a faint one is pending. Keep it that
way — if something needs colour to be understood, the copy is not doing its job.

### 4.2 Type

- **Display — Fraunces Variable**, italic, 600, `SOFT 0 / WONK 0`. Page titles (`PageHeader`,
  `text-5xl → 7xl`) and the landing hero only.
- **UI — Plus Jakarta Sans Variable** for everything else, including every number (`.tabular`).
- **Voice — Shantell Sans** only on the clarity rail, never for UI text.
- All fonts are self-hosted via Fontsource. No third-party font CDNs.

### 4.3 Layout

- Signed-in pages use `AppPage` → `PageHeader` → `Section`/`StatStrip`. Nothing is a card.
- A heavy `border-rule` opens a section; `border-line` hairlines separate rows; row hover is
  `bg-ink/[0.035]`.
- Width comes from `pageContainerClass` / `AppPage` so the navbar and body edges align.
- The ledger flow (Upload → Goal → Preparing → Practice → Results) uses `flow-step.tsx` and the
  `ledger*` classes; every step ends with `ledgerActionsClass`: back on the left, forward on the right.
- **One primary button per screen.** Lesser actions are `secondary`; Back/Skip/Retry are `ghost`.

### 4.4 Shape, motion, access

- Radius: `rounded-lg` for controls and lists, `rounded-[4px]` for score tags. Larger radii only on
  the landing brand block.
- Motion: `transition-colors` only (never `transition-all`), 150 ms. Larger motion (GSAP, `motion`)
  is reserved for the landing page and step transitions, and everything honours
  `prefers-reduced-motion`.
- Focus: the global `:focus-visible` outline is never removed except where a field shows focus with
  a solid ink border instead (`ledgerFieldClass`).
- Icons: `lucide-react`, `size-4`, `aria-hidden` when next to a label.
- Every page has a skip link; every async state has a `role="status"` message in plain words.

### 4.5 New examiner UI (to be designed in this language)

These do not exist yet; when built they must follow the ledger, not import a dashboard kit:

- **Evidence row**: under each answer, the learner's own quoted words beside the verdict
  (correct / incomplete / wrong) and the concept it counts for. Quote, not paraphrase.
- **Boundary map**: a ruled, indented concept list (`Indexing → Composite indexes → Left-prefix
  rule`) with a filled/outlined marker for verified/broken. No force-directed graph.
- **Due list**: "3 concepts due for a check" as ledger rows with a single "Start Quick Check".

---

## 5. Architecture at a glance

| Layer     | Where                         | Notes                                                         |
| --------- | ----------------------------- | ------------------------------------------------------------- |
| API       | `src/api` (FastAPI, `/v1`)    | routes are thin; logic lives in `src/services`                |
| Ingestion | `src/ingestion`               | PDF, text, Markdown → cleaned text                            |
| LLM       | `src/services/openrouter_service.py` | retries, model fallback, response cache                |
| Scoring   | `src/services/session_service.py`    | `score_jobs` outbox + worker; keyword fallback         |
| Storage   | Postgres (`src/db/schema.sql`, Alembic) · Dragonfly cache · S3 for PDFs |                     |
| STT       | ElevenLabs realtime token (`/v1/stt/token`)                  |                                |
| Web       | `web/` React 19, Vite, Tailwind 4, TanStack Query, Radix     |                                |

State that must survive model changes (concepts, evidence, misconceptions, mastery) belongs in
Postgres tables with model/prompt metadata — not in session JSON blobs and not in prompts.

---

## 6. What is implemented (audited against the code)

Legend: ✅ done · 🟡 partial · ❌ missing.

### 6.1 The commodity layer — done

| Capability                                   | Status | Where |
| -------------------------------------------- | :----: | ----- |
| Google sign-in, user scoping                 | ✅ | `auth_service.py`, migrations 003/005 |
| Upload PDF / text / Markdown                 | ✅ | `materials.py`, `src/ingestion` |
| Goal (subject, target, level, deadline)      | ✅ | `contexts.py`, `goal-page.tsx` |
| Async question-set generation (5–20 by size) | ✅ | `question_sets`, `preparing-page.tsx` |
| Rich question objects (concepts, misconceptions, reference answer, rubric) | ✅ | `openrouter_service.py` |
| Spoken answers via realtime STT, typed fallback, skip | ✅ | `practice-page.tsx`, `use-voice-answer.ts` |
| Background scoring with retry and fallback   | ✅ | `score_jobs`, `score_worker_loop` |
| Results: readiness, solid/to-fix topics, mix-ups, per-answer feedback | ✅ | `results-page.tsx` |
| Retest weak areas or full set, linked to parent | ✅ | `create_retest` |
| Saved study sessions, dashboard, activity heatmap | ✅ | `study_sessions`, `sessions-page.tsx` |
| Light/dark theme, editorial design system    | ✅ | `index.css` |

### 6.2 The examiner layer — mostly missing

| Strategy capability (§4 of strategy)  | Status | What exists / what is missing |
| ------------------------------------- | :----: | ----------------------------- |
| **A. Adaptive questioning**           | 🟡 | Up to 3 follow-ups per session (`misconception` > `gap` > `deepen`), proposed by the scorer and appended **after** the main set; one level deep. The main set is still pre-generated and fixed; no in-flow next-question choice, no stop condition, no per-concept difficulty. |
| **B. Concept / skill graph**          | ❌ | Questions carry free-text `topic` and `target_concepts` strings. No concept table, no prerequisites, no cross-source identity. |
| **C. Evidence-grounded evaluation**   | 🟡 | One LLM score 0–100 plus `concepts_missed` / `misconceptions_found`. No per-dimension scores, no claim-level verdicts, no quoted evidence, no deterministic checks, no verifier pass. Score is LLM-chosen, not mapped from evidence by the backend (PRD §11.5). `source_citations` are model-written strings with no retrieval behind them. `scored_by` is stored but not model or prompt version. |
| **D. Misconception memory**           | ❌ | Misconceptions are strings inside a session's answers JSON. Nothing persists them across sessions, retests them with a new example, or resolves them. |
| **E. Confidence calibration**         | ❌ | Never asked, never stored. |
| **F. Mastery decay & re-examination** | 🟡 | `concept_mastery` stores best score, attempts and `next_review_at` per *question* — but it is write-only (no route or screen reads it), `best_score` only ever rises so it cannot show decay, and retests reuse the identical question text. |
| Prove It / Quick Check / Teach Orabl / modes | ❌ | — |
| Boundary map, transfer tests, contradiction challenges | ❌ | — |
| TTS (hear the question), STT re-ask on low confidence | ❌ | — |
| Teams: org spaces, custom rubrics, audit trail | ❌ | Deliberately not yet (strategy month 6). |

### 6.3 Readiness against "Examination v1" (strategy §13)

| v1 step | Status |
| ------- | :----: |
| 1. Upload/select material and state an objective | ✅ |
| 2. Create a concept map and identify prerequisites | ❌ |
| 3. 15-minute oral examination | 🟡 fixed set + ≤3 follow-ups, no time budget |
| 4. Each answer → claims, correct/missing concepts, misconceptions, confidence | 🟡 concepts + misconceptions only |
| 5. Next question selected adaptively | 🟡 follow-ups only |
| 6. End with verified strengths, gaps and 3–5 scheduled rechecks | 🟡 strengths/gaps yes; rechecks computed but never shown |
| 7. Next session starts from learner state | ❌ every context starts from scratch |

### 6.4 Known defects to fix before building on top

1. **Answer-key leak (partial).** `QuestionResponse` excludes `reference_answer` and
   `scoring_rubric`, but still serialises `target_concepts`, `acceptable_alternatives` and
   `common_misconceptions` to the client during practice — the learner can read what the examiner
   is listening for in the network tab. Split a public question view from the internal one.
2. **Mastery is write-only and monotonic** (see F above).
3. **Score theatre.** Readiness is a precise percentage averaged from LLM scores with no evidence
   count or uncertainty.
4. **No audit metadata.** A score cannot be re-checked after a prompt or model change.
5. **Stale docs.** `PRD_CHECKLIST.md` marks the frontend, STT and results as not built.

---

## 7. What to build next

Go deeper, not broader. Each step below is a shippable pull request (or a short stack) that leaves
the product working, in this order. Steps 1–4 are strategy month 1–2 and together turn the existing
flow into "Examination v1".

### Step 0 — Hygiene (small, do first)

- Public vs internal question models; only `id`, `text`, `topic`, `difficulty`, `follow_up.kind`
  and public `source_citations` reach the client. Test that the practice payload contains no
  answer-key field.
- Store `model`, `prompt_version` and `scored_at` on every score.
- Refresh `PRD_CHECKLIST.md` or point it at this file.

### Step 1 — Evidence-structured evaluation  *(trust layer)*

Change the scorer's output from "a score and some lists" to evidence the backend scores:

```json
{
  "claims": [
    {"quote": "an index speeds up lookups", "concept": "index purpose",
     "verdict": "correct" | "incomplete" | "incorrect", "note": "..."}
  ],
  "missing": ["write cost of indexes"],
  "misconceptions": [{"belief": "...", "quote": "..."}],
  "dimensions": {"accuracy": 0-3, "completeness": 0-3, "reasoning": 0-3, "application": 0-3}
}
```

- The backend maps dimensions → score with a documented, tested rule (PRD §11.5). The LLM never
  picks the number.
- Quotes must be substrings of the transcript; drop claims whose quote does not match.
- Results shows the evidence row (§4.5) instead of a paragraph of feedback.
- Done when: every "needs work" verdict on the Results page shows the learner's own words that
  caused it.

### Step 2 — Concepts and prerequisites  *(foundation)*

- At preparation time, extract concepts for the context: `concepts(id, user_id, name, summary)`,
  `concept_edges(from_id, to_id, kind='prerequisite')`, `context_concepts`. Merge by normalised
  name per user so the same concept from two sources is one row.
- Every generated question references `concept_ids`; follow-ups inherit them.
- "Topics we'll cover" on the Preparing page lists concepts, not chunk-derived topics.
- Done when: two contexts on overlapping material share concept rows.

### Step 3 — Evidence ledger, misconception memory, real mastery  *(learner state)*

- `evidence(id, user_id, concept_id, session_id, question_id, verdict, quote, dimensions,
  confidence, model, prompt_version, created_at)` — append-only; one row per claim.
- `misconceptions(id, user_id, concept_id, belief, first_seen, last_seen, status
  'open'|'resolving'|'resolved', contradicting_evidence_count)`. Resolved only after two
  later contradicting answers on *different* questions.
- Mastery per concept is **derived** from evidence (recency-weighted, with evidence count and a
  decay term), replacing `concept_mastery.best_score`. Keep `next_review_at` per concept.
- Results and the dashboard read from here: "Solid · 4 answers", "Open mix-up since 12 Nov".
- Done when: Orabl can answer "why do you think I know X?" with a list of quoted evidence.

### Step 4 — Adaptive examiner policy  *(the product)*

Replace "fixed set + appended follow-ups" with a next-question policy:

- Seed: one opening question per in-scope concept, ordered by prerequisites and current mastery.
- After each scored answer choose one action: `deepen`, `apply`, `clarify`, `counterexample`,
  `prerequisite` (drop to the root gap), or `move_on`. Choice is rule-based on the evidence
  (verdicts, open misconceptions, concept mastery); the LLM only writes the question text.
- Stop conditions: time budget (default 15 min), per-concept evidence sufficient (e.g. ≥2
  consistent verdicts), max 2 consecutive probes on one concept.
- Latency: scoring is async today. Generate the next probe while the learner reads the current
  one, and fall back to the next seed question if the probe is not ready in ~2 s. The UI copy is
  "Next question based on your answer".
- Done when: two learners with different answers to question 1 get different question 2s, and the
  session ends by itself.

### Step 5 — Retention loop  *(month 3)*

- Due list on the dashboard from per-concept `next_review_at`.
- **Quick Check**: 5-minute session over due concepts with *new* questions on the same concept,
  never the identical text.
- End-of-session "3–5 rechecks scheduled" with dates.
- Done when: a gap found on day 1 is re-examined with a different question on day 2+ and shows
  resolved or still open.

### Step 6 — Differentiation  *(month 4, only after 1–5 work)*

Confidence asked selectively (before high-stakes probes only) and a "false confidence" queue;
Prove It (attempt to falsify claimed mastery across concepts); transfer and contradiction probes as
extra policy actions; TTS for questions.

### Not now

Teams, custom rubrics, SSO, LMS integrations, certificates, more file formats, gamification, more
languages beyond English + Hindi. Revisit after a focused professional segment repeatedly gets value
from steps 1–5.

---

## 8. How we will know it works

Track learning outcomes, not activity. Operational counts (uploads, questions generated, DAU) are
useful but never the headline.

| Metric | Definition |
| ------ | ---------- |
| Time to first insight | minutes until Orabl records a gap the learner did not self-report |
| Gap discovery rate | new open misconceptions or broken concepts per session |
| Weakness resolution rate | share of misconceptions later resolved |
| Retention after 7/30 days | verified concepts still verified on re-examination |
| Calibration | agreement between stated confidence and verdict (after step 6) |
| Return for scheduled review | share of due Quick Checks started |

North star candidate: **verified mastery retained over time.**

---

## 9. Pull request checklist

- [ ] Fits the loop in §1, or explains why it is worth a detour.
- [ ] Uses existing primitives; no new colours, fonts, radii, shadows or button styles.
- [ ] Copy passes §2.3 and §3; no internal terms on screen.
- [ ] Any number shown is traceable to evidence.
- [ ] LLM output is schema-validated with a deterministic fallback; no answer key reaches the client.
- [ ] Tests added; `ruff`, `pytest`, `bun run build`, `bun run lint` pass.
- [ ] This file updated if the design, the status in §6 or the plan in §7 changed.
