# @atalanta/kw-review-lenses

Three adversarial knowledge-work review prompts ("lenses") for feeding to an
**independent reviewer** in a [`@swamp/software-factory`](https://swamp-club.com)
run. The prose analogue of
[`@atalanta/ts-review-lenses`](https://github.com/Atalanta/swamp-ts-review-lenses)
— these review **documents**, not code.

> Run them as **three separate passes**. Mixing "does it read well" with "is it
> true and complete" dilutes both.

| Lens | Obsession | Finding ids |
| --- | --- | --- |
| **A — Structure** | Mode purity (Diátaxis), information architecture, one-piece-one-purpose, no orphaned sections | `STRUCT-` |
| **B — Craft vs reality** | Every claim traces to a source, completeness against a coverage contract, no fabrication, no silently-passed gap | `CRAFT-` |
| **C — Tone** | Terseness, house voice, no hedging/throat-clearing/self-narration, register per mode | `TONE-` |

**Ranking when lenses conflict:** craft-against-reality (B) beats tone (C). A
true, complete, sourced document in plain voice beats a polished one that
fabricates or omits.

## What this ships

A single `kw-review-lenses` **skill** bundle:

| File | What it is |
| --- | --- |
| `references/lens-a-structure.md` | Lens A review prose (transport-neutral) |
| `references/lens-b-craft.md` | Lens B review prose |
| `references/lens-c-tone.md` | Lens C review prose |
| `references/contract-block.md` | The machine-facing contract (read from swamp, emit findings JSON, id prefixes, re-review) appended to a lens at run time |
| `references/using-with-external-reviewer.md` | How lens + contract become a prompt (explanation, not for `cat`) |
| `SKILL.md` | The wiring runbook |

## Use

```
swamp extension pull @atalanta/kw-review-lenses
# then invoke the bundled `kw-review-lenses` skill
```

A complete reviewer prompt is `<one lens file> + references/contract-block.md`.
Run one external-reviewer invocation per lens (via
`@atalanta/external-reviewer`), or fall back to same-context `mode: dispatch`
with one subagent per lens. Run a deterministic prose linter (e.g.
`@atalanta/vale-review`) in a gated stage *before* review, so the reviewer never
re-flags lint-catchable prose.

The lens prose is transport-neutral; the swamp + findings-JSON contract is
appended at run time. Lens A uses Diátaxis vocabulary — adapt it if your house
document model differs; B and C are domain-portable across any prose factory.
