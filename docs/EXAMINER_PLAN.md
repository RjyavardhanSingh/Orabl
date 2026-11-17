# Examiner v1 — implementation plan

Branch: `feat/examiner` (cut from `main` at `1adaf07`). Backend first, then frontend.
Goal: turn the fixed question set + 3 trailing follow-ups into an examiner that picks each next
question from the evidence in the previous answer, records why it believes what it believes, and
starts the next session from what it learned. Strategy doc §13 "Examination v1"; DESIGN.md §7
steps 0–4.

## Where we start (main @ 1adaf07)

- A context gets one pre-generated question set (5–20 questions, `question_sets`).
- A session copies that set into Dragonfly state; the client answers by `question_index`.
- Each answer becomes a `score_jobs` row; a worker scores it with one LLM call (0–100 + lists)
  and may propose one follow-up. Up to 3 follow-ups are appended **after** the main set.
- Completion averages scores into "readiness %", writes `sessions`, upserts `concept_mastery`
  per *question* (best score only, never read back).
- **Leak:** `GET /v1/sessions/{id}/questions` returns raw state questions — including
  `reference_answer` and `scoring_rubric`. The practice and preparing pages call it.
- 128 backend tests pass.

## Design decisions (defaults — change any before we start)

1. **One examination flow replaces the fixed set.** New sessions are exams; already-completed
   sessions keep rendering their old results. No mode picker (PRD §4.1).
2. **Keep the index protocol.** `questions` in session state becomes "questions asked so far";
   the server appends the next one when it chooses it. Submit, resume, saved state and the
   score-job outbox keep working unchanged in shape.
3. **No waiting on the model between questions.** Scoring stays async. The examiner works
   concept by concept and interleaves: if the evaluation of the last answer is not back yet, the
   next ready item is asked (a seed question for another concept); when the evaluation lands,
   its probe is queued and asked next with a one-line reason ("Back to indexes — you said…").
   A learner never stares at a spinner between questions.
4. **One LLM call per answer.** The evaluator returns evidence *and* one proposed probe. The
   policy decides whether to use it, replace it with a pre-generated prerequisite question, or
   move on. The LLM never decides the score or the flow.
5. **Learner state is per user, per concept,** in Postgres with model/prompt metadata — not in
   session JSON. Concepts are matched across contexts by normalised name per user.

## Backend

### B0 — Close the answer-key leak (first PR, small)

- `PublicQuestion` schema: `id, text, topic, difficulty, follow_up{kind, parent_index,
  rationale}, previous_attempt, source_citations`. Every route that returns questions to the
  client uses it, including `/sessions/{id}/questions` and the retest response.
- Internal fields (`reference_answer`, `scoring_rubric`, `target_concepts`,
  `acceptable_alternatives`, `common_misconceptions`, `required_relationships`) stay server-side.
- Test: no client-facing payload contains any internal field name.
- Store `model`, `prompt_version`, `scored_at` on every scored answer.

### B1 — Exam blueprint: concepts + seed questions (replaces question generation)

At "Preparing", one LLM call over the material + goal returns:

```json
{"concepts": [{"key": "composite-index", "name": "Composite indexes",
               "summary": "...", "prerequisites": ["index-basics"], "importance": 1-3,
               "seed": {"text": "...", "reference_answer": "...",
                        "rubric": {"must_include": [...], "common_misconceptions": [...]},
                        "source_quote": "..."}}]}
```

- 4–12 concepts by material size (reuses the existing word-count sizing).
- Validation: prerequisite keys must exist, the graph must be acyclic (drop offending edges),
  every concept needs a seed with a reference answer; otherwise retry, then fail the job.
- `source_quote` must be a substring of the material (whitespace-normalised) or it is dropped —
  the first real grounding check.
- Tables (migration `010_examiner`):
  - `concepts(id, user_id, key, name, summary, UNIQUE(user_id, key))`
  - `concept_edges(user_id, from_concept_id, to_concept_id)` — prerequisite edges
  - `context_concepts(context_id, concept_id, importance, seed JSONB)`
- `question_sets` keeps its job/status machinery; its payload becomes the blueprint.

### B2 — Evidence-structured evaluator (replaces `_score_with_gemini`)

Output per answer:

```json
{"claims": [{"quote": "...", "verdict": "correct|incomplete|incorrect", "note": "..."}],
 "missing": ["..."],
 "misconceptions": [{"belief": "...", "quote": "..."}],
 "dimensions": {"accuracy": 0-3, "completeness": 0-3, "reasoning": 0-3, "application": 0-3},
 "probe": {"kind": "clarify|deepen|apply|counterexample|misconception",
           "text": "...", "reference_answer": "...", "reason": "..."} | null}
```

- Quotes must be substrings of the transcript (normalised); claims/misconceptions with
  unmatched quotes are dropped. A probe whose text contains the reference answer is dropped.
- **Deterministic score:** `score = round(100 * weighted(dimensions) / 3)` with weights
  accuracy .4, completeness .3, reasoning .2, application .1; any `incorrect` claim caps it at 59.
  Documented and unit-tested; the LLM never returns the number.
- **Concept verdict** from evidence: `verified` (score ≥ 75 and no incorrect claim),
  `shaky` (40–74 or only incomplete claims), `broken` (< 40 or a misconception).
- Fallback when the call or validation fails: today's keyword scorer, verdict `unscored`, no
  probe — the exam continues, the report says "not enough evidence".
- Persist (append-only) on every scored answer:
  - `evidence(id, user_id, concept_id, session_id, question_id, kind, verdict, score,
    dimensions, claims, quote, model, prompt_version, created_at)`
  - `misconceptions(id, user_id, concept_id, belief, first_seen_at, last_seen_at,
    status open|resolved, contradicted_count)` — resolved after 2 later answers on that concept
    that are `verified` without repeating the belief.

### B3 — Examiner policy (pure Python, the core)

`src/examiner/policy.py`: `choose_next(exam_state, learner_state, now) -> Action | Stop`.
No I/O, no LLM — fully unit-testable.

Per concept in the exam: `status unseen | probing | settled`, verdict history, probes asked.

Order of choice on each submit:

1. A ready probe for a concept still `probing` (an evaluation came back).
2. If a concept is `broken` and has an unexamined prerequisite → that prerequisite's seed
   ("prerequisite" action — finds the root gap).
3. Next `unseen` concept: open misconceptions first, then due for recheck, then low/unknown
   mastery, then importance; prerequisites before dependants.
4. Nothing ready but evaluations pending → stop asking and show "Checking your last answers…";
   the session resumes if a probe arrives (today's end-of-set behaviour, kept).

Stop rules: a concept settles after 2 consistent verdicts, or 3 questions on it, or a `verified`
answer to a `deepen`/`apply` probe. The exam stops when every concept is settled, or after 15
minutes, or 14 questions — whichever first. At most 2 probes in a row on one concept.

Probe use: `broken` → accept `misconception`/`clarify` probe; `shaky` → `clarify`;
`verified` once → `deepen`/`apply`; `verified` twice → settle, no probe.

### B4 — Learner state and the report

- `concept_state(user_id, concept_id, mastery 0–1, evidence_count, last_evidence_at,
  last_verified_at, next_check_at)`, recomputed from `evidence` on completion
  (recency-weighted mean of verdicts with a decay term). Replaces `concept_mastery`
  (kept, no longer written).
- `next_check_at`: broken → 1 day, shaky → 3 days, verified → 7 / 21 / 60 days by streak.
- Exam start reads `concept_state` and `misconceptions` for ordering (decision 5 →
  "next session starts from learner state").
- `POST /sessions/{id}/complete` returns a concept report instead of readiness %:
  per concept `verdict, evidence_count, best quote, missing, open misconceptions, next_check_at`,
  plus a headline `"5 of 8 concepts verified"` and the 3–5 earliest rechecks.
  `readiness_score` stays populated for old screens until the frontend switches.
- Retest becomes "re-examine these concepts" — it seeds an exam from the chosen concepts and
  asks fresh probes, never the identical text.

### B5 — Tests and checks

- Policy: table-driven tests for each rule, stop condition, interleaving and prerequisite descent.
- Evaluator: normalisation, quote validation, score mapping, verdict mapping, fallback.
- Blueprint: validation, cycle removal, quote grounding.
- Flow: a scripted fake LLM drives a full exam through submit → worker → next question →
  complete with the existing `_FakeCache`/`_FakeDb` pattern, asserting two different answer
  scripts produce different question sequences (strategy "definition of success").
- Live check with a real OpenRouter model on `data/test_biology.pdf` before the frontend phase.

## Frontend (after the backend is merged)

- **Preparing:** "Topics we'll cover" — the concept list with prerequisites as indents.
- **Practice:** the question header shows *why* it was asked ("Back to photosynthesis — you said
  the light reactions make glucose"); progress becomes "Question 5 · about 9 min left" (the total
  is not fixed any more); "Checking your last answers…" state when the examiner is waiting; the
  exam ends itself and opens the report.
- **Results → Report:** headline "5 of 8 concepts verified"; one ledger row per concept with a
  filled/outlined/faint marker, the learner's quoted words beside the verdict, missing points, and
  "Common mix-ups we noticed"; "Rechecks scheduled" with dates; primary action
  "Re-examine weak concepts". No percentage headline.
- Remove the client-side `target_concepts` / answer-key types.
- All in the Editorial Ledger language from DESIGN.md; verified in the running app with
  screenshots.

## Delivery

| PR | Contents | Size |
| -- | -------- | ---- |
| 1 | B0 leak fix + score metadata | S |
| 2 | B1 blueprint + migration 010 tables | M |
| 3 | B2 evaluator + evidence/misconception persistence | M |
| 4 | B3 policy wired into submit/worker/complete | L |
| 5 | B4 concept state, report, re-examine | M |
| 6 | Frontend: preparing, practice, report | L |

Each PR keeps the app working end to end and CI green (`ruff`, `pytest`; `bun run build`,
`bun run lint` for 6).

## Open questions

1. **Model.** Evaluation quality depends on the model; the defaults are free models that are slow
   and unreliable at strict JSON. A paid model for blueprint + evaluation is recommended. An
   `OPENROUTER_API_KEY` in project settings is needed for the live check.
2. **Exam length.** 15 minutes / 14 questions cap by default.
3. **Old flow.** Replace it outright (default) or keep the fixed set as a fallback.
