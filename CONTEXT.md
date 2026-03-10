# CONTEXT.md - Project Technical Brief

> 这份文件是给 Claude Code / sub-agent 的项目简报。
> 每次 spawn 编码任务时自动携带，确保上下文一致。

---

## 项目概述

**dex.express** — 多链实时 DEX 代币筛选器
- 品牌域名: dex.express（已上线）
- 代码仓库: base-dex-screener
- API: https://api-production-69b0.up.railway.app

---

## 技术栈

| 层 | 技术 |
|----|------|
| Frontend | Next.js 14, React 18, TailwindCSS, SWR, lightweight-charts |
| API | Fastify, WebSocket, Pino |
| Workers | viem (Base chain RPC via Alchemy) |
| Database | PostgreSQL 16 (分区表), Redis 7 (缓存 + pub/sub) |
| Auth | Privy (钱包登录) |
| Monorepo | pnpm workspaces |

## 目录结构

```
packages/
├── frontend/   @dex/frontend   — Next.js 14 + TailwindCSS
├── api/        @dex/api        — Fastify REST + WebSocket
├── workers/    @dex/workers    — 链上索引器 (viem)
├── database/   @dex/database   — pg + ioredis, schema, migrations
└── shared/     @dex/shared     — Types, constants, ABIs
```

---

## 开发规范

- 包管理器：**pnpm**（不要用 npm/yarn）
- 提交前跑：`pnpm lint && pnpm typecheck`
- 类型：严格 TypeScript，不允许 any
- 样式：TailwindCSS，不写内联 style
- 共享类型放 packages/shared/

## 已知注意事项

<!-- 随时更新：踩过的坑、特殊限制、重要决定 -->
-

---

## 当前重点任务

<!-- 每次开始新功能时更新 -->
-

---

_最后更新：2026-03-10_
