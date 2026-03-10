# MEMORY.md - Project Long-term Memory

> 项目级长期记忆。记录重要决策、架构选择、踩过的坑。
> 不是日常日志（那个在 memory/YYYY-MM-DD.md）。

---

## 项目状态

- **阶段**：开发中
- **线上**：https://base-dex-screener.vercel.app
- **启动时间**：2026年初

---

## 重要决策记录

<!-- 格式：日期 - 决定了什么 - 为什么 -->

---

## 架构选择

- Monorepo with pnpm workspaces — 多包共享类型方便
- Fastify over Express — 性能更好，schema validation 内置
- PostgreSQL 分区表 — 交易数据量大，按时间分区查询更快
- Redis pub/sub — WebSocket 实时推送

---

## 踩过的坑

<!-- 格式：坑的描述 + 解决方案 -->

---

## 待决策事项

<!-- 还没想好的架构/技术选型 -->

---

_最后更新：2026-03-10_
