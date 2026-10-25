# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## 仓库上下文

先读 `README.md` 了解框架，再按任务读对应文档。README 介绍上游 AI 示例站；当前工作区已定制为「汽车产业情报」，以 `site/`、`industry/` 和 `docs/automotive.md` 的配置及业务边界为准，不要把示例行业恢复回来。npm 包名仍使用 `@aihot/*`。

`docs/local-development.md` 记录本机环境和运行方式，包含多轮历史记录；阅读时注意后文或明确标注的替代说明。该文档记录已有 launchd 托管的 API、worker、web；启动开发服务前先核对当前进程与端口，避免重复启动。运行状态和模型可用性需要现场验证，不能由历史验收记录推断。

## 开发命令

以下命令从仓库根目录执行。需要 Node.js **24.11+**（原生运行 TypeScript、ES modules）、npm workspaces 和 PostgreSQL（本机使用 17）。后端无需构建；前端需要 React Router 构建。仓库没有独立 lint 脚本，静态检查使用 `typecheck`。

安装依赖：

```bash
npm ci
```

本机数据库由 `compose.dev.yml` 提供，监听 `127.0.0.1:55432`，开发库为 `aihot_dev`；完整 Docker 部署使用 `docs/deploy.md` 的配置。需要启动本机数据库时：

```bash
docker compose -f compose.dev.yml up -d --wait
```

初始化或更新数据库：

```bash
npm run db:migrate
```

```bash
node --env-file=.env scripts/seed.ts
```

种子脚本只新增 `industry/sources.json` 中尚不存在的信源，不覆盖数据库中已修改的来源配置。

开发时分别运行 API（3001）、worker、web（3000）；API 与 worker 的脚本会加载根目录 `.env`，web 需显式加载：

```bash
npm run dev:api
```

```bash
npm run dev:worker
```

```bash
node --env-file=.env "$(command -v npm)" run dev:web
```

前端生产构建：

```bash
npm run build -w @aihot/web
```

生产入口和关闭 worker 所需的排空时间见 `docs/deploy.md` 的「不用 Docker」。不要为文档或界面检查重新生成已有 `.env`；初始化与运行 worker 前先核对采集、模型和推送开关。

## 检查与单项测试

全仓库类型检查（包含前端路由类型生成）：

```bash
npm run typecheck
```

后端使用 Node 内置测试运行器。完整测试包括 `tests/` 和各模块的测试；`DATABASE_URL` 的库名必须以 `_test` 或 `_ci` 结尾。测试准备程序会自动建库、迁移，并为需要数据库的每个测试文件创建副本，账号需要 `CREATEDB` 权限。下面的连接地址是示例；本机 55432 端口和凭据的设置方法见 `docs/local-development.md` 的「验证」。

```bash
DATABASE_URL=postgres://127.0.0.1:5432/myhot_test npm test
```

运行一个需要数据库的测试文件时，保留两个数据库初始化参数：

```bash
DATABASE_URL=postgres://127.0.0.1:5432/myhot_test node --test-global-setup=tests/databases.ts --import ./tests/databases.ts --test --test-timeout=120000 tests/analyze.test.ts
```

无需数据库的测试以 `*.standalone.test.ts` 命名，完整 `npm test` 也会运行它们：

```bash
npm run test:standalone
```

单个无数据库测试（保留环境隔离入口）：

```bash
node --import ./tests/standalone.ts --test --test-timeout=120000 tests/url.standalone.test.ts
```

缩小到某个测试名称时，在文件路径前加 `--test-name-pattern='名称或正则'`。测试只使用本地假服务，不需要真实模型密钥；不要把开发 `.env` 整体加载到后端测试中。备份相关测试需要 PostgreSQL 17 的 `pg_dump`、`pg_restore` 在 PATH 中。

前端测试由 Node 测试运行器调用 Playwright，先安装浏览器，再构建，然后运行测试。测试夹具使用本地假 API 和临时端口启动构建后的 web，不依赖实际 API、worker 或数据库。单文件运行时将最后一个命令的通配符替换为具体测试路径；Linux CI 安装浏览器时另加 `--with-deps`：

```bash
npx playwright install chromium webkit
```

```bash
npm run build -w @aihot/web
```

```bash
node --test apps/web/tests/*.test.ts
```

已有站点运行后的端到端冒烟检查：

```bash
node scripts/smoke.ts --base http://localhost:3000
```

数据库迁移的在线执行约束可单独检查：

```bash
node scripts/check-migrations.ts
```

## 架构与改动落点

三个独立进程共享后端业务包和 PostgreSQL：

- `apps/api/`：Fastify HTTP 服务，提供网站接口 `/api/site/`、公开接口 `/api/v1/`、RSS、MCP、后台接口与静态资源。
- `apps/worker/`：pg-boss 队列消费者和定时任务，执行采集、正文提取、模型分析、事件归组、热度和报告编排。
- `apps/web/`：React Router SSR、React 和 Tailwind CSS。页面 loader 通过 HTTP 读取 API；自定义 `server.ts` 负责网页服务及 API 路径转发。数据库、模型调用和后端密钥不进入前端。

业务流程位于 `packages/backend/src/`：信源读取与采集 → 材料入库、判重和正文提取 → `editorial/` 预筛、两次评分、结构化及写作 → `events/` 归组与热度 → `publication/` 公开读取与发布 → `reports/` 成刊。日报按规则编排，不调用模型；周报、月报从日报汇编，模型只写总述和栏目导读。读者请求只读取已经处理的内容。

所有公共出口共用 `publication/`，公开范围与精选席位规则集中在 `publication/scope.ts`；新增出口应复用这一层，以保持撤回、事实证据与全文许可一致。`providers/receipts.ts` 和预算控制覆盖付费调用；重试通过已有回执复用结果。

`packages/contracts/` 提供跨进程共享类型与常量，后台接口类型在 `src/admin.ts`，任务载荷以 backend 的 `jobs/queue.ts` 中 `JobData` 为准。架构边界由 `tests/architecture.test.ts` 检查。

站点定制分成三层：

- `site/` 管站名、文案、品牌、条款、出刊时间和每步模型预设；`site/public/` 的固定文件发布时替换占位符。
- `industry/` 管分类、主题、初始信源、提示词和精选门槛。评分校准见 `docs/selection.md`，归组评测见 `docs/grouping.md`。
- `modules/` 放本站专属功能，经 `site/modules/{index,server,web}` 的清单接入通用框架；模块依赖同时登记在 `site/package.json`。当前 `modules/automotive/` 提供长安马自达列表与详情的信源适配，经 `site/modules/server.ts` 注册。

数据库迁移由 `scripts/migrate.ts` 合并引擎 `database/migrations/` 和启用模块的迁移，按完整文件名排序并记账。已发布迁移不可改写；新增迁移的在线执行规则和破坏性变更步骤见 `docs/architecture.md` 的「数据库迁移」。

涉及信源解析先读 `docs/sources.md`，涉及本站采集范围和经营事实边界先读 `docs/automotive.md`；本机启动见 `docs/local-development.md`，部署及升级见 `docs/deploy.md`。向上游提交改动前读 `CONTRIBUTING.md`；上游不接受外部 PR 修改此类 Agent 规则文件。
