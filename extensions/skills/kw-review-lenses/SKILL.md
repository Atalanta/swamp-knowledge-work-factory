---
name: kw-review-lenses
description: >-
  Wire and run three adversarial knowledge-work (prose/document) review lenses —
  structure (mode purity, information architecture, one-piece-one-purpose),
  craft (claim traceability, completeness against a coverage contract, no
  fabrication), tone (terseness, voice, house writing standards) — in a
  @swamp/software-factory run. Use when authoring or driving a factory's
  document-review stage and these lenses are present: at author time, set the
  review stage up for the three lenses; at drive time, run each lens as an
  independent external reviewer via @atalanta/external-reviewer's
  external-review-findings workflow and record its findings. Also covers the
  same-context dispatch fallback when no external agent is configured.
---

# Knowledge-Work Review Lenses

Three adversarial document-review prompts, distilled from failure modes that
escape a *reads-fine* draft: a piece that quietly mixes modes, asserts facts
that trace to nothing, or drifts from the house voice. Run them as **three
separate passes** — one reviewer per lens — so structure, craft, and tone
concerns don't dilute each other.

| Lens | File | Obsession | Finding id prefix |
| --- | --- | --- | --- |
| A — Structure | `references/lens-a-structure.md` | Mode purity (Diátaxis), information architecture, one-piece-one-purpose, no orphaned sections | `STRUCT-` |
| B — Craft vs reality | `references/lens-b-craft.md` | Every claim traces to a source, completeness against the coverage contract, no fabrication, no unfilled gap silently passed | `CRAFT-` |
| C — Tone | `references/lens-c-tone.md` | Terseness, house voice, no hedging/throat-clearing/self-narration, per-mode register | `TONE-` |

A complete reviewer prompt is **one lens file + `references/contract-block.md`**
(the swamp/findings contract). The lens prose is transport-neutral; the contract
is what makes the output a recordable factory artifact. When two lenses conflict,
**craft (B) outranks tone (C)** — a true, complete, sourced piece in imperfect
voice beats a beautifully-voiced piece that fabricates or omits.

These lenses are the prose analogue of `@atalanta/ts-review-lenses`. They review
*documents*, not code. Use them in a knowledge-work factory's review stage; use
the ts lenses in a code factory's.

## When you are authoring a factory (set the review stage up for the lenses)

Trigger: you are filling a `@swamp/software-factory` definition's document-review
stage and these lenses are available.

```
Author checklist:
- [ ] The review stage is mode: dispatch with a kind: findings artifact
- [ ] The findings artifact schema matches references/contract-block.md
      (id, severity critical|high|medium|low, description, category?, resolved?, resolutionNote?)
- [ ] review uses lenses A+B+C
- [ ] The mechanical linter (e.g. @atalanta/vale-review) runs in a GATED stage
      BEFORE this one, so the reviewer never re-flags lint-catchable prose
- [ ] There is a coverage-contract input for lens B to check completeness against
      (the list of required units — sections, persona needs, claims to cover)
- [ ] Decide the transport: external reviewer (default) or dispatch fallback
- [ ] Note in the stage description that findings come from three per-lens passes
      with prefixes STRUCT-/CRAFT-/TONE-
- [ ] swamp model method run <factory> validate  → passes
```

Do **not** inline the lens prose into the factory YAML — keep it referenced from
these files so it stays versioned and editable in one place. The stage's job is
only to declare the findings artifact and its gates; the prompt is assembled at
drive time (below).

## When you are driving a review stage (run the lenses)

Trigger: a factory run has reached a document-review stage whose findings should
come from these lenses.

Run **one external-reviewer invocation per lens**, then record the merged
findings. Use the factory repo as `cwd` so the reviewer's `swamp data query`
reads the right datastore.

```
Drive checklist (repeat the invoke+record for each lens):
- [ ] record_dispatch on the factory stage (per the software-factory drive loop)
- [ ] Lens B (CRAFT-):   invoke → query invocation → resolve_findings
- [ ] Lens A (STRUCT-):  invoke → query invocation → resolve_findings
- [ ] Lens C (TONE-):    invoke → query invocation → resolve_findings
- [ ] Re-check factory status; advance when findings-clear passes
```

**Step 1 — invoke the lens.** Concatenate the lens file and the contract into the
`prompt` input (two `cat`s — the lens prose then the contract; do **not** `cat`
`using-with-external-reviewer.md`, which is explanation, not contract):

```bash
swamp workflow run @atalanta/external-reviewer/external-review-findings \
  --input factoryName=my-factory \
  --input workItem=DOC-42 \
  --input artifact=document-review \
  --input cwd=. \
  --input prompt="$(cat extensions/skills/kw-review-lenses/references/lens-b-craft.md
                    cat extensions/skills/kw-review-lenses/references/contract-block.md)"
```

**Step 2 — read the findings back.** `invokeAndParse` persists the parsed JSON on
the reviewer model's `invocation` resource. Project just the findings array (no
`--json`, no pipe — the CEL projection prints the value directly):

```bash
swamp data query 'modelName == "external-reviewer" && specName == "invocation" && attributes.tags.workItem == "DOC-42" && attributes.tags.artifact == "document-review"' --select attributes.parsedResponse.findings
```

The result is a small array of `{id, severity, category?, description, resolved}`
— the contract caps each `description` and forbids extra fields, so it is KB-scale,
not tens of KB. If it comes back large or with `heading`/`passage`/`note` keys,
the reviewer ignored the contract: re-run the lens, do not try to record the
bloated output.

**Step 3 — record on the factory.** Pass that findings array straight to
`record_artifact` as the literal payload (first recording) or `resolve_findings`
(subsequent). It is small enough to be a normal `--input` argument — do NOT pipe
or redirect the query into a file:

```bash
swamp model method run <factory> record_artifact --input workItem=DOC-42 --input name=document-review --input payload='{"findings":[ <the array from Step 2> ]}'
```

Merge the three lenses' arrays into one `findings` array before recording (or
record one lens then `resolve_findings`-merge the others). The
`STRUCT-`/`CRAFT-`/`TONE-` prefixes keep the passes' ids from colliding when the
`findings-clear` gate evaluates them.

**Step 4 — repeat** for the remaining lenses, then advance the factory once
`findings-clear` is satisfied.

If the reviewer returns `ok: false` or empty `findings`, do not re-dispatch
blindly — read the invocation's `outputPreview` / transcript for why (auth,
provider, malformed JSON) per the software-factory dispatch guard.

## Fallback: same-context dispatch (no external agent)

If no external reviewer is configured, run the review stage as vanilla
`mode: dispatch` with one subagent per lens: each subagent's `systemPrompt` is
the lens file + `references/contract-block.md`, and it reviews the draft from its
own context instead of via `swamp data query`. Merge into one `kind: findings`
artifact with the same id prefixes. This shares the author's model family, so it
is review but not *independent* review — prefer the external path when both are
available.

## References

- [references/lens-a-structure.md](references/lens-a-structure.md) — Lens A prompt
- [references/lens-b-craft.md](references/lens-b-craft.md) — Lens B prompt
- [references/lens-c-tone.md](references/lens-c-tone.md) — Lens C prompt
- [references/contract-block.md](references/contract-block.md) — paste-clean swamp/findings contract appended to a lens at run time
- [references/using-with-external-reviewer.md](references/using-with-external-reviewer.md) — how the lens + contract become a prompt (explanation, not for `cat`)

Lens A uses Diátaxis vocabulary; if your house model of document types differs,
adapt A and keep B/C. B and C are domain-portable across any prose factory.
