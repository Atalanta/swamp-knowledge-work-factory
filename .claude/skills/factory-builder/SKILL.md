---
name: factory-builder
description: >-
  Drive the factory-design interview: a structured, phase-by-phase conversation
  that elicits the design of a @swamp/software-factory (a knowledge-work or code
  factory) in the canon's vocabulary — domain, stages, artifacts/schemas, the
  adversary/lenses, gates, cycles — persists each phase's decisions as a strict
  swamp artifact, then assembles a validated factory definition from the
  persisted record. Use when the user wants to design/build/scaffold a new
  factory, "build me a factory", "design a knowledge-work factory", "run the
  factory-design interview", or is at any phase of a factory-design run. This is
  a CONSTRAINED interview, not an open chat: each phase has fixed seed questions
  and a required artifact shape, and cannot advance until that artifact is
  recorded.
---

# Factory Builder

Drive the `factory-design` interview factory. It designs another
`@swamp/software-factory` by walking the design method from `docs/factory-method.md`
as a phased conversation, persisting each phase's decisions as a schema-validated
artifact, then assembling the target factory YAML deterministically from the
persisted record.

You are the generic software-factory driver (see the `software-factory` skill's
drive loop) pointed at the `factory-design` instance. This skill adds the
per-phase guidance: what to ask, and what shape to record.

**Read `docs/factory-canon.md` (the grammar + composition patterns) and
`docs/factory-method.md` (the three laws, the build order, the anti-patterns)
before driving — they are the source of the seed questions and the standard you
hold each answer to.**

## Setup — do this yourself, ask the human for nothing

The human should never create models or paste YAML. When you are triggered and
the required models do not yet exist, stand them up from the bundled templates.
Check first, then create only what is missing.

**1. Are the models already here?** List them:

```
swamp model search
```

If `factory-design` (@swamp/software-factory) and `assembler`
(@atalanta/factory-assembler) both exist, skip to Start. Otherwise:

**2. Pull the dependencies** (idempotent — skip any already pulled):

```
swamp extension pull @swamp/software-factory
swamp extension pull @atalanta/factory-assembler
swamp extension pull @atalanta/external-reviewer
swamp extension pull @mgreten/cli-agent
```

(Pre-publish: the human has already run `swamp extension source add <repo>` so
these resolve from the local source. If a pull fails as unresolvable, tell the
human to add the source; do not paste files as a workaround.)

**3. Create the `assembler` instance and set its global arg:**

```
swamp model create @atalanta/factory-assembler assembler
```

Then edit the created file (find it under
`models/@atalanta/factory-assembler/<uuid>.yaml`) so its `globalArguments` is:

```yaml
globalArguments:
  interviewFactory: factory-design
```

**4. Create the `factory-design` interview instance and write its definition.**
The definition body ships in the assembler extension at
`templates/factory-design.definition.yaml`. Create the instance, then write that
template's `globalArguments` + `reports` blocks into the created file (replacing
its `globalArguments: {}`, keeping the `type/typeVersion/id/name/version/tags`
header the `create` minted and the trailing `methods: {}`):

```
swamp model create @swamp/software-factory factory-design
```

Read the bundled template (in this repo after pull, at
`.swamp/pulled-extensions/@atalanta/factory-assembler/templates/factory-design.definition.yaml`,
or `extensions/models/templates/factory-design.definition.yaml` in the source
repo) and write it into the instance file with your file-editing tools. Do this
mechanically — it is a fixed transcription, not a judgement.

**5. Validate before driving:**

```
swamp model method run factory-design validate
```

Must report valid. If it does not, the transcription in step 4 is wrong — fix it
against the template; do not improvise the definition.

## The loop (per phase)

For each interview stage: `status` → `record_dispatch` → ask that phase's seed
questions → record the phase artifact → `advance`. The phase gate is
`artifact-exists` on the phase artifact, so you cannot leave a phase until its
decisions are captured in the required shape. This is deliberate: the interview
must produce structured decisions, not prose.

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

Record `stage-design` with a `stages[]` of `{id, kind, workMode, deterministic,
description}`. Include the terminal `done` (and usually `aborted`).

### Phase 3 — artifacts (artifact: `artifact-design`)

For each non-terminal stage, what durable product does it record, and what
invariants must be locked in its schema? Push the human to name invariants that
belong at the data layer (the method: "lock invariants in schemas, not in hope"):
a coverage contract (`requiredUnits`), required sources for claim-tracing, claim
ids with provenance. If the domain makes external factual claims, a `sources`
record or `claims[]` field belongs here — otherwise the CRAFT-style lens has
nothing to verify against.

Record `artifact-design` with an `artifacts[]` of `{stageId, name, kind
(regular|findings), invariants[]}`.

### Phase 4 — adversary (artifact: `lens-design`)

- **Who authors, who is the adversary?** Normal polarity: author = `claude`,
  adversary = `codex` — Claude (the driver) writes, an independent codex reviews.
  Ask the human and record both. The choices are providers
  (`claude`/`codex`/`gemini`/`opencode`/`amp`); optionally an `adversaryModel`
  (e.g. `gpt-5.5`). The factory definition is polarity-neutral — it names a
  reviewer *instance*, not a provider — so this choice drives how you scaffold
  that instance (below), not the YAML. Reversing later is a one-field edit.
- What must review catch? Against which standards → which lenses? (For prose:
  the `kw-review-lenses` STRUCT/CRAFT/TONE set; for code: `ts-review-lenses`
  A/B/C. For a house standard, name it.)
- External context-isolated reviewer, or same-context dispatch? **Canon: external**
  (`@atalanta/external-reviewer` — the reviewer is not the author). Dispatch is
  the lightweight fallback.
- A deterministic mechanical linter first? (Vale for prose via
  `@atalanta/vale-review`; a formatter/linter for code.) Canon: yes, gated,
  before the LLM review.
- How many rework cycles before escalation to a human short of abort?

Record `lens-design`: `{reviewer, author, adversary, adversaryModel?, lenses[],
standards[], mechanicalLinterFirst, maxReviewCycles}`. Carry `author`,
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

### Phase 6 — assembly (deterministic; artifact: `design`, method: assembler)

1. **Consolidate** the five phase artifacts into one `design` artifact — the
   full `DesignRecord` the assembler reads. Query each phase artifact's payload
   (`swamp data query 'modelName=="factory-design" && name=="artifact-<session>-<phase>-design"' --select attributes.payload`)
   and compose them into the DesignRecord shape (see the assembler's
   `DesignRecordSchema`: `factoryName`, `stages[]` with per-stage
   `workMode/skills/systemPrompt/artifacts/evidence/transitions`,
   `globalTransitions[]`). Fill the free-form fields the interview captured
   (stage `systemPrompt`s, lens skill names) directly into the record — they are
   evidence, not improvised at assembly.
2. `record_artifact name=design payload='<the DesignRecord>'`.
3. `record_dispatch` then let the stage run `assembler.build` (mode: method); it
   reads the `design` artifact and writes the target factory YAML as a file
   output. Record the `assembly-run` outcome `{status:"succeeded",runId:"…"}`.
4. `advance transition=assembled`.

The consolidation is the one place you shape data by hand; the assembler is the
deterministic projection. Keep judgement in the recorded fields, not in the YAML
rendering.

### Phase 7 — confirm (human)

Fetch the rendered YAML from the assembler's file output and render the target's
Mermaid, present both to the human (the record, not your memory of it). On their
explicit "go": `approve gateId=design-confirm actor=<who>`, then
`advance transition=confirmed`. Never approve on their behalf.

## After the interview: install the target factory

The interview produced the target factory YAML as a file artifact on the
`assembler` model — evidence, not a live definition. Installing it is a separate,
explicit step (swamp's source/runtime split — a model writes data, not source):

```
swamp model create @swamp/software-factory <factoryName>
# then write the rendered YAML into models/@swamp/software-factory/<uuid>.yaml
swamp model method run <factoryName> validate
swamp model method run <factoryName> describe   # show the human the Mermaid
```

### Scaffold the reviewer instance at the chosen polarity

If the design used an external reviewer, create the `@mgreten/cli-agent` instance
the factory's review stage references, with `defaultProvider` set to the
`adversary` recorded in the design (normal polarity: `codex`):

```
swamp model create @mgreten/cli-agent external-reviewer
swamp model edit external-reviewer      # set globalArguments:
#   defaultProvider: <adversary>        # e.g. codex (normal) — the ADVERSARY, not the author
#   defaultModel: <adversaryModel>      # e.g. gpt-5.5
#   codexPath: <adversary-cli>          # the adversary provider's CLI on PATH
#   wallTimeoutMs: 900000
#   maxRetries: 1
```

The author is whoever drives the factory (normally Claude via the
`software-factory` skill). **Reversing polarity later is a one-field edit** —
`swamp model edit external-reviewer` and change `defaultProvider`/`defaultModel`;
the factory definition does not change, because it names the instance, not the
provider. Confirm the adversary's CLI is installed and authenticated on the
machine before the first review call.

Then drive the new factory with the `software-factory` skill. The interview never
runs the target factory.

## References

- `docs/factory-canon.md` — the grammar, the composition patterns, the driving loop.
- `docs/factory-method.md` — the three laws, the rigor ladder, the build order, the anti-patterns.
- The `software-factory` skill — the generic drive loop this skill specialises.
- The `kw-review-lenses` skill — the prose review lenses a knowledge-work factory wires.
