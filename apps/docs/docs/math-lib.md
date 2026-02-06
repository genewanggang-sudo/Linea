# Math 曲线基础设计方案

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
- `tangentAtParam(u)`：原生参数切向（方向向量，是否单位化由实现决定）。

**B. 导数与曲率**
- `derivatives(u, n)`：返回 0..n 阶导（至少支持 0/1/2）。
- `curvatureAt(u)`：曲率。

**C. 长度与参数换算**
- `length(range?)`：曲线长度（解析优先，数值兜底）。
- `lengthAtParam(u)`：从参数域起点到 u 的弧长（解析优先，数值兜底）。
- `paramAtLength(s, tol?)`：根据弧长反求参数（数值迭代，需容差）。

**D. 切割与方向**
- `split(u)`：按参数切分。
- `trim(range)`：裁剪到参数区间。
- `reverse()`：反转参数方向。

**E. 几何有效性与复制**
- `isValid(eps?)`：判定曲线是否退化/非法。
- `clone()`：克隆。

**F. 变换**
- `transform(m)`：矩阵变换（就地）。
- `transformed(m)`：矩阵变换（返回新对象）。

**G. 通用查询**
- `closestPoint(p, tol?)`：返回最近点、参数、距离（解析优先，数值兜底）。
- `closestParam(p, tol?)`：仅返回最近参数。
- `distanceToPoint(p, tol?)`：点到曲线距离。
- `boundingBox(samples?)`：曲线包围盒。

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
- `contains(u, eps?)`：判断参数是否落在区间内。
- `clamp(u)`：把参数夹到区间内。
- `equals(other, eps?)`：区间近似相等判断。
- `expand(delta)` / `expanded(delta)`：区间扩展（用于容差）。
- `intersect(other)`：区间相交。
- `union(other)`：区间合并。
- `split(u)`：在参数处拆分区间。

### 适用曲线
- 直线、线段、B 样条等非周期参数曲线。

---

## PeriodInterval（周期参数域）

### 继承关系

- `PeriodInterval` 继承 `Interval`。
- 复用 `Interval` 的区间能力，并在周期语义上做增强。

### 表示规则

- 统一将参数归一化到 `[0, period)`。
- 允许“跨周期区间”表示，例如 `[350°, 30°]`。
- 判断与长度计算必须考虑跨周期情况。

### 方法（商用级建议）

**A. 新增能力**
- `normalize(u)`：归一化到 `[0, period)`。
- `shift(offset)`：区间整体平移。

**B. 重写以支持周期语义**
- `contains(u, eps?)`
- `length()`
- `clamp(u)`
- `intersect(other)`
- `union(other)`：按“最短覆盖单区间”策略返回，允许跨周期表达。
- `split(u)`
- `equals(other, eps?)`

### 适用曲线
- 圆、椭圆、圆弧、椭圆弧等周期曲线。

