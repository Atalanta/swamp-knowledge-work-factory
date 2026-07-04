/**
 * Deterministically assemble a `@swamp/software-factory` definition from the
 * design record produced by the `factory-design` interview.
 *
 * This is a swamp REPORT, not a model — it represents no external system; it is a
 * pure design-record -> factory-definition projection, which is exactly what a
 * report is for (read model run data, transform it, emit `{markdown, json}`). It
 * scopes to the interview's `record_artifact` method and fires when the
 * consolidated `design` artifact is recorded, reads that artifact via the
 * report's dataRepository, validates it against `DesignRecordSchema`, and emits
 * the target factory's definition object as its `json` output.
 *
 * It is a PURE PROJECTION: no LLM, no judgement. The same design record always
 * produces the same definition — the non-deterministic work happened in the
 * interview and is captured as evidence; assembly is a function of it.
 *
 * Fidelity is HYBRID (the design decision): common patterns are captured as
 * intent in the design record and expanded here by rule (a review stage's
 * fresh + findings-clear + human-approval stack; a coverage-contract cel gate; a
 * human sign-off), while uncommon needs are captured as raw gate-type+config and
 * passed straight through. `expandGates` is the whole intent->grammar ruleset;
 * it is the one opinionated surface and is unit-testable in isolation.
 *
 * The output is the definition OBJECT (json) — no YAML/serialisation library is
 * bundled; the datastore is JSON-native and swamp reads JSON definitions.
 * Installing it as a live git-tracked definition
 * (`models/@swamp/software-factory/<uuid>.yaml`) is a separate, explicit step
 * the driver performs, preserving swamp's source/runtime split: the report
 * produces data, the driver turns it into source.
 *
 * @module
 */
import { z } from "npm:zod@4";

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
  adversary: z.enum(["claude", "codex", "gemini", "opencode", "amp"])
    .optional(),
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
function renderStage(
  s: z.infer<typeof StageSpecSchema>,
): Record<string, unknown> {
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

/**
 * Count the gates a design expands to (across stage transitions + global
 * transitions), for the report's summary. Pure.
 */
export function countGates(design: DesignRecord): number {
  const inStages = design.stages.reduce(
    (n, s) =>
      n +
      s.transitions.reduce(
        (m, t) => m + t.gates.flatMap(expandGates).length,
        0,
      ),
    0,
  );
  const inGlobals = design.globalTransitions.reduce(
    (m, gt) => m + gt.gates.flatMap(expandGates).length,
    0,
  );
  return inStages + inGlobals;
}

// ---------------------------------------------------------------------------
// Report definition (the swamp-native home for a deterministic transform).
//
// The assembler is NOT a model — it represents no external system. It is a pure
// design-record -> factory-definition projection, which is exactly what a swamp
// report is for: read model run data, transform it, emit {markdown, json}. It
// scopes to the factory-design interview's `record_artifact` method and fires
// when the consolidated `design` artifact is recorded; it reads that artifact
// via the report's dataRepository, validates it against DesignRecordSchema, and
// emits the target factory definition as its `json` output (native — no YAML
// dependency) plus a readable markdown rendering. The install step reads the
// json from the persisted report and writes the live definition file.
// ---------------------------------------------------------------------------

const FACTORY_TYPE = "@swamp/software-factory";
const DESIGN_ARTIFACT = "design";

/** Structural slice of swamp's method-scope ReportContext (no SDK import). */
interface ReportContext {
  scope: string;
  modelType: unknown;
  modelId: string;
  methodName: string;
  executionStatus: "succeeded" | "failed";
  methodArgs: Record<string, unknown>;
  dataRepository: {
    getContent(
      type: unknown,
      modelId: string,
      dataName: string,
      version?: number,
    ): Promise<Uint8Array | null>;
  };
}

/** The physical run-data name of a factory artifact (mirrors the engine). */
function artifactInstanceName(workItem: string, artifact: string): string {
  return `artifact-${workItem}-${artifact}`;
}

/**
 * Render the assembled definition as readable markdown — a human-facing view of
 * the factory the design produced, plus the definition object in a fenced JSON
 * block. No YAML library: the json output is the machine-facing artifact.
 */
function renderMarkdown(
  design: DesignRecord,
  def: Record<string, unknown>,
): string {
  const gateCount = countGates(design);
  const stageLines = design.stages
    .map((s) => {
      const tag = s.initial ? " (initial)" : s.terminal ? " (terminal)" : "";
      const mode = s.workMode ? ` — ${s.workMode}` : "";
      return `- \`${s.id}\`${tag}${mode}`;
    })
    .join("\n");
  return [
    `# Assembled factory: ${design.factoryName}`,
    "",
    design.description ?? "",
    "",
    `**${design.stages.length} stages, ${gateCount} gates.**`,
    design.author || design.adversary
      ? `Polarity: author \`${design.author ?? "?"}\`, adversary \`${
        design.adversary ?? "?"
      }\`.`
      : "",
    "",
    "## Stages",
    stageLines,
    "",
    "## Definition (install this as the target factory's globalArguments + reports)",
    "",
    "```json",
    JSON.stringify(def, null, 2),
    "```",
  ].join("\n");
}

export const report = {
  name: "@atalanta/factory-assembler",
  description:
    "Deterministically assemble a @swamp/software-factory definition from the " +
    "factory-design interview's consolidated `design` artifact. Fires when that " +
    "artifact is recorded; emits the target factory definition as json (no LLM, " +
    "no YAML dependency — a pure projection).",
  scope: "method",
  labels: ["software-factory", "meta", "factory-builder"],
  execute: async (
    context: ReportContext,
  ): Promise<{ markdown: string; json: Record<string, unknown> }> => {
    // Only fire on the interview recording its consolidated `design` artifact.
    if (
      String(context.modelType) !== FACTORY_TYPE ||
      context.methodName !== "record_artifact" ||
      context.methodArgs.name !== DESIGN_ARTIFACT ||
      context.executionStatus !== "succeeded"
    ) {
      return { markdown: "", json: {} };
    }
    const workItem = context.methodArgs.workItem;
    if (typeof workItem !== "string" || workItem.length === 0) {
      return { markdown: "", json: {} };
    }

    // Read the just-recorded design artifact via the report's data repository.
    const raw = await context.dataRepository.getContent(
      context.modelType,
      context.modelId,
      artifactInstanceName(workItem, DESIGN_ARTIFACT),
    );
    if (raw === null) {
      return {
        markdown:
          `# Assembly\n\n_No \`${DESIGN_ARTIFACT}\` artifact found for ${workItem}._\n`,
        json: { error: "design artifact not found", workItem },
      };
    }

    // The artifact content is the record envelope; the DesignRecord is its payload.
    let payload: unknown;
    try {
      const envelope = JSON.parse(new TextDecoder().decode(raw)) as {
        payload?: unknown;
      };
      payload = envelope.payload ?? envelope;
    } catch (e) {
      return {
        markdown: `# Assembly\n\n_Could not parse the design artifact: ${
          String(e)
        }._\n`,
        json: { error: "unparsable design artifact", workItem },
      };
    }

    const parsed = DesignRecordSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        markdown:
          `# Assembly\n\n_Design record failed validation:_\n\n\`\`\`\n${parsed.error.message}\n\`\`\`\n`,
        json: { error: "invalid design record", issues: parsed.error.issues },
      };
    }

    const design = parsed.data;
    const definition = assembleDefinition(design);
    return {
      markdown: renderMarkdown(design, definition),
      // The machine-facing artifact: the target factory's definition object,
      // ready to write as globalArguments + reports. No serialisation library.
      json: {
        factoryName: design.factoryName,
        stageCount: design.stages.length,
        gateCount: countGates(design),
        definition,
      },
    };
  },
};
