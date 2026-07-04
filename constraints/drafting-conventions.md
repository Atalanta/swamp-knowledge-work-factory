# Drafting conventions

Constraints the drafting stage follows when producing or revising the document.
These are the author-side counterpart to the review lenses: write to avoid the
findings the lenses hunt for.

## Mode purity

Write in exactly the `docType` the brief declares, and keep every section in that
mode:

- **reference** — austere, neutral, mirrors the machinery's structure. State what
  is; do not teach, persuade, or narrate.
- **explanation** — discursive, connected prose; answer *why*; make connections.
- **how-to** — goal-titled recipe, imperative, the user's perspective; the *why*
  is linked, not inlined.
- **tutorial** — "we", a visible result at every step, no assumed prior knowledge.

If content wants to be a different mode, it belongs in a different document —
link to it, don't smuggle it in. (Lens A / `STRUCT-` catches mode mixing.)

## Claim tracing

Every factual assertion must trace to a source — a claim id, a cited document, a
code anchor, an interview. Do not assert a number, behaviour, limit, or cause you
cannot source. If something is inferred rather than sourced, say so; do not
present inference as fact. (Lens B / `CRAFT-` treats an unsourced or
source-unsupported claim as a finding.)

## Coverage contract

The brief lists `requiredUnits`. Record, in the document artifact's
`coveredUnits`, every unit this draft covers. If you deliberately do not cover a
required unit, put it in `acceptedGaps` with a reason — never leave it silently
absent. The `review → sign-off` gate refuses to advance while a required unit is
neither covered nor an accepted gap. (Lens B and the coverage CEL gate both check
this.)

## Voice

Terse. Cut any sentence that only introduces the next one. No hedging as filler,
no self-narration, no punchline flourishes. Match register to mode (reference is
austere; tutorial holds a hand). Assume a deterministic linter (Vale) runs before
review — but write clean anyway; the linter is a backstop, not a crutch. (Lens C
/ `TONE-` catches voice drift; the lint stage catches mechanical issues.)

## One piece, one purpose

A section answers one question. If it answers two, split it. If nothing links to
it, either link it or cut it. Predict each section's content in its heading so the
document is skimmable.
