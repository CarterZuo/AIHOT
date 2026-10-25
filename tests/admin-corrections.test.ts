import { createHmac } from "node:crypto";
import { config } from "@aihot/backend/config";
import { tag } from "./setup.ts";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql, closeDb } from "@aihot/backend/db";
import { createSource, updateSource } from "@aihot/backend/admin/sources";
import { overrideFields, rerun, setSeoIndexed, setVisibility } from "@aihot/backend/admin/content";
import { adoptReportSummary } from "@aihot/backend/admin/reports";
import { copyHash, FACT_REVIEW_VERSION } from "@aihot/backend/editorial/fact-review";
import { upsertMaterial } from "@aihot/backend/content/materials";
import { publishArticle } from "@aihot/backend/publication/publish";
import { getBoss, stopBoss } from "@aihot/backend/jobs/queue";
import { sha256 } from "@aihot/backend/lib/ids";
import { buildApp } from "../apps/api/src/app.ts";
import { SOURCE_DEFAULTS } from "@aihot/site";

const T = tag();
const sourceId = `admin-${T}`;
await sql`INSERT INTO sources (id, name, kind, tier) VALUES (${sourceId}, 'Admin review', 'rss', 'T1')`;
const app = await buildApp();
after(async () => { await app.close(); await stopBoss(); await closeDb(); });

async function article() {
  return (await upsertMaterial({ sourceId, url: `https://example.com/${tag()}`, title: "审查材料", bodyText: "正文", bodyStatus: "ok", via: "fetch", publishedAt: new Date() })).articleId;
}

test("source creation follows site fulltext defaults and preserves explicit overrides", async () => {
  for (const explicit of [undefined, !SOURCE_DEFAULTS.siteFulltext]) {
    const id = `fulltext-default-${tag()}`;
    const result = await createSource({
      id, name: "Fulltext default", kind: "external", config: {},
      ...(explicit === undefined ? {} : { site_fulltext: explicit }),
    }, "test");
    assert.ok(result.created);
    assert.equal(result.source.site_fulltext, explicit ?? SOURCE_DEFAULTS.siteFulltext);
    assert.equal(result.source.syndicate_fulltext, false);
  }
});

test("concurrent source intake creates one source for the same feed", async () => {
  const blocker = await sql.reserve();
  await blocker`BEGIN`;
  await blocker`LOCK TABLE sources IN SHARE MODE`;
  const pending = Promise.all(Array.from({ length: 4 }, (_, i) => createSource({
    id: `intake-${T}-${i}`, name: "Same feed", kind: "rss", config: { feedUrl: `https://example.com/feed-${T}` },
  }, "test")));
  try {
    // Hold inserts until all four requests have reached a lock: reproduce simultaneous clicks,
    // independently of how quickly the database happens to execute their duplicate checks.
    for (let i = 0; ; i++) {
      const [waiting] = await sql`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`;
      if (waiting!.n === 4) break;
      assert.ok(i < 200, "all concurrent requests reached the database");
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  } finally {
    await blocker`ROLLBACK`;
    blocker.release();
  }
  const results = await pending;
  assert.equal(results.filter((r) => r.created).length, 1);
  const created = results.find((r) => r.created)!;
  assert.ok(created.created);
  for (const result of results) if (!result.created) assert.equal(result.duplicate.id, created.source.id);
});

test("a source transaction rolled back at commit leaves no successful audit entry", async () => {
  await sql.unsafe(`CREATE FUNCTION refuse_admin_source_commit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.name = 'refuse-admin-commit' THEN RAISE EXCEPTION 'refused at commit'; END IF; RETURN NEW; END $$`);
  await sql.unsafe(`CREATE CONSTRAINT TRIGGER refuse_admin_source_commit AFTER UPDATE ON sources
    DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION refuse_admin_source_commit()`);
  try {
    const [before] = await sql`SELECT updated_at FROM sources WHERE id = ${sourceId}`;
    await assert.rejects(updateSource(sourceId, { patch: { name: "refuse-admin-commit" }, version: (before!.updated_at as Date).toISOString() }, "test-rollback"), /refused at commit/);
    const rows = await sql`SELECT 1 FROM audit_log WHERE actor = 'test-rollback'`;
    assert.equal(rows.length, 0);
  } finally {
    await sql.unsafe("DROP TRIGGER refuse_admin_source_commit ON sources; DROP FUNCTION refuse_admin_source_commit()");
  }
});

test("content corrections, public projection and audit either commit together or remain retryable", async () => {
  const id = await article();
  await publishArticle(id);
  await sql.unsafe(`CREATE FUNCTION refuse_admin_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.actor = 'test-refuse-audit' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$`);
  await sql.unsafe("CREATE TRIGGER refuse_admin_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION refuse_admin_audit()");
  try {
    for (const write of [
      () => overrideFields(id, { fields: { title: "更正标题" }, version: 0, reason: "校正" }, "test-refuse-audit"),
      () => setVisibility(id, { visibility: "withdrawn", version: 0, reason: "校正" }, "test-refuse-audit"),
    ]) {
      await assert.rejects(write(), /audit unavailable/);
      assert.equal((await sql`SELECT 1 FROM editorial_overrides WHERE article_id = ${id}`).length, 0);
      const [p] = await sql`SELECT title, visibility FROM publications WHERE article_id = ${id}`;
      assert.equal(p!.title, "审查材料");
      assert.equal(p!.visibility, "public");
    }
  } finally {
    await sql.unsafe("DROP TRIGGER refuse_admin_audit ON audit_log; DROP FUNCTION refuse_admin_audit()");
  }
  await overrideFields(id, { fields: { title: "更正标题" }, version: 0, reason: "校正" }, "test");
  await assert.rejects(setVisibility(id, { visibility: "withdrawn", version: 0, reason: "过期页面" }, "test"), { code: "conflict" });
  const [p] = await sql`SELECT title, visibility FROM publications WHERE article_id = ${id}`;
  assert.equal(p!.title, "更正标题");
  assert.equal(p!.visibility, "public");
});

test("repeating a completed command returns its job without resetting newer processing or a manual detach", async () => {
  await getBoss();
  for (const step of ["analyze", "extract", "group"] as const) {
    const id = await article();
    const key = `request-${step}-${T}`;
    const first = await rerun(id, step, key, "test");
    assert.ok(first?.jobId);
    await sql`UPDATE pgboss.job SET state = 'completed', completed_on = now() WHERE id = ${first.jobId}`;
    await sql`UPDATE articles SET processing_state = 'analyzed', revision = revision + 1 WHERE id = ${id}`;
    await sql`INSERT INTO grouping_overrides (article_id, reason, actor) VALUES (${id}, 'later manual detach', 'test')`;
    const again = await rerun(id, step, key, "test");
    assert.deepEqual(again, first);
    const [state] = await sql`SELECT processing_state FROM articles WHERE id = ${id}`;
    assert.equal(state!.processing_state, "analyzed");
    assert.equal((await sql`SELECT 1 FROM grouping_overrides WHERE article_id = ${id}`).length, 1);
    assert.equal((await sql`SELECT 1 FROM audit_log WHERE request_id = ${key}`).length, 1);
  }
});

test("a rejected SEO correction leaves both the decision and public indexing unchanged", async () => {
  const id = await article();
  await sql`INSERT INTO analyses (article_id, input_revision, origin, relevance, summary_zh, selected)
            VALUES (${id}, 1, 'rule', 'pass', '可收录的正文摘要', false)`;
  await publishArticle(id);
  const [before] = await sql`SELECT seo_indexed_at, seo_excluded_at, indexable FROM publications WHERE article_id = ${id}`;
  await sql.unsafe(`CREATE FUNCTION refuse_admin_seo_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.actor = 'test-refuse-seo' THEN RAISE EXCEPTION 'audit unavailable'; END IF; RETURN NEW; END $$`);
  await sql.unsafe("CREATE TRIGGER refuse_admin_seo_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION refuse_admin_seo_audit()");
  try {
    await assert.rejects(setSeoIndexed(id, { indexed: true, reason: "人工收录" }, "test-refuse-seo"), /audit unavailable/);
    const [after] = await sql`SELECT seo_indexed_at, seo_excluded_at, indexable FROM publications WHERE article_id = ${id}`;
    assert.deepEqual(after, before);
  } finally {
    await sql.unsafe("DROP TRIGGER refuse_admin_seo_audit ON audit_log; DROP FUNCTION refuse_admin_seo_audit()");
  }
  await setSeoIndexed(id, { indexed: true, reason: "人工收录" }, "test");
  const [indexed] = await sql`SELECT seo_indexed_at, seo_excluded_at, indexable FROM publications WHERE article_id = ${id}`;
  assert.ok(indexed!.seo_indexed_at);
  assert.equal(indexed!.seo_excluded_at, null);
  assert.equal(indexed!.indexable, true);
  await setSeoIndexed(id, { indexed: false, reason: "取消收录" }, "test");
  const [excluded] = await sql`SELECT seo_indexed_at, seo_excluded_at, indexable FROM publications WHERE article_id = ${id}`;
  assert.equal(excluded!.seo_indexed_at, null);
  assert.ok(excluded!.seo_excluded_at);
  assert.equal(excluded!.indexable, false);
});

async function frozenDaily() {
  const id = await article();
  const copy = { titleZh: "原生标题", summaryZh: "配备双腔空气悬架，全系标配后轮转向。", reasonZh: "区分配置适用范围。" };
  const output = { factReviewRequired: true, factReview: { version: FACT_REVIEW_VERSION, status: "pass", copyHash: copyHash(copy),
    evidence: [{ field: "summaryZh", quote: "全系标配后轮转向" }], issues: [] } };
  const [analysis] = await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance,title_zh,summary_zh,reason_zh,output,selected)
    VALUES (${id},1,'model','pass',${copy.titleZh},${copy.summaryZh},${copy.reasonZh},${sql.json(output)},false) RETURNING id`;
  await publishArticle(id);
  const summary = "全系标配后轮转向与双腔空气悬架。";
  const content = { date: "2096-01-02", leadItemId: "another-item", lead: { title: "保留头条", leadParagraph: "保留导读" },
    highlights: [id], flashes: [], sections: [{ label: "产品动态", items: [{ itemId: id, title: "冻结标题", summary, sourceId,
      sourceName: "Admin review", sourceUrl: "https://example.com", firstParty: true, role: "官方" }, { itemId: "other", summary: "保留其他条目" }] }],
    metrics: { totalEvents: 2, modelsReleased: 0 }, generator: { version: "fixture" } };
  const [report] = await sql`INSERT INTO reports (kind,key,window_start,window_end,content,generated_at,model,origin)
    VALUES ('daily',${`correction-${tag()}`},'2096-01-01','2096-01-02',${sql.json(content)},'2096-01-02T00:00:00Z','frozen-model','imported') RETURNING *`;
  const command = { itemId: id, expectedRevision: 1, expectedOldSummary: summary, analysisId: Number(analysis!.id), reason: "采用原生审核通过摘要" };
  return { id, copy, output, report: report!, content, command };
}

test("frozen daily correction adopts reviewed native copy, preserves the issue, and refuses stale retries", async () => {
  const fixture = await frozenDaily();
  const result = await adoptReportSummary(Number(fixture.report.id), fixture.command, "test-report-summary");
  assert.equal(result.revision, 2);
  assert.equal(result.summary, fixture.copy.summaryZh);
  const [saved] = await sql`SELECT * FROM reports WHERE id=${fixture.report.id}`;
  const expected = structuredClone(fixture.content);
  expected.sections[0]!.items[0]!.summary = fixture.copy.summaryZh;
  assert.deepEqual(saved!.content, expected);
  for (const field of ["kind", "key", "window_start", "window_end", "generated_at", "model", "origin", "created_at"]) {
    assert.deepEqual(saved![field], fixture.report[field], field);
  }
  const [revision] = await sql`SELECT * FROM report_revisions WHERE report_id=${fixture.report.id}`;
  assert.equal(revision!.revision, 1);
  assert.deepEqual(revision!.content, fixture.content);
  assert.deepEqual(revision!.generated_at, fixture.report.generated_at);
  const [audit] = await sql`SELECT * FROM audit_log WHERE subject=${`report:${fixture.report.id}`}`;
  assert.equal(audit!.action, "report.correct-summary");
  assert.equal(audit!.after.analysisId, fixture.command.analysisId);
  await assert.rejects(adoptReportSummary(Number(fixture.report.id), fixture.command, "test"), { code: "conflict" });
  assert.equal((await sql`SELECT count(*)::int AS n FROM report_revisions WHERE report_id=${fixture.report.id}`)[0]!.n, 1);
});

test("daily correction rejects unreviewed, stale, overridden and ambiguous copy without writing history", async () => {
  const fixture = await frozenDaily();
  const change = () => adoptReportSummary(Number(fixture.report.id), fixture.command, "test-report-invalid");
  for (const status of ["reject", "uncertain", "absent", "mismatch"]) {
    const output = status === "absent" ? {} : { ...fixture.output, factReview: { ...fixture.output.factReview,
      status: status === "mismatch" ? "pass" : status, copyHash: status === "mismatch" ? "different" : fixture.output.factReview.copyHash } };
    await sql`UPDATE analyses SET output=${sql.json(output)} WHERE id=${fixture.command.analysisId}`;
    await assert.rejects(change(), { code: "conflict" });
  }
  await sql`UPDATE analyses SET output=${sql.json(fixture.output)} WHERE id=${fixture.command.analysisId}`;
  await sql`UPDATE articles SET revision=2 WHERE id=${fixture.id}`;
  await assert.rejects(change(), { code: "conflict" });
  await sql`UPDATE articles SET revision=1 WHERE id=${fixture.id}`;
  await sql`INSERT INTO editorial_overrides (article_id,fields,reason,updated_by) VALUES (${fixture.id},${sql.json({ summary: fixture.copy.summaryZh })},'人工覆盖','test')`;
  await assert.rejects(change(), { code: "conflict" });
  await sql`DELETE FROM editorial_overrides WHERE article_id=${fixture.id}`;
  for (const patch of [sql`visibility='withdrawn'`, sql`summary='未采用原生稿'`, sql`analysis_id=NULL`]) {
    await sql`UPDATE publications SET ${patch} WHERE article_id=${fixture.id}`;
    await assert.rejects(change(), { code: "conflict" });
    await sql`UPDATE publications SET visibility='public',summary=${fixture.copy.summaryZh},analysis_id=${fixture.command.analysisId} WHERE article_id=${fixture.id}`;
  }
  await assert.rejects(adoptReportSummary(Number(fixture.report.id), { ...fixture.command, expectedOldSummary: "过期文字" }, "test"), { code: "conflict" });
  for (const content of [
    { ...fixture.content, leadItemId: fixture.id },
    { ...fixture.content, sections: [...fixture.content.sections, ...fixture.content.sections] },
    { ...fixture.content, flashes: [{ itemId: fixture.id, summary: "重复" }] },
  ]) {
    await sql`UPDATE reports SET content=${sql.json(content as never)} WHERE id=${fixture.report.id}`;
    await assert.rejects(change(), { code: "conflict" });
  }
  await sql`UPDATE reports SET content=${sql.json(fixture.content)},kind='weekly' WHERE id=${fixture.report.id}`;
  await assert.rejects(change(), { code: "conflict" });
  assert.equal((await sql`SELECT 1 FROM report_revisions WHERE report_id=${fixture.report.id}`).length, 0);
  assert.equal((await sql`SELECT 1 FROM audit_log WHERE actor='test-report-invalid'`).length, 0);
});

test("concurrent daily corrections create one revision and refuse an analysis superseded before publication", async () => {
  const fixture = await frozenDaily();
  const results = await Promise.allSettled(["one", "two"].map(actor => adoptReportSummary(Number(fixture.report.id), fixture.command, actor)));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const failed = results.find(result => result.status === "rejected");
  assert.equal(failed?.status === "rejected" && failed.reason.code, "conflict");
  assert.equal((await sql`SELECT count(*)::int AS n FROM report_revisions WHERE report_id=${fixture.report.id}`)[0]!.n, 1);
  const superseded = await frozenDaily();
  await sql`INSERT INTO analyses (article_id,input_revision,origin,relevance) VALUES (${superseded.id},1,'model','unknown')`;
  await assert.rejects(adoptReportSummary(Number(superseded.report.id), superseded.command, "test-superseded"), { code: "conflict" });
});

test("daily correction rolls back the report and revision if its audit cannot commit", async () => {
  const fixture = await frozenDaily();
  await sql.unsafe(`CREATE FUNCTION refuse_report_audit() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.actor = 'test-refuse-report' THEN RAISE EXCEPTION 'report audit unavailable'; END IF; RETURN NEW; END $$`);
  await sql.unsafe("CREATE TRIGGER refuse_report_audit BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION refuse_report_audit()");
  try {
    await assert.rejects(adoptReportSummary(Number(fixture.report.id), fixture.command, "test-refuse-report"), /report audit unavailable/);
    const [saved] = await sql`SELECT content,revision FROM reports WHERE id=${fixture.report.id}`;
    assert.equal(saved!.revision, 1);
    assert.deepEqual(saved!.content, fixture.content);
    assert.equal((await sql`SELECT 1 FROM report_revisions WHERE report_id=${fixture.report.id}`).length, 0);
  } finally {
    await sql.unsafe("DROP TRIGGER refuse_report_audit ON audit_log; DROP FUNCTION refuse_report_audit()");
  }
});

test("bad admin input is a client error and never starts processing", async () => {
  const token = `admin-session-${T}`;
  const [user] = await sql`INSERT INTO admin_users (display_name) VALUES ('Review') RETURNING id`;
  const claims = { appId: "test-session-app", unionId: "test-session-user", email: null };
  process.env.FEISHU_LOGIN_APP_ID = claims.appId;
  process.env.FEISHU_LOGIN_APP_SECRET = "test-app-secret";
  config.adminUnionIds = [claims.unionId];
  const binding = createHmac("sha256", process.env.SESSION_SECRET!).update(JSON.stringify(["admin-session-v1", "feishu", claims])).digest("hex");
  await sql`INSERT INTO admin_sessions (id_hash, user_id, csrf_token, expires_at, auth_method, auth_binding, auth_claims) VALUES (${sha256(token)}, ${user!.id}, 'review-csrf', now() + interval '1 hour', 'feishu', ${binding}, ${sql.json(claims)})`;
  const headers = { cookie: `aihot_admin=${token}`, "x-csrf-token": "review-csrf", "idempotency-key": `invalid-${T}` };
  const source = await app.inject({ method: "POST", url: "/api/admin/sources", headers, payload: { id: "bad" } });
  assert.equal(source.statusCode, 400);
  const id = await article();
  await sql`UPDATE articles SET processing_state = 'analyzed' WHERE id = ${id}`;
  const response = await app.inject({ method: "POST", url: `/api/admin/content/${id}/rerun`, headers, payload: { step: "typo" } });
  assert.equal(response.statusCode, 400);
  const [state] = await sql`SELECT processing_state FROM articles WHERE id = ${id}`;
  assert.equal(state!.processing_state, "analyzed");
  const fixture = await frozenDaily();
  const correction = { method: "POST" as const, url: `/api/admin/reports/${fixture.report.id}/summary-correction`, payload: fixture.command };
  assert.equal((await app.inject(correction)).statusCode, 401);
  assert.equal((await app.inject({ ...correction, headers: { cookie: headers.cookie } })).statusCode, 403);
  assert.equal((await app.inject({ ...correction, headers, payload: { ...fixture.command, newSummary: "任意替换稿" } })).statusCode, 400);
  const adopted = await app.inject({ ...correction, headers });
  assert.equal(adopted.statusCode, 200, adopted.body);
  assert.equal(adopted.json().summary, fixture.copy.summaryZh);
  assert.equal((await app.inject({ ...correction, headers })).statusCode, 409);
});
