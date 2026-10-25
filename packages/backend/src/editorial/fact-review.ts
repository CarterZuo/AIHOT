// The final reader-facing copy is reviewed against source text, independently of relevance and score.
import { z } from "zod";
import { sha256, stableJson } from "../lib/ids.ts";
import { collapseWhitespace } from "../lib/text.ts";
import { chatJson } from "../providers/llm.ts";
import { shutdownSignal } from "../jobs/queue.ts";
import { modelFor } from "./models.ts";
import type { AnalyzeInputArticle } from "./input.ts";
import { promptText, promptVersion } from "./prompts.ts";
import { renderContext } from "./writing.ts";

export interface ReviewedCopy { titleZh: string; summaryZh: string; reasonZh: string | null }
export const FACT_REVIEW_VERSION = "fact-review-v1";
export const FACT_REVIEW_PROMPT_VERSION = promptVersion("fact-review");
export const FACT_REVIEW_SYSTEM = promptText("fact-review");
const Field = z.enum(["titleZh", "summaryZh", "reasonZh"]);
export const FactReviewSchema = z.object({
  status: z.enum(["pass", "reject", "uncertain"]),
  evidence: z.array(z.object({ field: Field, quote: z.string().trim().min(1).max(1000) })).max(24),
  issues: z.array(z.object({
    field: Field, claim: z.string().trim().min(1).max(1000),
    kind: z.enum(["boundary", "scope", "attribution", "configuration", "unsupported", "missing_evidence"]),
    quote: z.string().trim().max(1000), reason: z.string().trim().min(1).max(600),
  })).max(12),
});

export function copyHash(copy: ReviewedCopy): string {
  return sha256(stableJson({ titleZh: copy.titleZh, summaryZh: copy.summaryZh, reasonZh: copy.reasonZh }));
}

export function factReviewPassed(output: unknown, copy: ReviewedCopy): boolean {
  const review = (output as { factReview?: Record<string, unknown> } | null)?.factReview;
  return review?.version === FACT_REVIEW_VERSION && review.status === "pass" && review.copyHash === copyHash(copy);
}

export function normalizeFactReview(data: z.infer<typeof FactReviewSchema>, a: AnalyzeInputArticle, copy: ReviewedCopy) {
  const originals = [a.title, ...(a.xPost ? [String(a.xPost.text ?? ""), String(a.xPost.quoted?.text ?? "")] : [a.bodyText ?? a.excerpt ?? ""])]
    .map(collapseWhitespace).filter(Boolean);
  const visible = collapseWhitespace(renderContext(a, { annotateQuoted: true }));
  const grounded = (quote: string) => !!quote && visible.includes(collapseWhitespace(quote))
    && originals.some(text => text.includes(collapseWhitespace(quote)));
  const evidence = data.evidence.filter(e => grounded(e.quote));
  const issues = data.issues.filter(i => copy[i.field]?.includes(i.claim));
  const fields = (["titleZh", "summaryZh", "reasonZh"] as const).filter(field => !!copy[field]);
  const validPass = !!copy.titleZh.trim() && !!copy.summaryZh.trim() && !data.issues.length
    && fields.every(field => evidence.some(e => e.field === field));
  const validReject = issues.length > 0 && issues.every(i => i.kind === "missing_evidence" || grounded(i.quote));
  const status = data.status === "pass" && validPass ? "pass" : data.status === "reject" && validReject ? "reject" : "uncertain";
  return { version: FACT_REVIEW_VERSION, status, copyHash: copyHash(copy), evidence, issues };
}

export async function reviewCopy(a: AnalyzeInputArticle, copy: ReviewedCopy, conditions: unknown = [], opts: { attemptTag?: string } = {}) {
  shutdownSignal.signal.throwIfAborted();
  const res = await chatJson({
    model: await modelFor("factReview"), purpose: "review_article_facts", subject: `article:${a.id}@${a.revision}`,
    promptVersion: FACT_REVIEW_PROMPT_VERSION, system: FACT_REVIEW_SYSTEM,
    user: JSON.stringify({ material: renderContext(a, { annotateQuoted: true }), conditions,
      copy: { titleZh: copy.titleZh, summaryZh: copy.summaryZh, reasonZh: copy.reasonZh } }),
    schema: FactReviewSchema, temperature: 0, maxTokens: 4096, timeoutMs: 120_000,
    attemptTag: [opts.attemptTag, "fact-review"].filter(Boolean).join(":") || undefined,
  });
  return { ...normalizeFactReview(res.data, a, copy), model: res.model, receiptId: res.receiptId, reused: res.reused };
}
