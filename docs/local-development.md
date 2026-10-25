# 本机开发与测试

当前验收状态以[2026-10-25交接](initialization-handoff-2026-10-25.md)为准。本文后部按日期保留历史，旧模型、进程、计数和暂停状态不能替代现场核验。新机器默认关闭采集与模型调用；本机已获授权的持续运行状态不随Git克隆迁移。

## 事实审核部署与模型选择（2026-10-25）

已部署生成稿发布前事实审核、统一公开投影拦截及冻结日报单条摘要纠错。处理步骤现为12项；后台已将 `understand`、`summarize`、`factReview` 三步经审计选择为 `magpie/codex/gpt-6.1-sol`，其他步骤沿用下节默认入口。隔离四篇旧错误稿全部被拒，四篇新内容理解稿与四个忠实意译/无害省略对照全部通过；另以本地评分夹具固定进入低分摘要路径，真实候选写作和审核4/4通过。实际部署队列四篇新稿均通过，已清除两处旧人工摘要覆盖；日报2经原生接口采用分析2308的摘要，版本1→2，旧版归档且非目标内容不变。这不是全行业质量校准。运行闭环证据见 `.data/fact-review-20261025/`，自然刊期验收另计。

后台模型选择在API与worker各有一分钟进程缓存；API切换成功不表示worker已立即采用。上线应等缓存刷新，或用既有SIGTERM排空重载worker，再按实际回执的 `model` 核对。首批运行验收曾在缓存刷新前使用旧模型，不能计作候选模型通过。

托管服务仍使用原有launchd任务。2026-10-25晚间已完成受控排空、无业务占位及重新注册，worker恢复心跳与自然调度。隔离任务确认本机macOS 27.2用户gui域将大于60秒的 `ExitTimeOut` 压回60秒，磁盘515秒不能作为生效证据。用户已接受此具体平台例外：维护先让应用完整排空并确认业务进程退出；活动任务期间不直接 `bootout`、`kickstart -k`、登出或强制关机。系统强制退出仍有60秒中断风险。完整边界和自然窗口见[当前验收交接](initialization-handoff-2026-10-25.md)。

## 当前模型入口（2026-10-25，取代下文 OpenCodex 历史配置）

已按用户授权切换到 Magpie：`LLM_BASE_URL=http://127.0.0.1:3425/v1`，`LLM_MODEL=antigravity/gemini-3.8-flash`。该次切换时11个处理步骤均使用 default；当前新增事实审核后的选择以本文顶部为准，密钥只留在本机配置。保留4096推理余量、JSON模式及文本输入。`site/models.ts` 已同步 Magpie 当前7个候选，旧 OpenCodex 候选已移除，历史回执保留。候选目录仍为静态配置，不会自动发现模型。

API与worker已按SIGTERM正常重载，由原有launchd托管恢复。真实翻译探针通过原生回执及结构校验；重载后的原生事件综述回执7583已completed。其他模型尚未做业务评测。本次验证记录位于 `.data/gateway-magpie-20261025/`。

远程仓库为 `CarterZuo/AIHOT`；本地克隆目录由使用者选择。
使用现有 Node.js 24.14.1；PostgreSQL 17 使用独立 Docker Compose 项目 `aihot-dev`。
以下命令均从仓库根目录执行。先启动 Docker Desktop。

## 进入环境

```bash
cd /path/to/AIHOT
export PATH="/opt/homebrew/opt/node@24/bin:/opt/homebrew/opt/libpq@17/bin:$PATH"
node --version
docker compose -f compose.dev.yml up -d --wait
```

其他机器可以使用 `.nvmrc` 选择 Node 版本。首次安装依赖运行 `npm ci`。
前端测试还需要 `npx playwright install chromium webkit`；后端备份测试需要 PostgreSQL 17 的 `pg_dump`、`pg_restore` 客户端（macOS 可安装 Homebrew 的 `libpq@17`）。
本机 `.env` 已生成随机管理员密码和签名密钥，权限为 `600`，不会提交到 Git。
换机器时按 `.env.example` 生成自己的 `.env`，并设置下列本地参数：

```dotenv
SITE_URL=http://localhost:3000
DATABASE_URL=postgres://aihot:<与POSTGRES_PASSWORD一致的密码>@127.0.0.1:55432/aihot_dev
API_BASE_URL=http://127.0.0.1:3001
API_HOST=127.0.0.1
WEB_HOST=127.0.0.1
COLLECT_ENABLED=false
MODEL_CALLS_ENABLED=false
FEISHU_CONTENT_PUSH_ENABLED=false
FEISHU_INTERNAL_ENABLED=false
INDEXNOW_SUBMIT_ENABLED=false
# 仅当系统DNS被TUN返回假IP时使用；保留采集安全校验
OUTBOUND_DNS_URL=https://223.5.5.5/resolve
```

数据库只监听本机 `55432` 端口，数据保存在 Docker 卷 `aihot-dev_db`。
开发库为 `aihot_dev`，测试库为 `aihot_test`；测试程序自动创建并清理每个测试文件的副本。

## 初始化数据库

```bash
node --env-file=.env scripts/migrate.ts
node --env-file=.env scripts/seed.ts
```

种子数据现为8个暂停的汽车候选信源，行业范围、真实试抓证据与启用条件见[汽车产业情报](automotive.md)。采集和模型调用关闭时，首页没有真实资讯是正常状态。
管理员登录地址为 `http://localhost:3000/admin`，密码查看本机 `.env` 的 `ADMIN_PASSWORD`。

## 启动开发服务

分别在三个终端执行；每个终端先执行上方“进入环境”中的 `cd` 和 `export PATH`。

```bash
# 终端 1：API（3001）
npm run dev:api

# 终端 2：后台任务（保留采集、模型和推送关闭）
npm run dev:worker

# 终端 3：前端热更新（3000），显式加载根目录配置
node --env-file=.env "$(command -v npm)" run dev:web
```

打开 `http://localhost:3000`。终端内使用 Ctrl+C 停止对应进程。

## 验证

```bash
npm run typecheck
npm run build -w @aihot/web
node --test apps/web/tests/*.test.ts

# 只读取数据库地址，避免将开发环境的关闭开关带入本地假服务测试。
AIHOT_TEST_DATABASE_URL=$(node --env-file=.env -p 'const u=new URL(process.env.DATABASE_URL);u.pathname="/aihot_test";u.href')
DATABASE_URL="$AIHOT_TEST_DATABASE_URL" npm test

# API、worker、web 启动后执行
node scripts/smoke.ts --base http://localhost:3000
```

`npm run test:standalone` 可单独运行无需数据库的测试；完整 `npm test` 已包含这些测试。
测试会监听本机临时端口，应在允许本地网络的终端中执行。测试使用本地假服务，不需要配置真实模型密钥。

## 停止数据库

先停止应用进程，再执行：

```bash
docker compose -f compose.dev.yml stop
```

该命令保留数据。不要添加 `down -v`，它会删除本项目数据库卷。

本次搭建的验证日志保存在 `.data/logs/`；该目录不会提交到 Git。
本次会话启动的后台开发进程，其 PID 记录在 `.data/dev-processes.json`。重开终端启动前，先核对 3000、3001 端口是否仍被这些进程使用，避免重复启动。
本机运行不等于公网部署，也不代表采集、模型或推送服务已接通。

## 初始环境验收记录（2026-10-23，行业定制前）

基线提交：`47531faa635c7f4313e526dd0b56312c1a23ba30`，与验收时远程 `main` 一致。
Node.js 24.14.1；PostgreSQL 服务端和客户端均为 17.11。

| 检查 | 结果 | 日志 |
|---|---|---|
| 类型检查 | 通过 | `.data/logs/typecheck.log` |
| 前端生产构建 | 通过 | `.data/logs/build.log` |
| 完整后端测试 | 935 通过，0 失败、0 跳过 | `.data/logs/backend-tests.log` |
| 前端测试（Chromium / WebKit） | 59 通过，0 失败、0 跳过 | `.data/logs/web-tests.log` |
| 站点冒烟检查 | 30 项通过 | `.data/logs/smoke.log` |
| 首页渲染 | 电脑与 390px 手机宽度已检查；手机无横向溢出 | `.data/logs/homepage.png`、`homepage-mobile.png` |
| 开发数据库 | 迁移完成，18 个示范信源 | `.data/logs/migrate.log`、`seed.log` |

首次检查发现测试浏览器版本和 `pg_dump` 缺失；补齐依赖后重新运行完整测试并通过。
当前 GitHub 账号已通过只读查询确认具有本仓库的 push、maintain 权限。本次新增开发配置保留在本地，未推送到远程。

## 汽车行业定制后

站名为“汽车产业情报”。当前开发库保留18个已暂停的旧AI示例源，并新增8个暂停的汽车候选源。已完成一次性采集入库23条（22条正文、1条短投诉摘要）；现有本地小模型未通过完整处理，正式信息流仍为0。API和网页继续运行，worker暂停。来源解析、DNS阻塞与待决定事项见[行业定制说明](automotive.md)。

行业定制的类型、构建、935项后端测试、59项前端测试及30项冒烟检查日志分别位于 `.data/logs/typecheck-auto.log`、`web-build-auto.log`、`backend-tests-auto.log`、`web-tests-auto.log`、`smoke-auto.log`。修改保留在本地，未推送或部署生产。

## 本机采集 DNS

本机VPN保留运行。本站通过 `.env` 的 `OUTBOUND_DNS_URL` 读取真实公网DNS答案，系统层仍可能显示198.18.x.x。修改此值后重启API和worker；不应为解决DNS问题开启 `ALLOW_PRIVATE_NETWORK_FETCH`。正常网络可删除该行恢复系统解析。详见[逐源验证记录](automotive.md)。

长马官方适配是本地workspace模块，没有新增第三方库。新拉取代码后运行 `npm ci` 建立workspace链接，再启动服务。只读验收命令为 `node --env-file=.env modules/automotive/scripts/check-sources.ts`。后台“试抓”不会入库；全局采集、模型和推送仍关闭。

首次采集清单：`.data/first-collection/collection.html`；后台按标题搜索，例如 `http://localhost:3000/admin/content?q=马自达`。模型检查与逐源入库数量见[一次性采集结果](automotive.md#首次一次性采集2026-10-23)。本批不启用持续任务，接入合格的本地文本模型后可继续处理已有23条。


## 首批分析完成与原生 worker 接管（2026-10-24）

23 条首次采集材料已通过一次性驱动调用原生 `analyzeArticle`、`groupArticle` 和 `publishArticle` 完成处理。数据库核对：23 条已分析、23 条公开内容、7 条精选、23 条已归档。一次性驱动未替代框架的评分、回执、预算或发布读取层。

本机 `.env` 使用 OpenCodex 的 OpenAI 兼容入口 `http://127.0.0.1:10100/v1`，模型为 `google-antigravity/gemini-3.8-flash`，`LLM_EXTRA_JSON={}`、`LLM_REASONING_TOKENS=4096`、`LLM_JSON_MODE=true`、`LLM_VISION=false`。密钥只留在本机配置。该入口是本机代理，不能理解为 Gemini 离线运行或已确认免费计费。

本次授权后 `MODEL_CALLS_ENABLED=true`，原生 worker 已用 `node --env-file=.env apps/worker/src/main.ts` 启动，PID 记在 `.data/dev-processes.json`。`COLLECT_ENABLED`、两个 Feishu 推送开关和 `INDEXNOW_SUBMIT_ENABLED` 继续为 false，全部信源保持暂停。原生 worker 的内容扫描与热度刷新任务均完成，扫描返回 `enqueued: 0`，不会为本批主动重复分析。worker 保留原生后台定时任务，不是持续采集授权；本次未配置开机自动启动。

查看首页 `/` 的 7 条精选、`/all` 的全部动态、`/admin/content` 的内容链路，以及 `/admin/runs` 的心跳和任务记录。首页电脑与 390px 手机页面已检查，冒烟检查通过。证据在 `.data/first-collection/` 的 `batch-process-results.json`、`status-before-worker.json`、`native-worker.log` 和 `smoke-live.log`。

本批为历史回灌，按原文日期展示，不创建当前热点事件或增加热度。日报任务仍可能报 `nothing judged in its window`；本次不宣称日报完成，也不修改历史标记或时间来制造日报与热度。


## 单次原生采集和日志核验（2026-10-24）

本次未启用持续采集：`.env` 的 `COLLECT_ENABLED=false`，所有信源仍暂停。临时进程只注册原生信源和正文提取队列消费者，不注册采集定时器；逐源以 `sources.fetch` 的 `force:true` 和独立 `singletonKey` 抓取。原生主 worker 消费分析、归组和综述任务。8 源各初始化一次，盖世在同一次验证中另做一次增量检查，以检验非回灌路径。临时进程已排空并退出。

新增124条，总材料147条；新增81条已分析、32条预筛拦截、11条正文待重试。公开池47条，精选9条。新增不等于最新汽车资讯：政府综合公告和旧档案也会先入库再筛选。本次446次模型回执全部completed，新增failed/unknown为0。所有调用使用现有OpenCodex Gemini；推送记录仍为0。检查证据保存在 `.data/native-latest/`。

热度任务正常执行，榜单0条，当前没有满足最少2个独立参与来源的事件。此前“历史回灌一律不增加热度”的表述需要修正：`isHistorical` 对首次回灌中距发现48小时内的有日期材料仍按新闻处理；日报候选则明确排除backfill。本次未修改任何历史标记、来源时间或精选门槛。

已到期的2026-10-23日报缺少窗口内可用材料，原生定时任务如实失败。2026-10-24版尚未到08:00截稿，只运行原生dailyEdition/arrangeDaily生成本地只读预览：8条judgedReports、0条selectedReports、0个事件。没有提前保存未来日报；尚未验证非空日报发布成功。

当前异常与日志边界：

- 长马列表运行ok，但1篇详情响应过大，触发大小限制；detailFailures=1。列表ok不等于正文完整。
- 11条原生正文提取未成功，转入Jina回退时缺少JINA_API_KEY；队列任务completed但output.state=retrying，文章仍new/pending。这是提取服务配置与失败路径问题，不能归因于Gemini。
- `.env` 关闭采集时，原生main不会注册正文提取队列；临时消费者退出后，这11条的后续重试可能只有入队、没有消费者。尚未修改框架或新增服务处理这一问题。
- 回执9/13/17/21为此前Gemini试配失败，maxTokens为1200/1024，均finish_reason=length；当前配置补入4096推理余量后评分上限5120，本次没有新增模型失败。Qwen回执4/6/7为此前小模型结构不合格。历史received回执5/8/10/11/12/14/15/16/18/19/20/22是早期试验遗留，未擅自改写其状态。
- 后台“付费请求”是通用回执统计，包含OpenCodex调用，不能单凭该名称认定实际扣费；任务显示ok也不能单凭该状态认定有内容、已抓取正文或已经对外推送。

本次只修改本机操作记录与忽略目录中的驱动/证据；网站原生处理代码与模型规则未修改。网站smoke检查通过。


## 历史：本机自主运行配置（2026-10-24；模型入口已由本文顶部取代）

用户已授权原生定时采集及信源扩充。当前COLLECT_ENABLED=true，模型仍为原有OpenCodex Gemini；飞书、IndexNow与付费提取服务关闭，备份明确不纳入本次。应用按docs/deploy.md的无Docker生产入口运行，由macOS launchd托管api/worker/web（com.carterzuo.automotive.*），全部本机监听。数据库使用原有卷，通过`.data/autonomous/compose.override.yml`设置unless-stopped。不要再重复启动开发进程。

原生sources.schedule和正文消费者已恢复，已经观察到无需Codex触发的自动入队、采集和分析。API通过launchd自动恢复测试；正文处理、多源热点与日报验收仍进行中，因此尚不确认部署配置完成。运行说明、验收条件和实际快照见`.data/autonomous/RUNBOOK.md`、`state.json`、`coverage.json`。原有AI源关闭VPN后的直连检测按用户要求延期，本站模型不随Codex驱动模型的未来切换而自动更改。EZ-6的N7竞品明确为日产N7，腾势N7专用源已停用。


## 历史：统一 OpenCodex 模型入口（2026-10-24；已由Magpie取代）

当前11个原生处理步骤均使用 `default`，由 `.env` 中的 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL` 指向现有 OpenCodex Gemini。后台“代码默认”表示没有按步骤覆盖，并不表示使用仓库示例供应商。

后台候选来自 `site/models.ts` 的固定 `PRESETS`。原8个示例项已移至仅供隔离测试使用的 `tests/model-presets.ts`。生产候选以 OpenCodex 当次 `/v1/models` 返回的9个模型为准，名称加 `opencodex/` 前缀，全部复用 `LLM_BASE_URL` 和 `LLM_API_KEY`，保持原 `llm` 回执、预算和安全控制。默认路由仍为 Gemini；没有自动分配其他模型或设备用模型。

新增候选只是目录注册，不等于已经通过真实材料评测或确认免费。当前保留文本输入，推理预留4096 tokens；其他模型的JSON输出、推理额度、速度和分类/评分质量须用限定样本验证后再选入业务步骤。历史用量中的旧模型记录保留，不代表仍在调用。

原生框架没有 `/v1/models` 自动发现/热同步机制。OpenCodex 完成模型增删后，应重新读取其目录，核对文本与 Chat Completions 能力，再更新 `site/models.ts` 并正常重载 API/worker。若要让后台自动跟随 OpenCodex 目录，需要单独获批开发，当前未实现。不能通过重启或修改地址声称动态同步已完成。
