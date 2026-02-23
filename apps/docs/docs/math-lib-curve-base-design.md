# Math 库二维曲线基类设计（第一阶段）

## 1. 目标

本阶段只实现曲线基类能力，为后续具体曲线实现打基础：

1. `Interval`
2. `PeriodInterval`（继承 `Interval`）
3. `Curve2`（抽象类）

不包含具体曲线实现（`Line2/Circle2/...`）。

## 2. 文件结构

- `packages/math/src/curves/interval.ts`
- `packages/math/src/curves/period_interval.ts`
- `packages/math/src/curves/curve2.ts`

## 3. Interval

职责：表达线性参数闭区间 `[start, end]`。

核心能力：

- `length()`：返回区间长度。
- `contains(u, eps?)`：参数包含判断。
- `clamp(u)`：参数钳制。
- `intersect(other, eps?)`：交集，统一返回数组。
- `union(other)`：并集，统一返回数组。
- `split(u, eps?)`：按参数切分，边界切返回 `[]`。
- `merge(intervals, eps?)`（静态）：多区间归并。
- `infinite()`（静态）：返回数学无界区间。

关键约定：

- `start > end` 时自动交换。
- 允许点区间（`start === end`）。
- `split` 边界切不抛错，返回 `[]`。

## 4. PeriodInterval

职责：表达周期参数区间，支持跨周期表示（例如 `[350, 30]`, `period=360`）。

核心能力：

- `normalize(u)`：参数归一化到 `[0, period)`。
- `length()`：沿正向的周期长度。
- `contains/clamp/split`：周期语义下的参数处理。
- `intersect/union`：周期区间交并，返回 `PeriodInterval[]`。
- `shift(offset)`：区间整体平移。

关键约定：

- `period` 必须大于 0。
- `intersect/union/equals` 输入为同周期 `PeriodInterval`。
- 周期不一致为硬约束（`intersect/union` 抛错，`equals` 返回 `false`）。
- 内部先转线性段计算，再包装回 `PeriodInterval`。

## 5. Curve2

职责：定义二维曲线统一抽象接口。

核心约定：

- 使用 `_range` 维护参数域。
- 默认参数域：`Interval.infinite()`。
- 参数域采用防御性复制：
- `setRange(range)` 存副本。
- `getRange()` 返回副本。

抽象接口（子类必须实现）：

- `pointAt(u)`
- `tangentAt(u)`
- `derivatives(u, n)`
- `curvatureAt(u)`
- `length(range?)`
- `lengthAtParam(u)`
- `paramAtLength(s, tol?)`
- `split(u)` / `trim(range)`
- `reverse()` / `transform(m)` / `transformed(m)`
- `closestPoint(p, tol?)`
- `boundingBox(accurate?)`
- `isValid(eps?)`
- `clone()`

基类默认实现：

- `derivativeAt(u, n)`
- `closestParam(p, tol?)`
- `distanceToPoint(p, tol?)`

## 6. 验收

```bash
pnpm -C packages/math test:run
pnpm -C packages/math lint
pnpm -C packages/math build
```

## 7. 下一阶段

进入具体曲线实现：

- `Line2`（线段语义：起点+终点）
- `Circle2`
- `Arc2`
- `Ellipse2`
- `EllipseArc2`
- `BSpline2`（直接支持 NURBS）
