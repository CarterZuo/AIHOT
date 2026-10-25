// Titles derived before a report's factual review cannot outlive that report's correction or hold.
// Historical stories retain their saved title; reviewed stories use a current readable report.
import { sql } from "../db.ts";
import { evidenceCondition, storyReportCondition } from "./scope.ts";

export function reviewedFact(factId: ReturnType<typeof sql>) {
  return sql`EXISTS (
    SELECT 1 FROM fact_articles reviewed_fa JOIN publications reviewed_p ON reviewed_p.article_id = reviewed_fa.article_id
    JOIN analyses reviewed_an ON reviewed_an.id = reviewed_p.analysis_id
    WHERE reviewed_fa.fact_id = ${factId}
      AND (reviewed_an.output->>'factReviewRequired' = 'true' OR reviewed_an.output ? 'factReview'))`;
}

export function publicStoryTitle(storyId = sql`st.id`, savedTitle = sql`st.title`, now: Date | ReturnType<typeof sql> = sql`now()`) {
  return sql`CASE WHEN EXISTS (SELECT 1 FROM facts reviewed_f WHERE reviewed_f.story_id = ${storyId} AND ${reviewedFact(sql`reviewed_f.id`)})
    THEN (SELECT p.title FROM facts f JOIN fact_articles fa ON fa.fact_id = f.id
      JOIN publications p ON p.article_id = fa.article_id JOIN sources s ON s.id = p.source_id
      WHERE f.story_id = ${storyId} AND ${evidenceCondition()} AND ${storyReportCondition(now)}
      ORDER BY p.selected DESC, (fa.role = 'primary') DESC, coalesce(p.published_at, p.discovered_at) DESC, p.article_id LIMIT 1)
    ELSE ${savedTitle} END`;
}
