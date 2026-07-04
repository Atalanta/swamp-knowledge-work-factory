/**
 * Tests for the pure assembler transform — the intent->grammar ruleset
 * (expandGates), the design-record -> definition-object projection
 * (assembleDefinition), and the gate count (countGates). These run without any
 * swamp runtime; the report's execute() shell (guard + repository read + the
 * {error} failure shapes) is exercised in-swamp against the factory-design
 * interview, not here.
 */
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assembleDefinition,
  assertCoherentPolarity,
  assertDrivableGraph,
  assertUniqueDeclarations,
  countGates,
  type DesignRecord,
  DesignRecordSchema,
  expandGates,
} from "./meta_factory.ts";

Deno.test("expandGates: review-clear expands to fresh + findings-clear", () => {
  const gates = expandGates({ intent: "review-clear", artifact: "document-review" });
  assertEquals(gates, [
    { type: "artifact-fresh", config: { artifact: "document-review", recordedThisCycle: true } },
    { type: "findings-clear", config: { artifact: "document-review", blocking: ["critical", "high"] } },
  ]);
});

Deno.test("expandGates: human-approval carries the id", () => {
  assertEquals(expandGates({ intent: "human-approval", id: "sign-off" }), [
    { type: "human-approval", config: { id: "sign-off" } },
  ]);
});

Deno.test("expandGates: coverage-contract builds the CEL all-macro with defaults", () => {
  const [gate] = expandGates({ intent: "coverage-contract" });
  assertEquals(gate.type, "cel");
  const cfg = gate.config as { expr: string };
  assertEquals(
    cfg.expr,
    "evidence.brief.requiredUnits.all(u, artifacts.document.coveredUnits.exists(c, c == u) || artifacts.document.acceptedGaps.exists(g, g.unit == u))",
  );
});

Deno.test("expandGates: raw passthrough is verbatim", () => {
  const raw = { type: "cooldown", config: { afterEvidence: "release", seconds: 180 } };
  assertEquals(expandGates({ raw }), [raw]);
});

Deno.test("expandGates: unknown intent throws (no silent skip)", () => {
  // deno-lint-ignore no-explicit-any
  assertThrows(() => expandGates({ intent: "nonsense" } as any), Error, "unknown gate intent");
});

Deno.test("expandGates: intent missing its required param throws", () => {
  assertThrows(() => expandGates({ intent: "review-clear" }), Error, "requires `artifact`");
});

Deno.test("expandGates: workflow-ok expands to workflow-succeeded", () => {
  assertEquals(expandGates({ intent: "workflow-ok", workflow: "@acme/test-suite" }), [
    { type: "workflow-succeeded", config: { workflow: "@acme/test-suite" } },
  ]);
});

Deno.test("expandGates: test-failed expands to evidence-recorded with status=failed", () => {
  assertEquals(expandGates({ intent: "test-failed", evidence: "test-run" }), [
    { type: "evidence-recorded", config: { name: "test-run", requireField: { status: "failed" } } },
  ]);
});

Deno.test("expandGates: workflow-ok / test-failed missing their param throw", () => {
  assertThrows(() => expandGates({ intent: "workflow-ok" }), Error, "requires `workflow`");
  assertThrows(() => expandGates({ intent: "test-failed" }), Error, "requires `evidence`");
});

Deno.test("assembleDefinition: throws on a malformed gate (report.execute catches this)", () => {
  // A design whose transition names an intent but omits its required field. The
  // report's execute() wraps assembleDefinition in try/catch and returns an
  // {error} json; here we assert the underlying transform fails loudly.
  const bad = DesignRecordSchema.parse({
    factoryName: "bad",
    stages: [
      {
        id: "a",
        initial: true,
        workMode: "interactive",
        // review-clear with no `artifact` — expandGates must throw
        transitions: [{ name: "go", to: "done", gates: [{ intent: "review-clear" }] }],
      },
      { id: "done", terminal: true },
    ],
  });
  assertThrows(() => assembleDefinition(bad), Error, "requires `artifact`");
});

/** A design record equivalent to the reviewed-document seed factory. */
const REVIEWED_DOCUMENT: DesignRecord = DesignRecordSchema.parse({
  factoryName: "reviewed-document",
  stages: [
    {
      id: "brief",
      initial: true,
      workMode: "interactive",
      evidence: [{
        name: "brief",
        fields: [
          { name: "docType", type: "string", required: true, enum: ["tutorial", "how-to", "reference", "explanation"] },
          { name: "audience", type: "string", required: true, minLength: 1 },
          { name: "requiredUnits", type: "array", required: true, minItems: 1, itemsType: "string" },
        ],
      }],
      transitions: [{ name: "start-drafting", to: "drafting", gates: [{ intent: "evidence-present", evidence: "brief" }] }],
    },
    {
      id: "drafting",
      workMode: "interactive",
      skills: ["kw-review-lenses"],
      constraints: "constraints/drafting-conventions.md",
      artifacts: [{
        name: "document",
        kind: "regular",
        fields: [
          { name: "title", type: "string", required: true, minLength: 1 },
          { name: "body", type: "string", required: true, minLength: 1 },
          { name: "coveredUnits", type: "array", itemsType: "string" },
        ],
      }],
      transitions: [{ name: "submit", to: "review", gates: [{ intent: "artifact-present", artifact: "document" }] }],
    },
    {
      id: "review",
      workMode: "dispatch",
      skills: ["kw-review-lenses"],
      systemPrompt: "Run three external-reviewer passes: structure, craft, tone.",
      artifacts: [{ name: "document-review", kind: "findings", reviews: "document" }],
      transitions: [
        {
          name: "accept",
          to: "sign-off",
          gates: [
            { intent: "review-clear", artifact: "document-review" },
            { intent: "coverage-contract" },
          ],
        },
        { name: "rework", to: "drafting" },
      ],
    },
    {
      id: "sign-off",
      workMode: "interactive",
      transitions: [
        { name: "ship", to: "done", manual: true, gates: [{ intent: "human-approval", id: "sign-off" }] },
        { name: "send-back", to: "drafting" },
      ],
    },
    { id: "done", terminal: true },
    { id: "aborted", terminal: true },
  ],
  globalTransitions: [
    { name: "abort", to: "aborted", gates: [{ intent: "human-approval", id: "abort-confirmation" }] },
  ],
});

Deno.test("assembleDefinition: scopes the summary report by default", () => {
  const def = assembleDefinition(REVIEWED_DOCUMENT) as {
    reports: { require: Array<{ name: string; methods: string[] }> };
  };
  assertEquals(def.reports.require[0].methods, ["summary"]);
});

Deno.test("assembleDefinition: renders the review stage's expanded gate stack", () => {
  const def = assembleDefinition(REVIEWED_DOCUMENT) as {
    globalArguments: { stages: Array<Record<string, unknown>> };
  };
  const review = def.globalArguments.stages.find((s) => s.id === "review") as {
    transitions: Array<{ name: string; gates: Array<{ type: string }> }>;
  };
  const accept = review.transitions.find((t) => t.name === "accept")!;
  // review-clear -> 2 gates, coverage-contract -> 1 gate = 3
  assertEquals(accept.gates.map((g) => g.type), ["artifact-fresh", "findings-clear", "cel"]);
});

Deno.test("assembleDefinition: produces a well-formed SF definition object", () => {
  const def = assembleDefinition(REVIEWED_DOCUMENT) as {
    globalArguments: { stages: Array<Record<string, unknown>>; globalTransitions: unknown[] };
  };
  const stages = def.globalArguments.stages;
  // exactly one initial, at least one terminal
  assertEquals(stages.filter((s) => s.initial === true).length, 1);
  assertEquals(stages.filter((s) => s.terminal === true).length >= 1, true);
  // the brief evidence schema is a type:object with the three required fields
  const brief = stages.find((s) => s.id === "brief") as {
    evidence: Array<{ name: string; schema: { type: string; required: string[] } }>;
  };
  assertEquals(brief.evidence[0].schema.type, "object");
  assertEquals(brief.evidence[0].schema.required, ["docType", "audience", "requiredUnits"]);
  // the findings artifact carries kind + reviews, no schema
  const review = stages.find((s) => s.id === "review") as {
    artifacts: Array<{ name: string; kind: string; reviews: string; schema?: unknown }>;
  };
  assertEquals(review.artifacts[0].kind, "findings");
  assertEquals(review.artifacts[0].reviews, "document");
  assertEquals(review.artifacts[0].schema, undefined);
});

Deno.test("countGates: counts expanded gates across stages + globals", () => {
  // review.accept: review-clear(2) + coverage-contract(1) = 3; other transitions
  // 1 each: start-drafting(1) + submit(1) + ship(1) + rework/send-back(0) +
  // global abort(1) = 3 + 1 + 1 + 1 + 1 = 7
  assertEquals(countGates(REVIEWED_DOCUMENT), 7);
});

/** Build a minimal design with one dispatch+findings review stage. */
function reviewDesign(
  adversary: string | undefined,
): DesignRecord {
  return DesignRecordSchema.parse({
    factoryName: "rev",
    adversary,
    stages: [
      {
        id: "draft",
        initial: true,
        workMode: "interactive",
        artifacts: [{ name: "doc", kind: "regular", fields: [{ name: "body", type: "string", required: true }] }],
        transitions: [{ name: "submit", to: "review", gates: [{ intent: "artifact-present", artifact: "doc" }] }],
      },
      {
        id: "review",
        workMode: "dispatch",
        systemPrompt: "Review the doc.",
        artifacts: [{ name: "doc-review", kind: "findings", reviews: "doc" }],
        transitions: [
          { name: "accept", to: "done", gates: [{ intent: "review-clear", artifact: "doc-review" }] },
          { name: "rework", to: "draft" },
        ],
      },
      { id: "done", terminal: true },
    ],
  });
}

Deno.test("renderStage: external adversary wires the review stage to external-reviewer", () => {
  const def = assembleDefinition(reviewDesign("codex")) as {
    globalArguments: { stages: Array<{ id: string; work?: { systemPrompt?: string } }> };
  };
  const review = def.globalArguments.stages.find((s) => s.id === "review")!;
  const prompt = review.work!.systemPrompt!;
  // keeps the author's prompt AND appends the external-reviewer instruction
  assertEquals(prompt.includes("Review the doc."), true);
  assertEquals(prompt.includes("external-review-findings"), true);
  assertEquals(prompt.includes("adversary = codex"), true);
});

Deno.test("renderStage: claude adversary leaves the review stage same-context", () => {
  const def = assembleDefinition(reviewDesign("claude")) as {
    globalArguments: { stages: Array<{ id: string; work?: { systemPrompt?: string } }> };
  };
  const review = def.globalArguments.stages.find((s) => s.id === "review")!;
  // author prompt unchanged, no external-reviewer instruction
  assertEquals(review.work!.systemPrompt, "Review the doc.");
});

Deno.test("renderStage: no adversary set leaves the review stage same-context", () => {
  const def = assembleDefinition(reviewDesign(undefined)) as {
    globalArguments: { stages: Array<{ id: string; work?: { systemPrompt?: string } }> };
  };
  const review = def.globalArguments.stages.find((s) => s.id === "review")!;
  assertEquals(review.work!.systemPrompt, "Review the doc.");
});

Deno.test("renderStage: reviewer external + adversary claude wires dispatch-isolated (not an error)", () => {
  // Same model, fresh-context subagent — independent by context. Valid, not a throw.
  const design = DesignRecordSchema.parse({
    ...reviewDesign("claude"),
    reviewer: "external",
  });
  const def = assembleDefinition(design) as {
    globalArguments: { stages: Array<{ id: string; work?: { systemPrompt?: string } }> };
  };
  const review = def.globalArguments.stages.find((s) => s.id === "review")!;
  const prompt = review.work!.systemPrompt!;
  assertEquals(prompt.includes("Review the doc."), true);
  assertEquals(prompt.includes("ISOLATED REVIEW"), true);
  assertEquals(prompt.includes("fresh-context subagent"), true);
  // not the external-bridge instruction
  assertEquals(prompt.includes("external-review-findings"), false);
});

Deno.test("assertCoherentPolarity: external adversary with no dispatch+findings review stage throws", () => {
  const bad = DesignRecordSchema.parse({
    factoryName: "rev",
    adversary: "codex",
    stages: [
      {
        id: "draft",
        initial: true,
        workMode: "interactive",
        artifacts: [{ name: "doc", kind: "regular", fields: [{ name: "body", type: "string", required: true }] }],
        transitions: [{ name: "submit", to: "review", gates: [{ intent: "artifact-present", artifact: "doc" }] }],
      },
      {
        // authored as workflow, not dispatch — NOT recognised as a review stage
        id: "review",
        workMode: "workflow",
        artifacts: [{ name: "doc-review", kind: "findings", reviews: "doc" }],
        transitions: [{ name: "accept", to: "done" }],
      },
      { id: "done", terminal: true },
    ],
  });
  assertThrows(() => assembleDefinition(bad), Error, "no stage is a review stage");
});

Deno.test("assertCoherentPolarity: coherent external design passes", () => {
  // codex adversary + a dispatch+findings review stage: assembles fine.
  assertCoherentPolarity(reviewDesign("codex"));
  const def = assembleDefinition(reviewDesign("codex")) as {
    globalArguments: { stages: Array<Record<string, unknown>> };
  };
  assertEquals(def.globalArguments.stages.length, 3);
});

Deno.test("renderStage: a review stage defaults maxCycles higher than the engine's 5", () => {
  const def = assembleDefinition(reviewDesign("codex")) as {
    globalArguments: { stages: Array<{ id: string; maxCycles?: number }> };
  };
  const review = def.globalArguments.stages.find((s) => s.id === "review")!;
  assertEquals(review.maxCycles, 10);
  // a non-review stage gets no injected maxCycles (engine default applies)
  const draft = def.globalArguments.stages.find((s) => s.id === "draft")!;
  assertEquals(draft.maxCycles, undefined);
});

Deno.test("renderStage: a pure human-approval stage gets no work block (no dispatch footgun)", () => {
  const design = DesignRecordSchema.parse({
    factoryName: "signoff",
    stages: [
      {
        id: "draft",
        initial: true,
        workMode: "interactive",
        artifacts: [{ name: "doc", kind: "regular", fields: [{ name: "body", type: "string", required: true }] }],
        transitions: [{ name: "submit", to: "sign-off", gates: [{ intent: "artifact-present", artifact: "doc" }] }],
      },
      {
        // records nothing — just the human approving. Should emit no `work`.
        id: "sign-off",
        workMode: "interactive",
        transitions: [
          { name: "ship", to: "done", manual: true, gates: [{ intent: "human-approval", id: "sign-off" }] },
          { name: "send-back", to: "draft" },
        ],
      },
      { id: "done", terminal: true },
    ],
  });
  const def = assembleDefinition(design) as {
    globalArguments: { stages: Array<{ id: string; work?: unknown }> };
  };
  const signoff = def.globalArguments.stages.find((s) => s.id === "sign-off")!;
  assertEquals(signoff.work, undefined);
  // a producing stage still has its work block
  const draft = def.globalArguments.stages.find((s) => s.id === "draft")!;
  assertEquals((draft.work as { mode?: string }).mode, "interactive");
});

Deno.test("renderStage: an explicit maxCycles on a review stage is honoured", () => {
  const design = DesignRecordSchema.parse({
    ...reviewDesign("codex"),
    stages: reviewDesign("codex").stages.map((s) =>
      s.id === "review" ? { ...s, maxCycles: 3 } : s
    ),
  });
  const def = assembleDefinition(design) as {
    globalArguments: { stages: Array<{ id: string; maxCycles?: number }> };
  };
  assertEquals(def.globalArguments.stages.find((s) => s.id === "review")!.maxCycles, 3);
});

Deno.test("assertDrivableGraph: reviewDesign's rework-returns-to-producer topology passes", () => {
  // review reviews `doc` (produced by draft) and loops rework -> draft. Fine.
  assertDrivableGraph(reviewDesign("codex"));
});

Deno.test("assertDrivableGraph: rework not reaching the subject's producer throws", () => {
  // The classic mis-design: `notes` is produced by `draft`, review reviews it,
  // but the review's only non-accept edge routes to `address` — which does NOT
  // declare `notes` and cannot reach `draft`. The rework loop dead-ends.
  const bad = DesignRecordSchema.parse({
    factoryName: "misdesign",
    stages: [
      {
        id: "intake",
        initial: true,
        workMode: "interactive",
        artifacts: [{ name: "notes", kind: "regular", fields: [{ name: "body", type: "string", required: true }] }],
        transitions: [{ name: "submit", to: "review", gates: [{ intent: "artifact-present", artifact: "notes" }] }],
      },
      {
        id: "review",
        workMode: "dispatch",
        artifacts: [{ name: "notes-review", kind: "findings", reviews: "notes" }],
        transitions: [
          { name: "accept", to: "done", gates: [{ intent: "review-clear", artifact: "notes-review" }] },
          { name: "rework", to: "address" }, // address can't re-record notes, can't reach intake
        ],
      },
      {
        id: "address",
        workMode: "interactive",
        // deliberately does NOT declare notes, and only loops back to review
        transitions: [{ name: "back", to: "review" }],
      },
      { id: "done", terminal: true },
    ],
  });
  assertThrows(() => assembleDefinition(bad), Error, "is not reachable from");
});

Deno.test("assertDrivableGraph: a gate on an undeclared artifact throws", () => {
  const bad = DesignRecordSchema.parse({
    factoryName: "dangling",
    stages: [
      {
        id: "a",
        initial: true,
        workMode: "interactive",
        // gate references `ghost`, which no stage declares
        transitions: [{ name: "go", to: "done", gates: [{ intent: "artifact-present", artifact: "ghost" }] }],
      },
      { id: "done", terminal: true },
    ],
  });
  assertThrows(() => assembleDefinition(bad), Error, 'gates on "ghost"');
});

Deno.test("assertUniqueDeclarations: passes a well-formed design", () => {
  // REVIEWED_DOCUMENT declares each artifact/evidence once — no throw.
  assertUniqueDeclarations(REVIEWED_DOCUMENT);
});

Deno.test("assembleDefinition: throws when an artifact is declared on two stages", () => {
  // The target engine requires artifact names global to a run. A design that
  // declares `draft` on both an intake and a revise stage must fail loudly here,
  // not assemble to a definition the engine rejects at validate.
  const doubled = DesignRecordSchema.parse({
    factoryName: "doubled",
    stages: [
      {
        id: "intake",
        initial: true,
        workMode: "interactive",
        artifacts: [{ name: "draft", kind: "regular", fields: [{ name: "body", type: "string", required: true }] }],
        transitions: [{ name: "next", to: "revise", gates: [{ intent: "artifact-present", artifact: "draft" }] }],
      },
      {
        id: "revise",
        workMode: "interactive",
        // WRONG: re-declares `draft` instead of re-recording it in place
        artifacts: [{ name: "draft", kind: "regular", fields: [{ name: "body", type: "string", required: true }] }],
        transitions: [{ name: "done", to: "done", gates: [{ intent: "artifact-present", artifact: "draft" }] }],
      },
      { id: "done", terminal: true },
    ],
  });
  assertThrows(
    () => assembleDefinition(doubled),
    Error,
    'artifact "draft" is declared on both stage "intake" and stage "revise"',
  );
});
