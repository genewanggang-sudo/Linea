
# Math 库二维曲线实现方案（第一阶段：基类）

## 1. 本阶段目标

先落地 3 个基础类，为后续具体曲线（直线、圆、圆弧、椭圆、椭圆弧、B 样条）打底：

1. `Interval`
2. `PeriodInterval`（继承 `Interval`）
3. `Curve2`（抽象基类，继承现有 `GeomBase`）

本阶段不实现具体曲线类，仅完成统一参数域与统一曲线接口。

---

## 2. 目录与文件

新增目录：

- `packages/math/src/curves`

新增文件：

- `packages/math/src/curves/interval.ts`
- `packages/math/src/curves/period_interval.ts`
- `packages/math/src/curves/curve2.ts`

同步修改：

- `packages/math/src/index.ts`（增加导出）
- `packages/math/src/types/type_define.ts`（增加曲线查询结果类型）

---

## 3. 设计细则

## 3.1 Interval

职责：表达非周期参数域（闭区间 `[start, end]`）。

核心字段：

- `public readonly start: number`
- `public readonly end: number`

核心方法：

- `length(): number`
- `contains(u: number, eps = Precision.EPS): boolean`
- `clamp(u: number): number`
- `equals(other: Interval, eps = Precision.EPS): boolean`
- `expand(delta: number): Interval`
- `expanded(delta: number): Interval`
- `intersect(other: Interval): Interval[]`
- `union(other: Interval): Interval[]`
- `split(u: number, eps = Precision.EPS): Interval[]`
- `merge(intervals: readonly Interval[], eps = Precision.EPS): Interval[]`（静态）

行为约定：

- 闭区间语义：`start/end` 都包含在内。
- 允许点区间：`start === end` 合法，长度为 `0`。
- 构造时若 `start > end`，自动交换为 `start <= end` 后再保存。
- `intersect` 统一返回数组：无交集返回 `[]`，有交集返回 `[Interval]`；端点相接返回点区间（如 `[3, 3]`）。
- `union` 统一返回数组：普通区间通常返回单段 `[Interval]`，为周期区间多段并集语义预留统一接口。
- `split` 在边界（含容差）返回 `[]`，表示未产生有效新分段，不抛错。
- `expand(delta)` 为就地修改；`expanded(delta)` 返回新对象，两者都保留。

## 3.2 PeriodInterval

职责：表达周期参数域，支持跨周期区间（如 `[350°, 30°]`）。

核心字段：

- 继承 `start/end`
- `public readonly period: number`

新增方法：

- `normalize(u: number): number`
- `shift(offset: number): PeriodInterval`

重写方法：

- `contains`
- `length`
- `clamp`
- `intersect`
- `union`
- `split`
- `equals`

行为约定：

- 参数归一化到 `[0, period)`。
- `period <= 0` 构造直接抛 `MathError`。
- `length()` 表示沿正方向从 `start` 到 `end` 的弧长。
- `intersect` 返回 `PeriodInterval[]`，内部可拆为线性区间计算后再包装回周期区间。
- `union` 返回 `PeriodInterval[]`，允许返回多段结果（通常为 1 段，跨周期离散场景可为 2 段）。
- `equals/intersect/union` 输入类型均为 `PeriodInterval`；`period mismatch` 属于硬约束（返回 `false` 或抛 `MathError`）。
- 线性段归并统一复用 `Interval.merge(...)`，不在 `PeriodInterval` 内重复维护归并算法。
- 跨周期区间采用“展开区间”表示与计算思路：
- 示例：`[350, 30]` 视作 `[350, 390]`（`period = 360`）。
- 运算流程：先归一化参数，再将区间拆到普通区间域做交并，最后映射回周期表示。
- `clamp(u)` 规则：
- 先将 `u` 归一化到 `[0, period)`。
- 若归一化后参数在区间内，直接返回该值。
- 若不在区间内，返回与 `u` 角距离最近的区间边界点。

## 3.3 Curve2（抽象）

职责：定义二维曲线统一协议，所有曲线实现必须遵守。

抽象方法（必须由子类实现）：

- `getRange(): Interval`
- `pointAt(u: number): Vec2`
- `tangentAt(u: number): Vec2`
- `derivatives(u: number, n: number): Vec2[]`
- `curvatureAt(u: number): number`
- `length(range?: Interval): number`
- `lengthAtParam(u: number): number`
- `paramAtLength(s: number, tol?: number): number`
- `split(u: number): Curve2[]`
- `trim(range: Interval): Curve2[]`
- `reverse(): this`
- `transform(m: Mat3): this`
- `transformed(m: Mat3): this`
- `closestPoint(p: Vec2, tol?: number): { point: Vec2; param: number; distance: number }`
- `boundingBox(accurate?: boolean): Box2`
- `isValid(eps?: number): boolean`
- `clone(): this`
- `dump()`

可由基类提供的通用实现：

- `derivativeAt(u, n)`（从 `derivatives` 取第 `n` 项）
- `closestParam(p, tol?)`（基于 `closestPoint`）
- `distanceToPoint(p, tol?)`（基于 `closestPoint`）

补充约定：

- 反序列化 `static load()` 由具体子类实现，`Curve2` 抽象类不声明静态方法。
- `transform`（就地）与 `transformed`（返回新对象）同时保留。
- `Curve2` 默认参数域使用 `Interval.infinite()`。
- `Curve2` 参数域采用防御性复制：`setRange(range)` 内部存副本，`getRange()` 返回副本。
- `length(range?)` 语义统一：
- 不传 `range` 时，计算整条曲线长度。
- 传入 `range` 时，计算参数子区间长度。
- 子类可通过两种方式设置参数域：直接赋值 `this._range`，或调用 `setRange(range)`。
- 周期曲线可把 `PeriodInterval` 作为 `Interval` 子类赋给 `_range`。

---

## 4. 类型系统

本阶段 `Interval` / `PeriodInterval` 不纳入 `GeomMgr` 序列化体系。

`Curve2` 作为抽象类不直接实例化，不注册具体类型。

需要扩展：

- `type_define.ts` 增加曲线最近点结果类型（`IClosestPointResult`）

---

## 5. 错误处理约定

统一使用 `MathError`：

- 参数非法：`MathError.assert(...)`
- 逻辑失败：`MathError.throw(...)`
- 可恢复提醒：`MathError.warn(...)`

容差约定：

- 参数侧优先使用 `Precision.EPS`。
- 距离侧优先使用 `Precision.LEN_EPS`。
- 若后续发现参数语义需要独立容差，再补充 `Precision.PARAM_EPS`。
- 当前默认值：
- `Precision.EPS = 1e-9`（参数比较默认容差）
- `Precision.LEN_EPS = 1e-12`（长度/零值判断默认容差）

---

## 6. 测试方案（本阶段）

新增测试文件：

- `packages/math/tests/interval.test.ts`
- `packages/math/tests/period_interval.test.ts`
- `packages/math/tests/curve2_base.test.ts`（仅验证基类默认方法与抽象契约）

关键用例：

- `Interval` 构造合法性与边界行为
- `Interval.contains/clamp/intersect/union/split` 覆盖
- `PeriodInterval` 跨周期 `contains/length/split` 覆盖
- `PeriodInterval.normalize/shift` 覆盖
- `Curve2` 默认方法（`derivativeAt/closestParam/distanceToPoint`）行为覆盖

验收命令：

```bash
pnpm -C packages/math test:run
pnpm -C packages/math lint
pnpm -C packages/math build
```

---

## 7. 落地顺序

1. 实现 `Interval` + 测试。
2. 实现 `PeriodInterval` + 测试。
3. 实现 `Curve2` 抽象层 + 测试。
4. 接入 `index.ts`、`geom_type.ts`、`dump_types.ts`。
5. 跑通 `test/lint/build` 并修正。

---

## 8. 下一阶段预告

在本阶段完成后，开始具体曲线实现：

- `Line2`（线段语义：起点 + 终点）
- `Circle2`
- `Arc2`
- `Ellipse2`
- `EllipseArc2`
- `BSpline2`（NURBS）
