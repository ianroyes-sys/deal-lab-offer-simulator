import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { workshopSources, saveWorkshopDraft, readWorkshopDraft, listWorkshopDrafts, exportWorkshopDraft } from './workshop.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deal-lab-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const write = (file, data) => { const p = path.join(root, file); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof data === 'string' ? data : JSON.stringify(data)); };
  return { root, write };
}
const deal = { kind: 'deal', title: 'A church offer', sourceId: 'client:demo', payload: { version: 1, sourceName: 'Demo', scenario: { buildFee: 1500, retainer: 99, costPerClient: 10, hoursPerClient: 2, availableHours: 20, target: 500, clientCount: 5 }, brief: 'A proposed scoped offer, not booked revenue.' } };

test('saved deal survives reload and export without changing source registers', t => {
  const f = fixture(t); f.write('data/fleet.json', [{ name: 'Demo', status: 'building' }]);
  const before = fs.readFileSync(path.join(f.root, 'data/fleet.json'), 'utf8');
  const d = saveWorkshopDraft(deal, f);
  assert.deepEqual(readWorkshopDraft(f.root, d.id), d); assert.equal(d.revision, 1);
  assert.match(exportWorkshopDraft(d), /Draft for review/);
  assert.equal(listWorkshopDrafts(f.root).length, 1);
  assert.equal(fs.readFileSync(path.join(f.root, 'data/fleet.json'), 'utf8'), before);
});
test('optimistic revisions prevent overwriting another saved edit', t => {
  const f = fixture(t); const d = saveWorkshopDraft(deal, f);
  const updated = saveWorkshopDraft({ ...d, title: 'Revised' }, f); assert.equal(updated.revision, 2);
  assert.throws(() => saveWorkshopDraft({ ...d, title: 'Stale' }, f), /another window/);
  assert.equal(readWorkshopDraft(f.root, d.id).title, 'Revised');
});
test('invalid money, unknown kinds and path traversal are rejected', t => {
  const f = fixture(t);
  assert.throws(() => saveWorkshopDraft({ ...deal, payload: { ...deal.payload, scenario: { ...deal.payload.scenario, retainer: -1 } } }, f), /retainer/);
  assert.throws(() => saveWorkshopDraft({ ...deal, kind: 'story' }, f), /deal/);
  assert.throws(() => readWorkshopDraft(f.root, '../../file'), /Invalid/);
});
test('source records distinguish prospects from delivered and stale balances from current money', t => {
  const f = fixture(t);
  f.write('data/clients.json', { clients: [{ slug: 'first', name: 'First', tier: 'delivered' }, { slug: 'demo', name: 'Demo', tier: 'prospect' }] });
  f.write('data/business.json', { ledger: { mrr: 100, asOf: '2020-01-01' } });
  f.write('data/goals.md', 'Revenue scoreboard: $750 MRR');
  const s = workshopSources({ root: f.root });
  assert.deepEqual(s.projects.map(p => p.status), ['delivered', 'prospect']);
  assert.equal(s.mission.currentMrr, null); assert.equal(s.mission.recordedMrr, 100); assert.equal(s.mission.goal, 750);
  const fresh = workshopSources({ root: f.root, now: Date.parse('2020-01-03') });
  assert.equal(fresh.mission.currentMrr, 100);
});
test('invalid scenario denominators and baseline cannot produce misleading math', t => {
  const f = fixture(t);
  for (const change of [{ retainer: 0 }, { hoursPerClient: 0 }, { availableHours: 0 }, { baselineMrr: -10 }, { baselineMrr: '100' }, { clientCount: 1.5 }])
    assert.throws(() => saveWorkshopDraft({ ...deal, payload: { ...deal.payload, scenario: { ...deal.payload.scenario, ...change } } }, f), /Scenario|scenario/);
  const d = saveWorkshopDraft({ ...deal, payload: { ...deal.payload, scenario: { ...deal.payload.scenario, baselineMrr: 100 } } }, f);
  assert.equal(readWorkshopDraft(f.root, d.id).payload.scenario.baselineMrr, 100);
});
test('the bundled example data loads as a coherent inventory', () => {
  const s = workshopSources({ dataDir: new URL('../data/example', import.meta.url).pathname });
  assert.ok(s.projects.some(p => p.kind === 'app')); assert.ok(s.projects.some(p => p.kind === 'client'));
  assert.equal(typeof s.mission.goal, 'number');
});
