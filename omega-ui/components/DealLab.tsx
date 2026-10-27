"use client";

import { useEffect, useState } from "react";
import styles from "./DealLab.module.css";
// Pure economics + brief template shared with the CLI and tests.
import { DEFAULT_SCENARIO, offerBrief, usd } from "../../src/scenario.mjs";

type Project = { id: string; name: string; kind: string; status: string; description: string; href?: string };
type Scenario = { buildFee: number; retainer: number; costPerClient: number; hoursPerClient: number; availableHours: number; target: number; clientCount: number; baselineMrr: number };
type Payload = { version: number; sourceName: string; scenario: Scenario; brief: string };
type Draft = { id: string; kind: string; title: string; sourceId?: string; payload: Payload; updatedAt?: string; revision: number };
type Workshop = { projects: Project[]; drafts: Draft[]; mission: { goal: number; currentMrr: number | null; sourceDate?: string } };
const initial: Scenario = { ...DEFAULT_SCENARIO };
const offer = (source: Project | undefined, s: Scenario) => offerBrief(source, s, { studio: process.env.NEXT_PUBLIC_STUDIO_NAME || "Your studio" });

function Control({ label, value, min = 0, max, step = 1, money = false, suffix = "", onChange }: { label: string; value: number; min?: number; max: number; step?: number; money?: boolean; suffix?: string; onChange: (n: number) => void }) {
  return <label className={styles.control}>
    <span><span>{label}</span><output>{money ? usd(value) : value}{suffix}</output></span>
    <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
  </label>;
}

export default function DealLab() {
  const [data, setData] = useState<Workshop | null>(null);
  const [sourceId, setSourceId] = useState("");
  const [scenario, setScenario] = useState<Scenario>(initial);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [revision, setRevision] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [dirty, setDirty] = useState(false);
  const [retry, setRetry] = useState(0);

  function openDraft(d: Draft) {
    if (!d.payload?.scenario) return;
    setDraftId(d.id); setRevision(d.revision); setSourceId(d.sourceId || ""); setTitle(d.title);
    setScenario({ ...initial, ...d.payload.scenario }); setBrief(d.payload.brief || "");
    setDirty(false); setNotice("Saved scenario opened."); setError("");
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    fetch("/api/workshop", { signal: controller.signal }).then(async (res) => {
      if (!res.ok) throw new Error("The project inventory could not load. Retry to reconnect.");
      const result = await res.json() as Workshop;
      setData(result);
      const requested = new URLSearchParams(window.location.search).get("draft");
      const saved = result.drafts.find((d) => d.id === requested && d.kind === "deal");
      if (saved) openDraft(saved);
      else { setSourceId(result.projects.find((p) => p.kind === "client")?.id || result.projects[0]?.id || ""); setScenario((s) => ({ ...s, target: result.mission.goal || 500, baselineMrr: result.mission.currentMrr ?? 0 })); }
    }).catch((e: Error) => { if (e.name !== "AbortError") setError(e.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    if (!dirty) return;
    const protect = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  const source = data?.projects.find((p) => p.id === sourceId);
  const current = scenario.baselineMrr;
  const simulated = scenario.clientCount * scenario.retainer;
  const recurring = current + simulated;
  const contribution = scenario.clientCount * (scenario.retainer - scenario.costPerClient);
  const hours = scenario.clientCount * scenario.hoursPerClient;
  const needed = Math.max(0, Math.ceil((scenario.target - current) / scenario.retainer));
  const capacity = scenario.hoursPerClient > 0 ? Math.floor(scenario.availableHours / scenario.hoursPerClient) : 0;
  const maxY = Math.max(scenario.target * 1.2, recurring * 1.12, 100);
  const y = (v: number) => 205 - Math.min(1, v / maxY) * 165;
  const drafts = data?.drafts.filter((d) => d.kind === "deal") || [];
  const projects = data?.projects.filter((p) => `${p.name} ${p.kind}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => Number(b.kind === "client") - Number(a.kind === "client")) || [];
  const change = (key: keyof Scenario, value: number) => { setScenario((s) => ({ ...s, [key]: value })); setDirty(true); setNotice(brief ? "Scenario updated. Recompose or sharpen the brief to reflect these assumptions." : ""); };

  function chooseSource(id: string) {
    if (dirty && !window.confirm("Start a new scenario? Unsaved changes in the current scenario will be lost.")) return;
    setSourceId(id); setDraftId(null); setRevision(null); setBrief(""); setTitle(""); setDirty(false); setNotice(""); setError("");
  }

  async function save() {
    setBusy(true); setError(""); setNotice("");
    const draftBrief = brief || offer(source, scenario);
    const draftTitle = title.trim() || `${source?.name || "Offer"} · ${usd(scenario.retainer)}/mo scenario`;
    const payload: Payload = { version: 1, sourceName: source?.name || "Unselected", scenario, brief: draftBrief };
    try {
      const response = await fetch("/api/workshop", { method: draftId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...(draftId ? { id: draftId, revision } : { kind: "deal", sourceId }), title: draftTitle, payload }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The scenario was not saved. Your edits are still here.");
      const saved: Draft = result.draft || result;
      setDraftId(saved.id); setRevision(saved.revision); setTitle(draftTitle); setBrief(draftBrief); setDirty(false); setNotice("Scenario saved to your workshop.");
      setData((d) => d ? { ...d, drafts: [saved, ...d.drafts.filter((v) => v.id !== saved.id)] } : d);
    } catch (e) { setError(e instanceof Error ? e.message : "The scenario was not saved. Try again."); }
    finally { setBusy(false); }
  }

  async function copy() {
    try { await navigator.clipboard.writeText(brief || offer(source, scenario)); setNotice("Offer draft copied."); }
    catch { setError("Clipboard access is unavailable. Select the offer text and copy it manually."); }
  }

  async function sharpen() {
    setBusy(true); setGenerating(true); setError(""); setNotice("Omega is shaping the offer around this project and your current economics…");
    try {
      const response = await fetch("/api/workshop/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "deal", sourceId, brief: `${brief || offer(source, scenario)}\n\nCurrent scenario inputs: ${JSON.stringify(scenario)}\n\nSharpen this offer. Keep uncertain claims explicit and pricing tied to the scenario. Do not invent results, delivery status, customer relationships, or a reason to change my numbers.` }) });
      const result = await response.json();
      if (!response.ok || !result.text) throw new Error(result.error || "Omega could not finish this draft. Your current text is unchanged.");
      setBrief(result.text.slice(0, 20000)); setDirty(true); setNotice("Omega’s draft is ready to edit. Save it when it reads like you.");
    } catch (e) { setError(e instanceof Error ? e.message : "Omega could not finish the draft. Try again."); }
    finally { setBusy(false); setGenerating(false); }
  }

  return <section className={styles.lab} aria-labelledby="deal-lab-heading" id="deal-lab">
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>COMMERCIAL WORKSHOP</p><h1 id="deal-lab-heading">Deal <em>Lab.</em></h1><p className={styles.intro}>Your finished apps are the starting line.<br />Find the offer that makes the next one count.</p></div>
      <div className={styles.mode}><span /> SCENARIO MODE<small>Explore the economics. Keep the real ledger real.</small></div>
    </header>

    {loading ? <div className={styles.empty} role="status">Connecting your app inventory and saved scenarios…</div> : !data ? <div className={styles.empty}><p role="alert">{error}</p><button onClick={() => setRetry((v) => v + 1)}>Reconnect workshop</button></div> : <>
      <div className={styles.workbench}>
        <aside className={styles.inventory}>
          <div className={styles.sectionLabel}>CHOOSE YOUR PROOF <span>{data.projects.length}</span></div>
          <input className={styles.search} type="search" aria-label="Search project inventory" placeholder="Find an app or prospect…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className={styles.sourceList}>{projects.length ? projects.map((p) => <button key={p.id} className={`${styles.source} ${sourceId === p.id ? styles.selected : ""}`} aria-pressed={sourceId === p.id} onClick={() => chooseSource(p.id)} disabled={busy}><span>{p.name}</span><small>{p.kind} · {p.status}</small><b aria-hidden="true">↗</b></button>) : <p className={styles.muted}>No matching projects. Try another name.</p>}</div>
          <p className={styles.inventoryNote}>Inventory is proof of work. A demo is not a signed client.</p>
        </aside>

        <div className={styles.simulator}>
          <div className={styles.sourceHeading}><div><p className={styles.eyebrow}>THE OFFER IN PLAY</p><h2>{source?.name || "Build your scenario"}</h2></div>{source?.href && <a href={source.href}>Open source ↗</a>}</div>
          {source?.description && <p className={styles.sourceDescription}>{source.description}</p>}
          <div className={styles.presets} aria-label="Scenario starting points"><span>START WITH</span><button disabled={busy} onClick={() => { setScenario((s) => ({ ...s, buildFee: 1500, retainer: 99 })); setDirty(true); }}>Recorded terms</button><button disabled={busy} onClick={() => { setScenario((s) => ({ ...s, buildFee: 2500, retainer: 250 })); setDirty(true); }}>Explore $250/mo</button></div>
          <p className={styles.terms}>Recorded terms: $1,500 build, $99/mo upkeep (edit these presets to match your own). Other prices here are experiments.</p>

          <fieldset disabled={busy} className={styles.controls}>
            <legend className="sr-only">Offer and capacity assumptions</legend>
            <Control label="Build fee" value={scenario.buildFee} max={10000} step={100} money onChange={(v) => change("buildFee", v)} />
            <Control label="Monthly retainer" value={scenario.retainer} min={1} max={1000} money onChange={(v) => change("retainer", v)} />
            <Control label="Direct cost / client / month" value={scenario.costPerClient} max={500} money onChange={(v) => change("costPerClient", v)} />
            <Control label="Support / client / month" value={scenario.hoursPerClient} min={0.5} max={20} step={0.5} suffix="h" onChange={(v) => change("hoursPerClient", v)} />
            <Control label="Available support / month" value={scenario.availableHours} min={1} max={100} suffix="h" onChange={(v) => change("availableHours", v)} />
            <Control label="Monthly revenue target" value={scenario.target} min={100} max={10000} step={100} money onChange={(v) => change("target", v)} />
            <Control label="Assumed existing MRR" value={scenario.baselineMrr} max={10000} step={50} money onChange={(v) => change("baselineMrr", v)} />
          </fieldset>
        </div>
      </div>

      <div className={styles.runway}>
        <div className={styles.runwayTop}><div><p className={styles.eyebrow}>THE RECURRING REVENUE PATH</p><h3>{needed === 0 ? "Your assumed baseline meets this target." : <>{needed} new {needed === 1 ? "retainer" : "retainers"}. <span>That’s the gap.</span></>}</h3></div><label className={styles.clientCount}>SIMULATE NEW CLIENTS<input type="number" aria-label="Simulated new clients" min={0} max={100} disabled={busy} value={scenario.clientCount} onChange={(e) => change("clientCount", Math.max(0, Math.min(100, Math.round(Number(e.target.value) || 0))))} /></label></div>
        <div className={styles.chartGrid}>
          <div className={styles.chart}>
            <svg viewBox="0 0 620 245" role="img" aria-label={`Scenario: ${scenario.clientCount} new clients add ${usd(simulated)} monthly revenue. Target ${usd(scenario.target)}. Assumed baseline MRR ${usd(current)}.`}>
              <defs><linearGradient id="deal-runway-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ffc861" stopOpacity=".22" /><stop offset="100%" stopColor="#ffc861" stopOpacity="0" /></linearGradient></defs>
              {[40, 95, 150, 205].map((row) => <line key={row} x1="25" y1={row} x2="590" y2={row} stroke="#ffffff" strokeOpacity=".07" />)}
              <line x1="25" y1={y(scenario.target)} x2="590" y2={y(scenario.target)} stroke="#9ad8ff" strokeOpacity=".7" strokeDasharray="5 7" />
              <text x="590" y={y(scenario.target) - 9} textAnchor="end" fill="#9ad8ff" fontSize="11">TARGET {usd(scenario.target)}/mo</text>
              <path d={`M 30 205 L 30 ${y(current)} L 580 ${y(recurring)} L 580 205 Z`} fill="url(#deal-runway-fill)" />
              <path d={`M 30 ${y(current)} L 580 ${y(recurring)}`} fill="none" stroke="#ffc861" strokeWidth="2.5" />
              {Array.from({ length: Math.min(12, scenario.clientCount) + 1 }, (_, i) => { const count = Math.min(12, scenario.clientCount); const t = count === 0 ? 0 : i / count; return <circle key={i} cx={30 + 550 * t} cy={y(current + simulated * t)} r={i === count ? 5 : 3} fill="#ffc861" stroke="#150f1a" strokeWidth="2" />; })}
              <text x="30" y="233" fill="#a9a2b6" fontSize="11">ASSUMED BASELINE {usd(current)}</text><text x="580" y="233" textAnchor="end" fill="#ffc861" fontSize="11">+{scenario.clientCount} SIMULATED CLIENTS</text>
            </svg>
            <p>{data.mission.currentMrr === null ? "Current MRR is unverified. Set the assumed existing MRR above." : `Recorded MRR: ${usd(data.mission.currentMrr)}/mo; your scenario baseline is editable.`} This is a client-count scenario, not a timeline or forecast.</p>
          </div>
          <div className={styles.economics}>
            <div className={styles.projected}><span>IF THESE CLIENTS SIGN</span><strong>{usd(recurring)}<small>/mo</small></strong><p>{usd(simulated)} additional monthly revenue</p></div>
            <dl><div><dt>One-time builds</dt><dd>{usd(scenario.clientCount * scenario.buildFee)}</dd></div><div><dt>Monthly contribution*</dt><dd className={contribution < 0 ? styles.warning : ""}>{usd(contribution)}</dd></div><div><dt>Support required</dt><dd className={hours > scenario.availableHours ? styles.warning : ""}>{hours} / {scenario.availableHours}h</dd></div></dl>
            <div className={styles.capacityTrack} role="meter" aria-label="Support capacity used" aria-valuemin={0} aria-valuemax={scenario.availableHours} aria-valuenow={Math.min(hours, scenario.availableHours)} aria-valuetext={`${hours} of ${scenario.availableHours} hours`}><span style={{ width: `${Math.min(100, hours / scenario.availableHours * 100)}%`, background: hours > scenario.availableHours ? "#ff8a6d" : "#9ad8ff" }} /></div>
            <p className={styles.capacityNote}>{needed > capacity ? `Target needs ${needed} clients; your support budget fits ${capacity}. Adjust price, scope, or hours.` : `Your support budget fits ${capacity} clients at this scope.`}</p>
          </div>
        </div>
        <p className={styles.footnote}>*Contribution = new retainer revenue minus direct costs. Excludes build time, sales effort, taxes, and your pay. Costs and hours are editable assumptions.</p>
      </div>

      <div className={styles.draftArea}>
        <div className={styles.draftIntro}><p className={styles.eyebrow}>MAKE IT TANGIBLE</p><h3>Leave with<br /><em>an actual offer.</em></h3><p>Turn the selected project and economics into a working brief. Edit the details, keep a version, and bring it into the next conversation.</p><button className={styles.outlineButton} disabled={busy} onClick={() => { if (brief && !window.confirm("Replace your offer text with a fresh draft from the current scenario?")) return; setBrief(offer(source, scenario)); setTitle(`${source?.name || "Offer"} · offer draft`); setDirty(true); setNotice("Working brief created. Review and edit the scope before using it."); }}>Compose working brief ↗</button><small>The brief is an editable template grounded in the selected source. It is never sent automatically.</small></div>
        <div className={styles.editor}>
          <label className={styles.titleLabel}>DRAFT TITLE<input aria-label="Offer draft title" disabled={busy} value={title} maxLength={200} placeholder={`${source?.name || "Offer"} · offer draft`} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} /></label>
          <textarea aria-label="Offer working brief" disabled={busy} value={brief} maxLength={20000} placeholder="Compose a working brief, or start writing your own here…" onChange={(e) => { setBrief(e.target.value); setDirty(true); }} />
          <div className={styles.editorActions}><span>{dirty ? "UNSAVED CHANGES" : draftId ? "SAVED DRAFT" : "NEW SCENARIO"}</span><button onClick={sharpen} disabled={busy || !sourceId}>{generating ? "Omega is drafting…" : "Sharpen with Omega ✦"}</button><button onClick={copy} disabled={busy}>Copy brief</button>{draftId && !dirty && <a href={`/api/workshop?export=${encodeURIComponent(draftId)}`}>Export .md ↓</a>}<button className={styles.saveButton} onClick={save} disabled={busy}>{busy && !generating ? "Saving…" : draftId ? "Save changes" : "Save scenario"}</button></div>
          {(notice || error) && <p className={error ? styles.error : styles.notice} role={error ? "alert" : "status"}>{error || notice}</p>}
        </div>
      </div>
      <div className={styles.saved}><div className={styles.sectionLabel}>YOUR SAVED SCENARIOS <span>{drafts.length}</span></div>{drafts.length ? <div className={styles.savedGrid}>{drafts.map((d) => <button key={d.id} disabled={busy} aria-pressed={draftId === d.id} onClick={() => { if (dirty && !window.confirm("Open this saved scenario and discard unsaved changes?")) return; openDraft(d); }}><span>{d.title}</span><small>{d.payload?.scenario ? `${usd(d.payload.scenario.retainer)}/mo · ${d.payload.scenario.clientCount} simulated clients` : "Offer working draft"}</small><b>↗</b></button>)}</div> : <p className={styles.muted}>Save your first scenario to compare offers without losing the assumptions.</p>}</div>
    </>}
  </section>;
}
