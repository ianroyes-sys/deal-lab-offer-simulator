// Local offer drafts. Source registers stay read-only; scenarios stay scenarios.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const clip = (value, n = 1000) => String(value ?? '').trim().slice(0, n);
const slug = value => clip(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const validId = id => typeof id === 'string' && /^[a-f0-9-]{36}$/.test(id);
function read(file) { try { return fs.readFileSync(file, 'utf8'); } catch { return ''; } }
function json(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } }
function array(value) { return Array.isArray(value) ? value : []; }
const safeHref = value => typeof value === 'string' && (/^\/(?!\/)/.test(value) || /^https?:\/\//.test(value)) ? value : undefined;

/**
 * Project inventory (apps you shipped + client/prospect records) and the revenue mission.
 * dataDir holds fleet.json, clients.json, business.json and optionally goals.md.
 */
export function workshopSources({ root = ROOT, dataDir = path.join(root, 'data'), goalsFile = process.env.DEAL_LAB_GOALS_FILE || path.join(dataDir, 'goals.md'), now = Date.now() } = {}) {
  const fleet = array(json(path.join(dataDir, 'fleet.json'), []));
  const clients = array(json(path.join(dataDir, 'clients.json'), {})?.clients);
  const projects = [
    ...fleet.filter(p => p && p.name).map(p => ({ id: `fleet:${slug(p.name)}`, name: clip(p.name, 160), kind: 'app', status: clip(p.status, 80), description: clip(p.tagline || p.needs, 500), href: safeHref(p.brief || p.url), source: 'fleet.json' })),
    ...clients.filter(p => p && p.slug && p.name).map(p => ({ id: `client:${slug(p.slug)}`, name: clip(p.name, 160), kind: 'client', status: p.tier === 'delivered' ? 'delivered' : 'prospect', description: clip(`${p.app || ''}${p.design ? ' · ' + p.design : ''}`, 500), source: 'clients.json' })),
  ];
  const goals = read(goalsFile);
  const goal = Number(goals.match(/\$([\d,]+)\s*MRR/i)?.[1]?.replace(/,/g, '')) || 500;
  const ledger = json(path.join(dataDir, 'business.json'), {})?.ledger;
  const recordedMrr = typeof ledger?.mrr === 'number' && Number.isFinite(ledger.mrr) ? ledger.mrr : null;
  // A stale ledger is useful context but not a live balance. No default zero claim.
  const sourceAt = Date.parse(ledger?.asOf || '');
  const currentMrr = Number.isFinite(sourceAt) && now - sourceAt <= 7 * 86400000 && sourceAt <= now ? recordedMrr : null;
  return { projects, mission: { goal, currentMrr, recordedMrr, sourceDate: ledger?.asOf || null, note: currentMrr === null ? 'Current recurring revenue is unverified. Set a scenario baseline explicitly.' : 'Recorded ledger value; not a live payment-provider balance.' } };
}

function draftPath(root, id) { if (!validId(id)) throw new Error('Invalid draft ID.'); return path.join(root, 'data/drafts', `${id}.json`); }
export function readWorkshopDraft(root, id) {
  const file = draftPath(root, id);
  const d = json(file, null);
  if (!d || d.id !== id || d.kind !== 'deal' || typeof d.title !== 'string' || !Number.isInteger(d.revision) || d.revision < 1 || !d.payload || typeof d.payload !== 'object' || typeof d.updatedAt !== 'string' || typeof d.createdAt !== 'string') throw new Error('Draft not found or damaged.');
  validateWorkshopDraft(d);
  return d;
}
export function listWorkshopDrafts(root = ROOT) {
  const dir = path.join(root, 'data/drafts');
  let files = []; try { files = fs.readdirSync(dir).filter(f => f.endsWith('.json')); } catch {}
  return files.map(f => { try { return readWorkshopDraft(root, f.slice(0, -5)); } catch { return null; } }).filter(Boolean).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function validateWorkshopDraft(input, kind = input?.kind) {
  if (kind !== 'deal') throw new Error('Choose a deal draft.');
  if (typeof input?.title !== 'string' || !input.title.trim() || input.title.length > 200) throw new Error('Give the draft a title of 1–200 characters.');
  const payload = input.payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || JSON.stringify(payload).length > 50000) throw new Error('Draft content is missing or too large.');
  if (payload.version !== 1) throw new Error('Unsupported draft version.');
  if (typeof payload.brief !== 'string' || payload.brief.length > 20000 || !payload.scenario || typeof payload.scenario !== 'object') throw new Error('Deal requires a brief and scenario.');
  for (const key of ['buildFee', 'retainer', 'costPerClient', 'hoursPerClient', 'availableHours', 'target', 'clientCount']) {
    const n = payload.scenario[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 10000000) throw new Error(`Invalid scenario ${key}.`);
  }
  for (const key of ['retainer', 'hoursPerClient', 'availableHours']) if (payload.scenario[key] <= 0) throw new Error(`Scenario ${key} must be positive.`);
  if (!Number.isInteger(payload.scenario.clientCount)) throw new Error('Scenario clientCount must be a whole number.');
  const baseline = payload.scenario.baselineMrr;
  if (baseline !== undefined && (typeof baseline !== 'number' || !Number.isFinite(baseline) || baseline < 0 || baseline > 10000000)) throw new Error('Invalid scenario baselineMrr.');
  if (payload.sourceName !== undefined && (typeof payload.sourceName !== 'string' || payload.sourceName.length > 500)) throw new Error('Invalid draft sourceName.');
  return { kind, title: input.title.trim(), sourceId: typeof input.sourceId === 'string' ? input.sourceId.slice(0, 300) : null, payload: JSON.parse(JSON.stringify(payload)) };
}

/** Create or update a draft. Updates must carry the current revision (optimistic concurrency). */
export function saveWorkshopDraft(input, { root = ROOT, now = new Date() } = {}) {
  const old = input?.id ? readWorkshopDraft(root, input.id) : null;
  if (old && input.revision !== old.revision) throw new Error('Draft changed in another window. Reload before saving.');
  const fields = validateWorkshopDraft(input, old?.kind);
  const id = old?.id || randomUUID();
  const draft = { id, ...fields, sourceId: fields.sourceId || old?.sourceId || null, createdAt: old?.createdAt || now.toISOString(), updatedAt: now.toISOString(), revision: (old?.revision || 0) + 1 };
  const file = draftPath(root, id);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(tmp, JSON.stringify(draft, null, 2) + '\n', { mode: 0o600, flag: 'wx' }); fs.renameSync(tmp, file); }
  finally { fs.rmSync(tmp, { force: true }); }
  return draft;
}

export function exportWorkshopDraft(draft) {
  const p = draft.payload;
  return [`# ${draft.title}`, '', `Local offer scenario · saved ${draft.updatedAt}`, 'Draft for review. No outreach, agreement, publication or factual outcome is implied.', '',
    '## Scenario assumptions', ...Object.entries(p.scenario).map(([k, v]) => `- ${k}: ${v}`), '', '## Offer brief', p.brief].join('\n') + '\n';
}
