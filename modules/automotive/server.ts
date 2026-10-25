// Public first-party news uses separate ordinary/top lists and a JSON detail endpoint.
import { defineServerModule } from '@aihot/backend/modules';
import { fetchJsonList } from '@aihot/backend/sources/json-list';
import { guardedFetch, requireOk } from '@aihot/backend/lib/http-fetch';
import { readableDocument } from '@aihot/backend/content/extract';
import { contentDocument } from '@aihot/backend/lib/page-content';
import { readPublicationDate } from '@aihot/backend/sources/dates';
import type { SourceRow } from '@aihot/backend/sources/types';

const origin = 'https://www.changan-mazda.com.cn';
export const automotive = defineServerModule({
  name: 'automotive',
  sourceAdapters: {
    changan_mazda: {
      kind: 'json_list',
      async listing(source: SourceRow) {
        const { adapter: _adapter, ...config } = source.config;
        const lists = await Promise.all(['queryNewPage', 'queryTopNewPage'].map(path =>
          fetchJsonList({ ...source, config: { ...config, url: `${origin}/api/openapi/news/${path}` } })));
        return [...new Map(lists.flat().map(c => [c.url, c])).values()];
      },
      async detail(url: string) {
        const page = new URL(url);
        const id = page.searchParams.get('id');
        if (page.origin !== origin || page.pathname !== '/headlines/detail/' || !id || !/^\d+$/.test(id)) {
          throw new Error('Unrecognized official news URL');
        }
        // A verified detail contains 10.7 MB of inline pictures; keep a bounded 16 MiB ceiling.
        const res = requireOk(await guardedFetch(`${origin}/api/openapi/news/get/${id}`, {
          timeoutMs: 20_000, maxBytes: 16 * 1024 * 1024, redirectPolicy: 'same-origin',
        }), 'official news detail');
        const result = JSON.parse(res.text());
        const item = result.data;
        if (result.code !== 200 || String(item?.newsId) !== id || typeof item.newsContent !== 'string') {
          throw new Error('Official news detail missing or mismatched');
        }
        // No scripts run. Inline pictures can be megabytes each; keep only readable text and URL images.
        const document = contentDocument(`<html><body><article>${item.newsContent}</article></body></html>`);
        for (const image of document.querySelectorAll('img[src^="data:"]')) image.remove();
        const body = readableDocument(document, url);
        if (!body) throw new Error('Official news detail has no confirmed readable body');
        return { ...readPublicationDate(item.newsCtime, '+08:00'), title: null, summary: body.text.slice(0, 2000), body };
      },
    },
  },
});
