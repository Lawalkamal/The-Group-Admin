import type { NextRequest } from 'next/server';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { createReport, listReports, resolveReport } from '@/lib/store';
import { checkFreeText, checkReportReason } from '@/lib/validate';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

/** Admins see open reports for their community. */
export async function GET(_request: Request, context: Context) {
  return guard(async () => {
    const user = await requireUser();
    const { groupId } = await context.params;
    return json({ reports: await listReports(user.id, groupId) });
  });
}

export async function POST(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId } = await context.params;
    const body = await readJson(request);

    if (typeof body.targetId !== 'string' || !body.targetId) {
      throw new ApiError(400, 'Pick the person you are reporting.', 'invalid_target');
    }
    const reason = checkReportReason(body.reason);
    if (!reason.ok) throw new ApiError(400, reason.error, 'invalid_reason');
    const note = checkFreeText(body.note, 200, 'Report note');
    if (!note.ok) throw new ApiError(400, note.error, 'invalid_note');

    const report = await createReport(user, groupId, body.targetId, reason.value, note.value);
    return json({ report }, 201);
  });
}

/** Marks a report handled. Admin only. */
export async function PATCH(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId } = await context.params;
    const body = await readJson(request);

    if (typeof body.reportId !== 'string' || !body.reportId) {
      throw new ApiError(400, 'Pick a report to resolve.', 'invalid_report');
    }

    return json({ reports: await resolveReport(user, groupId, body.reportId) });
  });
}
