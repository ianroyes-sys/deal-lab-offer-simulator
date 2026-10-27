import { NextRequest, NextResponse } from 'next/server';
import { workshopGuard } from '../../../lib/guard';
import { workshopSources, listWorkshopDrafts, readWorkshopDraft, saveWorkshopDraft, exportWorkshopDraft } from '../../../../src/workshop.mjs';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const DRAFT_ROOT = process.env.DEAL_LAB_ROOT || process.cwd();
const DATA_DIR = process.env.DEAL_LAB_DATA_DIR || undefined;
export async function GET(req: NextRequest) {
  const denied = workshopGuard(req); if (denied) return denied;
  const id = req.nextUrl.searchParams.get('export');
  try {
    if (id) {
      const draft = readWorkshopDraft(DRAFT_ROOT, id);
      return new NextResponse(exportWorkshopDraft(draft), { headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': `attachment; filename="deal-${draft.id}.md"`, 'Cache-Control': 'no-store' } });
    }
    return NextResponse.json({ ...workshopSources({ root: DRAFT_ROOT, dataDir: DATA_DIR }), drafts: listWorkshopDrafts(DRAFT_ROOT), generatedAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Draft not found.' }, { status: 404 }); }
}
async function save(req: NextRequest, update: boolean) {
  const denied = workshopGuard(req); if (denied) return denied;
  try {
    const raw = await req.text();
    if (raw.length > 60000) return NextResponse.json({ error: 'Draft is too large.' }, { status: 413 });
    const input = JSON.parse(raw);
    if (update && !input?.id) throw new Error('Choose a saved draft.');
    if (!update && input?.id) throw new Error('Use update for an existing draft.');
    const draft = saveWorkshopDraft(input, { root: DRAFT_ROOT });
    return NextResponse.json({ draft }, { status: update ? 200 : 201 });
  } catch(e) { const error = e instanceof Error ? e.message : 'Could not save draft.'; return NextResponse.json({error}, {status:/another window/.test(error)?409:400}); }
}
export async function POST(req:NextRequest){return save(req,false);}
export async function PUT(req:NextRequest){return save(req,true);}
