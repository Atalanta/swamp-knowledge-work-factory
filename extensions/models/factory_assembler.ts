/**
 * Deterministically assemble a `@swamp/software-factory` definition from the
 * design record produced by the `factory-design` interview factory.
 *
 * The interview (a `@swamp/software-factory` run driven by the `factory-builder`
 * skill) persists five strict, schema-validated design artifacts — domain,
 * stages, artifacts, adversary/lenses, gates. This model reads those records and
 * renders the target factory's `globalArguments` (stages + globalTransitions) as
 * YAML. It is a PURE PROJECTION: no LLM, no judgement. The same design record
 * always produces the same factory YAML — the non-deterministic work happened in
 * the interview and is captured as evidence; assembly is a function of it.
 *
 * Fidelity is HYBRID (the design decision): common patterns are captured as
 * intent in the design artifacts and expanded here by rule (a review stage's
 * fresh + findings-clear + human-approval stack; a coverage-contract cel gate; a
 * human sign-off), while uncommon needs are captured as raw gate-type+config and
 * passed straight through. `expandGates` is the whole intent->grammar ruleset;
 * it is the one opinionated surface and is unit-testable in isolation.
 *
 * Output is a FILE artifact (text/yaml) in the datastore — evidence, versioned
 * and auditable. Installing it as a live git-tracked definition
 * (`models/@swamp/software-factory/<uuid>.yaml`) is a separate, explicit step,
 * preserving swamp's source/runtime split: a model writes data, not source.
 *
 * @module
 */
import { z } from "npm:zod@4";
import { stringify as stringifyYaml } from "npm:yaml@2.6.1";

// ---------------------------------------------------------------------------
// Design-record shapes — the structured mirror of the interview's artifacts.
// These are what `queryData` returns from the interview factory's
// artifact-<session>-<name> payloads. They are the assembler's input contract;
// the interview factory's artifact schemas MUST produce these shapes.
// ---------------------------------------------------------------------------

/** The work mode of a target stage (SF grammar). */
const WorkModeEnum = z.enum(["interactive", "dispatch", "workflow", "method"]);

/** A field in a target artifact's schema (a usable subset of the SF schema subset). */
const SchemaFieldSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["string", "array", "object", "number", "integer", "boolean"]),
  required: z.boolean().default(false),
  minLength: z.number().int().positive().optional(),
  minItems: z.number().int().nonnegative().optional(),
  enum: z.array(z.string()).optional(),
  itemsType: z.enum(["string", "object"]).optional(),
  description: z.string().optional(),
});

/** A target artifact declared on a stage. */
const TargetArtifactSchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["regular", "findings"]).default("regular"),
  reviews: z.string().optional(), // subject link, for findings/fresh
  fields: z.array(SchemaFieldSchema).default([]),
});

/** A target evidence record declared on a stage. */
const TargetEvidenceSchema = z.object({
  name: z.string().min(1),
  fields: z.array(SchemaFieldSchema).default([]),
});

/**
 * A gate on a transition. Either an INTENT (expanded by rule) or RAW (passed
 * through). Exactly one of `intent` / `raw` is set.
 */
const GateSpecSchema = z.object({
  intent: z.enum([
    "review-clear", // fresh(recordedThisCycle) + findings-clear[critical,high]
    "human-approval", // human-approval gate (config.id from `id`)
    "coverage-contract", // cel: every required unit covered or accepted-gap
    "artifact-present", // artifact-exists
    "evidence-present", // evidence-recorded (optional requireField)
    "workflow-ok", // workflow-succeeded
    "test-failed", // evidence-recorded requireField status=failed (fail edge)
  ]).optional(),
  // intent parameters (only those the intent uses)
  artifact: z.string().optional(),
  evidence: z.string().optional(),
  id: z.string().optional(),
  workflow: z.string().optional(),
  requiredUnitsPath: z.string().optional(), // for coverage-contract
  coveredUnitsPath: z.string().optional(),
  acceptedGapsPath: z.string().optional(),
  // RAW passthrough: a literal SF gate. When set, `intent` is ignored.
  raw: z.object({
    type: z.string(),
    config: z.record(z.string(), z.unknown()).default({}),
  }).optional(),
});

/** A transition out of a stage. */
const TransitionSpecSchema = z.object({
  name: z.string().min(1),
  to: z.string().min(1),
  manual: z.boolean().default(false),
  gates: z.array(GateSpecSchema).default([]),
});

/** A target stage. */
const StageSpecSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  initial: z.boolean().default(false),
  terminal: z.boolean().default(false),
  workMode: WorkModeEnum.optional(), // absent on terminal stages
  skills: z.array(z.string()).default([]),
  systemPrompt: z.string().optional(),
  constraints: z.string().optional(),
  maxCycles: z.number().int().positive().optional(),
  artifacts: z.array(TargetArtifactSchema).default([]),
  evidence: z.array(TargetEvidenceSchema).default([]),
  transitions: z.array(TransitionSpecSchema).default([]),
});

/** A global (escape-hatch) transition. */
const GlobalTransitionSpecSchema = z.object({
  name: z.string().min(1),
  to: z.string().min(1),
  gates: z.array(GateSpecSchema).default([]),
});

/**
 * The full design record the assembler consumes. Assembled from the interview's
 * per-phase artifacts (domain/stages/artifacts/adversary/gates) into one object
 * before `build` renders it. `factoryName` names the target factory instance.
 */
export const DesignRecordSchema = z.object({
  factoryName: z.string().min(1),
  description: z.string().optional(),
  stages: z.array(StageSpecSchema).min(1),
  globalTransitions: z.array(GlobalTransitionSpecSchema).default([]),
  // Whether to scope the work-item-summary report (recommended default true).
  scopeSummaryReport: z.boolean().default(true),
  // Polarity — who authors vs who adversarially reviews. The factory YAML is
  // polarity-neutral (it names a reviewer INSTANCE, not a provider), so these
  // do not affect the rendered definition. They are carried through as evidence
  // of the intended polarity and drive how the builder scaffolds the
  // external-reviewer instance (defaultProvider = adversary). Reversing later is
  // a one-field edit on that instance, not a re-assembly.
  author: z.enum(["claude", "codex", "gemini", "opencode", "amp"]).optional(),
  adversary: z.enum(["claude", "codex", "gemini", "opencode", "amp"]).optional(),
  adversaryModel: z.string().optional(),
});

export type DesignRecord = z.infer<typeof DesignRecordSchema>;
type SchemaField = z.infer<typeof SchemaFieldSchema>;
type GateSpec = z.infer<typeof GateSpecSchema>;

// ---------------------------------------------------------------------------
// Pure projection: design record -> SF globalArguments object.
// ---------------------------------------------------------------------------

/** Render one schema field into the SF JSON-schema-subset property entry. */
function fieldToProperty(f: SchemaField): Record<string, unknown> {
  const prop: Record<string, unknown> = { type: f.type };
  if (f.minLength !== undefined) prop.minLength = f.minLength;
  if (f.minItems !== undefined) prop.minItems = f.minItems;
  if (f.enum !== undefined) prop.enum = f.enum;
  if (f.description !== undefined) prop.description = f.description;
  if (f.type === "array" && f.itemsType !== undefined) {
    prop.items = { type: f.itemsType };
  }
  return prop;
}

/** Render a field list into a `type: object` schema (SF requires object roots). */
function fieldsToSchema(fields: SchemaField[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const f of fields) {
    properties[f.name] = fieldToProperty(f);
    if (f.required) required.push(f.name);
  }
  const schema: Record<string, unknown> = { type: "object", properties };
  if (required.length > 0) schema.required = required;
  return schema;
}

/**
 * Expand one gate spec into zero-or-more concrete SF gates. This is the entire
 * intent->grammar ruleset — the one opinionated surface, kept pure and testable.
 * A raw gate passes straight through. An unknown intent throws (a design record
 * that names an intent the assembler doesn't know is a bug, not a silent skip).
 */
export function expandGates(g: GateSpec): Array<Record<string, unknown>> {
  if (g.raw !== undefined) {
    return [{ type: g.raw.type, config: g.raw.config }];
  }
  switch (g.intent) {
    case "review-clear": {
      if (g.artifact === undefined) {
        throw new Error("review-clear gate requires `artifact`");
      }
      return [
        {
          type: "artifact-fresh",
          config: { artifact: g.artifact, recordedThisCycle: true },
        },
        {
          type: "findings-clear",
          config: { artifact: g.artifact, blocking: ["critical", "high"] },
        },
      ];
    }
    case "human-approval": {
      if (g.id === undefined) {
        throw new Error("human-approval gate requires `id`");
      }
      return [{ type: "human-approval", config: { id: g.id } }];
    }
    case "coverage-contract": {
      const req = g.requiredUnitsPath ?? "evidence.brief.requiredUnits";
      const cov = g.coveredUnitsPath ?? "artifacts.document.coveredUnits";
      const gap = g.acceptedGapsPath ?? "artifacts.document.acceptedGaps";
      const expr =
        `${req}.all(u, ${cov}.exists(c, c == u) || ${gap}.exists(g, g.unit == u))`;
      return [{
        type: "cel",
        config: {
          expr,
          message:
            "Every required unit must be covered or listed as an accepted gap; " +
            "a silent gap cannot advance.",
        },
      }];
    }
    case "artifact-present": {
      if (g.artifact === undefined) {
        throw new Error("artifact-present gate requires `artifact`");
      }
      return [{ type: "artifact-exists", config: { artifact: g.artifact } }];
    }
    case "evidence-present": {
      if (g.evidence === undefined) {
        throw new Error("evidence-present gate requires `evidence`");
      }
      return [{ type: "evidence-recorded", config: { name: g.evidence } }];
    }
    case "workflow-ok": {
      if (g.workflow === undefined) {
        throw new Error("workflow-ok gate requires `workflow`");
      }
      return [{ type: "workflow-succeeded", config: { workflow: g.workflow } }];
    }
    case "test-failed": {
      if (g.evidence === undefined) {
        throw new Error("test-failed gate requires `evidence`");
      }
      return [{
        type: "evidence-recorded",
        config: { name: g.evidence, requireField: { status: "failed" } },
      }];
    }
    default:
      throw new Error(`unknown gate intent: ${String(g.intent)}`);
  }
}

/** Render a target artifact into its SF definition entry. */
function renderArtifact(
  a: z.infer<typeof TargetArtifactSchema>,
): Record<string, unknown> {
  const entry: Record<string, unknown> = { name: a.name };
  if (a.kind === "findings") {
    entry.kind = "findings";
    if (a.reviews !== undefined) entry.reviews = a.reviews;
  } else {
    if (a.reviews !== undefined) entry.reviews = a.reviews;
    entry.schema = fieldsToSchema(a.fields);
  }
  return entry;
}

/** Render one stage into its SF definition entry. */
function renderStage(s: z.infer<typeof StageSpecSchema>): Record<string, unknown> {
  const entry: Record<string, unknown> = { id: s.id };
  if (s.description !== undefined) entry.description = s.description;
  if (s.initial) entry.initial = true;
  if (s.terminal) {
    entry.terminal = true;
    return entry; // terminal stages carry no work/artifacts/transitions
  }
  if (s.maxCycles !== undefined) entry.maxCycles = s.maxCycles;
  if (s.workMode !== undefined) {
    const work: Record<string, unknown> = { mode: s.workMode };
    if (s.skills.length > 0) work.skills = s.skills;
    if (s.systemPrompt !== undefined) work.systemPrompt = s.systemPrompt;
    if (s.constraints !== undefined) work.constraints = s.constraints;
    entry.work = work;
  }
  if (s.artifacts.length > 0) entry.artifacts = s.artifacts.map(renderArtifact);
  if (s.evidence.length > 0) {
    entry.evidence = s.evidence.map((e) => ({
      name: e.name,
      schema: fieldsToSchema(e.fields),
    }));
  }
  if (s.transitions.length > 0) {
    entry.transitions = s.transitions.map((t) => {
      const tr: Record<string, unknown> = { name: t.name, to: t.to };
      if (t.manual) tr.manual = true;
      const gates = t.gates.flatMap(expandGates);
      if (gates.length > 0) tr.gates = gates;
      return tr;
    });
  }
  return entry;
}

/**
 * The pure transform: a validated design record -> the object that becomes the
 * target factory's `globalArguments` (plus the top-level `reports` block when
 * the summary report is scoped). Deterministic; no IO.
 */
export function assembleDefinition(
  design: DesignRecord,
): Record<string, unknown> {
  const globalArguments: Record<string, unknown> = {
    stages: design.stages.map(renderStage),
  };
  if (design.globalTransitions.length > 0) {
    globalArguments.globalTransitions = design.globalTransitions.map((gt) => {
      const tr: Record<string, unknown> = { name: gt.name, to: gt.to };
      const gates = gt.gates.flatMap(expandGates);
      if (gates.length > 0) tr.gates = gates;
      return tr;
    });
  }
  const out: Record<string, unknown> = { globalArguments };
  if (design.scopeSummaryReport) {
    out.reports = {
      require: [
        {
          name: "@swamp/software-factory/work-item-summary",
          methods: ["summary"],
        },
      ],
    };
  }
  return out;
}

/** Render the assembled definition object to YAML text. */
export function assembleYaml(design: DesignRecord): string {
  return stringifyYaml(assembleDefinition(design), null, { lineWidth: 100 });
}

// ---------------------------------------------------------------------------
// Model definition (IO wrapper around the pure transform).
// ---------------------------------------------------------------------------

const GlobalArgsSchema = z.object({
  interviewFactory: z.string().min(1).default("factory-design").describe(
    "Model name of the factory-design interview instance whose design artifacts " +
      "this assembler reads.",
  ),
});

type GlobalArgs = z.infer<typeof GlobalArgsSchema>;

/** Runtime surface swamp injects; declared structurally (no SDK import). */
type MethodContext = {
  globalArgs: GlobalArgs;
  logger: {
    info: (msg: string, props?: Record<string, unknown>) => void;
    warning: (msg: string, props?: Record<string, unknown>) => void;
    error: (msg: string, props?: Record<string, unknown>) => void;
  };
  queryData?: (
    predicate: string,
    select?: string,
  ) => Promise<unknown[]>;
  writeResource: (
    specName: string,
    instanceName: string,
    data: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  createFileWriter: (
    specName: string,
    instanceName: string,
  ) => Promise<{ writeText: (text: string) => Promise<Record<string, unknown>> }>;
};

/**
 * Read the interview factory's design artifact payloads and assemble them into
 * one DesignRecord. Each phase persists one artifact named
 * `artifact-<session>-<phase>-design`; this reads them and merges into the
 * DesignRecord shape. A single consolidated `design` artifact (the interview's
 * final phase) is preferred when present — one query, one validated object.
 */
async function loadDesignRecord(
  context: MethodContext,
  session: string,
): Promise<DesignRecord> {
  if (context.queryData === undefined) {
    throw new Error("queryData is unavailable; cannot read the design record");
  }
  const factory = context.globalArgs.interviewFactory;
  // The interview's final `assembly` phase consolidates the per-phase artifacts
  // into a single `design` artifact whose payload is the whole DesignRecord.
  const rows = await context.queryData(
    `modelName == "${factory}" && name == "artifact-${session}-design"`,
    "attributes.payload",
  );
  if (rows.length === 0) {
    throw new Error(
      `no consolidated design artifact 'artifact-${session}-design' on ` +
        `'${factory}' — run the interview to its assembly phase first`,
    );
  }
  return DesignRecordSchema.parse(rows[0]);
}

/** Model definition for the deterministic factory assembler. */
export const model = {
  type: "@atalanta/factory-assembler",
  version: "2026.07.04.1",
  globalArguments: GlobalArgsSchema,
  resources: {
    "assembled-factory": {
      description:
        "Metadata for one assembled target factory: its name, stage/gate counts, " +
        "and the file instance holding the rendered YAML.",
      schema: z.object({
        factoryName: z.string(),
        session: z.string(),
        stageCount: z.number().int(),
        gateCount: z.number().int(),
        yamlFile: z.string(),
        assembledAt: z.string(),
      }),
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
  },
  files: {
    "factory-yaml": {
      description:
        "The rendered @swamp/software-factory definition YAML (globalArguments " +
        "+ reports) for a target factory. Evidence; install as a live definition " +
        "with swamp model create + edit as a separate explicit step.",
      contentType: "text/yaml",
      lifetime: "infinite" as const,
      garbageCollection: 20,
    },
  },
  methods: {
    build: {
      description:
        "Read the factory-design interview's consolidated `design` artifact for a " +
        "session and deterministically render the target factory's definition YAML " +
        "as a file output. Pure projection — no LLM.",
      arguments: z.object({
        session: z.string().min(1).describe(
          "The interview work-item / session ref whose design record to assemble.",
        ),
      }),
      execute: async (
        args: { session: string },
        context: MethodContext,
      ): Promise<{ dataHandles: Record<string, unknown>[] }> => {
        const assembledAt = new Date().toISOString();
        const design = await loadDesignRecord(context, args.session);
        const yaml = assembleYaml(design);

        const stageCount = design.stages.length;
        const gateCount = design.stages.reduce(
          (n, s) =>
            n + s.transitions.reduce((m, t) => m + t.gates.length, 0),
          design.globalTransitions.reduce((m, gt) => m + gt.gates.length, 0),
        );

        const safe = design.factoryName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileWriter = await context.createFileWriter(
          "factory-yaml",
          `factory-yaml-${safe}`,
        );
        const fileHandle = await fileWriter.writeText(yaml);

        context.logger.info("Assembled target factory definition", {
          factoryName: design.factoryName,
          session: args.session,
          stageCount,
          gateCount,
        });

        const metaHandle = await context.writeResource(
          "assembled-factory",
          `assembled-factory-${safe}`,
          {
            factoryName: design.factoryName,
            session: args.session,
            stageCount,
            gateCount,
            yamlFile: `factory-yaml-${safe}`,
            assembledAt,
          },
        );
        return { dataHandles: [fileHandle, metaHandle] };
      },
    },
  },
};
