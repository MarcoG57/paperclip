/** Validate evidence integrity. This does not authenticate a human or certify a runtime. */
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { exactKeys, invariant } from "./model.mjs";
export function timestamp(value) {
  invariant(typeof value === "string", "TIMESTAMP_REQUIRED");
  const m =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(
      value,
    );
  invariant(m, "ZONED_RFC3339_REQUIRED");
  const [y, mo, d, h, mi, s] = m.slice(1, 7).map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0),
    days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  invariant(
    y >= 2000 &&
      mo >= 1 &&
      mo <= 12 &&
      d >= 1 &&
      d <= days[mo - 1] &&
      h < 24 &&
      mi < 60 &&
      s < 60,
    "INVALID_CALENDAR_TIME",
  );
  if (m[7] !== "Z") {
    const [hours, minutes] = m[7].slice(1).split(":").map(Number);
    invariant(
      hours <= 14 && minutes < 60 && (hours < 14 || minutes === 0),
      "INVALID_TIMEZONE",
    );
  }
  const result = Date.parse(value);
  invariant(Number.isFinite(result), "INVALID_TIMESTAMP");
  return result;
}
export async function verifyEvidence(record, { root, cases, subjectHash }) {
  exactKeys(
    record,
    [
      "schemaVersion",
      "caseId",
      "status",
      "scope",
      "sourceCommit",
      "subjectHash",
      "startedAt",
      "finishedAt",
      "command",
      "exitCode",
      "artifacts",
      "modelBinding",
      "reason",
    ],
    "EVIDENCE",
  );
  invariant(record.schemaVersion === 1, "UNSUPPORTED_EVIDENCE");
  const spec = cases.find((c) => c.id === record.caseId);
  invariant(spec, "UNKNOWN_CASE");
  invariant(
    ["PASS", "FAIL", "BLOCKED", "NOT_RUN"].includes(record.status),
    "INVALID_STATUS",
  );
  invariant(record.scope === spec.scope, "EVIDENCE_SCOPE_MISMATCH");
  invariant(
    Array.isArray(record.artifacts) && Array.isArray(record.command),
    "INVALID_EVIDENCE_ARRAYS",
  );
  if (["BLOCKED", "NOT_RUN"].includes(record.status)) {
    invariant(
      typeof record.reason === "string" && record.reason.trim(),
      "REASON_REQUIRED",
    );
    invariant(
      record.startedAt === null &&
        record.finishedAt === null &&
        record.exitCode === null &&
        record.artifacts.length === 0 &&
        record.command.length === 0 &&
        record.modelBinding === null,
      "UNRUN_CASE_CANNOT_CLAIM_EXECUTION",
    );
    return {
      caseId: record.caseId,
      status: record.status,
      integrityValid: true,
      runtimeCertified: false,
    };
  }
  invariant(record.subjectHash === subjectHash, "STALE_EVIDENCE_SUBJECT");
  invariant(
    typeof record.sourceCommit === "string" &&
      /^[a-f0-9]{40}$/.test(record.sourceCommit),
    "SOURCE_COMMIT_REQUIRED",
  );
  invariant(
    timestamp(record.finishedAt) >= timestamp(record.startedAt),
    "NEGATIVE_DURATION",
  );
  invariant(
    record.command.length > 0 &&
      record.command.every((c) => typeof c === "string" && c.length > 0),
    "COMMAND_REQUIRED",
  );
  invariant(Number.isInteger(record.exitCode), "EXIT_CODE_REQUIRED");
  if (record.status === "PASS")
    invariant(record.exitCode === 0, "PASS_REQUIRES_SUCCESS_EXIT");
  else
    invariant(
      typeof record.reason === "string" && record.reason.trim(),
      "FAIL_REASON_REQUIRED",
    );
  invariant(record.artifacts.length > 0, "ARTIFACT_REQUIRED");
  const rootStat = await fs.lstat(root);
  invariant(
    rootStat.isDirectory() && !rootStat.isSymbolicLink(),
    "INVALID_EVIDENCE_ROOT",
  );
  const base = await fs.realpath(root);
  for (const artifact of record.artifacts) {
    exactKeys(artifact, ["path", "sha256"], "ARTIFACT");
    invariant(
      typeof artifact.path === "string" &&
        artifact.path.length > 0 &&
        !path.isAbsolute(artifact.path) &&
        !artifact.path.includes("\\") &&
        !artifact.path.split("/").some((p) => !p || p === "." || p === ".."),
      "UNSAFE_ARTIFACT_PATH",
    );
    let current = base;
    for (const part of artifact.path.split("/")) {
      current = path.join(current, part);
      invariant(
        !(await fs.lstat(current)).isSymbolicLink(),
        "SYMLINK_ARTIFACT",
      );
    }
    const stat = await fs.stat(current);
    invariant(
      stat.isFile() && stat.size <= 10 * 1024 * 1024,
      "INVALID_ARTIFACT_FILE",
    );
    invariant(
      typeof artifact.sha256 === "string" &&
        /^[a-f0-9]{64}$/.test(artifact.sha256),
      "INVALID_ARTIFACT_HASH",
    );
    invariant(
      createHash("sha256")
        .update(await fs.readFile(current))
        .digest("hex") === artifact.sha256,
      "ARTIFACT_HASH_MISMATCH",
    );
  }
  if (spec.model) {
    exactKeys(
      record.modelBinding,
      ["model", "effort", "runId"],
      "MODEL_BINDING",
    );
    invariant(
      record.modelBinding.model === spec.model &&
        record.modelBinding.effort === spec.effort,
      "MODEL_BINDING_MISMATCH",
    );
    invariant(
      typeof record.modelBinding.runId === "string" &&
        record.modelBinding.runId.trim(),
      "RUN_ID_REQUIRED",
    );
  } else invariant(record.modelBinding === null, "UNEXPECTED_MODEL_BINDING");
  return {
    caseId: record.caseId,
    status: record.status,
    integrityValid: true,
    runtimeCertified: false,
  };
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    invariant(
      process.argv.length === 6,
      "Usage: node scripts/company/evidence.mjs RECORD.json ARTIFACT_ROOT CASES.json SUBJECT_HASH",
    );
    const [recordFile, root, casesFile, subjectHash] = process.argv.slice(2);
    const result = await verifyEvidence(
      JSON.parse(await fs.readFile(recordFile, "utf8")),
      {
        root,
        cases: JSON.parse(await fs.readFile(casesFile, "utf8")),
        subjectHash,
      },
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      JSON.stringify({ integrityValid: false, error: error.message }),
    );
    process.exitCode = 1;
  }
}
