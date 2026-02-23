# Math 库二维曲线实现方案（OCCT 投影结果对接版）

## 1. 目标

实现二维曲线层，使其可承接 OCCT 投影算法输出，并转成 Linea 可显示的统一曲线对象。

链路目标：

1. OCCT 投影得到 2D 曲线
2. 映射为 Linea 曲线对象
3. 统一采样/显示

## 2. 实现范围

首期实现 6 类曲线：

1. `Line2`（线段）
2. `Circle2`
3. `Arc2`
4. `Ellipse2`
5. `EllipseArc2`
6. `BSpline2`（直接支持 NURBS）

不在首期范围：

- 曲线求交
- 偏移/布尔
- 拟合

## 3. 总体架构

### 3.1 公共基座

- 参数域：`Interval` / `PeriodInterval`
- 抽象层：`Curve2`

### 3.2 曲线层

新增目录：`packages/math/src/curves`

建议文件：

- `line2.ts`
- `circle2.ts`
- `arc2.ts`
- `ellipse2.ts`
- `ellipse_arc2.ts`
- `bspline2.ts`

### 3.3 显示适配层（后续可独立）

- 统一走 `pointAt` + 采样策略生成折线
- 保留原始参数区间，避免采样越界

## 4. 各曲线数据模型

### 4.1 Line2（线段）

- 字段：`start: Vec2`, `end: Vec2`
- 参数域：`[0, 1]`
- 语义：有限曲线，`length/boundingBox` 全可直接计算

### 4.2 Circle2

- 字段：`center: Vec2`, `radius: number`
- 参数：角度（弧度）
- 参数域：`PeriodInterval(0, 2π, 2π)`

### 4.3 Arc2

- 字段：`center`, `radius`, `startAngle`, `endAngle`, `clockwise`
- 参数：角度（弧度）
- 参数域：`PeriodInterval`

### 4.4 Ellipse2

- 字段：`center`, `rx`, `ry`, `rotation`
- 参数：椭圆角参数
- 参数域：`PeriodInterval(0, 2π, 2π)`

### 4.5 EllipseArc2

- 字段：`center`, `rx`, `ry`, `rotation`, `startAngle`, `endAngle`, `clockwise`
- 参数域：`PeriodInterval`

### 4.6 BSpline2（NURBS）

- 字段：
- `controlPoints: Vec2[]`
- `degree: number`
- `knots: number[]`
- `weights?: number[]`
- `multiplicities?: number[]`（建议保留，便于对接 OCCT）
- `isPeriodic?: boolean`

说明：

- `weights` 为空时按全 1 处理（非有理 B 样条）
- 直接支持有理形式，避免后续二次重构

## 5. 核心接口行为约定

所有曲线遵循 `Curve2` 接口：

- `pointAt/tangentAt/derivatives/curvatureAt`
- `length/lengthAtParam/paramAtLength`
- `split/trim`
- `reverse/transform/transformed`
- `closestPoint/closestParam/distanceToPoint`
- `boundingBox/isValid/clone`

统一约束：

- `split(u)` 边界返回 `[]`
- `trim(range)` 无结果返回 `[]`
- 计算失败统一走 `MathError`

## 6. OCCT 对接约束（重点）

### 6.1 类型映射建议

- `Geom2d_Line` -> `Line2`（需外部提供截断端点）
- `Geom2d_Circle` -> `Circle2`
- `Geom2d_TrimmedCurve(Circle)` -> `Arc2`
- `Geom2d_Ellipse` -> `Ellipse2`
- `Geom2d_TrimmedCurve(Ellipse)` -> `EllipseArc2`
- `Geom2d_BSplineCurve` -> `BSpline2`
- `Geom2d_BezierCurve` -> 转 `BSpline2`（统一链路）

### 6.2 参数域保真

- OCCT 输出若为 trimmed curve，必须保留 trim range
- 不做自动“整曲线化”

### 6.3 NURBS 参数保真

- 优先保留 knot + multiplicity 原信息
- 避免导入阶段展开后丢失结构语义

## 7. 实施顺序

1. `Line2` + 单测
2. `Circle2` / `Arc2` + 单测
3. `Ellipse2` / `EllipseArc2` + 单测
4. `BSpline2(NURBS)` + 单测
5. 序列化扩展（`EN_GEO_TYPE` / `dump_types` / `GeomMgr`）
6. 文档与示例补齐

## 8. 测试要求

新增建议测试文件：

- `line2.test.ts`
- `circle2.test.ts`
- `arc2.test.ts`
- `ellipse2.test.ts`
- `ellipse_arc2.test.ts`
- `bspline2.test.ts`
- `curve_serialize.test.ts`

重点场景：

- 构造参数合法性
- 参数边界行为
- reverse/transform 一致性
- 长度/最近点精度
- OCCT 映射后的参数域保真
- 序列化 round-trip

## 9. 验收标准

```bash
pnpm -C packages/math test:run
pnpm -C packages/math build
pnpm -C packages/math lint
```

并满足：

- 6 类曲线都可创建/求值/显示采样
- BSpline2 可处理有理曲线输入（NURBS）
- OCCT 投影结果可完整映射到上述类型
