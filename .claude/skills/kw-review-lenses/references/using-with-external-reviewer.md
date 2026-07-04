# Using the lenses with the external reviewer

This is the human-facing explanation of how a lens becomes a complete reviewer
prompt. **The text that actually goes into the prompt is
[`contract-block.md`](contract-block.md)** — this file explains it; that file is
the paste-clean source of truth. Keep edits to the contract in `contract-block.md`
so the two never diverge.

## The shape of a complete reviewer prompt

```
complete prompt  =  <one lens file>  +  contract-block.md
```

- **Lens file** (`lens-a-structure.md`, `lens-b-craft.md`, or
  `lens-c-tone.md`) — transport-neutral review *prose*: the adversarial stance
  and what to hunt for. It deliberately says nothing about swamp, findings JSON,
  or id prefixes, so the same prose serves both external review and same-context
  dispatch.
- **`contract-block.md`** — the machine-facing *contract*: read the work products
  from swamp, apply the lens adversarially, return ONLY findings JSON matching the
  factory's `kind: findings` schema, use the lens's stable id prefix, and verify
  prior resolutions on re-review.

The split exists so the lens prose stays reusable across transports and the
swamp/findings contract lives in exactly one place.

## How the bridge consumes it

The workflow `@atalanta/external-reviewer/external-review-findings` runs an
independent CLI agent (codex, claude, gemini, …) as the reviewer and persists its
parsed output as `parsedResponse` on the reviewer model's `invocation` resource,
tagged `{factory, workItem, artifact}`. The reviewer never shares the author's
context: it reads the document under review **from swamp itself**, in the trusted
`cwd`, and returns findings JSON.

Concatenate the lens and the contract at run time (see SKILL.md for the exact
two-`cat` invocation) — do **not** `cat` *this* file into a prompt; it is
explanation, not contract.

## Per-lens id prefixes

Run one invocation per lens so the three passes stay distinct, and use the lens's
stable finding-id prefix so they don't collide when the factory's `findings-clear`
gate evaluates them:

| Lens | File | Prefix |
| --- | --- | --- |
| A — Structure | `lens-a-structure.md` | `STRUCT-` |
| B — Craft vs reality | `lens-b-craft.md` | `CRAFT-` |
| C — Tone | `lens-c-tone.md` | `TONE-` |

`contract-block.md` carries the general id/severity rules; state the specific
prefix for the lens you are running when you assemble the prompt (or instruct the
reviewer which prefix to use).

## Ordering: run the mechanical layer first

These lenses assume a deterministic prose linter (e.g. `@atalanta/vale-review`)
has already run in an earlier gated stage. The tone lens (C) explicitly does not
re-flag what a linter catches — banned words, passive voice, spelling. Running the
linter first keeps the expensive reviewer focused on what only judgement can see:
mode mixing, unsourced claims, silent gaps, register. If no linter stage exists,
lens C absorbs more low-level tone work and its findings will be noisier.
