import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SCENARIO, economics, offerBrief, usd } from './scenario.mjs';

test('default scenario: five $99 retainers against a $500 target', () => {
  const e = economics(DEFAULT_SCENARIO);
  assert.equal(e.simulated, 495); assert.equal(e.recurring, 495);
  assert.equal(e.needed, 6); assert.equal(e.capacity, 10);
  assert.equal(e.contribution, 5 * (99 - 15)); assert.equal(e.hours, 10);
  assert.equal(e.oneTimeBuilds, 7500); assert.equal(e.overCapacity, false); assert.equal(e.capacityShortfall, false);
});
test('baseline above target needs zero new clients; support overflow is flagged', () => {
  assert.equal(economics({ ...DEFAULT_SCENARIO, baselineMrr: 900 }).needed, 0);
  const e = economics({ ...DEFAULT_SCENARIO, hoursPerClient: 5, clientCount: 6 });
  assert.equal(e.overCapacity, true); assert.equal(e.capacity, 4);
  assert.equal(e.capacityShortfall, true);
});
test('offer brief carries the scenario numbers and never claims a signed deal', () => {
  const brief = offerBrief({ name: 'Harbor Bakery', status: 'prospect', description: 'Neighborhood bakery wanting pre-orders.' }, { ...DEFAULT_SCENARIO, retainer: 250 }, { studio: 'Example Studio' });
  assert.match(brief, /Harbor Bakery/); assert.match(brief, /\$250\/mo/); assert.match(brief, /Example Studio/);
  assert.match(brief, /not a signed agreement/);
  assert.match(offerBrief(undefined, DEFAULT_SCENARIO), /status unconfirmed/);
  assert.equal(usd(1500), '$1,500');
});
