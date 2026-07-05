# swamp-knowledge-work-factory

A repeatable, extensible way to run **knowledge work** — writing, documentation,
decision records, research briefs — through a `@swamp/software-factory` with the
same rigor a code factory gets: staged flow, mechanical linting, external
adversarial review, and a human sign-off the driver cannot self-satisfy.

## Fastest path: "build me a kw factory"

One pull, then say that to a swamp-enabled agent; the `factory-builder` skill runs
a **structured interview** that designs a factory for your knowledge work and
assembles a validated definition:

```
swamp extension pull @atalanta/meta-factory   # auto-resolves the whole tree (see Dependencies)
# then, to the agent:  "build me a kw factory"
```

The interview walks seven phases (domain → stages → artifacts/schemas →
adversary/lenses → gates → assembly → confirm), persists every decision as
schema-validated swamp data, and ends by deterministically rendering the target
factory YAML. The agent stands up the interview models itself on first run — you
do no typing or pasting; you answer the interview.

## What this repo ships

1. **`@atalanta/meta-factory`** — the factory-builder skill (the interview
   driver), the deterministic assembler model that renders a design record into
   factory YAML, and the bundled `factory-design` interview template.
2. **`@atalanta/kw-review-lenses`** — the prose analogue of
   `@atalanta/ts-review-lenses`: structure / craft / tone review lenses a
   knowledge-work factory's review stage wires.
3. **Seed factories** — `reviewed-document` and `runbook` under
   `models/@swamp/software-factory/` — worked examples the interview can produce;
   instantiate directly if you want a starting point rather than a fresh design.
4. **The canon and the method** — `docs/factory-canon.md` (how factories compose:
   grammar + patterns) and `docs/factory-method.md` (the opinionated method: the
   three laws, the rigor ladder, the build order, the anti-patterns).

## Depend, don't copy

This repo **depends on** `@swamp/software-factory`; it does not vendor or fork it.

`@swamp/software-factory` is a fully generic, model-driven state-machine engine.
Its own registry description is explicit: *"The engine ships no lifecycle
concepts: adversarial review, comprehensive testing, release, and UAT stages are
expressible, never assumed."* The method surface (`start`, `status`,
`record_artifact`, `advance`, …), the gate types (`findings-clear`,
`workflow-succeeded`, `cel`, …), the schema system, the findings contract, the
retry-feedback mechanism, the dispatch guard — all domain-neutral. The only
"software" in the extension is in its *example definitions* and doc phrasing,
which you replace for knowledge work anyway.

`spade-factory` proves the point: it produces SPADE decision *documents* — no
build, no test, no PR — on the unmodified engine. The engine did not need to
change; only the stages, schemas, gates, and lenses did.

So copying the implementation would mean forking a generic engine to change
nothing but its examples — a maintenance burden for zero behavioural gain, and
you'd lose upstream fixes. This repo depends.

## Dependencies (one pull, auto-resolved)

`@atalanta/meta-factory` declares the whole tree in its manifest, so a
single pull resolves everything (swamp resolves dependencies to depth 10 — you
never issue the sub-pulls, and neither does the agent):

```
swamp extension pull @atalanta/meta-factory
```

brings, automatically:

| Extension | Role |
| --- | --- |
| `@atalanta/meta-factory` | the `factory-builder` skill, the assembler report, the interview template |
| `@swamp/software-factory` | the engine (the model type every factory instantiates) |
| `@atalanta/external-reviewer` | the external adversarial reviewer bridge (Claude drives, an external agent judges) |
| `@mgreten/cli-agent` | the external reviewer model type (under external-reviewer) |
| `@atalanta/kw-review-lenses` | the STRUCT/CRAFT/TONE prose review lenses |
| `@atalanta/vale-review` | the deterministic prose linter for a gated `lint` stage |

The one thing a pull cannot bring is the interview's model *instance* (instances
are created per-repo, never resolved by dependency) — the `factory-builder` skill
creates it from the bundled template on first run. You run nothing; you answer the
interview.

## The flow

```
brief → drafting → lint (Vale, gated) → review (STRUCT/CRAFT/TONE, external) → sign-off (human) → done
```

with `rework` back-edges from `lint` and `review` to `drafting`, an `escalate`
transition to a human once `review` cycles 3+ times, and a global `abort`.

Two knowledge-work-specific moves the method calls for are wired in:

- **Mechanical-before-judgement** — the `lint` stage runs Vale and is *gated* on
  it (`workflow-succeeded`), so the expensive LLM reviewer never sees a draft
  that fails mechanical checks.
- **The coverage contract** — the `brief` evidence carries `requiredUnits[]`; the
  `review → sign-off` transition has a `cel` gate asserting every required unit
  is in the draft's `coveredUnits` or listed as an `acceptedGap`. A silent
  omission cannot advance. This is the prose analogue of the output-correctness
  gate `docs/factory-method.md` names as the frontier.

## Use it

```
# 1. pull the dependencies (above)
# 2. inspect and specialise the seed definition
swamp model method run reviewed-document describe    # render the Mermaid
swamp model method run reviewed-document validate    # lint the definition

# 3. start a document
swamp model method run reviewed-document start --input workItem=DOC-1

# 4. drive the loop (see docs/factory-canon.md "Driving")
swamp model method run reviewed-document status --input workItem=DOC-1
```

Specialise by editing the `brief`/`document` schemas, the `requiredUnits`
coverage contract, and the lens set. Read `docs/factory-canon.md` for the grammar
and `docs/factory-method.md` for the opinionated method before you change gates.

## Layout

```
docs/
  factory-canon.md          how factories compose (explanation + grammar + patterns)
  factory-method.md         the opinionated method (laws, rigor ladder, build order)
models/@swamp/software-factory/
  <id>.yaml                 the seed reviewed-document factory
extensions/skills/kw-review-lenses/
  SKILL.md                  the review-lens wiring runbook
  references/               the three lenses + contract block
  manifest.yaml             publishes @atalanta/kw-review-lenses
constraints/
  drafting-conventions.md   author-side counterpart to the review lenses
```

## Polarity and known limitations

**Review transport is wired from `reviewer` + `adversary`.** Context-isolation,
not model-identity, makes review independent. Three tiers the assembler emits on
each review stage (a `dispatch` stage recording a `kind: findings` artifact):
- **external** — `reviewer: external` + a non-claude `adversary` (e.g. `codex`):
  a different model in a separate process via `@atalanta/external-reviewer`.
  Strongest. The `factory-builder` skill scaffolds the `@mgreten/cli-agent`
  reviewer instance on install.
- **dispatch-isolated** — `reviewer: external` + `adversary: claude`: a
  fresh-context Claude subagent, independent by context. No instance to scaffold.
- **same-context** — `reviewer: dispatch` or unset: the driver reviews inline.

Reversing tier later is a one-field edit.

## Publishing (maintainer note)

The adversarial-review report written before each `swamp extension push` covers
**all bundled surfaces, not just `meta_factory.ts`**: the report code, the bundled
`templates/factory-design.definition.yaml`, and the `factory-builder` skill. The
`.1` duplicate-`reports`-block bug shipped because an earlier review looked only at
the TS. Review the template (engine-validate it: install a throwaway instance from
it, `validate`, discard) and the skill (stale/contradictory guidance, unresolved
references) as part of the gate.

Known limitations:

- **Artifact/evidence names are global to a run.** Declare each once on its
  producing stage; re-record it in place on later stages, don't re-declare it.
  The assembler now fails loudly (`assembleDefinition` throws, the report returns
  `{error}`) if a design double-declares a name, rather than emitting a
  definition the engine rejects at `validate`.

- **Phase-6 consolidation is hand-shaped (deliberate).** The interview phases
  capture SUMMARIES (stage kinds/modes, artifact names + invariants, gate
  intents); at phase 6 the driver composes these into the full DesignRecord
  (attaching systemPrompts, field schemas, gate specs) by hand. This is the one
  non-mechanical step. It could be made a deterministic join by enriching the
  phase-artifact schemas to full DesignRecord granularity — but that turns the
  interview into structured form-filling, which is the opposite of the
  conversation it's meant to be. Decision: keep the phases conversational and the
  consolidation hand-shaped; the exact DesignRecord shape is documented in the
  `factory-builder` skill (phase 6), and the engine-`validate` at the confirm
  phase catches any error the hand-consolidation introduces before install. The
  tradeoff is a driver judgement step in exchange for a human-friendly interview.
