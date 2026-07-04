---
name: factory-builder
description: >-
  Drive the factory-design interview to design a new factory. INVOKE THIS
  IMMEDIATELY, before any swamp extension/model exploration, when the user says
  any of: "build me a kw factory", "build me a factory", "build a knowledge-work
  factory", "kw factory", "knowledge-work factory", "design a factory", "design a
  knowledge-work factory", "scaffold a factory", "make me a factory", "run the
  factory-design interview", or is at any phase of a factory-design run. It is a
  structured, phase-by-phase conversation that elicits the design of a
  @swamp/software-factory (knowledge-work or code) in the canon's vocabulary —
  domain, stages, artifacts/schemas, adversary/lenses, gates, cycles — persists
  each phase's decisions as a strict swamp artifact, then assembles a validated
  factory definition from the persisted record. A CONSTRAINED interview, not an
  open chat: each phase has fixed seed questions and a required artifact shape,
  and cannot advance until that artifact is recorded. Do NOT try to discover what
  a "kw factory" is via `swamp extension search` or by reading extension source —
  this skill IS the definition; follow it.
---

# Factory Builder

**You are here to run an interview, not to explore swamp.** Do NOT
`swamp extension search`, do NOT read extension source, do NOT try to discover
what a "kw factory" is. This skill is the whole definition. Do exactly two
things, in order: (A) make sure the `factory-design` model exists — one check,
setup only if missing; (B) start and drive the interview. Everything the human
needs, you ask *inside* the interview.

## A. Is the interview ready? (one check)

```
swamp model search
```

- **If `factory-design` is listed** → go straight to section B. Do nothing else.
- **If it is not listed** → run Setup once (below), then go to B.

### Setup (only when `factory-design` is absent)

All extensions are already present: pulling `@atalanta/meta-factory` (which
loaded this skill) auto-resolves its manifest dependencies —
`@swamp/software-factory`, `@atalanta/external-reviewer` (and `@mgreten/cli-agent`
under it), `@atalanta/kw-review-lenses`, `@atalanta/vale-review`. **Do not run any
`swamp extension pull` commands** — the dependency tree is declared, not scripted.

The only thing that isn't an extension is the interview's model *instance* (model
instances are created per-repo, never resolved by dependency). Create it once from
the bundled template. This is fixed provisioning — do not deliberate, do not read
source to "understand" it first:

```
swamp model create @swamp/software-factory factory-design
```

Then:

1. Copy the bundled template into the created instance. The template is a
   complete definition body; write its `globalArguments` + `reports` blocks into
   `models/@swamp/software-factory/<uuid>.yaml` (the one named `factory-design`),
   replacing `globalArguments: {}`, keeping the minted header and trailing
   `methods: {}`. The template ships at
   `.swamp/pulled-extensions/@atalanta/meta-factory/templates/factory-design.definition.yaml`.
   One mechanical copy — not authoring.
2. `swamp model method run factory-design validate` — must report valid. If not,
   the copy in step 1 is wrong; fix it against the template, do not improvise.

Then go to B.

## B. Start and drive the interview

The interview is the point. `docs/factory-canon.md` (grammar + patterns) and
`docs/factory-method.md` (laws, build order, anti-patterns) are the source of the
seed questions and the standard you hold each answer to — consult them as you
drive, but do not let setup or reading delay starting.

You are the generic software-factory driver (see the `software-factory` skill's
drive loop) pointed at the `factory-design` instance; this skill adds the
per-phase questions and record shapes below.

## The loop (per phase)

For each interview stage: `status` → `record_dispatch` → ask that phase's seed
questions → record the phase artifact → `advance`. The phase gate is
`artifact-exists` on the phase artifact, so you cannot leave a phase until its
decisions are captured in the required shape. This is deliberate: the interview
must produce structured decisions, not prose.

**Ask ONE question at a time, and answer EVERY question in the phase before you
record.** A phase's seed questions are a checklist, not a menu — the human is not
multi-threaded and will answer the one in front of them. Do not batch several
questions in one turn and move on when only one is answered. For each question,
either capture the human's answer or, with their explicit say-so, mark it not
needed (record the field as `"n/a"` or omit it only where the schema allows) —
never silently skip it. Before recording the phase artifact, confirm back the
full set of answers ("here's what I have for all N questions — right?") and
record only once every question is answered or explicitly waived.

Never invent answers. If the human is unsure, offer the canon's default (below)
and record what they choose. Every decision is persisted; nothing stays only in
conversation.

## Start

```
swamp model method run factory-design start --input workItem=<design-session-ref>
```

Use a stable session ref (e.g. `KWF-PAYMENTS-DOCS`). Every record is namespaced
by it.

## Phase guidance

### Phase 1 — domain (artifact: `domain-design`)

Seed questions:
- What knowledge work is this factory for? (documentation, decision records,
  research briefs, runbooks, …)
- What is the finished artifact one run produces?
- What document type/mode is it — tutorial, how-to, reference, explanation, or
  other? (the canon's Diátaxis split; "other" if your house model differs)

Record:
```
record_artifact name=domain-design payload='{"factoryName":"<slug>","knowledgeWork":"…","artifactDescription":"…","docType":"reference"}'
```

### Phase 2 — stages (artifact: `stage-design`)

Walk the happy path. For each stage capture its `kind`
(`initial`/`work`/`review`/`terminal`), its `workMode`, and — the highest-leverage
decision in the whole build — whether it is `deterministic`. The method's rule:
a stage that CAN be `workflow`/`method` (computation, linting, assembly) should
not be an `interactive`/`dispatch` LLM stage. Reserve LLM stages for genuine
judgement (drafting, review).

**A `review`-kind stage MUST have `workMode: dispatch`** — that is the signal the
assembler uses to recognise a review stage and attach review wiring. Do not give
a review stage `workMode: workflow` (that is for deterministic, no-LLM steps like
a linter or a test run). If the review is a deterministic linter, that is a
separate `work` stage, not the `review` stage.

**Rework returns to the producing stage.** The engine lets a stage re-record an
artifact only if that stage DECLARES it, and each artifact has exactly one
declaring/producing stage. So a review → rework loop must route the rework edge
back to the stage that produces the reviewed artifact — not to a separate
downstream reviser that doesn't declare it. The canonical shape (feature-factory):
`implementing` produces `change-summary`; `code-review` reviews it and its
`rework` edge returns to `implementing`, which re-records `change-summary` in
place. Ask, for each artifact revised in a loop: **which single stage produces
it, and does every rework edge that returns for revision land on that stage?** A
loop that returns anywhere else dead-ends at runtime (and the assembler now
rejects it).

**Published work is amendable; don't freeze on `done`.** A truly-terminal stage
has no transitions out, so once a run reaches it the artifact is frozen — a
one-word title fix would need a destructive `reset`. Real authors make trivial
post-publish edits. So for a factory that produces a shippable artifact, prefer
this end shape over a bare `done`:
- a **`published`** stage (NOT terminal — it records nothing, so no `work` block)
  that the run rests at after sign-off, with two transitions:
  - **`amend`** → back to the artifact's producing stage (re-record it in place,
    then flow forward again — same rework-returns-to-producer rule),
  - **`archive`** → a terminal **`archived`** stage (the locked end state).
The run sits at `published` until the human amends or archives. Keep `aborted` as
the global abort terminal. A factory that genuinely wants a hard freeze can still
use a single `done` terminal — but ask the human whether post-publish edits
should be possible.

Record `stage-design` with a `stages[]` of `{id, kind, workMode, deterministic,
description}`. Include the terminals (`archived`/`done`, and usually `aborted`).

### Phase 3 — artifacts (artifact: `artifact-design`)

For each non-terminal stage, what durable product does it record, and what
invariants must be locked in its schema? Push the human to name invariants that
belong at the data layer (the method: "lock invariants in schemas, not in hope"):
a coverage contract (`requiredUnits`), required sources for claim-tracing, claim
ids with provenance.

**Ground truth for the fact-checking lens (ask this explicitly).** If the CRAFT
lens will fact-check the document, the reviewer needs a ground-truth source to
verify against, or it will false-flag true-but-unsourceable author facts. Make
this a first-class evidence record — a `facts` (or `sources`) record the brief
stage captures, wired into the review stage's prompt so the reviewer checks
claims against it. Ask: "what is the source of truth the fact-check verifies
against?" If there is none, say so — the lens then only checks internal
consistency, not external truth. Do not leave this to be discovered mid-run when
the reviewer starts fighting the author.

**Findings double as the adjudication log (a deliberate feature).** The
`kind: findings` payload carries `resolved` + `resolutionNote` per finding, and
the `findings-clear` gate blocks only on UNRESOLVED blocking-severity findings.
So the human's accept/reject decisions live in the findings record itself: a
rejected-but-non-blocking finding is marked `resolved: true` with the reason in
`resolutionNote`, and the gate passes. This is the intended mechanism — the
findings artifact is both the reviewer's output and the author's decision log. If
you want a richer log (who decided, when), a `kind: findings` artifact may ALSO
declare a schema; those fields merge into the finding object.

Record `artifact-design` with an `artifacts[]` of `{stageId, name, kind
(regular|findings), invariants[]}`.

### Phase 4 — adversary (artifact: `lens-design`)

- **How independent should review be?** Context-isolation, not model-identity, is
  what makes a review valid — a fresh-context reviewer is independent even if it
  is the same model as the driver. Three transports, recorded via `reviewer` +
  `adversary`:
  - **external** (`reviewer: external` + a non-claude `adversary` like `codex`) —
    a different model in a separate process (`@atalanta/external-reviewer`).
    Model + process isolation; strongest. **Canon** where a second agent is set
    up. Optionally an `adversaryModel` (e.g. `gpt-5.5`).
  - **dispatch-isolated** (`reviewer: external` + `adversary: claude`) — a
    fresh-context Claude subagent reviews Claude's work. Independent by context,
    same model. Use when no external agent is configured but you still want
    isolated review. This is NOT an error (a prior version wrongly rejected it).
  - **same-context** (`reviewer: dispatch` or unset) — the driver reviews inline.
    Weakest; the lightweight fallback.
  Record `reviewer` and `adversary` to pick the tier. Reversing later is a
  one-field edit.
- What must review catch? Against which standards → which lenses? (For prose:
  the `kw-review-lenses` STRUCT/CRAFT/TONE set; for code: `ts-review-lenses`
  A/B/C. For a house standard, name it.)
- A deterministic mechanical linter first? (Vale for prose via
  `@atalanta/vale-review`; a formatter/linter for code.) Canon: yes, gated,
  before the LLM review.
- How many rework cycles before escalation to a human short of abort?

Record `lens-design`: `{reviewer, author, adversary, adversaryModel?, lenses[],
standards[], mechanicalLinterFirst, maxReviewCycles}`. Carry `reviewer`, `author`,
`adversary`, `adversaryModel` into the consolidated `design` record too — they
are evidence of the intended polarity.

### Phase 5 — gates (artifact: `gate-design`)

For every transition, apply the method's test: **could the driver advance while
the thing is broken?** If yes, add the gate that makes it impossible. Capture
each transition's gates as *intents* the assembler expands, or raw gate
type+config for anything uncommon. The intents the assembler knows:

| intent | expands to |
| --- | --- |
| `review-clear` | `artifact-fresh(recordedThisCycle)` + `findings-clear[critical,high]` |
| `human-approval` | `human-approval` (the one gate the driver can't self-satisfy — put it at ship) |
| `coverage-contract` | `cel` asserting every required unit is covered or an accepted gap |
| `artifact-present` | `artifact-exists` |
| `evidence-present` | `evidence-recorded` |
| `workflow-ok` | `workflow-succeeded` (verified testing) |
| `test-failed` | `evidence-recorded requireField status=failed` (the fail edge) |

Keep `rework` back-edges gateless. Record `gate-design` with a `transitions[]`
of `{stageId, name, to, gateIntents[]}`.

### Phase 6 — assembly (deterministic; artifact: `design`)

1. **Consolidate** the five phase artifacts into one `design` artifact — the full
   `DesignRecord` the assembler report reads. Query each phase artifact's payload
   (`swamp data query 'modelName=="factory-design" && name=="artifact-<session>-<phase>-design"' --select attributes.payload`)
   and compose them into the EXACT shape below. Do NOT read the extension source
   for the schema — this is it. The report validates against zod and rejects a
   wrong shape, so match it precisely.

   **DesignRecord shape** (the assembler's input contract):
   - `factoryName` (string, required), `description?` (string)
   - `reviewer?` `"external" | "dispatch"`, `author?` / `adversary?`
     `"claude"|"codex"|"gemini"|"opencode"|"amp"`, `adversaryModel?` (string)
   - `stages[]` (≥1), each:
     - `id` (string, required), `description?`, `initial?` / `terminal?` (bool)
     - `workMode?` `"interactive"|"dispatch"|"workflow"|"method"` (omit on terminal)
     - `skills?` (string[]), `systemPrompt?`, `constraints?`, `maxCycles?` (int)
     - `artifacts[]`: `{ name, kind: "regular"|"findings", reviews?, fields[] }`
       where `fields[]` = `{ name, type: "string"|"array"|"object"|"number"|"integer"|"boolean", required?, minLength?, minItems?, enum?, itemsType?, description? }`
     - `evidence[]`: `{ name, fields[] }` (same field shape)
     - `transitions[]`: `{ name, to, manual?, gates[] }`
   - each **gate** is EITHER an intent (params are SIBLINGS of `intent`, not
     nested) OR a raw passthrough — exactly one:
     - `{ intent: "review-clear", artifact: "<findings-artifact>" }` → fresh + findings-clear[critical,high]
     - `{ intent: "human-approval", id: "<gate-id>" }`
     - `{ intent: "coverage-contract" }` (optional `requiredUnitsPath`/`coveredUnitsPath`/`acceptedGapsPath`)
     - `{ intent: "artifact-present", artifact: "<name>" }`
     - `{ intent: "evidence-present", evidence: "<name>" }`
     - `{ intent: "workflow-ok", workflow: "<name>" }`
     - `{ intent: "test-failed", evidence: "<name>" }`
     - `{ raw: { type: "<sf-gate-type>", config: { … } } }`
   - `globalTransitions[]`: `{ name, to, gates[] }`

   **Hard rules the assembler enforces (it throws otherwise):**
   - **Artifact/evidence names are global.** Declare each once, on its producing
     stage; a later stage re-records it in place — do NOT re-declare it in that
     stage's `artifacts[]`.
   - **Rework returns to the producing stage.** A review's `rework` edge must
     route back to the single stage that declares the reviewed artifact (which
     re-records it in place) — the producer's declaring stage must be reachable
     from the review stage. A loop that returns to a stage which doesn't declare
     the subject dead-ends (the engine only lets a stage re-record what it
     declares). Every gate must reference an artifact/evidence some stage declares.
   - **A review stage is `workMode: "dispatch"` with a `kind: "findings"`
     artifact.** That is the signal the assembler keys on. Do not author a review
     stage as `workMode: "workflow"` — it won't be recognised as review and the
     review transport won't attach. If any isolated review is configured
     (`reviewer: external`, or a non-claude `adversary`), there MUST be such a
     dispatch+findings stage. `reviewer: external` + `adversary: claude` is
     allowed — it wires dispatch-isolated (fresh-context subagent), not external.

   Fill the free-form fields the interview captured (stage `systemPrompt`s, lens
   skill names) directly into the record — evidence, not improvised now. Put the
   phase-4 `maxReviewCycles` on the review stage's `maxCycles` (and its producing
   stage's), so the human's expected round count drives the cap. If you leave a
   review stage's `maxCycles` unset, the assembler defaults it to 10 (higher than
   the engine's 5, because knowledge-work review converges slowly) — never leave
   it at the engine default for a review loop.
2. `record_dispatch`, then `record_artifact name=design payload='<the DesignRecord>'`.
   Recording `design` **fires the `@atalanta/meta-factory` report** — it validates
   the record and emits the target factory definition as json. No method to run,
   no assembler instance.
3. Read the assembled definition from the report:
   `swamp report get @atalanta/meta-factory` (its `json.definition` is the target
   factory's globalArguments + reports; `json.error` is set if the design was
   rejected — fix the `design` artifact and re-record, do not hand-write the
   definition).
4. `advance transition=assembled`.

The consolidation is the one place you shape data by hand; the report is the
deterministic projection. Keep judgement in the recorded design fields.

### Phase 7 — confirm (human)

Present the assembled definition (the assembler report's `json.definition`) and,
if useful, the target's rendered Mermaid — the record, not your memory of it. On
the human's explicit "go": `approve gateId=design-confirm actor=<who>`, then
`advance transition=confirmed`. Never approve on their behalf.

## After the interview: install the target factory

The interview produced the target factory definition as the assembler report's
`json.definition` — evidence, not a live factory. Installing it is a separate,
explicit step (swamp's source/runtime split — the report produces data, you turn
it into source):

```
swamp model create @swamp/software-factory <factoryName>
# write the report's json.definition (globalArguments + reports) into
# models/@swamp/software-factory/<uuid>.yaml under the minted header, keeping
# the trailing methods: {}. The definition is a JSON object; render it as the
# YAML body with your file tools (swamp reads either, but the repo convention is YAML).
swamp model method run <factoryName> validate
swamp model method run <factoryName> describe   # show the human the Mermaid
```

### Scaffold the reviewer instance — external tier only

Only the **external** transport needs a `@mgreten/cli-agent` instance (a
different-model reviewer in a separate process). The **dispatch-isolated** and
**same-context** tiers need nothing scaffolded — the driver spawns the
fresh-context subagent (or reviews inline) with no extra model. If the design's
review stage carries the `EXTERNAL REVIEW` instruction, create the instance with
`defaultProvider` = the recorded `adversary`:

```
swamp model create @mgreten/cli-agent external-reviewer
swamp model edit external-reviewer      # set globalArguments:
#   defaultProvider: <adversary>        # e.g. codex — the ADVERSARY (a non-claude model)
#   defaultModel: <adversaryModel>      # e.g. gpt-5.5
#   codexPath: <adversary-cli>          # the adversary provider's CLI on PATH
#   wallTimeoutMs: 900000
#   maxRetries: 1
```

Confirm the adversary's CLI is installed and authenticated before the first
review call. Reversing to a different provider later is a one-field edit
(`defaultProvider`); the factory definition does not change, because it names the
instance, not the provider.

Then drive the new factory with the `software-factory` skill. The interview never
runs the target factory.

## References

- `docs/factory-canon.md` — the grammar, the composition patterns, the driving loop.
- `docs/factory-method.md` — the three laws, the rigor ladder, the build order, the anti-patterns.
- The `software-factory` skill — the generic drive loop this skill specialises.
- The `kw-review-lenses` skill — the prose review lenses a knowledge-work factory wires.
