import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { verifyEvidence, timestamp } from "../../scripts/company/evidence.mjs";
let root, record;
const subjectHash = "sha256:" + "a".repeat(64);
const cases = [
  { id: "model-check", scope: "live", model: "gpt-6-luna", effort: "max" },
];
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "company-evidence-"));
  await fs.writeFile(path.join(root, "result.txt"), "synthetic test evidence");
  record = {
    schemaVersion: 1,
    caseId: "model-check",
    status: "PASS",
    scope: "live",
    sourceCommit: "b".repeat(40),
    subjectHash,
    startedAt: "2026-09-27T10:00:00Z",
    finishedAt: "2026-09-27T10:01:00Z",
    command: ["synthetic-fixture"],
    exitCode: 0,
    artifacts: [
      {
        path: "result.txt",
        sha256: createHash("sha256")
          .update("synthetic test evidence")
          .digest("hex"),
      },
    ],
    modelBinding: {
      model: "gpt-6-luna",
      effort: "max",
      runId: "synthetic-run",
    },
    reason: null,
  };
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});
const verify = () => verifyEvidence(record, { root, cases, subjectHash });
test("valid fixture checks integrity only, never runtime certification", async () => {
  const r = await verify();
  assert.equal(r.integrityValid, true);
  assert.equal(r.runtimeCertified, false);
});
for (const [name, mutation] of Object.entries({
  unknown: (r) => (r.extra = true),
  case: (r) => (r.caseId = "other"),
  scope: (r) => (r.scope = "mock"),
  stale: (r) => (r.subjectHash = "other"),
  commit: (r) => (r.sourceCommit = null),
  naive: (r) => (r.startedAt = "2026-09-27T10:00:00"),
  calendar: (r) => (r.startedAt = "2026-02-30T10:00:00Z"),
  duration: (r) => (r.finishedAt = "2026-09-26T10:00:00Z"),
  exit: (r) => (r.exitCode = 1),
  artifact: (r) => (r.artifacts = []),
  escape: (r) => (r.artifacts[0].path = "../escape"),
  absolute: (r) => (r.artifacts[0].path = "/etc/passwd"),
  hash: (r) => (r.artifacts[0].sha256 = "c".repeat(64)),
  model: (r) => (r.modelBinding.model = "other"),
  effort: (r) => (r.modelBinding.effort = "xhigh"),
  run: (r) => (r.modelBinding.runId = ""),
}))
  test(`reject ${name}`, async () => {
    mutation(record);
    await assert.rejects(verify());
  });
test("reject symlink artifact", async () => {
  await fs.symlink(path.join(root, "result.txt"), path.join(root, "link"));
  record.artifacts[0].path = "link";
  await assert.rejects(verify(), /SYMLINK/);
});
test("NOT_RUN requires an explicit reason and no execution claims", async () => {
  Object.assign(record, {
    status: "NOT_RUN",
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    artifacts: [],
    command: [],
    modelBinding: null,
    reason: "Host not available",
  });
  assert.equal((await verify()).status, "NOT_RUN");
  record.exitCode = 0;
  await assert.rejects(verify());
});
test("timestamp does not depend on optional validation packages", () => {
  assert.throws(() => timestamp("2026-09-27T10:00:00"));
  assert.throws(() => timestamp("2026-09-27T10:00:00+14:30"));
  assert.equal(
    timestamp("2026-09-27T12:00:00+02:00"),
    timestamp("2026-09-27T10:00:00Z"),
  );
});
