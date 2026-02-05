# Math 库更新记录

> 说明：按日期倒序记录（最新在前）。

---

## 2026-02-05

### Vec2

- 新增单位向量静态方法（`unitX` / `unitY`）。
- 新增 `addScaled`，并补充相关测试。
- 调整为可变 API 并补充变换相关方法。
- 新增 `rotateAround(center, rad)` 并补测。

### Mat3

- 新增最小 `Mat3` 接口定义。
- 调整为可变 API，补充常用变换方法与接口调整。
- 增加向量变换接口并更新测试。
- 新增 `decompose()`（平移/旋转/缩放分解，假定无剪切）并补测。

### Coord2D

- 构造函数新增重载：空参、复制、从 `Mat3`、`origin + xAxis(+ yAxis)`。
- 新增 `transform` / `transformed`、`inverse`、`getScale` / `setScale`。
- 修复中文注释乱码，补全测试用例覆盖新方法。

### Box2

- 新增 `transform` / `transformed`、`distanceToPoint`、`clampPoint`、`intersect`。
- 构造函数增加重载（复制、`min/max` 两点、点集）。
- 精简实现：构造分支复用 `fromPoints`，`transform` 与 `intersect` 逻辑更简洁。
- 增补对应测试用例。

### 测试

- 更新 `Vec2` / `Mat3` / `Coord2D` / `Box2` 测试覆盖。

## 2026-02-04

### ESLint / TS 配置

- 新增根级 `tsconfig.eslint.json`，用于 ESLint 的 type‑aware 检查。
- 覆盖 `src` 与 `tests`，并包含 `vitest` 类型。
- ESLint 指向该 `tsconfig`，避免对 tests 做单独 override。

### Math 库基础设计

- 采用列向量 + 右乘语义，与 three.js 一致。
- `Mat3`：对外行主序输入/输出，内部列主序存储与计算。
- `Vec2`：不可变向量，支持序列化/反序列化。
- 统一序列化结构：`IDB` + `type` 字段，注册表 `GeomMgr`。

### 代码变更与结构

- 移除 `src` 下各子目录的 `index.ts`，统一由 `src/index.ts` 导出。
- `Vec2` / `Mat3` 文件名改为小写：`vec2.ts` / `mat3.ts`，并同步更新引用。
- 新增 `Mat3`，扩展 `EN_GEO_TYPE` 与 `IDBMat3`。
- `GeomBase` 要求子类实现 `clone`（后改为返回 `GeomBase` 简化类型）。

### 新增能力

- 新增 `Coord2D`（二维坐标系/基准框架），并补充测试。
- 新增 `Precision`（数值容差与精度管理），并补充测试。
- 新增 `MathUtils`（常用数值工具），并补充测试。
- 新增通用类型定义：`type_define.ts`、`type_guard.ts` 中补充数字元组与辅助类型。

### Vec2 扩展

- `Vec2` 方法与精度相关逻辑完善。
- `vec2.test.ts` 结构与覆盖率补齐。

### 矩阵 / 包围盒 / 序列化调整

- `mat3.ts` 细节调整（接口与实现层面）。
- `box2.ts` 做了小幅修正。
- `dump_types.ts` 与 `geom_mgr.ts` 结构调整。
- `geom_type.ts` 扩展新类型标识。

### 测试

- 新增 `Mat3` 测试；补齐 `Vec2` 测试分支覆盖。
- 测试用例标题改为中文。
- 通过 `pnpm test:math:run`。

### 待办与下一步建议

- `Box2`(AABB)
- `Line2` / `Segment2` / `Ray2`
- `Circle` / `Arc`
- `Polyline`
- `Bezier`
- `Tessellate`
