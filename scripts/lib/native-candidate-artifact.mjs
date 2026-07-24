import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  join,
  relative,
  resolve,
  sep,
} from "node:path";

export async function assertNativeArtifactMatchesCommit({
  artifactPath,
  repoRoot,
  commit,
}) {
  const candidateArchive = resolve(String(artifactPath || ""));
  const repository = resolve(String(repoRoot || ""));
  const candidateCommit = String(commit || "").trim().toLowerCase();
  if (!/^[a-f0-9]{40}$/.test(candidateCommit)) {
    throw new Error("candidate commit must be a full 40-character Git SHA");
  }
  const artifactStat = await lstat(candidateArchive).catch(() => null);
  if (!artifactStat?.isFile() || !candidateArchive.endsWith(".tar.gz")) {
    throw new Error(`native source archive is missing or invalid: ${candidateArchive}`);
  }

  const work = await mkdtemp(join(tmpdir(), "humi-native-artifact-check-"));
  try {
    const candidateRoot = join(work, "candidate");
    const expectedRoot = join(work, "expected");
    const expectedArchive = join(work, "expected.tar");
    await extractArchive(candidateArchive, candidateRoot, { gzip: true });
    execFileSync("git", [
      "archive",
      "--format=tar",
      `--output=${expectedArchive}`,
      candidateCommit,
      "miniprogram",
    ], {
      cwd: repository,
      stdio: ["ignore", "ignore", "pipe"],
    });
    await extractArchive(expectedArchive, expectedRoot, { gzip: false });

    const candidateMiniprogram = await findSingleMiniprogramRoot(candidateRoot);
    const expectedMiniprogram = resolve(expectedRoot, "miniprogram");
    const candidateManifest = await buildManifest(candidateMiniprogram);
    const expectedManifest = await buildManifest(expectedMiniprogram);
    if (JSON.stringify(candidateManifest) !== JSON.stringify(expectedManifest)) {
      const mismatch = firstMismatch(expectedManifest, candidateManifest);
      throw new Error(
        `native source archive does not match candidate commit ${candidateCommit}: ${mismatch}`,
      );
    }
  } finally {
    await rm(work, { recursive: true, force: true });
  }
  return true;
}

async function extractArchive(archivePath, targetRoot, { gzip }) {
  await mkdir(targetRoot, { recursive: true });
  const listArgs = gzip ? ["-tzf", archivePath] : ["-tf", archivePath];
  const entries = execFileSync("tar", listArgs, {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  }).split(/\r?\n/).filter(Boolean);
  for (const entry of entries) {
    const normalized = entry.replace(/\/+$/, "");
    if (
      normalized.startsWith("/")
      || normalized.split("/").some((segment) => segment === "..")
      || normalized.includes("\0")
    ) {
      throw new Error(`unsafe native source archive entry: ${entry}`);
    }
  }
  const extractArgs = gzip
    ? ["-xzf", archivePath, "-C", targetRoot]
    : ["-xf", archivePath, "-C", targetRoot];
  execFileSync("tar", extractArgs, { stdio: ["ignore", "ignore", "pipe"] });
}

async function findSingleMiniprogramRoot(root) {
  const candidates = [];
  const filesOutsideCandidates = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`native source archive may not contain symbolic links: ${relative(root, absolute)}`);
      }
      if (entry.isDirectory()) {
        if (entry.name === "miniprogram") candidates.push(absolute);
        else await visit(absolute);
      } else {
        filesOutsideCandidates.push(absolute);
      }
    }
  }

  await visit(root);
  if (candidates.length !== 1) {
    throw new Error("native source archive must contain exactly one miniprogram directory");
  }
  const miniprogramRoot = candidates[0];
  for (const file of filesOutsideCandidates) {
    if (!isInside(miniprogramRoot, file)) {
      throw new Error(`native source archive contains an unexpected file: ${relative(root, file)}`);
    }
  }
  return miniprogramRoot;
}

async function buildManifest(root) {
  const rootStat = await lstat(root).catch(() => null);
  if (!rootStat?.isDirectory()) throw new Error(`missing miniprogram directory: ${root}`);
  const entries = [];

  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const path = relative(root, absolute).split(sep).join("/");
      const stat = await lstat(absolute);
      if (stat.isSymbolicLink()) {
        throw new Error(`native source archive may not contain symbolic links: ${path}`);
      }
      if (stat.isDirectory()) {
        entries.push({ path, type: "directory" });
        await visit(absolute);
      } else if (stat.isFile()) {
        const content = await readFile(absolute);
        entries.push({
          path,
          type: "file",
          executable: Boolean(stat.mode & 0o111),
          bytes: content.length,
          sha256: createHash("sha256").update(content).digest("hex"),
        });
      } else {
        throw new Error(`native source archive contains an unsupported entry: ${path}`);
      }
    }
  }

  await visit(root);
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function firstMismatch(expected, actual) {
  const limit = Math.max(expected.length, actual.length);
  for (let index = 0; index < limit; index += 1) {
    if (JSON.stringify(expected[index]) !== JSON.stringify(actual[index])) {
      return `entry ${index + 1} expected ${describe(expected[index])}, received ${describe(actual[index])}`;
    }
  }
  return "manifest differs";
}

function describe(entry) {
  if (!entry) return "(missing)";
  return `${entry.type}:${entry.path}`;
}

function isInside(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel !== "" && !rel.startsWith(`..${sep}`) && rel !== "..";
}
