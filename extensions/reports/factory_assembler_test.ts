/**
 * Tests for the pure assembler transform. These exercise the intent->grammar
 * ruleset (expandGates) and the full design-record -> YAML projection without
 * any swamp runtime, then re-parse the YAML to assert it is the shape the
 * software-factory grammar expects.
 */
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  assembleDefinition,
  countGates,
  type DesignRecord,
  DesignRecordSchema,
  expandGates,
} from "./factory_assembler.ts";

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
