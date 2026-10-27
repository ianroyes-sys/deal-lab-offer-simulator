#!/usr/bin/env node
// deal-lab: scenario math and offer briefs from the command line.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_SCENARIO, economics, offerBrief, usd } from '../src/scenario.mjs';
import { workshopSources, listWorkshopDrafts } from '../src/workshop.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [command = 'help', ...rest] = process.argv.slice(2);
const flags = {};
for (let i = 0; i < rest.length; i++) if (rest[i].startsWith('--')) flags[rest[i].slice(2)] = rest[i + 1]?.startsWith('--') || rest[i + 1] === undefined ? true : rest[++i];
const dataDir = path.resolve(flags.data || (fs.existsSync(path.join(ROOT, 'data/fleet.json')) ? path.join(ROOT, 'data') : path.join(ROOT, 'data/example')));

if (command === 'sources') {
  console.log(JSON.stringify(workshopSources({ root: ROOT, dataDir }), null, 2));
} else if (command === 'scenario') {
  const s = { ...DEFAULT_SCENARIO };
  for (const key of Object.keys(s)) if (flags[key] !== undefined) s[key] = Number(flags[key]);
  const e = economics(s);
  console.log(`New MRR if ${s.clientCount} sign: ${usd(e.simulated)} (total ${usd(e.recurring)}/mo vs target ${usd(s.target)})`);
  console.log(`Retainers still needed: ${e.needed} · support fits ${e.capacity} clients · contribution ${usd(e.contribution)}/mo · one-time builds ${usd(e.oneTimeBuilds)}`);
  if (flags.source) {
    const source = workshopSources({ root: ROOT, dataDir }).projects.find(p => p.id === flags.source);
    console.log('\n' + offerBrief(source, s, { studio: flags.studio || process.env.DEAL_LAB_STUDIO_NAME }));
  }
} else if (command === 'drafts') {
  for (const d of listWorkshopDrafts(ROOT)) console.log(`${d.id}  r${d.revision}  ${d.title}`);
} else {
  console.log('Usage: deal-lab sources | scenario [--retainer 99 --clientCount 5 ... --source client:slug] | drafts   [--data DIR]');
}
