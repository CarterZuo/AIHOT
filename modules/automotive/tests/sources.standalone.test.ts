import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { config } from '@aihot/backend/config';
import { installModules, serverModules } from '@aihot/backend/modules';
import { unsupportedConfig } from '@aihot/backend/sources/config-keys';
import { fetchJsonList } from '@aihot/backend/sources/json-list';
import { fetchDetail } from '@aihot/backend/sources/web-list';
import type { SourceRow } from '@aihot/backend/sources/types';
import { automotive } from '../server.ts';

const origin = 'https://www.changan-mazda.com.cn';
const source: SourceRow = { id: 'fixture', name: 'fixture', kind: 'json_list', tier: 'T1', participation_mode: 'editorial', first_party: true, interval_minutes: 120, enabled: false, cursor: null, fail_count: 0, config: {
  adapter: 'changan_mazda', method: 'POST', bodyJson: { currentPage: 1, pageSize: 30 }, itemsPath: 'data.records',
  titlePaths: ['newsTitle'], publishedAtPath: 'newsCtime', publishedAtUtcOffset: '+08:00',
  urlTemplate: `${origin}/headlines/detail/?id={newsId}`,
} };

test('official adapter merges top and ordinary lists, confirms detail identity and sanitizes body', async () => {
  const previous = getGlobalDispatcher();
  const modules = serverModules();
  const allowPrivate = config.allowPrivateNetworkFetch;
  const agent = new MockAgent(); agent.disableNetConnect();
  setGlobalDispatcher(agent); config.allowPrivateNetworkFetch = true; installModules([automotive]);
  const host = agent.get(origin);
  const article = { newsId: 1, newsTitle: '测试车型上市消息', newsCtime: '2026-10-20 08:30:00' };
  try {
    assert.deepEqual(unsupportedConfig('json_list', source.config), []);
    assert.ok(unsupportedConfig('web_list', { adapter: 'changan_mazda' }).length);
    for (const [path, records] of [ ['queryNewPage', [article]], ['queryTopNewPage', [article, { ...article, newsId: 2 }]] ] as const) {
      host.intercept({ path: `/api/openapi/news/${path}`, method: 'POST' }).reply(200, { data: { records } });
    }
    const items = await fetchJsonList(source);
    assert.equal(items.length, 2); assert.equal(items[0].publicationTime, '2026-10-20T00:30:00.000Z');
    const body = '<p>' + '这是一段公开的汽车产品说明，包含适用车型、服务条件和实际发布时间。'.repeat(20) + '</p>';
    host.intercept({ path: '/api/openapi/news/get/1' }).reply(200, { code: 200, data: { ...article, newsContent: body + '<script>alert(1)</script><img src="data:image/png;base64,AAAA">' } });
    const got = await fetchDetail(items[0].url, source, { date: true, title: false, summary: false, body: true });
    assert.ok(got.body && got.body.text.length > 200);
    assert.equal(got.publicationTime, '2026-10-20T00:30:00.000Z');
    assert.doesNotMatch(got.body!.html, /<script|data:image/);
    host.intercept({ path: '/api/openapi/news/get/2' }).reply(200, { code: 200, data: { ...article, newsContent: body } });
    await assert.rejects(fetchDetail(items[1].url, source, { date: true, title: false, summary: false }), /mismatched/);
    host.intercept({ path: '/api/openapi/news/get/1' }).reply(200, { code: 200, data: { ...article, newsContent: '<p>暂无正文</p>' } });
    await assert.rejects(fetchDetail(items[0].url, source, { date: true, title: false, summary: false }), /no confirmed/);
    for (const url of ['https://evil.invalid/headlines/detail/?id=1', `${origin}/headlines/detail/?id=../private`]) {
      await assert.rejects(fetchDetail(url, source, { date: true, title: false, summary: false }), /Unrecognized/);
    }
    assert.deepEqual(agent.pendingInterceptors(), []);
  } finally {
    setGlobalDispatcher(previous); config.allowPrivateNetworkFetch = allowPrivate; installModules(modules); await agent.close();
  }
});
