/** Same-host/same-user single-writer guard. Not a distributed lock. */
import fs from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { digest, invariant } from "./model.mjs";
export async function withInstallLock(
  target,
  fn,
  directory = path.join(os.homedir(), ".paperclip-company-operator"),
) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await fs.lstat(directory);
  invariant(
    stat.isDirectory() &&
      !stat.isSymbolicLink() &&
      (stat.mode & 0o777) === 0o700,
    "UNSAFE_OPERATOR_STATE_DIRECTORY",
  );
  invariant(
    process.getuid === undefined || stat.uid === process.getuid(),
    "FOREIGN_OPERATOR_STATE_DIRECTORY",
  );
  const file = path.join(directory, `install-${digest(target).slice(7)}.lock`);
  let handle;
  try {
    handle = await fs.open(
      file,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o600,
    );
  } catch (error) {
    if (error.code === "EEXIST")
      throw new Error("INSTALL_LOCK_EXISTS_INSPECT_BEFORE_REMOVING");
    throw error;
  }
  try {
    await handle.writeFile(
      JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }),
    );
    await handle.sync();
    return await fn();
  } finally {
    await handle.close();
    await fs.unlink(file);
  }
}
