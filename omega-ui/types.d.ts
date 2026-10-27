// Type shims so the Next.js components can import the plain ESM modules.
declare module "*/src/scenario.mjs" {
  export type Scenario = { buildFee: number; retainer: number; costPerClient: number; hoursPerClient: number; availableHours: number; target: number; clientCount: number; baselineMrr: number };
  export const DEFAULT_SCENARIO: Readonly<Scenario>;
  export function usd(n: number): string;
  export function economics(s: Scenario): Record<string, number | boolean>;
  export function offerBrief(source: { name: string; status?: string; description?: string } | undefined, s: Scenario, opts?: { studio?: string }): string;
}
declare module "*/src/workshop.mjs" {
  export function workshopSources(opts?: { root?: string; dataDir?: string }): { projects: any[]; mission: any };
  export function listWorkshopDrafts(root?: string): any[];
  export function readWorkshopDraft(root: string, id: string): any;
  export function saveWorkshopDraft(input: unknown, opts?: { root?: string }): any;
  export function exportWorkshopDraft(draft: unknown): string;
}
