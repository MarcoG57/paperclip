import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  loadSources,
  compileTeam,
  generatedDrift,
} from "../../scripts/company/generate.mjs";
import {
  CATALOG_ID,
  validatePreset,
  allocateBudgets,
  adapterFor,
  runtimeFor,
  reviewPolicy,
  digest,
  canonical,
  topological,
} from "../../scripts/company/model.mjs";
import {
  validateBindings,
  makePlan,
  apply,
  preview,
  inspect,
} from "../../scripts/company/install.mjs";
import { apiOrigin, createClient } from "../../scripts/company/api.mjs";
import { parseArgs } from "../../scripts/company/index.mjs";
import { withInstallLock } from "../../scripts/company/lock.mjs";
const sources = await loadSources();
const clone = () => structuredClone(sources.preset);
const bindings = {
  apiOrigin: "http://127.0.0.1:3100",
  companyId: "00000000-0000-4000-8000-000000000001",
  responsibleUserId: "test-user",
};
const plan = await makePlan(bindings);

test("authoring sources produce twelve roles and native files", async () => {
  assert.equal(validatePreset(clone()).roles.length, 12);
  assert.equal(Object.keys(compileTeam(sources)).length, 26);
  assert.deepEqual(await generatedDrift(), []);
});
test("budgets reconcile with integer arithmetic", () => {
  assert.equal(
    Object.values(allocateBudgets(clone())).reduce((a, b) => a + b, 0),
    10000,
  );
  const p = clone();
  p.budgetMonthlyCents = 9999;
  assert.equal(
    Object.values(allocateBudgets(p)).reduce((a, b) => a + b, 0),
    9999,
  );
});
for (const [label, mutate] of Object.entries({
  unknown: (p) => (p.typo = true),
  roleUnknown: (p) => (p.roles[0].typo = true),
  duplicate: (p) => (p.roles[1].slug = p.roles[0].slug),
  model: (p) => (p.roles[0].model = "invented"),
  effort: (p) => (p.roles[2].effort = "xhigh"),
  weight: (p) => (p.roles[0].budgetWeight = 9),
  budget: (p) => (p.budgetMonthlyCents = 0),
  unsafeBudget: (p) => (p.budgetMonthlyCents = Number.MAX_SAFE_INTEGER + 1),
  cycle: (p) => (p.roles[0].manager = "product"),
  root: (p) => (p.roles[1].manager = null),
  reviewer: (p) => (p.roles[0].reviewer = p.roles[0].slug),
  missingManager: (p) => (p.roles[1].manager = "missing"),
  badPath: (p) => (p.roles[0].slug = "../outside"),
  taskCycle: (p) => (p.tasks[0].blockedBy = ["smoke-delivery"]),
  unknownBlocker: (p) => (p.tasks[0].blockedBy = ["missing"]),
  duplicateBlocker: (p) =>
    (p.tasks[1].blockedBy = ["qualify-runtime", "qualify-runtime"]),
  unknownProject: (p) => (p.tasks[0].project = "missing"),
  concurrency: (p) => (p.maxManagedRuns = 99),
}))
  test(`rejects ${label}`, () => {
    const p = clone();
    mutate(p);
    assert.throws(() => validatePreset(p));
  });
test("all workers are configured disarmed", () => {
  for (const r of sources.preset.roles) {
    assert.equal(adapterFor(r).dangerouslyBypassApprovalsAndSandbox, false);
    assert.equal(adapterFor(r).engine, "cli");
    assert.equal(adapterFor(r).filesystemSandboxCommand, "company-bwrap");
    assert.equal(runtimeFor().heartbeat.wakeOnDemand, false);
    assert.equal(runtimeFor().heartbeat.enabled, false);
  }
});
test("models remain exact; max is not translated", () => {
  const r = sources.preset.roles.find((r) => r.slug === "engineer-a");
  assert.equal(adapterFor(r).modelReasoningEffort, "max");
});
test("plan hash binds destination and owner without credentials", async () => {
  const other = await makePlan({ ...bindings, responsibleUserId: "other" });
  assert.notEqual(plan.planHash, other.planHash);
  assert.equal(plan.installOptions.pauseAutomations, true);
  assert.equal(plan.installOptions.collisionStrategy, "skip");
  assert.equal(JSON.stringify(plan).includes("PAPERCLIP_API_KEY"), false);
});
test("review needs a human and a distinct reviewer", () => {
  const p = sources.preset;
  assert.throws(() => reviewPolicy("engineer-a", p, {}, ""));
  const id = "00000000-0000-4000-8000-000000000002";
  const policy = reviewPolicy("engineer-a", p, { qa: id }, "user");
  assert.equal(policy.maxReviewRounds, 2);
  assert.equal(policy.stages.at(-1).type, "approval");
  assert.throws(() =>
    reviewPolicy("engineer-a", p, { qa: id, "engineer-a": id }, "user"),
  );
});
test("canonical hashing is stable across object key ordering", () => {
  assert.equal(digest({ a: 1, b: 2 }), digest({ b: 2, a: 1 }));
  assert.throws(() => canonical({ x: NaN }));
});
for (const origin of [
  "http://example.com",
  "http://localhost:3100",
  "https://user:secret@example.com",
  "https://example.com/path",
  "https://example.com?secret=x",
  "file:///etc/passwd",
])
  test(`reject origin ${origin}`, () => assert.throws(() => apiOrigin(origin)));
test("accept explicit TLS or literal loopback", () => {
  assert.equal(apiOrigin("https://company.example"), "https://company.example");
  assert.equal(apiOrigin("http://[::1]:3100"), "http://[::1]:3100");
});
test("bindings reject unknown fields and malformed ids", () => {
  assert.throws(() => validateBindings({ ...bindings, token: "secret" }));
  assert.throws(() => validateBindings({ ...bindings, companyId: "other" }));
});
test("client never retries a failed write or leaks response text", async () => {
  let calls = 0;
  const request = createClient(bindings.apiOrigin, {
    fetchImpl: async () => {
      calls++;
      return new Response("secret detail", { status: 500 });
    },
  });
  await assert.rejects(
    request("POST", "/api/test", {}),
    /^Error: API_HTTP_500$/,
  );
  assert.equal(calls, 1);
});
test("client scopes requests and disables redirects", async () => {
  let options;
  const request = createClient(bindings.apiOrigin, {
    token: "test-token",
    fetchImpl: async (url, opts) => {
      options = opts;
      assert.equal(url.origin, bindings.apiOrigin);
      return new Response("{}");
    },
  });
  await request("GET", "/api/test");
  assert.equal(options.redirect, "error");
  assert.equal(options.headers.Origin, bindings.apiOrigin);
  await assert.rejects(request("GET", "https://other.example/api"));
});
test("client caps response bodies", async () => {
  const request = createClient(bindings.apiOrigin, {
    maxBytes: 2,
    fetchImpl: async () => new Response('{"x":1}'),
  });
  await assert.rejects(request("GET", "/api/test"), /RESPONSE_TOO_LARGE/);
});
test("client rejects ambiguous and newline credentials", () => {
  assert.throws(() =>
    createClient(bindings.apiOrigin, { token: "x", cookie: "y" }),
  );
  assert.throws(() => createClient(bindings.apiOrigin, { token: "x\r\ny" }));
  assert.throws(() => createClient("https://example.com"));
});
test("uncertain writes require inspection, not retries", async () => {
  let calls = 0;
  const r = createClient(bindings.apiOrigin, {
    fetchImpl: async () => {
      calls++;
      throw new Error("sensitive");
    },
  });
  await assert.rejects(r("POST", "/api/test", {}), /WRITE_OUTCOME_UNKNOWN/);
  assert.equal(calls, 1);
});
test("apply without explicit approved hash makes no API call", async () => {
  let calls = 0;
  await assert.rejects(
    apply(plan, "wrong", async () => {
      calls++;
    }),
    /EXPLICIT_PLAN_HASH/,
  );
  assert.equal(calls, 0);
});
test("apply refuses an active company before mutation", async () => {
  const methods = [];
  await assert.rejects(
    apply(plan, plan.planHash, async (method) => {
      methods.push(method);
      return { id: bindings.companyId, status: "active" };
    }),
    /PAUSED_COMPANY/,
  );
  assert.deepEqual(methods, ["GET"]);
});
test("apply refuses foreign agents", async () => {
  let calls = 0;
  await assert.rejects(
    apply(plan, plan.planHash, async () =>
      ++calls === 1
        ? { id: bindings.companyId, status: "paused" }
        : [{ id: "foreign" }],
    ),
    /FOREIGN_AGENTS/,
  );
});
test("preview rejects catalog drift before import", async () => {
  const calls = [];
  await assert.rejects(
    preview(plan, async (method, route) => {
      calls.push(method);
      return calls.length === 1
        ? { id: bindings.companyId, status: "paused" }
        : { contentHash: "sha256:bad" };
    }),
    /REMOTE_CATALOG_DRIFT/,
  );
  assert.deepEqual(calls, ["GET", "GET"]);
});
test("CLI rejects silent extra options and duplicate flags", () => {
  assert.throws(() =>
    parseArgs(["apply", "--bindings", "a", "--bindings", "b"]),
  );
  assert.throws(() => parseArgs(["plan", "--unsafe", "x"]));
  assert.throws(() => parseArgs(["deploy"]));
});
test("single-writer guard rejects concurrent apply and cleans up", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "company-lock-"));
  try {
    let release;
    const pending = withInstallLock(
      bindings,
      () => new Promise((r) => (release = r)),
      dir,
    );
    while (!release) await new Promise((r) => setTimeout(r, 5));
    await assert.rejects(
      withInstallLock(bindings, async () => {}, dir),
      /INSTALL_LOCK_EXISTS/,
    );
    release();
    await pending;
    assert.deepEqual(await fs.readdir(dir), []);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
test("single-writer lock is removed after a handled failure", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "company-lock-"));
  try {
    await assert.rejects(
      withInstallLock(
        bindings,
        async () => {
          throw new Error("test");
        },
        dir,
      ),
    );
    assert.deepEqual(await fs.readdir(dir), []);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

function nativeFixture({ installed = false, drift = false } = {}) {
  const preset = sources.preset,
    files = compileTeam(sources),
    budgets = allocateBudgets(preset),
    calls = [];
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const roleIds = Object.fromEntries(
    preset.roles.map((r, i) => [r.slug, id(i + 20)]),
  );
  const projectIds = Object.fromEntries(
    preset.projects.map((p, i) => [p.slug, id(i + 50)]),
  );
  const taskIds = Object.fromEntries(
    preset.tasks.map((t, i) => [t.slug, id(i + 80)]),
  );
  let company = {
    id: bindings.companyId,
    status: "paused",
    ...(installed ? plan.companyPatch : {}),
  };
  let policies = installed ? [plan.budgetPolicy] : [];
  const agents = preset.roles.map((r) => ({
    id: roleIds[r.slug],
    companyId: bindings.companyId,
    status: "paused",
    reportsTo: r.manager ? roleIds[r.manager] : null,
    budgetMonthlyCents: budgets[r.slug],
    metadata: {
      evidenceFirst: { role: r.slug },
      paperclip: {
        catalogTeam: { catalogId: CATALOG_ID, originHash: plan.contentHash },
      },
    },
  }));
  const projects = preset.projects.map((p) => ({
    id: projectIds[p.slug],
    companyId: bindings.companyId,
    name: p.name,
    status: "backlog",
    leadAgentId: roleIds[p.lead],
    executionWorkspacePolicy: {
      enabled: true,
      sharedWorkspaceConcurrency: "serialize",
      defaultMode: p.coding ? "isolated_workspace" : "shared_workspace",
      allowIssueOverride: false,
      ...(p.coding ? { workspaceStrategy: { type: "git_worktree" } } : {}),
    },
  }));
  if (!installed)
    for (const project of projects) project.executionWorkspacePolicy = null;
  const issues = preset.tasks.map((t) => ({
    id: taskIds[t.slug],
    companyId: bindings.companyId,
    title: t.title,
    status: "backlog",
    projectId: projectIds[t.project],
    assigneeAgentId: null,
    assigneeUserId: null,
    blockedBy: t.blockedBy.map((slug) => ({ id: taskIds[slug] })),
  }));
  const request = async (method, url, body) => {
    calls.push({ method, url, body });
    const pathname = url.split("?")[0];
    if (pathname === `/api/companies/${bindings.companyId}`) {
      if (method === "PATCH") company = { ...company, ...body };
      return structuredClone(company);
    }
    if (pathname === "/api/teams/catalog/ref")
      return { contentHash: plan.contentHash };
    if (pathname.endsWith("/preview"))
      return { team: { contentHash: plan.contentHash }, errors: [] };
    if (pathname.endsWith("/install")) {
      installed = true;
      assert.equal(body.pauseAutomations, true);
      return { team: { contentHash: plan.contentHash } };
    }
    if (pathname.endsWith("/budgets/policies")) {
      policies = [body];
      return body;
    }
    if (pathname.endsWith("/budgets/overview")) return { policies };
    if (pathname.endsWith("/agents")) return installed ? agents : [];
    if (pathname.endsWith("/projects")) return installed ? projects : [];
    if (pathname.endsWith("/issues")) return installed ? issues : [];
    if (pathname.startsWith("/api/issues/"))
      return issues.find((i) => pathname.endsWith(i.id));
    if (pathname.startsWith("/api/projects/") && method === "PATCH") {
      const project = projects.find(
        (p) => pathname === `/api/projects/${p.id}`,
      );
      assert.ok(project);
      assert.equal(company.status, "paused");
      Object.assign(project, structuredClone(body));
      return structuredClone(project);
    }
    const role = preset.roles.find((r) => pathname.includes(roleIds[r.slug]));
    if (role && pathname.endsWith("/configuration"))
      return {
        adapterType: "codex_local",
        adapterConfig: {
          ...adapterFor(role),
          ...(drift ? { modelReasoningEffort: "high" } : {}),
          env: { OPENAI_API_KEY: { type: "plain", value: "[REDACTED]" } },
        },
        runtimeConfig: runtimeFor(),
        permissions: {
          canCreateAgents: false,
          canCreateSkills: false,
          canAssignTasks: false,
        },
      };
    if (role && pathname.endsWith("/instructions-bundle/file")) {
      const source = files[`agents/${role.slug}/AGENTS.md`];
      return { content: source.slice(source.indexOf("\n---\n", 4) + 5).trim() };
    }
    throw new Error(`Unhandled fixture route ${method} ${pathname}`);
  };
  return { request, calls };
}
test("native API fixture exercises paused installation and full readback without activation", async () => {
  const { request, calls } = nativeFixture();
  const report = await apply(plan, plan.planHash, request);
  assert.equal(report.configured, true);
  assert.equal(report.changed, true);
  assert.equal(report.runtimeReady, false);
  const mutations = calls.filter((c) => c.method !== "GET");
  assert.equal(mutations.length, 9);
  assert.equal(
    calls.some((c) => /\/resume|\/wakeup/.test(c.url)),
    false,
  );
  const again = await apply(plan, plan.planHash, request);
  assert.equal(again.changed, false);
  assert.equal(calls.filter((c) => c.method !== "GET").length, 9);
});
test("readback detects effort drift; existing instances are never silently repaired", async () => {
  const { request, calls } = nativeFixture({ installed: true, drift: true });
  const report = await inspect(plan, request);
  assert.equal(report.configured, false);
  await assert.rejects(
    apply(plan, plan.planHash, request),
    /PARTIAL_IMPORT_OR_DRIFT/,
  );
  assert.equal(
    calls.every((c) => c.method === "GET"),
    true,
  );
});

test("safe catalog excludes execution policies and approval plan binds them separately", () => {
  assert.equal(
    compileTeam(sources)[".paperclip.yaml"].includes(
      "executionWorkspacePolicy",
    ),
    false,
  );
  assert.equal(plan.projectPolicies.length, 5);
  assert.equal(
    plan.projectPolicies.filter(
      (p) => p.executionWorkspacePolicy.defaultMode === "isolated_workspace",
    ).length,
    2,
  );
});
test("operator refuses foreign project destinations before policy writes", async () => {
  const fixture = nativeFixture();
  let imported = false;
  const request = async (method, url, body) => {
    const response = await fixture.request(method, url, body);
    if (url.includes("/install?")) imported = true;
    if (imported && url.endsWith("/projects"))
      return response.map((p) => ({ ...p, companyId: "other-company" }));
    return response;
  };
  await assert.rejects(
    apply(plan, plan.planHash, request),
    /PROJECT_POLICY_TARGET_INVALID/,
  );
  assert.equal(
    fixture.calls.some(
      (c) => c.method === "PATCH" && c.url.startsWith("/api/projects/"),
    ),
    false,
  );
});
test("operator checks paused company before each workspace policy", async () => {
  const fixture = nativeFixture();
  let imported = false;
  const request = async (method, url, body) => {
    const response = await fixture.request(method, url, body);
    if (url.includes("/install?")) imported = true;
    if (
      imported &&
      method === "GET" &&
      url === `/api/companies/${bindings.companyId}`
    )
      return { ...response, status: "active" };
    return response;
  };
  await assert.rejects(
    apply(plan, plan.planHash, request),
    /COMPANY_ACTIVATED_DURING_INSTALL/,
  );
  assert.equal(
    fixture.calls.some(
      (c) => c.method === "PATCH" && c.url.startsWith("/api/projects/"),
    ),
    false,
  );
});
test("operator does not retry a failed policy write or report configured", async () => {
  const fixture = nativeFixture();
  let writes = 0;
  const request = async (method, url, body) => {
    if (method === "PATCH" && url.startsWith("/api/projects/")) {
      writes++;
      throw new Error("WRITE_OUTCOME_UNKNOWN");
    }
    return fixture.request(method, url, body);
  };
  await assert.rejects(
    apply(plan, plan.planHash, request),
    /WRITE_OUTCOME_UNKNOWN/,
  );
  assert.equal(writes, 1);
});
