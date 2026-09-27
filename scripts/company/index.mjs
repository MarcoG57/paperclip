#!/usr/bin/env node
/** Operator entrypoint. Keep bindings and credentials outside the repository. */
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadSources, generatedDrift } from "./generate.mjs";
import { makePlan, preview, apply, inspect } from "./install.mjs";
import { createClient } from "./api.mjs";
import { withInstallLock } from "./lock.mjs";
import { invariant, reviewPolicy } from "./model.mjs";
const HELP = `Usage:
  node scripts/company/index.mjs validate
  node scripts/company/index.mjs plan --bindings /private/bindings.json
  node scripts/company/index.mjs preview --bindings /private/bindings.json
  node scripts/company/index.mjs apply --bindings /private/bindings.json --approve-plan sha256:...
  node scripts/company/index.mjs doctor --bindings /private/bindings.json
  node scripts/company/index.mjs review-policy --role engineer-a --ids /private/ids.json --owner USER_ID
Credentials: PAPERCLIP_API_KEY or PAPERCLIP_OPERATOR_COOKIE in the environment.
No command activates agents, calls models, buys infrastructure, or sends messages.`;
export function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  invariant(
    [
      "validate",
      "plan",
      "preview",
      "apply",
      "doctor",
      "review-policy",
    ].includes(command),
    "UNKNOWN_COMMAND",
  );
  const allowed =
    command === "review-policy"
      ? ["role", "ids", "owner"]
      : command === "apply"
        ? ["bindings", "approve-plan"]
        : ["bindings"];
  for (let i = 0; i < rest.length; i += 2) {
    const key = rest[i]?.slice(2);
    invariant(
      rest[i]?.startsWith("--") &&
        allowed.includes(key) &&
        !Object.hasOwn(options, key) &&
        rest[i + 1] &&
        !rest[i + 1].startsWith("--"),
      "INVALID_ARGUMENTS",
    );
    options[key] = rest[i + 1];
  }
  return { command, options };
}
async function readJson(file) {
  invariant(file, "INPUT_FILE_REQUIRED");
  return JSON.parse(await fs.readFile(file, "utf8"));
}
export async function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === "--help") {
    console.log(HELP);
    return 0;
  }
  const { command, options } = parseArgs(argv);
  const { preset } = await loadSources();
  if (command === "validate") {
    const drift = await generatedDrift();
    console.log(
      JSON.stringify(
        {
          valid: drift.length === 0,
          drift,
          roles: preset.roles.length,
          scope: "AUTHORING_ONLY",
        },
        null,
        2,
      ),
    );
    return drift.length ? 1 : 0;
  }
  if (command === "review-policy") {
    console.log(
      JSON.stringify(
        reviewPolicy(
          options.role,
          preset,
          await readJson(options.ids),
          options.owner,
        ),
        null,
        2,
      ),
    );
    return 0;
  }
  const plan = await makePlan(await readJson(options.bindings));
  if (command === "plan") {
    console.log(JSON.stringify(plan, null, 2));
    return 0;
  }
  const request = createClient(plan.bindings.apiOrigin, {
    token: process.env.PAPERCLIP_API_KEY,
    cookie: process.env.PAPERCLIP_OPERATOR_COOKIE,
  });
  const report =
    command === "preview"
      ? await preview(plan, request)
      : command === "doctor"
        ? await inspect(plan, request)
        : await withInstallLock(plan.bindings, () =>
            apply(plan, options["approve-plan"], request),
          );
  console.log(JSON.stringify(report, null, 2));
  return report.configured === false ? 2 : 0;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error.message,
        status: "BLOCKED",
        activationAttempted: false,
      }),
    );
    process.exitCode = 1;
  }
}
