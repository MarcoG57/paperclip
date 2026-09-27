import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveCatalogTeamRef } from "./index.js";
import { parseFrontmatterMarkdown } from "./frontmatter.js";

const team = resolveCatalogTeamRef("evidence-first-company")!;
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = parseFrontmatterMarkdown(`---\n${fs.readFileSync(path.join(root, team.path, ".paperclip.yaml"), "utf8")}\n---\n`).frontmatter as any;

describe("evidence-first native catalog contract", () => {
  it("is optional, local-only and contains no recurring wakeups", () => {
    expect(team.defaultInstall).toBe(false);
    expect(team.counts).toMatchObject({ agents: 12, projects: 5, tasks: 7, routines: 0, externalSkillSources: 0 });
    expect(team.sourceRefs).toEqual([]);
    expect(team.requiredSkills).toEqual([]);
  });
  it("serializes model, effort, budget and paused defaults into the actual sidecar format", () => {
    const values = Object.values(data.agents) as any[];
    expect(values).toHaveLength(12);
    expect(values.reduce((sum, value) => sum + value.budgetMonthlyCents, 0)).toBe(10000);
    for (const value of values) {
      expect(value.adapter.type).toBe("codex_local");
      expect(value.adapter.config.dangerouslyBypassApprovalsAndSandbox).toBe(false);
      expect(value.runtime.heartbeat).toMatchObject({ enabled: false, wakeOnDemand: false, maxConcurrentRuns: 1 });
    }
    expect(data.agents["engineer-a"].adapter.config).toMatchObject({ model: "gpt-6-luna", modelReasoningEffort: "max" });
    expect(data.agents.director.adapter.config).toMatchObject({ model: "gpt-6-astra", modelReasoningEffort: "medium" });
  });
});
