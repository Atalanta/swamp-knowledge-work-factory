# The Factory Canon

How to compose, extend, and design `@swamp/software-factory` definitions — for
software *and* knowledge work.

This is deliverable 1 of 3: the mental model + grammar + design method. It is
grounded in the software-factory skill docs (`references/authoring.md`,
`references/driving.md`, the four bundled examples), the cross-repo study in
[`factory-comparison.md`](./factory-comparison.md), and the two knowledge-work
exemplars (swamp-diataxis, spade-factory). Deliverable 2 (the distilled
best-practices method) and 3 (a generic knowledge-work template) build on it.

---

## Part 1 — Explanation: what a factory *is*

### The one idea

A factory is **a state machine defined as data**. The definition is a program;
each work item's run is a program counter walking that program. You — or any
agent — are a *generic interpreter*: you never need to know what a stage
*means*, only what `status` says is required next. The same drive loop runs
every factory. All the meaning lives in the definition.

That inversion is the whole point. Everything else (gates, lenses, reviews,
cycles) is machinery in service of it. If you internalise nothing else:
**`status` is the contract; the definition is the program; you are the
interpreter.**

### One factory, many work items

There is no work item in the definition. One factory instance serves many work
items concurrently; `workItem` is a method argument on every call, and every
run record is namespaced per work item (`artifact-<workItem>-<name>`,
`state-<workItem>`, `journal-<workItem>`…). Parallel work items never collide,
but the vocabulary you author in stays logical (`artifact-plan`, not
`artifact-PAY-218-plan`).

### The five moving parts

| Part | What it is | Why it exists |
| --- | --- | --- |
| **Stage** | A node in the machine: an `id`, optional `work`, declared `artifacts`/`evidence`, and gated `transitions` out. | The unit of progress. Exactly one `initial`, ≥1 `terminal`. |
| **Work** | *How* a stage's work gets done: `interactive` / `dispatch` / `workflow` / `method`. | Separates who does the work (you, subagents, a workflow, a method) from what the stage is *for*. |
| **Artifact** | A schema-validated data product a stage records. | The durable, queryable output. Strict-by-default schema catches LLM drift at the producing seam. |
| **Evidence** | A schema-validated *external* fact (a PR, a CI outcome, a release URL). | Records what happened outside the factory; cycle-scoped so stale facts can't carry across rework. |
| **Gate** | A predicate on a transition. All gates must pass to `advance`. | Where policy is enforced *structurally*. This is where rigor lives. |

### Why gates are the heart of it

Anyone can write a linear checklist. What makes a factory trustworthy is that
the *advance* is blocked by machine-checkable conditions the driver cannot talk
its way past:

- `findings-clear(blocking:[critical,high])` — the platform refuses to advance
  while any unresolved critical/high finding exists. Operates on the recorded
  findings artifact, not a human claim.
- `artifact-fresh(recordedThisCycle:true)` — a review from a prior cycle cannot
  satisfy the gate after rework; the reviewer must re-run. This is the core
  anti-staleness control.
- `workflow-succeeded` / `evidence-recorded(requireField:{status:succeeded})` —
  verified against swamp's own run records, not attested by the driver.
- `human-approval` — cannot be self-satisfied; the interpreter is forbidden from
  calling `approve` without an explicit human instruction.

Gate failures are *instructions*, not errors. `advance` tells you exactly what
is missing ("re-record 'plan-review' against the current subject", "a human
must run approve with gateId=…"). You follow them literally; you never work
around them, because the author configured them on purpose.

### Why the design keeps engineering against silent failure

Read the docs closely and one obsession recurs: **turn a silent no-op into a
loud failure at the seam where it happens.**

- A `workflow`/`method` stage's recorded outcome inherits a built-in contract
  (`{status, runId, outputs?}`). A workflow that "succeeded" but recorded an
  empty outcome fails loudly at the `record_evidence` write — instead of leaving
  the gate quietly unsatisfied and the driver re-dispatching the same stage
  forever.
- Every stage with a `work` block must be `record_dispatch`-ed *before* it runs.
  Re-dispatching the same `(stage, cycle)` warns on attempt 2 and hard-fails on
  attempt 3 (`runaway-loop-suspected`). That is the deterministic fix for the
  "succeeded but recorded nothing → loop forever" trap.
- Object payloads are **strict by default** — an undeclared key is rejected.
  A stray field or typo'd key is caught at the producing stage, not downstream.
- A rejected payload is *recorded* as `validation-<target>` (rejected value +
  path-bearing errors), so a retry stage can bind it straight back into the
  model's next prompt.

This is the same instinct behind "never lose data" in the bilan REPL and behind
the no-swamp-pipes hook: make the failure mode structural and loud, not a hedge
the operator has to notice.

---

## Part 2 — Reference: the grammar

Everything here is enforced by `validate` or at run time. This is the complete
surface as documented; treat it as the spec.

### Definition shape

```yaml
# models/@swamp/software-factory/<id>.yaml  (git-tracked)
globalArguments:
  stages: [ ... ]            # the machine (required)
  globalTransitions: [ ... ] # edges available from every non-terminal stage (optional)

reports:                     # top-level, sibling of globalArguments
  require:
    - { name: "@swamp/software-factory/work-item-summary", methods: [summary] }
checks:                      # top-level
  require: [ ... ]
```

`swamp model create @swamp/software-factory <name>` writes the file; edit the
YAML directly. Scope the `work-item-summary` report to `methods: [summary]` —
otherwise it fires after *every* method (`record_artifact`, `advance`…) and
buries the real history under empty placeholder versions.

### Stage

```yaml
- id: plan-review            # lowercase, -/_ separators, unique
  description: optional prose
  initial: true              # exactly one stage
  terminal: true             # ≥1 stage; terminal stages have no transitions out
  maxCycles: 5               # re-entry circuit breaker (default 5)
  maxDispatchesPerCycle: 2   # dispatch attempts per entry (default 2)
  work: { ... }
  artifacts: [ ... ]
  evidence: [ ... ]
  transitions: [ ... ]
```

`maxCycles × maxDispatchesPerCycle` bounds total work on a stage. They are two
distinct guards: `maxCycles` caps how many times you may *re-enter* a stage;
`maxDispatchesPerCycle` caps re-runs *within one entry*.

### Work modes

| mode | executor | keys |
| --- | --- | --- |
| `interactive` | the driving agent, in conversation | `skills`, `systemPrompt`, `constraints` |
| `dispatch` | one subagent per listed skill, in parallel | + `command` template |
| `workflow` | a named swamp workflow (no LLM) | `workflow:{name,inputs}`, `resultEvidence`, `inputsSchema?` |
| `method` | one model method call | `method:{modelIdOrName,methodName,inputs}`, `resultEvidence`, `inputsSchema?` |

Run-data bindings resolve at stage execution time against the run's own records,
and may only reference data written by *earlier* stages:

```yaml
inputs:
  ref: '${{ data.latest(self.name, "evidence-change-request").payload.headSha }}'
```

`status` returns `work` with bindings already resolved; anything in
`unresolvedBindings` means an earlier product wasn't recorded.

### Artifacts

```yaml
artifacts:
  - name: plan-review        # global to the machine; declare once
    kind: findings           # unlocks findings gates + resolve_findings
    reviews: plan            # subject link: pins the subject's version on record
    schema:                  # required unless kind: findings
      type: object
      required: [summary]
      properties:
        summary: { type: string, minLength: 1 }
```

Schema subset (compiled to zod): `type` (object/array/string/number/integer/
boolean), `properties`, `required`, `additionalProperties`, `items`, `enum`,
`pattern`, `minLength`/`maxLength`, `minimum`/`maximum`, `minItems`/`maxItems`.
Unknown keywords rejected at authoring time. **Every artifact declares a
`schema` or is `kind: findings`** — there is no unvalidated artifact.

`kind: findings` payloads carry `findings: [{id, severity, description,
category?, resolved?, resolutionNote?}]`, severity in
`critical`/`high`/`medium`/`low` (no "info" — use `low`). Use stable prefixed ids
(`ARCH-1`, `CORR-2`) so resolution tracks across cycles.

**The schema is also the retrieval contract.** Records store the payload at
`attributes.payload.<field>`, so a driver fetches exactly the field it needs.
Well-structured schema fields pay off at query time.

### Evidence

```yaml
evidence:
  - name: change-request     # global name; schema-validated on record_evidence
    schema:
      type: object
      required: [url]
      properties:
        url: { type: string }
        headSha: { type: string, minLength: 7 }
```

Opaque to gates (gates check *that* it was recorded and optionally one field),
but its shape is checked on write. **Cycle-scoped**: re-entering a stage means
re-recording its evidence — stale test runs and stale PR state cannot carry
across rework.

`resultEvidence` on a `workflow`/`method` stage needs no schema of its own — it
inherits the built-in `{status, runId, outputs?}` contract. Declare an explicit
`evidence` entry of the same name to constrain it further.

`inputsSchema` validates a `method`/`workflow` stage's *resolved inputs* before
dispatch — catching an upstream value that drifted shape at the boundary the
factory owns, surfaced in `status` as `invalidInputs`.

### Gates

| type | config | passes when |
| --- | --- | --- |
| `artifact-exists` | `artifact` | ≥1 version recorded |
| `artifact-fresh` | `artifact`, `recordedThisCycle?` | pinned subject version is current; with `recordedThisCycle`, the latest version was recorded during this entry |
| `findings-clear` | `artifact`, `blocking:[severities]` | no unresolved finding at a blocking severity (needs `kind: findings`) |
| `human-approval` | `id`, `minApprovals?` | enough `approve` records for the current (stage, cycle); any rejection blocks |
| `evidence-recorded` | `name`, `requireField?` | evidence recorded this (stage, cycle); optional dot-path match, e.g. `{status: succeeded}` |
| `cooldown` | `afterEvidence`\|`afterArtifact`, `seconds` | enough wall-clock time since the record |
| `max-cycles` | `stage`, `limit`, `invert?` | routing only (e.g. make `escalate` live after N rounds) |
| `cel` | `expr`, `message?` | CEL predicate true over `artifacts.<snake_name>`, `evidence.<snake_name>`, `approvals`, `state`, `workItem` |
| `workflow-succeeded` | `workflow`, `requireStepOutputs?` | swamp's own run record shows the latest run succeeded this entry — verified, not attested |

Reserved: `human-approval` ids must not start with `cycle-override:`.
`artifact-fresh` targets need `reviews:`; `findings-clear` targets need
`kind: findings`. Note the CEL gate snake-cases artifact names
(`uat-report` → `artifacts.uat_report`) and `size()` is safe *inside* a gate
`expr` (unlike a `--json` projection).

### Transitions

```yaml
transitions:
  - name: approve
    to: implementing
    manual: true             # optional: require explicit human "go" even when gates pass
    gates: [ ... ]           # all must pass; empty/absent = unconditional
globalTransitions:
  - name: abort
    to: aborted
    gates: [{ type: human-approval, config: { id: abort-confirmation } }]
```

Loop-backs are ordinary transitions to earlier stage ids. **Gateless `rework`
back-edges are correct design**: the driver can always retreat; only
*advancing* requires passing the gate stack. Re-entry increments the stage's
cycle; approvals and evidence are cycle-scoped and do not carry over.
`globalTransitions` (abort, escalate) are exempt from the dispatch guard, so a
run is never trapped.

### The method surface (driving)

All take `workItem` except `validate`/`describe`.

| method | does |
| --- | --- |
| `start` | validate + begin a run at the initial stage (fails on an existing run) |
| `status` | materialize + persist `status-<workItem>` (or `status-_factory` factory-wide); the contract you read each loop |
| `record_dispatch` | mark a work-bearing stage as running — **before** executing it; arms the loop guard |
| `record_artifact` | record a declared artifact (schema-validated) |
| `record_evidence` | record declared evidence / a `resultEvidence` outcome (schema-validated) |
| `resolve_findings` | mark findings resolved with notes (not a fresh recording) |
| `approve` / `reject` | human decisions on a `human-approval` gate or `cycle-override:<stage>` grant (explicit human instruction only) |
| `advance` | move along a named transition; gates re-validated here |
| `summary` | render the full run history as markdown, static from run data (no LLM) |
| `validate` / `describe` | lint the definition / render it as Mermaid |
| `reset` | destroy progress (needs `confirm=reset`; explicit human intent only) |

### Validation rules (hard errors)

Exactly one `initial`, ≥1 `terminal`; unique stage ids; globally unique
artifact/evidence names; transition targets exist; non-terminal stages have a
way out (global transitions count); gate references resolve; `findings-clear`
targets `kind: findings`; `artifact-fresh` targets need `reviews:`; reviews
links acyclic; schemas compile; every artifact has a schema or is
`kind: findings`; every evidence has a schema; artifact/evidence/`inputsSchema`
roots are `type: object`; every stage reachable from initial. At run time:
advancing out of a work-bearing stage requires a `record_dispatch` for the
current entry.

---

## Part 3 — The composition patterns

These are the reusable "moves" — the vocabulary you compose a factory *out of*.
Each is drawn from a real definition.

### Pattern A — The adversarial review stage (the canonical one)

A work stage produces a subject; a review stage refutes it; a gate blocks
advance until findings clear.

```yaml
- id: implementing
  work: { mode: interactive, skills: [implementation] }
  artifacts:
    - name: change-summary
      schema: { type: object, required: [summary, headSha], properties: { summary: {type: string}, headSha: {type: string, minLength: 7} } }
  # ...

- id: code-review
  work:
    mode: dispatch                        # one subagent per skill, in parallel
    skills: [correctness, architecture, idiom]
    systemPrompt: |
      You are an adversarial reviewer. Review the change at
      ${{ data.latest(self.name, "evidence-change-request").payload.url }}
      against the plan. Record findings with severities; do not soften them.
  artifacts:
    - name: code-review
      kind: findings
      reviews: change-summary             # auto-pins subject version on record
  transitions:
    - name: accept
      to: done
      gates:
        - { type: artifact-fresh,  config: { artifact: code-review, recordedThisCycle: true } }
        - { type: findings-clear,  config: { artifact: code-review, blocking: [critical, high] } }
        - { type: human-approval,  config: { id: ship-approval } }
    - name: rework
      to: implementing                    # gateless back-edge
```

**The canon: the reviewer is external and context-isolated.** Your strongest
factories (bilan, restic, aldi-compass, slack-firehose, spade) do not review
with subagents of the driver — they dispatch to a *different model in a separate
process* (codex via `@mgreten/cli-agent`, or `@atalanta/*` reviewer instances)
that reads the work fresh from swamp and cannot approve its own output. This is
the *polarity reversal*: Claude drives, codex judges. Same-model `dispatch`
(subagents of the driver) is the lightweight fallback for a quick internal
factory — but it is self-review, and self-review is the documented weak spot.

Wiring the external reviewer: the review stage's `dispatch` subagent (or a
`method` stage) invokes the reviewer model instance, handing it a **lens** (see
Pattern B) plus a fetch recipe (`swamp data query … --select attributes.payload
--json`) so it pulls the subject itself. On re-entry, tell the reviewer to fetch
its prior findings and *verify* claimed resolutions rather than trust them.
Merge all reviewers' findings into one `record_artifact` with stable prefixed
ids.

### Pattern B — Lenses as versioned shared skills

A lens is the reviewer's instruction set: what to look for, the finding-id
prefix, the exact output schema. Keep lenses as **versioned files**, not inline
YAML prose and not ad-lib.

Three lenses run independently, correctness outranking idiom:

- **IDIOM** (`IDIOM-`) — language/toolchain conventions.
- **CORR** (`CORR-`) — correctness, data-loss, edge cases. Outranks idiom on
  conflict, so a real bug can't be traded for a style opinion.
- **ARCH** (`ARCH-`) — boundaries, coupling, design.

For prose factories the axes differ (spade uses TONE/IA/SPADE; diataxis uses
Diátaxis-compass/craft/tone) but the discipline is identical. A shared
**contract block** (spade's `contract-block.md`) defines the fetch recipe, the
"don't re-flag what the mechanical linter caught" rule, and the findings JSON
schema — one file all lenses suffix, so schema changes propagate once.

Anti-patterns the study found and this canon rejects:
- Lens criteria inline in YAML (`swamp-cli-agent`) — no single source to update.
- Lens reference to a package not pulled into the repo (restic-refactor) —
  unresolvable locally.
- `TODO` stub lenses (`swamp-aldi`) — structurally sound, content-empty.
- Copies drifting between repos (bilan's work-item lens is newer than spade's).

Package lenses as a published skill extension (`@you/ts-review-lenses`,
`@you/sdlc-review-lenses`) so every factory pulls the same versioned source.

### Pattern C — Mechanical layer before the judgement layer

Run the deterministic linter *inside a gated stage* so the expensive LLM
reviewer never spends capacity on lint-catchable issues, and idiom/prose quality
is structural, not advisory.

- aldi-compass: Fantomas (format) + FSharpLint (idiom) must exit 0 before the
  conformance suite runs.
- spade: a Vale linter stage gates the writing review — codex only sees drafts
  that already pass mechanical checks; the lens explicitly tells codex not to
  re-flag what Vale caught.

### Pattern D — Verified testing (never an LLM claim)

Testing is `mode: method` or `mode: workflow`, gated on a *real recorded field*:

```yaml
- id: testing
  work:
    mode: workflow
    workflow: { name: "@acme/run-tests", inputs: { ref: '${{ data.latest(self.name, "evidence-change-request").payload.headSha }}' } }
    resultEvidence: test-run
  transitions:
    - name: pass
      to: code-review
      gates: [{ type: workflow-succeeded, config: { workflow: "@acme/run-tests" } }]
    - name: fail
      to: implementing
      gates: [{ type: evidence-recorded, config: { name: test-run, requireField: { status: failed } } }]
```

`workflow-succeeded` verifies against swamp's own run records. Feed the ref
structurally from recorded evidence (`data.latest(...)`) so the test is coupled
to the actual committed code, not a prose claim. aldi-compass goes further:
SHA256-pin a reference oracle and falsify the port against the live original
(differential conformance beats author-written expectations).

### Pattern E — CEL cross-artifact integrity gates

Validate one artifact against another's data at the transition. spade's are the
best examples in the whole set:

```yaml
# on alternatives → decide: the "three choices" rule
- { type: cel, config: { expr: 'size(artifacts.alternatives.options) >= 2 && size(artifacts.alternatives.options) <= 3' } }
# on decide → explain: can't recommend an option that doesn't exist
- { type: cel, config: { expr: 'artifacts.decide.options.exists(o, o.id == artifacts.decide.recommendedOptionId)' } }
# on uat accept: an empty report can't masquerade as a thorough pass
- { type: cel, config: { expr: 'size(artifacts.uat_report.findings) >= 1', message: "record ≥1 finding (low = informational clean pass)" } }
```

Cheap, structural, catches fabrication that a schema alone can't.

### Pattern F — Retry-with-feedback for LLM-driven stages

When a `method` stage's output fails its schema (an LLM drifted a field type),
the engine records the rejected value + errors as `validation-<target>` and the
retry binds it back into the model's next prompt:

```yaml
work:
  mode: method
  method:
    modelIdOrName: "@my/planner"
    methodName: generate
    inputs:
      workItem: '${{ self.workItem }}'
      # whole record, null-safe: null on attempt 1, the failure on retry.
      # NEVER bind a sub-field (…"validation-plan").errors) — throws when absent.
      feedback: '${{ data.latest(self.name, "validation-plan") }}'
  resultEvidence: plan-run
```

A clean record auto-clears the validation record; the re-prompt lives with the
method (not the engine); the dispatch guard bounds the loop. `feedback == null`
and `feedback.cleared == true` both mean "clean attempt."

### Pattern G — Rich, schema-constrained design artifacts

Lock the domain invariants at the *data layer* so they're blocked before any
reviewer sees them — not surfaced as findings. restic requires
`includeExcludePolicy` / `secretHandling` / `restoreSafety` as design-time
fields; spade requires `evidence[]` entries to carry both `claim` and `source`
(no unsourced assertions). Pin the diff: put `headSha` + branch in the change
artifact so the reviewer works from committed code at a ref.

### Pattern H — Ground the design in real facts first

Mine the spec from ground truth, not from re-derivation. Name the corpora as
evidence: `aldi-schema-facts` (swamp-aldi), the DDD data + KB (restic), the
Go source + live skill contract (aldi-compass). Capture in-flight
`design-decision` evidence — an immutable audit trail of *why* the
implementation diverged from the plan.

### Pattern I — Escape hatches and cycle discipline

- Set `maxCycles` deliberately (slack-firehose: 12 on planning). The default 5
  is often wrong for exploratory front stages.
- Add an `escalate` transition to a human *short of* `abort`, gated on
  `max-cycles` so it goes live after N rounds — a no-progress loop should reach a
  human, not just die at the cap.
- `reviewer-preflight`: a cheap `method`-mode connectivity check that the
  reviewer model is reachable before an expensive 15-minute review call
  (slack-firehose design factory).

---

## Part 4 — How-to: design a factory from scratch

A repeatable procedure. It is the same whether the output is code or prose.

### Step 1 — Name the flow as stages

Write the happy path as a stage list first, ignoring gates. Every factory in the
study shares a spine — for software:
`plan → plan-review → implement → test → code-review → done`; for a decision
doc, spade's is `setting → people → alternatives → decide → explain → assemble →
review → done`. The *shape* is rarely the hard part. Mark exactly one `initial`
and at least one `terminal` (usually `done` + `aborted`).

### Step 2 — For each stage, choose a work mode

- Human judgement / drafting / interviewing → `interactive`.
- Adversarial review → `dispatch` (canon: to an external reviewer).
- Deterministic computation, tests, linters → `workflow` or `method` (no LLM).

The strongest knowledge-work factory (diataxis) is built on one rule:
**separate deterministic computation from probabilistic LLM calls.** Span
inventory, planning, relevance scoring, signposting are pure code; only
atomising, clustering, and review are LLM. Do the same — a stage that can be
deterministic should not be an LLM call.

### Step 3 — Declare artifacts and evidence with tight schemas

For each stage, what durable product does it record (artifact) and what external
fact does it depend on (evidence)? Make schemas strict:
- Required fields for everything load-bearing.
- `minLength`/`minItems` so an empty string can't pass as content.
- Lock domain invariants as required fields (Pattern G) rather than hoping a
  reviewer catches their absence.
- Remember the schema is your query contract — name fields for how you'll fetch
  them.

### Step 4 — Gate every advance

This is where rigor is won or lost. For each transition *out*, ask "what must be
provably true to leave here?" and encode it:
- Review stages: `artifact-fresh(recordedThisCycle:true)` +
  `findings-clear(blocking:[critical,high])` + `human-approval`.
- Test stages: `workflow-succeeded` / `evidence-recorded(requireField:…)`.
- Integrity: `cel` cross-artifact checks (Pattern E).
- Keep `rework` back-edges gateless.

The test: could the driver *advance while the thing is broken*? If yes, you're
missing a gate. (This is exactly how bilan shipped a non-fix twice — a demo
stage gated only on `artifact-exists` records a broken result identically to a
passing one.)

### Step 5 — Wire lenses and constraints as versioned files

Point review stages at shared lens skills (Pattern B), not inline prose.
Point interactive stages at `constraints:` files for conventions. One source of
truth, pulled into the repo, versioned.

### Step 6 — Set the guards

`maxCycles` per stage (tune the front stages up), `maxDispatchesPerCycle`,
an `escalate` transition, a global `abort`. Scope the summary report to
`methods:[summary]`.

### Step 7 — `validate`, `describe`, confirm with the human, `start`

```
swamp model method run <factory> validate
swamp model method run <factory> describe   # render the Mermaid, show the human
swamp model method run <factory> start --input workItem=<ref>
```

Then drive it with the loop in `driving.md`: `status` → `record_dispatch` →
execute → record → re-`status` → `advance`.

### Step 8 — Extend, don't rebuild

To add a stage, insert it and re-point the neighbouring transitions. To share a
canonical stage set across factories, hold it in a template instance and
reference it by CEL:

```yaml
globalArguments:
  stages: "${{ model.acme-sdlc-template.definition.globalArguments.stages }}"
```

To evolve a lens, edit the shared skill and republish — every factory inherits
it. To harden a gate, add a `cel` check; to catch a new drift, tighten a schema.

---

## The design test (one paragraph to remember)

A good factory makes the *right outcome the only reachable one*: every advance
is gated on a machine-checkable fact, reviews are fresh and external, tests are
verified not claimed, invariants are schema-locked, and the one thing a human
must judge (ship, abort) is the one gate the interpreter cannot self-satisfy. A
weak factory has the same *shape* but gates on `artifact-exists` — it records
that something happened without checking whether it was right. The gap between
those two is the entire discipline.
