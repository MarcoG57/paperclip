import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { agents, companies, createDb, projects, issues } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { teamsCatalogService } from "../services/teams-catalog.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
if (!embeddedPostgresSupport.supported && process.env.PAPERCLIP_REQUIRE_EMBEDDED_TESTS === "1") {
  throw new Error(`Embedded PostgreSQL is required for this CI job: ${embeddedPostgresSupport.reason}`);
}
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe.sequential : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping embedded Postgres teams catalog no-overrides install tests on this host: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("teams catalog install with no caller adapter overrides", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let tempHome: string | null = null;
  let oldPaperclipHome: string | undefined;

  beforeAll(async () => {
    oldPaperclipHome = process.env.PAPERCLIP_HOME;
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-teams-catalog-no-overrides-"));
    process.env.PAPERCLIP_HOME = tempHome;
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-teams-catalog-no-overrides-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterAll(async () => {
    if (oldPaperclipHome === undefined) delete process.env.PAPERCLIP_HOME;
    else process.env.PAPERCLIP_HOME = oldPaperclipHome;
    if (tempHome) await fs.rm(tempHome, { recursive: true, force: true });
    await tempDb?.cleanup();
  });

  async function seedEmptyCompany() {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Clean install company",
      issuePrefix: `T${companyId.replace(/-/g, "").slice(0, 6).toUpperCase()}`,
      requireBoardApprovalForNewAgents: false,
    });
    return companyId;
  }

  async function listAdapterTypesByName(companyId: string) {
    const rows = await db
      .select({
        name: agents.name,
        role: agents.role,
        adapterType: agents.adapterType,
        permissions: agents.permissions,
      })
      .from(agents)
      .where(eq(agents.companyId, companyId));
    return new Map(rows.map((row) => [row.name, row]));
  }

  it("installs core-exec-team end-to-end with no caller overrides and creates 3 claude_local agents", async () => {
    const companyId = await seedEmptyCompany();
    const svc = teamsCatalogService(db);

    await svc.installCatalogTeam(companyId, "core-exec-team", {
      collisionStrategy: "rename",
      include: { projects: false, issues: false },
    });

    const byName = await listAdapterTypesByName(companyId);
    expect(byName.size).toBe(3);

    const adapterTypes = Array.from(byName.values()).map((row) => row.adapterType);
    expect(adapterTypes).toEqual(["claude_local", "claude_local", "claude_local"]);
    expect(adapterTypes).not.toContain("process");
    expect(adapterTypes).not.toContain("http");
  });

  it("installs product-design end-to-end with no caller overrides and uses claude_local", async () => {
    const companyId = await seedEmptyCompany();
    const svc = teamsCatalogService(db);

    await svc.installCatalogTeam(companyId, "product-design", {
      collisionStrategy: "rename",
      include: { projects: false, issues: false },
    });

    const byName = await listAdapterTypesByName(companyId);
    expect(byName.size).toBe(1);
    const adapterTypes = Array.from(byName.values()).map((row) => row.adapterType);
    expect(adapterTypes).toEqual(["claude_local"]);
    expect(adapterTypes).not.toContain("process");
  });

  it("installs product-engineering end-to-end with no caller overrides and uses claude_local for every agent", async () => {
    const companyId = await seedEmptyCompany();
    const svc = teamsCatalogService(db);

    await svc.installCatalogTeam(companyId, "product-engineering", {
      collisionStrategy: "rename",
      include: { projects: false, issues: false },
    });

    const byName = await listAdapterTypesByName(companyId);
    expect(byName.size).toBe(3);
    const adapterTypes = Array.from(byName.values()).map((row) => row.adapterType);
    expect(adapterTypes).toEqual(["claude_local", "claude_local", "claude_local"]);
    expect(adapterTypes).not.toContain("process");
    expect(byName.get("CTO")?.permissions).toMatchObject({ canCreateAgents: true });
  });

  it("honors an explicit caller adapter override for a single slug while defaulting the rest to claude_local", async () => {
    const companyId = await seedEmptyCompany();
    const svc = teamsCatalogService(db);

    await svc.installCatalogTeam(companyId, "core-exec-team", {
      collisionStrategy: "rename",
      include: { projects: false, issues: false },
      adapterOverrides: {
        cto: { adapterType: "opencode_local", adapterConfig: { model: "anthropic/claude-opus-4" } },
      },
    });

    const byName = await listAdapterTypesByName(companyId);
    expect(byName.size).toBe(3);
    const ctoRow = Array.from(byName.values()).find((row) => row.role === "engineering-manager" || row.name === "CTO");
    expect(ctoRow?.adapterType).toBe("opencode_local");
    const otherAdapters = Array.from(byName.values())
      .filter((row) => row !== ctoRow)
      .map((row) => row.adapterType);
    expect(otherAdapters).toEqual(["claude_local", "claude_local"]);
  });
  it("imports the evidence-first company through real persistence without starting agents", async () => {
    const companyId = await seedEmptyCompany();
    await db.update(companies).set({ status: "paused" }).where(eq(companies.id, companyId));
    const svc = teamsCatalogService(db);
    const prepared = await svc.prepareCatalogTeamSource(companyId, "evidence-first-company");
    const preview = await svc.previewCatalogTeamImport(companyId, "evidence-first-company", {
      include: { agents: true, projects: true, issues: true, skills: false },
    });
    expect(preview.errors).toEqual([]);
    await svc.installCatalogTeam(companyId, "evidence-first-company", {
      expectedContentHash: prepared.team.contentHash,
      include: { agents: true, projects: true, issues: true, skills: false },
    });
    const importedAgents = await db.select().from(agents).where(eq(agents.companyId, companyId));
    const importedProjects = await db.select().from(projects).where(eq(projects.companyId, companyId));
    const importedIssues = await db.select().from(issues).where(eq(issues.companyId, companyId));
    expect(importedAgents).toHaveLength(12);
    expect(importedProjects).toHaveLength(5);
    expect(importedIssues).toHaveLength(7);
    expect(importedAgents.reduce((total, agent) => total + agent.budgetMonthlyCents, 0)).toBe(10000);
    for (const agent of importedAgents) {
      expect(agent.status).toBe("paused");
      expect(agent.adapterType).toBe("codex_local");
      expect(agent.adapterConfig).toMatchObject({
        engine: "cli", dangerouslyBypassApprovalsAndSandbox: false,
        filesystemScope: "workspace", networkScope: "allowlist", fastMode: false,
      });
      expect(agent.runtimeConfig).toMatchObject({ heartbeat: { enabled: false, wakeOnDemand: false, maxConcurrentRuns: 1 } });
      expect(agent.permissions).toMatchObject({ canCreateAgents: false, canAssignTasks: false, canCreateSkills: false });
      const config = agent.adapterConfig as Record<string, unknown>;
      expect(["gpt-6-astra", "gpt-6-luna", "gpt-6-sol"]).toContain(config.model);
      if (config.model === "gpt-6-astra") expect(config.modelReasoningEffort).toBe("medium");
      if (config.model === "gpt-6-sol") expect(config.modelReasoningEffort).toBe("high");
      if (config.model === "gpt-6-luna") expect(["medium", "max"]).toContain(config.modelReasoningEffort);
    }
    for (const issue of importedIssues) {
      expect(issue.status).toBe("backlog");
      expect(issue.assigneeAgentId).toBeNull();
      expect(issue.assigneeUserId).toBeNull();
    }
    expect(importedProjects.every((project) => project.status === "backlog")).toBe(true);
    // Native catalog import does not authorize provider usage or resume the company.
    const company = (await db.select().from(companies).where(eq(companies.id, companyId)))[0];
    expect(company.status).toBe("paused");
  }, 60_000);

});
