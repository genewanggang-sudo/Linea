# Math 库更新记录

更新日期：2026-02-04

这份文档记录本次 Math 库的关键决策与变更，便于后续追踪与回顾。

---

## 1) ESLint / TS 配置

- 新增根级 `tsconfig.eslint.json`，用于 ESLint 的 type-aware 检查。
- 覆盖 `src` 与 `tests`，并包含 `vitest` 类型。
- ESLint 指向该 `tsconfig`，避免在 tests 上做特殊 override。

## 2) Math 库基础设计

- 采用列向量 + 右乘语义，与 three.js 一致。
- `Mat3`：对外行主序输入/输出，内部列主序存储与计算。
- `Vec2`：不可变向量，支持序列化/反序列化。
- 统一序列化结构：`IDB` + `type` 字段，注册表 `GeomMgr`。

## 3) 代码变更与结构

- 移除 `src` 下各子目录的 `index.ts`，统一由 `src/index.ts` 导出。
- `Vec2`/`Mat3` 文件名改为小写：`vec2.ts` / `mat3.ts`，并更新引用。
- 新增 `Mat3`，扩展 `EN_GEO_TYPE` 与 `IDBMat3`。
- `GeomBase` 要求子类实现 `clone`（后改为返回 `GeomBase` 简化类型）。

## 4) 测试

- 新增 `Mat3` 测试；补齐 `Vec2` 测试分支覆盖。
- 测试用例标题改为中文。
- 已通过 `pnpm test:math:run`。

## 5) 待办与下一步建议

- `Box2`(AABB)
- `Line2` / `Segment2` / `Ray2`
- `Circle` / `Arc`
- `Polyline`
- `Bezier`
- `Tessellate`

