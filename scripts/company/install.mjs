/** Guarded client for native catalog installation; intentionally no activation command. */
import fs from "node:fs/promises";
import path from "node:path";
import {
  CATALOG_ID,
  CATALOG_KEY,
  CATALOG_PATH,
  adapterFor,
  allocateBudgets,
  runtimeFor,
  permissionsFor,
  workspacePolicyFor,
  canonical,
  digest,
  exactKeys,
  invariant,
} from "./model.mjs";
import { ROOT, loadSources, compileTeam, generatedDrift } from "./generate.mjs";
import { apiOrigin } from "./api.mjs";

export function validateBindings(bindings) {
  exactKeys(
    bindings,
    ["apiOrigin", "companyId", "responsibleUserId"],
    "BINDINGS",
  );
  const origin = apiOrigin(bindings.apiOrigin);
  invariant(
    typeof bindings.companyId === "string" &&
      /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(bindings.companyId),
    "COMPANY_UUID_REQUIRED",
  );
  invariant(
    typeof bindings.responsibleUserId === "string" &&
      bindings.responsibleUserId.trim() &&
      bindings.responsibleUserId.length < 255,
    "HUMAN_OWNER_REQUIRED",
  );
  return { ...bindings, apiOrigin: origin };
}
export async function makePlan(bindings, root = ROOT) {
  bindings = validateBindings(bindings);
  invariant((await generatedDrift(root)).length === 0, "GENERATED_TEAM_STALE");
  const sources = await loadSources(root),
    { preset } = sources;
  const manifest = JSON.parse(
    await fs.readFile(
      path.join(root, "packages/teams-catalog/generated/catalog.json"),
      "utf8",
    ),
  );
  const team = manifest.teams.find((t) => t.id === CATALOG_ID);
  invariant(
    team && team.path === CATALOG_PATH.replace("packages/teams-catalog/", ""),
    "CATALOG_MANIFEST_MISSING",
  );
  for (const file of team.files) {
    const content = await fs.readFile(path.join(root, CATALOG_PATH, file.path));
    invariant(
      file.sha256 === digest(content.toString("utf8")).slice(7) ||
        file.sha256 === digest(content.toString("utf8")),
      "CATALOG_MANIFEST_STALE",
    );
  }
  invariant(
    team.contentHash ===
      digest(
        JSON.stringify(
          team.files.map((f) => ({ path: f.path, sha256: f.sha256 })),
        ),
      ),
    "CATALOG_HASH_STALE",
  );
  const toolHashes = {};
  for (const file of [
    "model.mjs",
    "generate.mjs",
    "api.mjs",
    "install.mjs",
    "index.mjs",
    "lock.mjs",
  ])
    toolHashes[file] = digest(
      await fs.readFile(path.join(root, "scripts/company", file), "utf8"),
    );
  const content = {
    schemaVersion: 1,
    scope: "NATIVE_CATALOG_INSTALL_PAUSED_ONLY",
    bindings,
    catalogId: CATALOG_ID,
    catalogKey: CATALOG_KEY,
    contentHash: team.contentHash,
    companyPatch: {
      budgetMonthlyCents: preset.budgetMonthlyCents,
      defaultResponsibleUserId: bindings.responsibleUserId,
      requireBoardApprovalForNewAgents: true,
      feedbackDataSharingEnabled: false,
    },
    budgetPolicy: {
      scopeType: "company",
      scopeId: bindings.companyId,
      metric: "billed_cents",
      windowKind: "calendar_month_utc",
      amount: preset.budgetMonthlyCents,
      warnPercent: preset.budgetWarningPercent,
      hardStopEnabled: true,
      notifyEnabled: true,
      isActive: true,
    },
    installOptions: {
      collisionStrategy: "skip",
      pauseAutomations: true,
      expectedContentHash: team.contentHash,
      include: { agents: true, projects: true, issues: true, skills: false },
      sourcePolicy: {
        allowExternalSources: false,
        allowUnpinnedOptionalSources: false,
        allowLocalPathSources: false,
      },
    },
    projectPolicies: preset.projects.map((project) => ({
      slug: project.slug,
      name: project.name,
      executionWorkspacePolicy: workspacePolicyFor(project),
    })),
    expectedRoles: preset.roles.map((r) => ({
      slug: r.slug,
      model: r.model,
      effort: r.effort,
      manager: r.manager,
    })),
    toolHashes,
  };
  return { ...content, planHash: digest(content) };
}
function subset(actual, expected) {
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((v, i) => subset(actual[i], v))
    );
  if (expected && typeof expected === "object")
    return (
      actual &&
      typeof actual === "object" &&
      Object.entries(expected).every(([k, v]) => subset(actual[k], v))
    );
  return actual === expected;
}
function list(value, label) {
  invariant(Array.isArray(value), `UNEXPECTED_${label}_RESPONSE`);
  return value;
}
function provenance(agent) {
  return agent.metadata?.paperclip?.catalogTeam;
}
const basePath = (plan) => `/api/companies/${plan.bindings.companyId}`;
const teamPath = (plan) => `${basePath(plan)}/teams/catalog/ref`;
function roleOf(agent) {
  return agent.metadata?.evidenceFirst?.role;
}

export async function inspect(plan, request, { root = ROOT } = {}) {
  const { preset } = await loadSources(root);
  const budgets = allocateBudgets(preset),
    checks = [];
  const check = (id, passed) => checks.push({ id, passed: Boolean(passed) });
  const company = await request("GET", basePath(plan));
  check("company-id", company.id === plan.bindings.companyId);
  check("company-paused", company.status === "paused");
  check("company-settings", subset(company, plan.companyPatch));
  const agents = list(
    await request("GET", `${basePath(plan)}/agents`),
    "AGENTS",
  );
  const owned = agents.filter((a) => provenance(a)?.catalogId === CATALOG_ID);
  check("no-unmanaged-agents", agents.length === owned.length);
  check("role-count", owned.length === preset.roles.length);
  const byRole = new Map(owned.map((a) => [roleOf(a), a]));
  check("unique-roles", byRole.size === owned.length);
  const sources = await loadSources(root),
    files = compileTeam(sources);
  for (const role of preset.roles) {
    const agent = byRole.get(role.slug);
    check(`${role.slug}:present`, agent);
    if (!agent) continue;
    check(`${role.slug}:company`, agent.companyId === plan.bindings.companyId);
    check(`${role.slug}:paused`, agent.status === "paused");
    check(
      `${role.slug}:origin`,
      provenance(agent)?.originHash === plan.contentHash,
    );
    check(
      `${role.slug}:manager`,
      agent.reportsTo === (role.manager ? byRole.get(role.manager)?.id : null),
    );
    const config = await request(
      "GET",
      `/api/agents/${agent.id}/configuration?companyId=${plan.bindings.companyId}`,
    );
    const { env, ...expectedAdapter } = adapterFor(role);
    check(
      `${role.slug}:binding`,
      config.adapterType === "codex_local" &&
        subset(config.adapterConfig, expectedAdapter),
    );
    check(
      `${role.slug}:no-extra-command-overrides`,
      !config.adapterConfig?.extraArgs?.length &&
        !config.adapterConfig?.args?.length &&
        !config.adapterConfig?.dangerouslyBypassSandbox &&
        (!config.adapterConfig?.command ||
          config.adapterConfig.command === "codex"),
    );
    // Native API deliberately redacts even an empty env binding. Verify its
    // presence/type, never infer the hidden value or ask the API to reveal it.
    check(
      `${role.slug}:env-reference`,
      Object.keys(config.adapterConfig?.env ?? {}).length === 1 &&
        config.adapterConfig.env.OPENAI_API_KEY?.type === "plain",
    );
    check(
      `${role.slug}:wake-policy`,
      subset(config.runtimeConfig, runtimeFor()),
    );
    check(
      `${role.slug}:permissions`,
      subset(config.permissions, permissionsFor()),
    );
    check(
      `${role.slug}:budget`,
      agent.budgetMonthlyCents === budgets[role.slug],
    );
    const file = await request(
      "GET",
      `/api/agents/${agent.id}/instructions-bundle/file?path=AGENTS.md&companyId=${plan.bindings.companyId}`,
    );
    const source = files[`agents/${role.slug}/AGENTS.md`];
    const end = source.indexOf("\n---\n", 4);
    check(
      `${role.slug}:instructions`,
      typeof file.content === "string" &&
        file.content.trim() === source.slice(end + 5).trim(),
    );
  }
  const projects = list(
    await request("GET", `${basePath(plan)}/projects`),
    "PROJECTS",
  );
  check("project-count", projects.length === preset.projects.length);
  const byProject = new Map();
  for (const project of preset.projects) {
    const matches = projects.filter((p) => p.name === project.name);
    check(`${project.slug}:unique-project`, matches.length === 1);
    if (matches.length !== 1) continue;
    const actual = matches[0];
    byProject.set(project.slug, actual);
    check(
      `${project.slug}:project-company`,
      actual.companyId === plan.bindings.companyId,
    );
    check(
      `${project.slug}:project-state`,
      actual.status === "backlog" &&
        actual.leadAgentId === byRole.get(project.lead)?.id,
    );
    check(
      `${project.slug}:workspace-policy`,
      subset(actual.executionWorkspacePolicy, {
        enabled: true,
        sharedWorkspaceConcurrency: "serialize",
        defaultMode: project.coding ? "isolated_workspace" : "shared_workspace",
        allowIssueOverride: false,
        ...(project.coding
          ? { workspaceStrategy: { type: "git_worktree" } }
          : {}),
      }),
    );
  }
  const tasks = list(
    await request("GET", `${basePath(plan)}/issues?limit=100`),
    "ISSUES",
  );
  check("task-count", tasks.length === preset.tasks.length);
  const byTask = new Map(
    preset.tasks.map((t) => [t.slug, tasks.find((x) => x.title === t.title)]),
  );
  for (const task of preset.tasks) {
    const matches = tasks.filter((x) => x.title === task.title);
    check(`${task.slug}:unique-task`, matches.length === 1);
    if (matches.length !== 1) continue;
    const actual = matches[0];
    check(
      `${task.slug}:task-state`,
      actual.status === "backlog" &&
        actual.companyId === plan.bindings.companyId &&
        actual.projectId === byProject.get(task.project)?.id &&
        !actual.assigneeAgentId &&
        !actual.assigneeUserId,
    );
    const detail = await request("GET", `/api/issues/${actual.id}`);
    const expected = task.blockedBy.map((id) => byTask.get(id)?.id).sort();
    check(
      `${task.slug}:blockers`,
      Array.isArray(detail.blockedBy) &&
        canonical(detail.blockedBy.map((x) => x.id).sort()) ===
          canonical(expected),
    );
  }
  const overview = await request("GET", `${basePath(plan)}/budgets/overview`);
  check(
    "budget-hard-stop",
    Array.isArray(overview.policies) &&
      overview.policies.some((p) => subset(p, plan.budgetPolicy)),
  );
  return {
    scope: "CONFIGURATION_READBACK_ONLY",
    configured: checks.every((c) => c.passed),
    runtimeReady: false,
    checks,
    unverified: [
      "real model/effort execution",
      "sandbox and network on deployment host",
      "global slot supervisor installed",
      "worktree isolation",
      "backup restore",
      "provider billing and subscription quota",
      "external-action permissions",
      "redacted environment values",
    ],
  };
}

export async function preview(plan, request) {
  const company = await request("GET", basePath(plan));
  invariant(
    company.id === plan.bindings.companyId && company.status === "paused",
    "EMPTY_PAUSED_COMPANY_REQUIRED",
  );
  const team = await request(
    "GET",
    `/api/teams/catalog/ref?ref=${encodeURIComponent(CATALOG_KEY)}`,
  );
  invariant(team.contentHash === plan.contentHash, "REMOTE_CATALOG_DRIFT");
  const { pauseAutomations, expectedContentHash, ...options } =
    plan.installOptions;
  return request(
    "POST",
    `${teamPath(plan)}/preview?ref=${encodeURIComponent(CATALOG_KEY)}`,
    options,
  );
}

export async function apply(plan, approvalHash, request, { root = ROOT } = {}) {
  invariant(approvalHash === plan.planHash, "EXPLICIT_PLAN_HASH_REQUIRED");
  const { planHash, ...content } = plan;
  invariant(digest(content) === planHash, "PLAN_TAMPERED");
  const company = await request("GET", basePath(plan));
  invariant(
    company.id === plan.bindings.companyId && company.status === "paused",
    "EMPTY_PAUSED_COMPANY_REQUIRED",
  );
  const agents = list(
    await request("GET", `${basePath(plan)}/agents`),
    "AGENTS",
  );
  if (agents.length) {
    invariant(
      agents.every((a) => provenance(a)?.catalogId === CATALOG_ID),
      "FOREIGN_AGENTS_PRESENT",
    );
    const report = await inspect(plan, request, { root });
    invariant(
      report.configured,
      "PARTIAL_IMPORT_OR_DRIFT_REQUIRES_OPERATOR_REPAIR",
    );
    return { ...report, changed: false };
  }
  // The native importer is not a single cross-service transaction. Refuse to
  // mix an initial installation with prior projects/tasks or a partial import.
  const projects = list(
    await request("GET", `${basePath(plan)}/projects`),
    "PROJECTS",
  );
  const issues = list(
    await request("GET", `${basePath(plan)}/issues?limit=1`),
    "ISSUES",
  );
  invariant(
    projects.length === 0 && issues.length === 0,
    "EMPTY_COMPANY_REQUIRED",
  );
  const result = await preview(plan, request);
  invariant(
    Array.isArray(result.errors) && result.errors.length === 0,
    "NATIVE_PREVIEW_FAILED",
  );
  invariant(
    result.team?.contentHash === plan.contentHash,
    "PREVIEW_HASH_MISMATCH",
  );
  // Budget and governance are established while the company is still paused.
  await request("PATCH", basePath(plan), plan.companyPatch);
  await request(
    "POST",
    `${basePath(plan)}/budgets/policies`,
    plan.budgetPolicy,
  );
  const latest = await request("GET", basePath(plan));
  invariant(latest.status === "paused", "COMPANY_ACTIVATED_DURING_INSTALL");
  const installed = await request(
    "POST",
    `${teamPath(plan)}/install?ref=${encodeURIComponent(CATALOG_KEY)}`,
    plan.installOptions,
  );
  invariant(
    installed.team?.contentHash === plan.contentHash,
    "INSTALLED_HASH_MISMATCH",
  );

  // Keep agent_safe unchanged. These destinations and policies are
  // separately approved through planHash, after the safe catalog import.
  const importedProjects = list(
    await request("GET", `${basePath(plan)}/projects`),
    "PROJECTS",
  );
  invariant(
    importedProjects.length === plan.projectPolicies.length,
    "PROJECT_POLICY_TARGET_COUNT",
  );
  const targets = plan.projectPolicies.map((policy) => {
    const matches = importedProjects.filter(
      (project) => project.name === policy.name,
    );
    invariant(matches.length === 1, "PROJECT_POLICY_TARGET_AMBIGUOUS");
    const target = matches[0];
    invariant(
      target.companyId === plan.bindings.companyId &&
        typeof target.id === "string" &&
        /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(target.id),
      "PROJECT_POLICY_TARGET_INVALID",
    );
    invariant(target.status === "backlog", "PROJECT_POLICY_TARGET_NOT_BACKLOG");
    return {
      id: target.id,
      executionWorkspacePolicy: policy.executionWorkspacePolicy,
    };
  });
  for (const target of targets) {
    const current = await request("GET", basePath(plan));
    invariant(
      current.id === plan.bindings.companyId && current.status === "paused",
      "COMPANY_ACTIVATED_DURING_INSTALL",
    );
    await request("PATCH", `/api/projects/${target.id}`, {
      executionWorkspacePolicy: target.executionWorkspacePolicy,
    });
  }
  const report = await inspect(plan, request, { root });
  invariant(report.configured, "INSTALL_READBACK_FAILED_KEEP_PAUSED");
  return { ...report, changed: true };
}
