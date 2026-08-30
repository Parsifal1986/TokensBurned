import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const START = "<!-- burn:start -->";
const END = "<!-- burn:end -->";
const PROJECT_URL = "https://parsifal1986.github.io/TokensBurned/";

export function profileCardMarkdown(repository, branch = "burn") {
  return `${START}\n[![TokensBurned AI Coding Stats](https://raw.githubusercontent.com/${repository}/${branch}/stats.svg)](${PROJECT_URL})\n${END}`;
}

async function gh(args, options = {}) {
  try {
    const { stdout } = await execFileAsync("gh", args, {
      maxBuffer: 4 * 1024 * 1024,
      ...options,
    });
    return stdout.trim();
  } catch (error) {
    const detail = error.stderr?.trim() || error.message;
    throw new Error(`GitHub CLI failed: ${detail}`);
  }
}

export async function githubIdentity() {
  return gh(["api", "user", "--jq", ".login"]);
}

async function apiJson(endpoint) {
  return JSON.parse(await gh(["api", endpoint]));
}

async function ensureBurnBranch(repository, branch) {
  try {
    await gh(["api", `repos/${repository}/git/ref/heads/${branch}`]);
    return;
  } catch {
    const repo = await apiJson(`repos/${repository}`);
    const source = await apiJson(`repos/${repository}/git/ref/heads/${repo.default_branch}`);
    await gh([
      "api",
      "-X",
      "POST",
      `repos/${repository}/git/refs`,
      "-f",
      `ref=refs/heads/${branch}`,
      "-f",
      `sha=${source.object.sha}`,
    ]);
  }
}

async function getContent(repository, file, branch) {
  try {
    return await apiJson(`repos/${repository}/contents/${file}?ref=${encodeURIComponent(branch)}`);
  } catch {
    return null;
  }
}

async function putContent(repository, file, branch, content, message) {
  const existing = await getContent(repository, file, branch);
  const encoded = Buffer.from(content).toString("base64");
  const args = [
    "api", "-X", "PUT", `repos/${repository}/contents/${file}`,
    "-f", `message=${message}`,
    "-f", `content=${encoded}`,
    "-f", `branch=${branch}`,
  ];
  if (existing?.sha) args.push("-f", `sha=${existing.sha}`);
  await gh(args);
}

export async function configureProfile({ repository, branch = "burn", svg, json }) {
  const repo = await apiJson(`repos/${repository}`);
  await ensureBurnBranch(repository, branch);
  await putContent(repository, "stats.json", branch, json, "chore(burn): initialize stats");
  await putContent(repository, "stats.svg", branch, svg, "chore(burn): initialize card");

  const readme = await getContent(repository, "README.md", repo.default_branch);
  if (!readme) throw new Error("Profile repository has no README.md.");
  const current = Buffer.from(readme.content, "base64").toString("utf8");
  if (!current.includes(START)) {
    const image = `\n\n${profileCardMarkdown(repository, branch)}\n`;
    await putContent(
      repository,
      "README.md",
      repo.default_branch,
      `${current.trimEnd()}${image}`,
      "docs: add Burn AI coding stats",
    );
  }
  return { defaultBranch: repo.default_branch };
}

export async function syncProfile({ repository, branch = "burn", svg, json }) {
  await ensureBurnBranch(repository, branch);
  const remoteStats = await getContent(repository, "stats.json", branch);
  if (remoteStats) {
    const current = Buffer.from(remoteStats.content, "base64").toString("utf8");
    if (current.trim() === json.trim()) return { changed: false };
  }
  await putContent(repository, "stats.json", branch, json, "chore(burn): update stats");
  await putContent(repository, "stats.svg", branch, svg, "chore(burn): update card");
  return { changed: true };
}
