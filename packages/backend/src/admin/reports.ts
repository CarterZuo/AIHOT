// Report corrections adopt reviewed native copy, with history and the operator's audit in one commit.
import { z } from "zod";
import type { AdminReportSummaryCorrection, AdminReportSummaryCorrected } from "@aihot/contracts/admin";
import { ARTICLE_ID_PATTERN } from "@aihot/contracts/taxonomy";
import { audit } from "../audit.ts";
import { sql } from "../db.ts";
import { correctReportSummary } from "../reports/correct.ts";

export async function adoptReportSummary(reportId: number, input: AdminReportSummaryCorrection, actor: string): Promise<AdminReportSummaryCorrected> {
  z.number().int().positive().parse(reportId);
  const command = z.object({
    itemId: z.string().regex(ARTICLE_ID_PATTERN),
    expectedRevision: z.number().int().positive(),
    expectedOldSummary: z.string(),
    analysisId: z.number().int().positive(),
    reason: z.string().trim().min(1).max(2000),
  }).strict().parse(input);
  return sql.begin(async tx => {
    const { result, before } = await correctReportSummary(tx, reportId, command);
    await audit(actor, "report.correct-summary", `report:${reportId}`, command.reason, before, result, { db: tx });
    return result;
  });
}
