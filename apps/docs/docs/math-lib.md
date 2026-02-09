# Math 曲线基础设计方案

## 通用约定
- `eps` 为参数容差，默认使用 `Precision.EPS`。
- `tol` 为距离容差，默认使用 `Precision.LEN_EPS`。
- 数值算法遵循“解析优先、数值兜底”，并有迭代上限（默认建议 50）。
- 默认接口尽量保证返回；超范围时进行 `clamp` 或使用采样/端点兜底。
- 结构性操作（如 `split` / `trim`）若无结果，返回空数组。

## 目的

- 明确 `Curve2` 基类与参数域（`Interval` / `PeriodInterval`）的职责与方法，便于快速发现缺口并讨论改进。

---

## 需要设计的类

1. `Curve2`（二维曲线基类）
2. `Interval`（普通参数域）
3. `PeriodInterval`（周期参数域，继承 Interval）

---

## 商用标准：解析优先，数值兜底

- 能解析的曲线（直线、圆等）使用解析算法。
- 无解析解或过于复杂的曲线（椭圆弧、B 样条等）使用数值/迭代。
- 所有数值算法都需显式支持容差参数。

---

## Curve2

### 方法分类

**A. 参数与取点（原生参数）**
- `getParamRange()`：返回参数域（`Interval` 或 `PeriodInterval`）。
- `pointAtParam(u)`：原生参数取点。
- `tangentAtParam(u)`：原生参数切向（返回一阶导数向量，不单位化）。

**B. 导数与曲率**
- `derivatives(u, n)`：返回 0..n 阶导（至少支持 0/1/2），采用数组顺序 `[d0, d1, d2, ...]`。
- `derivativeAt(u, n)`：返回第 n 阶导数（单值接口）。
- `curvatureAt(u)`：曲率；曲线应在构造阶段保证有效性。数值退化时返回 `0` 并记录警告。

**C. 长度与参数换算**
- `length(range?)`：曲线长度（解析优先，数值兜底）。
- `lengthAtParam(u)`：从参数域起点到 u 的弧长（解析优先，数值兜底）；当 `u` 超出参数域时进行 `clamp`。
- `paramAtLength(s, tol?)`：根据弧长反求参数（数值迭代，需容差）；当 `s` 超出 `[0, length]` 时进行 `clamp`。

**D. 切割与方向**
- `split(u)`：按参数切分；当 `u` 超出参数域时进行 `clamp`；若切到边界导致无有效切分，返回空数组。
- `trim(range)`：裁剪到参数区间；与参数域无交集时返回空数组。
- `reverse()`：反转参数方向（参数域保持不变，例如 `[0,1]` 仍为 `[0,1]`，但点序反向）。

**E. 几何有效性与复制**
- `isValid(eps?)`：判定曲线是否退化/非法（具体标准由子类定义）。
- `clone()`：克隆。

**F. 变换**
- `transform(m)`：矩阵变换（就地），仅支持 2D 仿射矩阵 `Mat3`。
- `transformed(m)`：矩阵变换（返回新对象），仅支持 2D 仿射矩阵 `Mat3`。

**G. 通用查询**
- `closestPoint(p, tol?)`：返回 `{ point: Vec2; param: number; distance: number }`（解析优先，数值兜底）；数值失败时使用采样/端点兜底，保证返回。
- `closestParam(p, tol?)`：仅返回最近参数；数值失败时使用采样/端点兜底，保证返回。
- `distanceToPoint(p, tol?)`：点到曲线距离；数值失败时使用采样/端点兜底，保证返回。
- `boundingBox(accurate?)`：曲线包围盒（解析优先，采样兜底）；`accurate=true` 时精度优先，`accurate=false` 或缺省时性能优先。

### 方法含义简述

- `pointAtParam` / `tangentAtParam` / `derivatives`：**几何定义核心**。
- `length` / `paramAtLength`：用于等弧长采样与动画路径。
- `split` / `trim` / `reverse`：用于编辑、布尔等曲线处理。
- `closestPoint` / `distanceToPoint`：投影与距离查询（解析优先，数值兜底，容差可控）。

### 暂缓实现

- 曲线离散（如 `toPolyline`）暂不纳入本轮实现，后续作为单独专题设计。

---

## Interval（普通参数域）

### 方法
- `length()`：区间长度。
- `contains(u, eps?)`：判断参数是否落在区间内（`eps` 为参数容差）。
- `clamp(u)`：把参数夹到区间内。
- `equals(other, eps?)`：区间近似相等判断（`eps` 为参数容差）。
- `expand(delta)` / `expanded(delta)`：区间扩展（用于容差）。
- `intersect(other)`：区间相交。
- `union(other)`：区间合并。
- `split(u)`：在参数处拆分区间。

### 适用曲线
- 直线、线段、B 样条等非周期参数曲线。

### 规则补充
- 采用闭区间 `[a, b]` 语义：`contains(a)` 与 `contains(b)` 都为 `true`。

---

## PeriodInterval（周期参数域）

### 继承关系

- `PeriodInterval` 继承 `Interval`。
- 复用 `Interval` 的区间能力，并在周期语义上做增强。

### 表示规则

- 统一将参数归一化到 `[0, period)`（半开区间）。
- 允许“跨周期区间”表示，例如 `[350°, 30°]`。
- 判断与长度计算必须考虑跨周期情况；`length()` 定义为沿参数正方向从 start 到 end 的长度，跨周期则 `length = (period - start) + end`。

### 方法（商用级建议）

**A. 新增能力**
- `normalize(u)`：归一化到 `[0, period)`。
- `shift(offset)`：区间整体平移。

**B. 重写以支持周期语义**
- `contains(u, eps?)`（`eps` 为参数容差）
- `length()`
- `clamp(u)`
- `intersect(other)`
- `union(other)`：按“正向最短覆盖单区间”策略返回，允许跨周期表达。
- `split(u)`
- `equals(other, eps?)`（`eps` 为参数容差）

### 适用曲线
- 圆、椭圆、圆弧、椭圆弧等周期曲线。

