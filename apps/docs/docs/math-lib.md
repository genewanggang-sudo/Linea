# 数学库方案

## 分层结构（宏观）

```
math/
  core/        基础类型与代数
  curves/      曲线与几何对象
  serialize/   序列化与反序列化
  utils/       公共工具与数值容差
```

---

## core（基础类型与代数）

**定位**：为上层提供最小且稳定的数学基石。

包含主要类：
- `Vec2` / `Vec3`：向量
- `Matrix2D` / `Matrix3D`：矩阵与变换（2D/3D）
- `Euler`：欧拉角
- `Quat`：四元数
- `Box2`（二维包围盒，轴对齐）
- `Box3`（三维包围盒，轴对齐）
- `Coord2D`（二维坐标系）

---

## curves（曲线与几何对象）

**定位**：二维编辑器中的几何对象抽象。

包含主要类：
- `Line`（直线）
- `Arc`（圆弧）
- `Circle`（圆）
- `Ellipse`（椭圆）
- `EllipseArc`（椭圆弧）

统一能力：
- `tessellate(options)`：将曲线离散为点集，用于渲染与测量
- `length()`：曲线长度（测量）
- `pointAt(t)`：参数化取点（0~1）
- `tangentAt(t)`：切线方向（方向/标注）
- `bbox()`：包围盒（选择/裁剪）

---

## serialize（序列化与反序列化）

**定位**：为编辑器与存储层提供统一的持久化入口。

设计要点：
- 抽象基类 `GeomBase`，约定 `dump()` / `load()` 协议
- 不提供全局 Serializer/Deserializer，避免过度集中
- 每个具体类自行实现 `dump()` / `load()`
- 序列化结构包含 `type` 字段，便于还原与调试

---

## utils（工具与容差）

**定位**：提供通用数值工具与容差控制。

包含主要内容：
- `Precision`（精度策略集合，如 EPS、舍入规则等）
- `MathUtils.clamp(...)`
- `MathUtils.lerp(...)`
- `MathUtils.almostEqual(...)`

---

## tests（测试方案）

**目标**：保障几何算法在持续迭代中的稳定性与可回归性。

建议方案（先规划，不实现）：
- 使用 Vitest 作为测试框架
- 测试覆盖：
  - core：向量/矩阵/坐标系的基本运算与边界
  - curves：长度、点采样（tessellate）、bbox、端点与参数化一致性
  - utils：Precision（EPS）与常用工具函数
- 采用固定数据 + 随机数据（Property-based 思路）组合

---

## TODO（基础能力补充）

- MathUtils：`clamp` / `lerp` / `almostEqual`
- Vec2：`perp` / `project` / `reflect` / `angle`
- Mat3：`fromTRS`（平移/旋转/缩放组合）
- 常量/辅助：`DEG2RAD` / `RAD2DEG` / `TAU`
