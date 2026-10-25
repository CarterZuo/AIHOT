// Failure cases: a prompt's header-actions class makes Readability discard its text; a bar chart's
// CSS disappears and leaves unrelated labels/values; normalization exposes hidden content or scripts.
// The widgets are the source's to declare (config.detail.preserve), and a rule it cannot run is refused
// instead of silently changing nothing; the engine knows no site's classes.
import assert from "node:assert/strict";
import { test } from "node:test";
import * as cheerio from "cheerio";
import { pageRules, readable } from "@aihot/backend/content/extract";
import { unsupportedConfig } from "@aihot/backend/sources/config-keys";
import { bodyToMarkdown } from "@aihot/backend/content/markdown";
import { shield, unshield } from "@aihot/backend/editorial/translate";

const prose = "The article explains how to maintain software, with practical examples and measurements. ".repeat(6);
const page = (content: string) => `<html><head><title>Maintenance</title></head><body><article><h1>Maintenance</h1><p>${prose}</p>${content}<p>${prose}</p></article></body></html>`;
const preserve = [
  { selector: ".not-prose:has(.prompt-scroll__content)", as: "pre" as const, code: ".prompt-scroll__content", caption: "[data-prompt-model]" },
  { selector: "figure .comparison-panels", as: "table" as const },
];
const extract = (content: string) => {
  const body = readable(page(content), "https://publisher.example/article", { preserve });
  assert.ok(body);
  return body;
};
const prompt = (attributes = "") => `<div class="not-prose" ${attributes}><div><div class="prompt-scroll-frame"><div class="prompt-scroll prompt-scroll--header-actions"><div class="prompt-scroll__content whitespace-pre-wrap">Review &lt;files&gt; &amp; preserve spelling.\n  Keep this indentation.</div></div></div><div class="prompt-actions"><span data-prompt-model="true">Model A</span><button>Copy prompt</button><script>untrusted()</script></div></div></div>`;

test("custom prompt blocks survive extraction and translation verbatim, without their controls", () => {
  const body = extract(prompt());
  const $ = cheerio.load(body.html);
  assert.equal($("pre code").text(), "Review <files> & preserve spelling.\n  Keep this indentation.");
  assert.ok(body.text.includes("Model A"));
  assert.doesNotMatch(body.html, /Copy prompt|untrusted|<script|<files>/);
  const protectedBody = shield(body.html);
  assert.equal(unshield(protectedBody.html, protectedBody), body.html);
  assert.match(bodyToMarkdown(body.html), /```[\s\S]*Review <files> & preserve spelling\.\n  Keep this indentation\.[\s\S]*```/);
});

test("hidden prompt components remain hidden", () => {
  for (const attributes of ['hidden', 'aria-hidden="true"', 'style="DISPLAY:NONE !important"']) {
    assert.doesNotMatch(extract(prompt(attributes)).html, /Review &lt;files&gt;/);
  }
});

test("comparison panels keep metric headings, model/value relationships and the source note", () => {
  const panel = (metric: string, values: string[]) => `<section class="comparison-panel"><p class="metric-label">${metric}</p><dl class="comparison-rows">${values.map((value, i) => `<div class="comparison-row"><dt>Model ${i + 1}</dt><dd><span aria-hidden="true">DECORATION</span><span class="result-value">${value}</span></dd></div>`).join("")}</dl><div class="axis" aria-hidden="true">AXIS</div></section>`;
  const body = extract(`<figure><figcaption>Cleanup comparison</figcaption><div class="comparison-panels">${panel("API cost", ["$109.06", "$15.12", "$5.27"])}${panel("Findings", ["142", "131", "86"])}</div><p>Costs include follow-up turns.</p></figure>`);
  const $ = cheerio.load(body.html);
  assert.deepEqual($("thead th").map((_, el) => $(el).text()).get(), ["", "API cost", "Findings"]);
  assert.deepEqual($("tbody tr").toArray().map(el => $(el).children().map((_, cell) => $(cell).text()).get()), [
    ["Model 1", "$109.06", "142"], ["Model 2", "$15.12", "131"], ["Model 3", "$5.27", "86"],
  ]);
  assert.match(body.html, /Cleanup comparison/);
  assert.match(body.html, /Costs include follow-up turns/);
  assert.doesNotMatch(body.html, /DECORATION|AXIS/);
  assert.match(bodyToMarkdown(body.html), /\| Model 1 \| \$109.06 \| 142 \|/);
  assert.equal(cheerio.load(extract('<dl><dt>Term</dt><dd>Ordinary definition</dd></dl>').html)("dl").length, 1);
});

test("a declared body keeps attachment-heavy articles and excludes surrounding declarations", () => {
  const attachments = Array.from({ length: 11 }, (_, i) => `<p><a href="/files/${i}.pdf">${i + 1}. Draft standard and explanatory attachment</a></p>`).join("");
  const html = `<html><head><title>Draft standards</title><meta name="pubdate" content="2026-10-21T06:53:25Z"></head><body>
    <div class="report-body"><p>${prose}</p><p>Comments close on 2026-12-19.</p>${attachments}<img data-src="/chart.png" alt="Chart"><script>untrusted()</script><a href="javascript:alert(1)">Unsafe link</a>
    <p hidden>HIDDEN WORDS</p><p aria-hidden="true">ARIA HIDDEN</p><p style="DISPLAY:NONE !important">STYLE HIDDEN</p></div>
    <div><p>${"COPYRIGHT DECLARATION. Reproduction requests and legal contacts. ".repeat(12)}</p></div></body></html>`;
  const rules = pageRules({ detail: { bodySelector: ".report-body" } });
  const body = readable(html, "https://publisher.example/news/item", rules);
  assert.ok(body);
  assert.match(body.text, /Comments close on 2026-12-19/);
  assert.doesNotMatch(body.html, /COPYRIGHT DECLARATION|HIDDEN WORDS|ARIA HIDDEN|STYLE HIDDEN|untrusted|javascript:/);
  const $ = cheerio.load(body.html);
  assert.equal($("a[href$='.pdf']").length, 11);
  assert.equal($("a[href$='.pdf']").first().attr("href"), "https://publisher.example/files/0.pdf");
  assert.equal($("img").attr("src"), "https://publisher.example/chart.png");
  assert.equal(body.publishedAt?.toISOString(), "2026-10-21T06:53:25.000Z");
  assert.equal(body.via, "selector");
});

test("a declared body fails closed when missing, ambiguous, hidden, malformed or too short", () => {
  const url = "https://publisher.example/article";
  for (const content of ["", `<div class="report-body">Short</div>`, `<div class="report-body">${prose}</div><div class="report-body">${prose}</div>`,
    ...["hidden", 'aria-hidden="true"', 'style="visibility:HIDDEN"'].map(attr => `<section ${attr}><div class="report-body">${prose}</div></section>`)]) {
    assert.equal(readable(page(content), url, { bodySelector: ".report-body" }), null);
  }
  assert.equal(readable(page(prose), url, { bodySelector: "???" }), null);
  assert.ok(readable(page(prose), url), "sources without a declared body keep the generic extractor");
});

test("sources accept a nonempty declared body selector and reject malformed values", () => {
  for (const kind of ["rss", "web_list", "json_list"] as const) {
    assert.deepEqual(unsupportedConfig(kind, { detail: { bodySelector: ".report-body" } }), []);
    for (const bodySelector of ["", " ", false, null, [".report-body"]]) {
      assert.deepEqual(unsupportedConfig(kind, { detail: { bodySelector } }), ["detail.bodySelector"]);
    }
  }
});

test("a source declares only widget rules extraction can run", () => {
  assert.deepEqual(unsupportedConfig("web_list", { detail: { preserve } }), []);
  for (const rule of [{ as: "pre" }, { selector: " ", as: "pre" }, { selector: "figure", as: "chart" }, { selector: "figure", as: "table", code: "pre" },
    { selector: "div", as: "pre", caption: 3 }, { selector: "div", as: "pre", label: "span" }, "div"]) {
    assert.deepEqual(unsupportedConfig("web_list", { detail: { preserve: [rule] } }), ["detail.preserve"], JSON.stringify(rule));
  }
  assert.deepEqual(unsupportedConfig("rss", { detail: { preserve: { selector: "div", as: "pre" } } }), ["detail.preserve"]);
});
