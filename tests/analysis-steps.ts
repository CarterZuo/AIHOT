// Which step of the article analysis a model request is for, and a score that selects. Each step sends
// its own system prompt, rendered from the industry pack, and the thresholds come from the pack too: a
// test that recognises a request by its whole prompt and scores against the pack's threshold keeps
// working when a site rewrites the prompts and recalibrates the thresholds for its own industry.
import { MEND_SYSTEM, SCORE_SYSTEM, STRUCTURE_SYSTEM, tierThreshold } from "@aihot/backend/editorial/analyze";
import { PREFILTER_SYSTEM, UNDERSTAND_SYSTEM } from "@aihot/backend/editorial/writing";
import { FACT_REVIEW_SYSTEM } from "@aihot/backend/editorial/fact-review";

export type AnalysisStep = "prefilter" | "score" | "structure" | "understand" | "summarize" | "wording" | "factReview";

const BY_SYSTEM = new Map<string, AnalysisStep>([
  [PREFILTER_SYSTEM, "prefilter"], [SCORE_SYSTEM, "score"], [STRUCTURE_SYSTEM, "structure"], [UNDERSTAND_SYSTEM, "understand"], [MEND_SYSTEM, "wording"], [FACT_REVIEW_SYSTEM, "factReview"],
]);

/** The step of a chat request, from its body as the provider receives it; the title/summary prompt comes without a system message. */
export function analysisStep(body: string): AnalysisStep {
  const { messages } = JSON.parse(body) as { messages: Array<{ role: string; content: unknown }> };
  if (messages[0]?.role !== "system") return "summarize";
  const step = BY_SYSTEM.get(String(messages[0].content));
  if (!step) throw new Error(`not a request of the article analysis: ${String(messages[0].content).slice(0, 80)}`);
  return step;
}

/** An explicit successful reviewer response for protocol tests, with quotes copied from their source fixture. */
export function passingFactReview(body: string) {
  const { messages } = JSON.parse(body) as { messages: Array<{ content: string }> };
  const { material, copy } = JSON.parse(messages.at(-1)!.content) as {
    material: string; copy: { titleZh: string; summaryZh: string; reasonZh: string | null };
  };
  const text = material.split(/【正文(?:（作者自己的内容）)?】\n/)[1]?.split("\n\n【材料质量】")[0]?.trim()
    || material.match(/【引用[^\n]*】[^\n]*\n([^\n]+)/)?.[1] || "";
  const quote = text.split("\n")[0]!.slice(0, 120).trim();
  return { status: "pass", evidence: (["titleZh", "summaryZh", "reasonZh"] as const)
    .filter(field => !!copy[field]).map(field => ({ field, quote })), issues: [] };
}

/** Both score calls at the T1 threshold: material from a T1 source is selected, with this mean score. */
export const SELECTING_SCORE = tierThreshold("T1")!;
