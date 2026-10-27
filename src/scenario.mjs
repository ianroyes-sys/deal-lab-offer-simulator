// Pure offer economics for a build-fee + monthly-retainer service business.
// Everything here is a scenario: nothing is a forecast, a ledger value or a signed deal.

export const DEFAULT_SCENARIO = Object.freeze({ buildFee: 1500, retainer: 99, costPerClient: 15, hoursPerClient: 2, availableHours: 20, target: 500, clientCount: 5, baselineMrr: 0 });

export const usd = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

/** Derived numbers shown on the runway chart and the economics panel. */
export function economics(s) {
  const current = s.baselineMrr;
  const simulated = s.clientCount * s.retainer;
  const recurring = current + simulated;
  const contribution = s.clientCount * (s.retainer - s.costPerClient);
  const hours = s.clientCount * s.hoursPerClient;
  const needed = Math.max(0, Math.ceil((s.target - current) / s.retainer));
  const capacity = s.hoursPerClient > 0 ? Math.floor(s.availableHours / s.hoursPerClient) : 0;
  return {
    current, simulated, recurring, contribution, hours, needed, capacity,
    oneTimeBuilds: s.clientCount * s.buildFee,
    overCapacity: hours > s.availableHours,
    capacityShortfall: needed > capacity,
  };
}

/** Editable working brief grounded in one selected project. Never sent anywhere. */
export function offerBrief(source, s, { studio = 'Your studio' } = {}) {
  const name = source?.name || 'New prospect';
  return `# ${name} — offer working draft

Prepared by ${studio} · scenario, not a signed agreement

## The opportunity
${source?.description || 'Confirm the organization, its audience, and the problem this app should solve.'}

## What we propose
A focused mobile app that gives this community one place to find its essential content and next steps. Confirm the feature list after a walkthrough of the existing demo.

## Commercial scenario
- One-time build: ${usd(s.buildFee)}
- Monthly maintenance: ${usd(s.retainer)}/mo
- Scope to agree: release support, dependency updates, and a monthly health check.
- New features and substantial content work are quoted separately.
- The organization owns its Apple Developer account and pays Apple directly.

## Before this becomes an offer
- Verify the demo works and identify exactly what needs finishing.
- Agree deliverables, launch timing, support limits, and cancellation terms.
- Confirm pricing fits your recorded terms or record the changed decision.
- Confirm eligibility for any founding or introductory rate.

## The next conversation
“I have a working app concept for ${source?.name || 'your organization'}. Could we walk through it together and see whether it solves a real need?”

## Internal capacity assumptions
${s.hoursPerClient} support hours/client/month; ${usd(s.costPerClient)} direct costs/client/month; ${s.availableHours} available support hours/month. Build time, acquisition costs, taxes, and owner compensation are not included.

Source: ${source?.name || 'Unselected'} (${source?.status || 'status unconfirmed'}). Confirm current status before making claims.
`;
}
