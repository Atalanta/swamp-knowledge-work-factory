# The Factory Method

The distilled, opinionated way to build a `@swamp/software-factory` — the
practices that separate the rigorous factories from the ones that ship broken
work through every gate. This is deliverable 2 of 3.

Deliverable 1 ([`factory-canon.md`](./factory-canon.md)) is the grammar: what
the machine *can* do. This is the method: what you *should always* do, in what
order, and which mistakes to refuse. It consolidates the cross-repo study
([`factory-comparison.md`](./factory-comparison.md)) — 19 practices, two
systemic weaknesses, and the IP-leverage finding — into one repeatable canon.

Everything here is drawn from what the strong factories actually do, not from
theory. Where a practice comes from a specific repo, it's named.

---

## The three laws

Everything else is a consequence of these.

1. **Gate on facts, never on claims.** Every advance must be blocked by a
   machine-checkable condition: a recorded field, a cleared findings set, a
   verified workflow run, a human sign-off. If the only thing standing between a
   stage and the next is the driver's assertion that the work is done, there is
   no gate.

2. **The reviewer is not the author.** Review is done by a different model in a
   separate process, reading the work fresh from swamp, unable to approve its
   own output. Self-review — subagents of the same driver — is the fallback for
   throwaway work, not the standard.

3. **Make silent failure loud at the seam.** A workflow that succeeds but records
   nothing, an LLM that drifts a field type, a stage that runs twice with no
   progress — each must become a loud error where it happens, not a quiet gate
   that never satisfies while the driver loops forever.

If you find yourself arguing for an exception to one of these, you are usually
about to build a factory that *looks* rigorous and isn't.

---

## The rigor ladder

Factories are not pass/fail — they sit on a ladder. The study ranked nine across
three tiers; the rungs below are what moves a factory up. Build to the highest
rung the domain justifies, and know which rung you're on.

**Rung 0 — Shape only.** Correct stages, `artifact-exists` gates, review prompts
that are `TODO` or ad-lib. Structurally valid, content-empty. (swamp-aldi.) This
is a scaffold, not a factory. Never ship a run through it and trust the output.

**Rung 1 — Real verification.** Testing is `mode: method`/`workflow` gated on a
real recorded field (`exitCode:0` / `status:succeeded` / `workflow-succeeded`),
never an LLM claim. This is the single most important structural gate and the
floor for any factory doing real work. (All Tier-1/2 factories.)

**Rung 2 — External adversarial review.** Three independent lenses
(idiom / correctness / architecture, correctness outranking idiom) run by a
context-isolated external reviewer, findings-gated on critical/high, fresh each
cycle. (bilan, restic, slack-firehose impl.)

**Rung 3 — Mechanical-before-judgement + integrity gates.** A deterministic
linter (Fantomas/FSharpLint, Vale) gates the stage before the LLM reviewer sees
the work; CEL cross-artifact gates enforce domain invariants the schema can't.
(aldi-compass, spade.)

**Rung 4 — Objective correctness.** The output is checked against ground truth,
not author expectations: an oracle-pinned differential suite (aldi-compass) or a
demo stage that runs the real artifact and *asserts on its output*. Only
aldi-compass reaches this on the test axis, and *no* factory reaches it on the
end-to-end axis. This is the frontier (see "The gap none of them close").

---

## The build order

Build a factory in this sequence. Each step depends on the last; skipping one is
where the weak factories went wrong.

### 1. Ground before you plan

Name the corpora the factory reasons from as **evidence records**, so the spec
is mined from ground truth, not re-derived: the source being ported
(aldi-compass pins the Go binary), the DDD/KB facts (restic), a
`schema-facts` mining pass (swamp-aldi). A factory that plans from the LLM's
memory of the domain is building on sand. Capture in-flight `design-decision`
evidence too — an immutable trail of *why* you diverged from the plan.

### 2. Write the happy-path stages, ignore gates

Lay out the flow as a stage list first. The shape is rarely the hard part and is
shared across almost every factory. Mark one `initial`, at least `done` +
`aborted` terminal.

### 3. Assign work modes — deterministic wherever possible

The diataxis rule: **separate deterministic computation from probabilistic LLM
calls.** A stage that *can* be code (inventory, scoring, planning, linting,
assembly) should be `workflow`/`method`, not an LLM turn. Reserve LLM stages
(`interactive`/`dispatch`) for genuine judgement: drafting, review, ambiguous
classification. This is the highest-leverage decision in the whole build — it
determines how much of the factory is verifiable versus trusted.

### 4. Lock invariants in schemas, not in hope

For each artifact, put the domain's load-bearing facts in the schema as
*required* fields — restic's `secretHandling`/`restoreSafety`, spade's
`evidence[]` requiring `claim`+`source`. Add `minLength`/`minItems` so emptiness
can't pass as content. The schema is strict by default; keep it that way (opt
into `additionalProperties: true` only where you mean to). A required field
blocked at the write is worth more than a finding a reviewer might raise. Name
fields for how you'll query them — the schema is the retrieval contract.

### 5. Gate every advance against the "broken" test

For each outbound transition, ask: **could the driver advance while the thing is
broken?** If yes, add the gate that makes that impossible.

- Review → `artifact-fresh(recordedThisCycle:true)` +
  `findings-clear(blocking:[critical,high])` + `human-approval`.
- Test → `workflow-succeeded` or `evidence-recorded(requireField:{status:…})`.
- Integrity → `cel` cross-artifact checks (`recommendedOptionId ∈ options.ids`;
  `size(findings) >= 1` so an empty report can't pass as thorough).
- Keep `rework` back-edges gateless — retreat is always allowed; only advance is
  gated.

### 6. Point reviews at versioned lens skills

Never inline lens criteria in YAML prose, never `TODO` them, never reference a
package that isn't pulled into the repo. Package them
(`@you/ts-review-lenses`, `@you/sdlc-review-lenses`) with a shared contract block
(the fetch recipe, the "don't re-flag mechanical findings" rule, the findings
JSON schema, stable id prefixes). One source of truth; every factory inherits
it; drift disappears.

### 7. Run the mechanical layer inside a gated stage

If a linter can catch it, don't spend an LLM on it. Fantomas/FSharpLint before
the conformance suite; Vale before the writing review. The lens tells the
reviewer not to re-flag what the linter already caught.

### 8. Set the guards deliberately

`maxCycles` per stage (tune the exploratory front stages up from the default 5),
`maxDispatchesPerCycle`, an `escalate` transition to a human *short of* abort
(gated on `max-cycles` so it goes live after N no-progress rounds), a global
`abort`. Add a `reviewer-preflight` smoke test if reviews are expensive. Scope
the summary report to `methods:[summary]`.

### 9. Validate, render, confirm, start

`validate` until clean; `describe` and show the human the Mermaid before `start`;
then drive the loop.

---

## The named anti-patterns (refuse these)

Each of these shipped in a real factory and each is a false sense of rigor.

- **The `artifact-exists` demo.** A stage that runs the real artifact but gates
  advance only on `artifact-exists` — a broken result is structurally identical
  to a passing one. bilan shipped a non-fix twice this way (WI-10 caps, WI-12's
  demo used a question that never triggered the bug). If a stage produces
  something judgeable, gate on the judgement, not its existence.

- **The self-reviewing design factory.** A review stage whose reviewer is a
  subagent of the same driver that produced the work. It cannot find what the
  author couldn't see. slack-firehose's *design* factory is self-review
  (pre-polarity-reversal); its *impl* factory reverses polarity (Claude drives,
  codex judges) and is the stronger of the two.

- **The prose-summary review input.** Handing the reviewer a change-*summary*
  string instead of the diff at a pinned `headSha`. The reviewer either fetches
  the real code itself or reviews a fiction. Pin the diff.

- **The inline lens.** Review criteria written as YAML prose in the stage
  `systemPrompt` (swamp-cli-agent). Precise, but there's no single source to
  update and inherit, and it drifts silently between factories.

- **The unresolvable lens.** A stage referencing a lens package that was never
  pulled into the repo (restic-refactor). It reads as rigorous and resolves to
  nothing at run time.

- **The default `maxCycles` everywhere.** Every stage at the platform default 5
  with no `escalate` — the only non-normal exit is `abort`. A rework loop that
  makes no progress isn't detected until the cap bites, and then it just aborts.
  Only slack-firehose tunes this.

- **The trust-based assembly stage.** spade's `assemble` gates on
  `artifact-exists` + a non-empty body string, with no structural check that all
  five sections are present. A hand-built handoff between structured artifacts
  and a free-text body is where content silently goes missing.

---

## The two systemic weaknesses (present almost everywhere)

The study found two gaps shared across nearly all nine factories. Closing them
is where the method earns its keep.

### Weakness 1 — Untuned cycles, no escalation

Only one factory tunes `maxCycles`; none has an `escalate` transition to a human
short of abort. The fix is Step 8 above: tune per-stage, add
`escalate` gated on `max-cycles` so a stuck run reaches a human with its history
instead of dying at the cap.

### Weakness 2 — No structural output-correctness gate

Every factory trusts author-written tests + prose review for "does the output
actually do the right thing end to end." The correctness lenses across multiple
repos *independently* flag "tests that pass while the feature is broken / loses
data" — but no factory *enforces* an end-to-end check. This is the single
biggest shared blind spot, and it is exactly the class of failure that bit bilan
twice. See the frontier section below.

---

## The IP-leverage finding (the highest-value move you're not making)

Your strongest, most reusable review assets — the **sdlc work-item and PLAN
lenses** — are the *least* deployed.

- The **work-item lens** (8 criteria: right altitude, ground truth, scope
  boundary, product-decisions-present/design-absent, provable-by-real-entrypoint
  done, single planning trajectory; verdict
  `ready|minor_revision|major_revision|not_safe`) is a manual pre-`start` ritual
  in two repos and a **wired factory stage in zero**.

- The **PLAN lens** (8 LLM-execution-readiness criteria, `PLAN-` findings) is
  wired into exactly **one** factory stage (restic-refactor). Everywhere else,
  plan-review ad-libs inline prose covering the same ground less rigorously.

- Meanwhile the lenses have **drifted between repos** — bilan's work-item and
  plan lenses carry a newer "done/verification must exercise the REAL
  user-facing entrypoint" criterion that spade's copies lack.

Two moves close this:

1. **Wire the work-item lens as the first factory stage** —
   `work-item-review` (dispatch → external reviewer → `findings-clear` on the
   `ready` verdict) — instead of a pre-`start` convention. A ticket gate the
   *platform* enforces, not the driver's discipline. No factory has this; it is
   the missing front of every pipeline. A ticket that isn't `ready` shouldn't
   reach planning.

2. **Pull both lens skills into every factory** and reference them from the
   stage `systemPrompt` rather than inlining prose. One versioned source; the
   bilan-vs-spade skew shows the drift is already real and already costing you.

The distinction to keep: `sdlc-review-lenses` reviews the *prose* artifacts
(is this the right problem? is the plan LLM-executable?) — work-item + PLAN,
language-agnostic. `ts-review-lenses` reviews the *code* — IDIOM/CORR/ARCH, at
plan-review (C) and code-review (A/B/C). They are different jobs; a complete
factory wires both.

---

## The frontier: the gap none of them close

No factory has a gate that **runs the real artifact and structurally verifies
the output is correct.** Testing runs author-written tests; review reads prose.
Both can pass while the feature is broken. The two ways forward, both proven in
part:

- **Differential oracle** (aldi-compass): pin a reference implementation by hash,
  run the new artifact and the oracle against the same inputs, diff the outputs,
  fail on drift. Works whenever a trusted reference exists (a port, a rewrite, a
  spec-conformant original).

- **Judging demo** (bilan, half-built): a `demo` stage that runs the exact
  user-facing entrypoint end-to-end against real data — and gates advance on a
  *structured pass/fail assertion over its output*, not `artifact-exists`. The
  demo input must exercise the change (a completeness/limit-triggering case, not
  a soft one). bilan has the stage; it still only records, doesn't judge. Making
  that gate judge is the highest-value thing to build next, and it is what
  deliverable 3's template should ship with.

For knowledge-work factories the analogue is a **coverage contract**: diataxis
computes a span inventory deterministically and requires the atomiser to return
a disposition for *every* span id — silent omission becomes a structural
failure. Any prose factory can adopt the same move: enumerate the required units
mechanically, gate on all of them being accounted for.

---

## The one-line method

Ground in facts, make everything deterministic that can be, lock invariants in
schemas, gate every advance against "could this advance while broken," review
with an external model through versioned lenses, run the mechanical layer first,
verify tests against real records, and put the one human judgement at the one
gate the interpreter can't self-satisfy. The rest is the grammar.
