// A classification correction moves the same frozen entry; it never composes another issue or pays
// a writer. The override, publication, report revisions and audit commit in the caller's transaction.
import { RELEASE } from "@aihot/industry/taxonomy";
import type { AdminReportSummaryCorrection, AdminReportSummaryCorrected } from "@aihot/contracts/admin";
import { Conflict } from "../audit.ts";
import type { Tx } from "../db.ts";
import { factReviewPassed } from "../editorial/fact-review.ts";
import { listedCondition } from "../publication/scope.ts";
import { isRelease } from "../editorial/vocabulary.ts";
import { emit } from "../modules.ts";
import { SECTION_ORDER, sectionOf } from "./edition.ts";

interface Entry { itemId: string; followUp?: string; firstParty?: boolean; role?: string; [key: string]: unknown }
interface Group { label?: string; heading?: string; summary?: unknown; items?: Entry[]; storyRefs?: Entry[]; [key: string]: unknown }
interface Content { sections?: Group[]; themes?: Group[]; metrics?: Record<string, number>; [key: string]: unknown }

/** Moves the item to its new section in every issue that carries it; says whether any issue changed. */
export async function correctReportClassification(tx: Tx, articleId: string, reason: string): Promise<boolean> {
  const [item] = await tx<{ category: string | null }[]>`SELECT category FROM publications WHERE article_id=${articleId}`;
  if (!item?.category) return false;
  const reports = await tx<{ id: number; kind: string; content: Content; revision: number; generated_at: Date }[]>`
    SELECT id,kind,content,revision,generated_at FROM reports
    WHERE content @> ${tx.json({ sections: [{ items: [{ itemId: articleId }] }] })}
       OR content @> ${tx.json({ themes: [{ storyRefs: [{ itemId: articleId }] }] })}
    ORDER BY id FOR UPDATE`;
  let changed = false;
  for (const report of reports) {
    const content = structuredClone(report.content);
    const daily = report.kind === "daily";
    const groups = (daily ? content.sections : content.themes) ?? [];
    const labelKey = daily ? "label" : "heading";
    const entriesKey = daily ? "items" : "storyRefs";
    const from = groups.find(g => g[entriesKey]?.some(e => e.itemId === articleId));
    // Older, hand-written theme headings are not taxonomy columns; do not reinterpret their prose.
    if (!from || !SECTION_ORDER.includes(from[labelKey] ?? "")) continue;
    const label = sectionOf(item.category);
    if (from[labelKey] !== label) {
      const moving = from[entriesKey]!.filter(e => e.itemId === articleId);
      from[entriesKey] = from[entriesKey]!.filter(e => e.itemId !== articleId);
      let target = groups.find(g => g[labelKey] === label);
      if (!target) { target = { [labelKey]: label, [entriesKey]: [] }; groups.push(target); }
      target[entriesKey]!.push(...moving);
      if (!daily) { from.summary = null; target.summary = null; }
    }
    const arranged = groups.filter(g => g[entriesKey]?.length).sort((a, b) => SECTION_ORDER.indexOf(a[labelKey]!) - SECTION_ORDER.indexOf(b[labelKey]!));
    if (daily) {
      content.sections = arranged;
      // The release figure (dailyMetrics) follows the new classification; without a RELEASE kind there is none.
      if (RELEASE) {
        const entries = arranged.flatMap(g => g.items ?? []);
        const rows = await tx<{ article_id: string; category: string | null; tags: string[] }[]>`
          SELECT article_id,category,tags FROM publications WHERE article_id IN ${tx(entries.map(e => e.itemId))}`;
        const byId = new Map(rows.map(r => [r.article_id, r]));
        content.metrics = { ...content.metrics, modelsReleased: entries.filter(e => {
          const p = byId.get(e.itemId);
          return p && isRelease(p.category, p.tags) && !e.followUp && (e.firstParty || e.role === "官方" || e.role === "X·官方");
        }).length };
      }
    } else content.themes = arranged;
    if (JSON.stringify(content) === JSON.stringify(report.content)) continue;
    await tx`INSERT INTO report_revisions (report_id,revision,content,generated_at,reason)
      VALUES (${report.id},${report.revision},${tx.json(report.content as never)},${report.generated_at},${`classification ${articleId}: ${reason}`})`;
    await tx`UPDATE reports SET content=${tx.json(content as never)},revision=revision+1,updated_at=now() WHERE id=${report.id}`;
    changed = true;
  }
  if (changed) await emit("reportsChanged", { reason: `report classification ${articleId}` }, tx);
  return changed;
}

/** A daily adopts one reviewed analysis; its issue time, selection and all other copy stay frozen. */
export async function correctReportSummary(tx: Tx, reportId: number, input: AdminReportSummaryCorrection): Promise<{
  result: AdminReportSummaryCorrected;
  before: { revision: number; summary: string };
}> {
  // Content corrections and analysis commits take this lock too. A new material revision or an
  // override cannot slip between checking the reviewed copy and adopting it into the issue.
  const [article] = await tx<{ revision: number }[]>`SELECT revision FROM articles WHERE id=${input.itemId} FOR UPDATE`;
  if (!article) throw new Conflict("内容不存在");
  const [publication] = await tx<{ analysis_id: number | null; summary: string | null; available: boolean }[]>`
    SELECT p.analysis_id,p.summary,(${listedCondition(new Date())}) AS available
    FROM publications p JOIN sources s ON s.id=p.source_id
    WHERE p.article_id=${input.itemId} AND s.participation_mode='editorial' FOR UPDATE OF p`;
  const [analysis] = await tx<{
    input_revision: number; origin: string; title_zh: string | null; summary_zh: string | null; reason_zh: string | null; output: unknown;
  }[]>`SELECT input_revision,origin,title_zh,summary_zh,reason_zh,output FROM analyses
    WHERE id=${input.analysisId} AND article_id=${input.itemId}
      AND NOT EXISTS (SELECT 1 FROM analyses newer WHERE newer.article_id=${input.itemId}
        AND newer.input_revision=${article.revision} AND newer.id > ${input.analysisId})`;
  const [override] = await tx<{ fields: Record<string, unknown> }[]>`SELECT fields FROM editorial_overrides WHERE article_id=${input.itemId}`;
  if (!analysis || analysis.origin !== "model" || analysis.input_revision !== article.revision
    || !analysis.summary_zh?.trim() || !factReviewPassed(analysis.output, {
      titleZh: analysis.title_zh ?? "", summaryZh: analysis.summary_zh, reasonZh: analysis.reason_zh,
    })) throw new Conflict("目标分析不是当前材料的事实审核通过稿");
  if (!publication?.available || publication.analysis_id !== input.analysisId || publication.summary !== analysis.summary_zh
    || Object.hasOwn(override?.fields ?? {}, "summary")) {
    throw new Conflict("公开摘要必须直接采用目标原生分析，且没有人工摘要覆盖");
  }
  const [report] = await tx<{ kind: string; revision: number; content: Content; generated_at: Date }[]>`
    SELECT kind,revision,content,generated_at FROM reports WHERE id=${reportId} FOR UPDATE`;
  if (!report || report.kind !== "daily") throw new Conflict("只支持已有日报的条目摘要纠错");
  if (report.revision !== input.expectedRevision) throw new Conflict("日报版本已变化，请重新核对");
  const content = structuredClone(report.content);
  const entries = (content.sections ?? []).flatMap(group => group.items ?? []).filter(entry => entry.itemId === input.itemId);
  const flashes = Array.isArray(content.flashes) ? content.flashes : [];
  if (entries.length !== 1 || content.leadItemId === input.itemId || flashes.some(entry => entry && typeof entry === "object" && "itemId" in entry && entry.itemId === input.itemId)) {
    throw new Conflict("仅支持唯一栏目条目；头条或重复条目须单独核对");
  }
  const entry = entries[0]!;
  if (entry.summary !== input.expectedOldSummary) throw new Conflict("日报摘要已变化，请重新核对");
  if (entry.summary === analysis.summary_zh) throw new Conflict("日报已采用该摘要，无需重复纠错");
  entry.summary = analysis.summary_zh;
  await tx`INSERT INTO report_revisions (report_id,revision,content,generated_at,reason)
    VALUES (${reportId},${report.revision},${tx.json(report.content as never)},${report.generated_at},${`summary ${input.itemId}, analysis ${input.analysisId}: ${input.reason}`})`;
  await tx`UPDATE reports SET content=${tx.json(content as never)},revision=revision+1,updated_at=now() WHERE id=${reportId}`;
  await emit("reportsChanged", { reason: `report summary ${reportId}/${input.itemId}` }, tx);
  return {
    before: { revision: report.revision, summary: input.expectedOldSummary },
    result: { reportId, itemId: input.itemId, analysisId: input.analysisId, revision: report.revision + 1, summary: analysis.summary_zh },
  };
}
