// Read-only acceptance check: no ingestion, model calls, paid rendering or publication.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { previewSource } from '@aihot/backend/admin/sources';
import { extractFromUrl } from '@aihot/backend/content/extract';
import { fetchDetail } from '@aihot/backend/sources/web-list';
import { createDirectResolver } from '@aihot/backend/lib/egress-proxy';
import { isBlockedAddress } from '@aihot/backend/lib/url';
import { config } from '@aihot/backend/config';
import { installModules } from '@aihot/backend/modules';
import { closeDb, sql } from '@aihot/backend/db';
import { SERVER_MODULES } from '../../../site/modules/server.ts';
import type { SourceRow } from '@aihot/backend/sources/types';

installModules(SERVER_MODULES);
const dir = '.data/source-validation';
mkdirSync(dir, { recursive: true });
if (config.allowPrivateNetworkFetch || config.privateFeedHosts.length) throw new Error('Run with public-address guards enabled');
const sources = JSON.parse(readFileSync('industry/sources.json', 'utf8')).sources as SourceRow[];
if (sources.some(s => !['json_list', 'web_list'].includes(s.kind) || !s.config.url?.startsWith('https://') || s.config.url.startsWith('https://r.jina.ai/'))) throw new Error('Only free public lists are allowed');
const dns = config.outboundDnsUrl ? createDirectResolver(config.outboundDnsUrl) : null;
const results: object[] = [];
try {
  const before = await sql`SELECT count(*)::int AS receipts FROM receipts`;
  for (const source of sources) {
    const started = Date.now();
    try {
      const host = new URL(source.config.url).hostname;
      const system = await lookup(host, { all: true });
      const addresses = dns ? await dns(host) : system.map(a => a.address);
      if (addresses.some(isBlockedAddress)) throw new Error('Public DNS check failed');
      const preview = await previewSource(source);
      const details = [];
      for (const item of preview.items.slice(0, 3)) {
        try {
          const detail = source.config.detail
            ? await fetchDetail(item.url, source, { date: true, title: false, summary: !!source.config.detail.summarySelector, body: true }) : null;
          const body = detail?.body ?? (source.config.detail ? null : await extractFromUrl(item.url, `source:${source.id}`, {}, { paidFallback: false }));
          details.push({ title: item.title, url: item.url, publishedAt: item.publishedAt, bodyChars: body?.text.length ?? 0,
            excerptChars: detail?.summary?.length ?? 0, bodyPreview: (body?.text ?? detail?.summary)?.slice(0, 140) ?? null });
        } catch (error) { details.push({ title: item.title, url: item.url, error: String(error) }); }
      }
      const result = { id: source.id, name: source.name, ms: Date.now() - started, systemAddresses: system.map(a => a.address),
        checkedPublicAddresses: addresses, count: preview.count, sampleCount: preview.items.length,
        datedSamples: preview.items.filter(i => i.publishedAt).length, details };
      results.push(result);
      console.log(source.id, `list=${preview.count}`, `dated=${result.datedSamples}/${result.sampleCount}`,
        `body=${details.filter(d => 'bodyChars' in d && (d.bodyChars! > 0 || d.excerptChars! > 0)).length}/${details.length}`);
    } catch (error) { results.push({ id: source.id, error: String(error) }); console.log(source.id, String(error)); }
  }
  const after = await sql`SELECT count(*)::int AS receipts FROM receipts`;
  writeFileSync(`${dir}/acceptance.json`, JSON.stringify({ checkedAt: new Date().toISOString(),
    scope: 'Live preview and up to three bodies per source; no ingestion or publication', receiptsBefore: before, receiptsAfter: after, results }, null, 2));
} finally { await closeDb(); }
