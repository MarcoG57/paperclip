/** Pure contracts for the opt-in company preset. No model calls or I/O. */
import { createHash } from "node:crypto";

export const CATALOG_KEY =
  "paperclipai/optional/company-defaults/evidence-first-company";
export const CATALOG_ID =
  "paperclipai:optional:company-defaults:evidence-first-company";
export const CATALOG_PATH =
  "packages/teams-catalog/catalog/optional/company-defaults/evidence-first-company";
export const MODEL_EFFORTS = Object.freeze({
  "gpt-6-astra": ["medium"],
  "gpt-6-luna": ["medium", "max"],
  "gpt-6-sol": ["high"],
});

export function invariant(condition, code) {
  if (!condition) throw new Error(code);
}
export function canonical(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  invariant(
    value && Object.getPrototypeOf(value) === Object.prototype,
    "INVALID_JSON_VALUE",
  );
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(",")}}`;
}
export const digest = (value) =>
  `sha256:${createHash("sha256")
    .update(typeof value === "string" ? value : canonical(value))
    .digest("hex")}`;
export function exactKeys(value, keys, label) {
  invariant(
    value && typeof value === "object" && !Array.isArray(value),
    `INVALID_${label}`,
  );
  invariant(
    Object.keys(value).every((k) => keys.includes(k)) &&
      keys.every((k) => Object.hasOwn(value, k)),
    `INVALID_${label}_KEYS`,
  );
}
function text(value, label) {
  invariant(
    typeof value === "string" && value.trim().length > 0,
    `INVALID_${label}`,
  );
}
function slugs(rows, label) {
  invariant(Array.isArray(rows) && rows.length > 0, `EMPTY_${label}`);
  const seen = new Set();
  for (const row of rows) {
    invariant(
      typeof row.slug === "string" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug),
      `INVALID_${label}_SLUG`,
    );
    invariant(!seen.has(row.slug), `DUPLICATE_${label}_SLUG`);
    seen.add(row.slug);
  }
  return seen;
}
export function topological(rows, dependencies) {
  const byId = new Map(rows.map((row) => [row.slug, row]));
  const done = new Set(),
    visiting = new Set(),
    result = [];
  function visit(id) {
    invariant(byId.has(id), "UNKNOWN_DEPENDENCY");
    invariant(!visiting.has(id), "CYCLIC_DEPENDENCY");
    if (done.has(id)) return;
    visiting.add(id);
    for (const dep of dependencies(byId.get(id))) visit(dep);
    visiting.delete(id);
    done.add(id);
    result.push(byId.get(id));
  }
  for (const row of rows) visit(row.slug);
  return result;
}
export function validatePreset(preset) {
  exactKeys(
    preset,
    [
      "schemaVersion",
      "slug",
      "name",
      "description",
      "language",
      "budgetMonthlyCents",
      "budgetWarningPercent",
      "maxManagedRuns",
      "roles",
      "projects",
      "tasks",
    ],
    "PRESET",
  );
  invariant(
    preset.schemaVersion === 1 && preset.slug === "evidence-first-company",
    "UNSUPPORTED_PRESET",
  );
  invariant(
    preset.language === "es" && preset.maxManagedRuns === 4,
    "POLICY_DRIFT",
  );
  text(preset.name, "NAME");
  text(preset.description, "DESCRIPTION");
  invariant(
    Number.isSafeInteger(preset.budgetMonthlyCents) &&
      preset.budgetMonthlyCents >= 100,
    "INVALID_BUDGET",
  );
  invariant(
    Number.isInteger(preset.budgetWarningPercent) &&
      preset.budgetWarningPercent > 0 &&
      preset.budgetWarningPercent < 100,
    "INVALID_WARNING",
  );
  const roleIds = slugs(preset.roles, "ROLE"),
    projectIds = slugs(preset.projects, "PROJECT");
  slugs(preset.tasks, "TASK");
  for (const role of preset.roles) {
    exactKeys(
      role,
      [
        "slug",
        "name",
        "model",
        "effort",
        "manager",
        "reviewer",
        "budgetWeight",
      ],
      "ROLE",
    );
    text(role.name, "ROLE_NAME");
    invariant(
      MODEL_EFFORTS[role.model]?.includes(role.effort),
      "UNSUPPORTED_MODEL_BINDING",
    );
    invariant(
      role.manager === null ||
        (roleIds.has(role.manager) && role.manager !== role.slug),
      "INVALID_MANAGER",
    );
    invariant(
      role.reviewer === "human" ||
        (roleIds.has(role.reviewer) && role.reviewer !== role.slug),
      "INVALID_REVIEWER",
    );
    invariant(
      Number.isInteger(role.budgetWeight) && role.budgetWeight > 0,
      "INVALID_WEIGHT",
    );
  }
  invariant(
    preset.roles.filter((r) => r.manager === null).length === 1,
    "ROOT_COUNT",
  );
  invariant(
    preset.roles.reduce((sum, r) => sum + r.budgetWeight, 0) === 100,
    "WEIGHT_SUM",
  );
  topological(preset.roles, (r) => (r.manager ? [r.manager] : []));
  for (const project of preset.projects) {
    exactKeys(
      project,
      ["slug", "name", "lead", "coding", "description"],
      "PROJECT",
    );
    text(project.name, "PROJECT_NAME");
    text(project.description, "PROJECT_DESCRIPTION");
    invariant(
      roleIds.has(project.lead) && typeof project.coding === "boolean",
      "INVALID_PROJECT",
    );
  }
  for (const task of preset.tasks) {
    exactKeys(
      task,
      ["slug", "project", "title", "blockedBy", "description"],
      "TASK",
    );
    text(task.title, "TASK_TITLE");
    text(task.description, "TASK_DESCRIPTION");
    invariant(
      projectIds.has(task.project) && Array.isArray(task.blockedBy),
      "INVALID_TASK",
    );
    invariant(
      new Set(task.blockedBy).size === task.blockedBy.length,
      "DUPLICATE_BLOCKER",
    );
  }
  topological(preset.tasks, (t) => t.blockedBy);
  return preset;
}
export function allocateBudgets(preset) {
  const rows = preset.roles.map((r) => [
    r.slug,
    Number((BigInt(preset.budgetMonthlyCents) * BigInt(r.budgetWeight)) / 100n),
  ]);
  rows[0][1] += preset.budgetMonthlyCents - rows.reduce((s, [, n]) => s + n, 0);
  return Object.fromEntries(rows);
}
export function adapterFor(role) {
  return {
    engine: "cli",
    model: role.model,
    modelReasoningEffort: role.effort,
    fastMode: false,
    dangerouslyBypassApprovalsAndSandbox: false,
    filesystemScope: "workspace",
    filesystemSandboxCommand: "company-bwrap",
    networkScope: "allowlist",
    networkAllowlist: ["api.openai.com:443"],
    timeoutSec: 3600,
    graceSec: 15,
    outputInactivityTimeoutMs: 900000,
    // Fail without an explicit connection. Do not inherit a personal API key.
    env: { OPENAI_API_KEY: "" },
  };
}
export function runtimeFor() {
  return {
    heartbeat: {
      enabled: false,
      wakeOnDemand: false,
      cooldownSec: 60,
      maxConcurrentRuns: 1,
    },
  };
}
export function permissionsFor() {
  return {
    canCreateAgents: false,
    canCreateSkills: false,
    canAssignTasks: false,
  };
}
export function reviewPolicy(roleSlug, preset, ids, responsibleUserId) {
  const role = preset.roles.find((r) => r.slug === roleSlug);
  invariant(
    role && typeof responsibleUserId === "string" && responsibleUserId.trim(),
    "REVIEW_BINDINGS_REQUIRED",
  );
  const stages = [];
  if (role.reviewer !== "human") {
    const id = ids[role.reviewer];
    invariant(
      typeof id === "string" &&
        /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id),
      "REVIEWER_ID_REQUIRED",
    );
    invariant(id !== ids[roleSlug], "SELF_REVIEW_FORBIDDEN");
    stages.push({
      type: "review",
      approvalsNeeded: 1,
      participants: [{ type: "agent", agentId: id }],
    });
  }
  stages.push({
    type: "approval",
    approvalsNeeded: 1,
    participants: [{ type: "user", userId: responsibleUserId }],
  });
  return { mode: "normal", commentRequired: true, maxReviewRounds: 2, stages };
}
