#!/usr/bin/env node
// Prepare local catalog changes only. Publishing and deployment remain separate.
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { stableVersion } from '../src/update.js';

const repo = 'Parsifal1986/TokensBurned';
const root = fileURLToPath(new URL('../', import.meta.url));
export function validatePublishedRelease(release, version) {
  if (!stableVersion(version) || release.tag_name !== `v${version}` || release.draft !== false || release.prerelease !== false || !release.published_at) {
    throw new Error('Only a published, non-prerelease vMAJOR.MINOR.PATCH release can enter the stable catalog.');
  }
}
async function github(resource) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${resource}`, {headers:{Accept:'application/vnd.github+json'},signal:AbortSignal.timeout(15000)});
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  return response.json();
}
async function main() {
  const version = stableVersion(process.argv[2]);
  if (!version) throw new Error('Usage: node scripts/promote-release.mjs vMAJOR.MINOR.PATCH [cloud-checkout]');
  const tag = `v${version}`;
  const release = await github(`releases/tags/${tag}`);
  validatePublishedRelease(release, version);
  const commit = await github(`commits/${tag}`);
  if (!/^[0-9a-f]{40}$/.test(commit.sha)) throw new Error('Invalid release commit');
  const metadata = await github(`contents/package.json?ref=${commit.sha}`);
  const pkg = JSON.parse(Buffer.from(metadata.content, 'base64').toString('utf8'));
  if (pkg.version !== version) throw new Error('Tag and package version disagree');
  // Validate all inputs before changing either local catalog.
  const entries = [];
  for (const [filename, source] of [
    ['.agents/plugins/marketplace.json', {source:'url',url:`https://github.com/${repo}.git`}],
    ['.claude-plugin/marketplace.json', {source:'github',repo}],
  ]) {
    const file = path.join(root,filename);
    const catalog = JSON.parse(await fs.readFile(file,'utf8'));
    const plugin = catalog.plugins.find(p=>p.name==='tokensburned');
    plugin.source = {...source,ref:tag,sha:commit.sha};
    if ('version' in plugin) plugin.version=version;
    entries.push([file,JSON.stringify(catalog,null,2)+'\n']);
  }
  if (process.argv[3]) {
    const file=path.resolve(process.argv[3],'src/release.js');
    const previous=await fs.readFile(file,'utf8');
    const next=previous.replace(/release_tag: "[^"]+"/,`release_tag: "${tag}"`).replace(/latest_version: "[^"]+"/,`latest_version: "${version}"`).replace(/update_url: "[^"]+"/,`update_url: "https://github.com/${repo}/releases/tag/${tag}"`);
    if (!next.includes('channel: "stable"')) throw new Error('Cloud checkout must support stable releases');
    entries.push([file,next]);
  }
  for (const [file,content] of entries) await fs.writeFile(file,content);
  console.log(`Prepared stable ${tag} at ${commit.sha}. Review and publish catalog/API changes separately.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}
