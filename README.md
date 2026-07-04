# swamp-knowledge-work-factory

A repeatable, extensible way to run **knowledge work** — writing, documentation,
decision records, research briefs — through a `@swamp/software-factory` with the
same rigor a code factory gets: staged flow, mechanical linting, external
adversarial review, and a human sign-off the driver cannot self-satisfy.

It ships three things:

1. **A seed factory definition** — `models/@swamp/software-factory/` — a generic
   *reviewed-document* flow you instantiate and specialise. Not a domain factory;
   a teaching template.
2. **The `kw-review-lenses` skill** — `extensions/skills/kw-review-lenses/` — the
   prose analogue of `@atalanta/ts-review-lenses`: structure / craft / tone
   review lenses for documents, publishable as `@atalanta/kw-review-lenses`.
3. **The canon and the method** — `docs/` — how factories compose (the grammar)
   and how to build a rigorous one (the opinionated method).

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

## Dependencies (pull, don't vendor)

| Extension | Role |
| --- | --- |
| `@swamp/software-factory` | the engine (the model type this factory instantiates) |
| `@atalanta/external-reviewer` | the polarity-reversal review workflow (Claude drives, an external agent judges) |
| `@atalanta/vale-review` | the deterministic prose linter for the gated `lint` stage |
| `@mgreten/cli-agent` | the external reviewer model type |
| `@atalanta/kw-review-lenses` | the STRUCT/CRAFT/TONE prose lenses (shipped from this repo) |

```
swamp extension pull @swamp/software-factory
swamp extension pull @atalanta/external-reviewer
swamp extension pull @atalanta/vale-review
swamp extension pull @atalanta/kw-review-lenses
```

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
