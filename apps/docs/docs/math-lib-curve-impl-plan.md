# 二维曲线实施手册（Implementation Playbook）

## 1. 决策总表（唯一真值）

| ID | 决策项 | 结论 |
|---|---|---|
| D1 | Line2 参数域 | 固定为 `[0, len]`（`len = |end - start|`） |
| D2 | 中间抽象层 | 增加 `CircleCurve2`、`EllipseCurve2` |
| D3 | Circle/Arc 变换 | 仅允许相似变换；非等比缩放/剪切抛 `MathError` |
| D4 | Arc 参数语义 | 参数解释固定递增，方向由区间/方向语义表达 |
| D5 | split/trim 返回类型 | 返回固定具体类型，不只给 `Curve2[]` |
| D6 | reverse 语义 | 仅反向参数方向，不改变几何 |
| D7 | closestPoint 并列解 | 返回最小参数值对应点 |
| D8 | boundingBox(accurate) | 第一版统一准确包围盒 |
| D9 | Line2 参数-弧长关系 | 线性对应 |
| D10 | BSpline2 输入 | 同时支持 expanded knots 与 knots+multiplicities |
| D11 | 数值常量 | 统一放 `Precision` 并补注释 |
| D12 | 序列化 | 本轮同步接入 `EN_GEO_TYPE/dump_types/GeomMgr` |
| D13 | `pointAt(u)` 越界行为 | 一律抛 `MathError`（不自动 clamp） |
| D14 | Arc/EllipseArc 内部存储 | 统一规范化为参数递增区间 |
| D15 | 相似变换判定 | 用 `A^T A = s^2 I`（容差内），允许镜像 |
| D16 | 弧段 `reverse` 字段更新 | 交换起终角并翻转 `clockwise`，再规范化 |
| D17 | BSpline2 参数域 | 非周期样条使用 `[U[p], U[m-p-1]]` |
| D18 | `Circle2.split` 边界行为 | 边界切分返回 `[]` |
| D19 | 周期曲线最近点并列解 | 参数先归一到 `[range.start, range.start+period)` 再比较 |
| D20 | 弧段准确包围盒算法 | 端点 + 解析极值参数（域内筛选） |
| D21 | 周期 B 样条首版支持 | 第一版仅支持 non-periodic |
| D22 | 序列化版本策略 | 本轮不加 `version` 字段（先不做兼容演进） |
| D23 | 弧段同角语义 | `startAngle == endAngle` 视为空弧；整圆/整椭圆仅由 `Circle2/Ellipse2` 表达 |
| D24 | 镜像后的方向语义 | 线性部分 `det(A)<0` 时自动翻转 `clockwise` |
| D25 | 曲线序列化字段契约 | `IDB*` 按类型逐字段写死（不边实现边定） |
| D26 | BSpline dump 输出格式 | 统一输出 `expandedKnots` |
| D27 | periodic 拒绝判定 | 仅当 `isPeriodic===true` 显式拒绝 |
| D28 | 退化输入策略 | 构造期统一抛 `MathError` |
| D29 | 错误体系前置收口 | 里程碑 M0 先把基础层 `Error` 统一成 `MathError` |
| D30 | `split` 返回顺序 | 固定按参数递增顺序返回 |
| D31 | `trim` 返回顺序 | 固定按参数递增顺序返回 |
| D32 | 最近点失败语义 | 未收敛不返回近似值，直接抛 `MathError` |
| D33 | `isValid()` 职责 | 仅做结构合法性检查，不做昂贵数值验证 |
| D34 | `transform` 原子性 | 失败时对象状态不变，不允许部分修改 |
| D35 | `clone()` 语义 | 严格深拷贝，不共享可变引用 |
| D36 | 零长度子曲线返回 | `split/trim` 结果中过滤零长度子曲线 |
| D37 | `boundingBox` 容差口径 | 参数判定用 `CURVE_PARAM_EPS`，比较断言用 `CURVE_LENGTH_EPS` |
| D38 | BSpline 权重约束 | `weights[i] > 0`，否则构造期抛错 |
| D39 | BSpline 缺省权重 | 未传 `weights` 自动按全 1 处理 |
| D40 | 导数返回契约 | `derivatives(u,n)` 必须返回 `n+1` 项；`n>degree` 高阶补零 |
| D41 | 参数边界吸附 | `pointAt/tangentAt/derivatives` 端点统一吸附后计算 |
| D42 | 最近点初值策略 | 固定“粗采样 + 局部迭代”两阶段 |
| D43 | 逆弧长求解流程 | 固定“二分保底 + 牛顿加速 + 失败回退二分” |
| D44 | 长度积分算法 | 固定阶 Gauss-Legendre + 自适应细分 |
| D45 | BSpline 导数阶数 | 支持任意阶（上限 `degree`） |
| D46 | BSpline 端点求值 | 最后节点采用端点特判/夹紧到最后有效 span |
| D47 | BSpline 节点合法性 | 节点向量非递减（允许重复） |
| D48 | BSpline clamped 约束 | 首版不强制 open clamped |
| D49 | BSpline `split` 实现 | 采用精确 `knot insertion` 分裂 |
| D50 | BSpline `trim` 实现 | 基于两次精确 `split` 实现 |
| D51 | `Circle2.trim` 返回类型 | 固定返回 `Arc2[]`（含 full-span arc） |
| D52 | full-span 弧段表达 | 允许 `Arc2/EllipseArc2` 的 `sweep == period` |
| D53 | 曲线等价判定 | 首版 `equals` 使用结构等价（字段/参数等价） |
| D54 | `transformed` 失败语义 | 与 `transform` 一致，非法变换直接抛 `MathError` |

---

## 2. 范围与交付

### 2.1 In Scope

1. 曲线类：`Line2`、`Circle2`、`Arc2`、`Ellipse2`、`EllipseArc2`、`BSpline2(NURBS)`。
2. 抽象层：`CircleCurve2`、`EllipseCurve2`。
3. 序列化：6 类曲线全部纳入 `GeomMgr`。
4. 测试：曲线行为 + 序列化 round-trip。

### 2.2 Out of Scope

1. 曲线求交。
2. 偏移、布尔、拟合。
3. 加速近似包围盒（本版只做准确值）。

---

## 3. 类层级与文件布局

```text
Curve2
├─ CircleCurve2 (abstract)
│  ├─ Circle2
│  └─ Arc2
├─ EllipseCurve2 (abstract)
│  ├─ Ellipse2
│  └─ EllipseArc2
└─ BSpline2

Line2 (directly extends Curve2)
```

新增文件：

1. `packages/math/src/curves/circle_curve2.ts`
2. `packages/math/src/curves/ellipse_curve2.ts`
3. `packages/math/src/curves/line2.ts`
4. `packages/math/src/curves/circle2.ts`
5. `packages/math/src/curves/arc2.ts`
6. `packages/math/src/curves/ellipse2.ts`
7. `packages/math/src/curves/ellipse_arc2.ts`
8. `packages/math/src/curves/bspline2.ts`

同步变更：

1. `packages/math/src/constants/geom_type.ts`
2. `packages/math/src/serialize/dump_types.ts`
3. `packages/math/src/serialize/geom_mgr.ts`
4. `packages/math/src/utils/precision.ts`
5. `packages/math/src/index.ts`

---

## 4. 数据模型与参数域

### 4.1 Line2

1. 字段：`start: Vec2`、`end: Vec2`。
2. 参数域：`Interval(0, len)`，其中 `len = start.distanceTo(end)`。
3. 参数-长度：严格线性映射。

### 4.2 Circle2 / Arc2

1. `CircleCurve2` 公共字段：`center: Vec2`、`radius: number`。
2. `Circle2` 参数域：`PeriodInterval(0, 2π, 2π)`。
3. `Arc2` 字段：`startAngle`、`endAngle`、`clockwise`，参数域为 `PeriodInterval`。
4. `Arc2` 内部存储统一为参数递增区间：`[s, s+sweep]`。
5. 弧段 `reverse()`：交换 `startAngle/endAngle`，翻转 `clockwise`，再按递增规则规范化。
6. `startAngle == endAngle` 视为空弧（长度 0），不表示整圆。
7. 发生镜像变换（`det(A)<0`）时，方向语义自动翻转（`clockwise = !clockwise`）。

### 4.3 Ellipse2 / EllipseArc2

1. `EllipseCurve2` 公共字段：`center: Vec2`、`rx: number`、`ry: number`、`rotation: number`。
2. `Ellipse2` 参数域：`PeriodInterval(0, 2π, 2π)`。
3. `EllipseArc2` 字段：`startAngle`、`endAngle`、`clockwise`，参数域为 `PeriodInterval`。
4. `EllipseArc2` 内部存储统一为参数递增区间：`[s, s+sweep]`。
5. 弧段 `reverse()`：交换 `startAngle/endAngle`，翻转 `clockwise`，再按递增规则规范化。
6. `startAngle == endAngle` 视为空弧（长度 0），不表示整椭圆。
7. 发生镜像变换（`det(A)<0`）时，方向语义自动翻转（`clockwise = !clockwise`）。

### 4.4 BSpline2

1. 字段：`controlPoints`、`degree`、`weights?`。
2. 输入模式：
- expanded knots
- knots + multiplicities
3. 内部统一为 expanded knot vector 计算。
4. 第一版仅支持 non-periodic。
5. 参数域（非周期）固定为 `[U[p], U[m-p-1]]`。
6. periodic 拒绝规则：仅当输入 `isPeriodic===true` 时显式抛错。
7. dump 输出统一为 `expandedKnots`。

---

## 5. 逐方法契约（必须遵守）

> 下列规则适用于所有曲线类。

### 5.1 `pointAt(u)`

1. 输入：参数 `u`。
2. 行为：仅在合法参数域内计算。
3. 异常：参数越界一律抛 `MathError`（不自动 clamp）。

### 5.2 `tangentAt(u)` / `derivatives(u,n)` / `curvatureAt(u)`

1. 尽量解析解，不能解析再用稳定数值法。
2. `n` 非法必须抛错。
3. 导数不可用时抛 `MathError`，不返回脏值。

### 5.3 `length(range?)` / `lengthAtParam(u)` / `paramAtLength(s,tol?)`

1. 可解析时用解析式。
2. 数值法必须有收敛判据与 fallback（二分兜底）。
3. 失败抛 `MathError`，包含 `tol/maxIter` 细节。

### 5.4 `split(u)` / `trim(range)`

1. `split` 在边界返回 `[]`。
2. `trim` 无结果返回 `[]`。
3. 返回具体类型：
- `Line2 -> Line2[]`
- `Circle2 -> Arc2[]`
- `Arc2 -> Arc2[]`
- `Ellipse2 -> EllipseArc2[]`
- `EllipseArc2 -> EllipseArc2[]`
- `BSpline2 -> BSpline2[]`
4. `Circle2.split(u)` 边界切分同样返回 `[]`（保持全库一致）。

### 5.5 `reverse()`

1. 几何不变，仅参数方向反转。
2. 要满足 `reverse().reverse()` 等价原对象（允许浮点容差）。

### 5.6 `transform(m)` / `transformed(m)`

1. `transform` 就地修改；`transformed` 返回新对象。
2. `Circle2/Arc2`：仅允许相似变换，其他仿射抛错。
3. 相似变换判定：取线性部分 `A(2x2)`，在容差内满足 `A^T A = s^2 I`；允许镜像（`det(A) < 0`）。
4. 椭圆系、B 样条、线段按一般仿射处理。

### 5.7 `closestPoint(p,tol?)`

1. 返回 `{ point, param, distance }`。
2. 并列最优点时返回最小参数值。
3. 周期曲线先把候选参数规范化到 `[range.start, range.start + period)` 再比较最小值。
4. 收敛失败抛 `MathError`。

### 5.8 `boundingBox(accurate?)`

1. 第一版无条件返回准确包围盒。
2. `accurate` 参数保留，仅为后续优化兼容。
3. `Arc2/EllipseArc2` 准确包围盒算法固定为：端点 + 解析极值参数，且仅保留落在弧域内的候选点。

---

## 6. 算法与稳健性要求

### 6.1 解析优先

1. `Line2`、`Circle2`、`Arc2` 主流程均解析实现。
2. `Ellipse2`/`EllipseArc2` 的点、导数、曲率使用解析公式。

### 6.2 数值策略

1. 长度积分：自适应积分（固定阶求积 + 递归细分）。
2. 逆弧长/最近点：Newton 主迭代 + bisection fallback。
3. 达到 `maxIter` 或误差不收敛：抛 `MathError`。
4. 算法失败不静默降级，不返回近似脏值。

### 6.3 容差与常量（统一入口）

在 `Precision` 新增并注释：

1. `CURVE_PARAM_EPS = 1e-9`
2. `CURVE_LENGTH_EPS = 1e-8`
3. `CURVE_NEWTON_EPS = 1e-10`
4. `CURVE_MAX_ITER = 50`
5. `CURVE_INTEGRAL_MAX_DEPTH = 12`

### 6.4 容差来源与取值依据（必须遵守）

1. 基础浮点精度来源：IEEE-754 双精度机器精度（`epsilon`）  
参考：`std::numeric_limits<double>::epsilon` 文档。  
链接：<https://en.cppreference.com/w/cpp/types/numeric_limits/epsilon>

2. 几何内核经验来源：Open CASCADE `Precision` 包  
参考：`Confusion = 1e-7`、`Intersection = Confusion / 100 = 1e-9` 的设计说明。  
链接：<https://dev.opencascade.org/doc/refman/html/class_precision.html>  
链接：<https://dev.opencascade.org/doc/occt-6.7.0/overview/html/user_guides__foundation_classes.html>

3. 数值迭代/积分默认量级来源：SciPy 文档  
参考：`brentq` 的默认绝对/相对容差与 `maxiter`（100），`quad` 的默认积分容差与子区间上限。  
链接：<https://docs.scipy.org/doc/scipy/reference/generated/scipy.optimize.brentq.html>  
链接：<https://docs.scipy.org/doc/scipy/reference/generated/scipy.integrate.quad.html>

4. 当前常量与来源映射  
- `CURVE_PARAM_EPS = 1e-9`：对齐 OCCT 交会级别容差（参数比较/参数域边界判断）。  
- `CURVE_LENGTH_EPS = 1e-8`：比参数容差放宽 1 个数量级，降低弧长积分与逆弧长振荡风险。  
- `CURVE_NEWTON_EPS = 1e-10`：作为牛顿迭代收敛阈值，严于长度容差、略宽于机器噪声放大下限。  
- `CURVE_MAX_ITER = 50`：取工程折中值（在 root/integral 问题中常见 50~100），先保守限时防死循环。  
- `CURVE_INTEGRAL_MAX_DEPTH = 12`：自适应积分递归上限，防止高曲率区间无限细分导致性能失控。

5. 后续调参规则（防灾难）  
- 调参只允许在 `Precision` 集中修改，禁止在曲线类中写 magic number。  
- 任何调参必须附带：失败用例、误差对比、性能对比。  
- 若出现模型尺度差异（微米级/米级混用），后续新增“按模型尺度缩放容差”的策略，但不在首版实现。

---

## 7. 序列化契约

1. `EN_GEO_TYPE` 增加：`Line2/Circle2/Arc2/Ellipse2/EllipseArc2/BSpline2`。
2. `dump_types.ts` 增加对应 `IDB*` 类型。
3. 每类实现 `dump/load`，并通过注册器接入 `GeomMgr`。
4. round-trip 要求：`dump -> load` 后关键字段一致、几何一致。
5. 本轮不引入 `version` 字段，暂不做版本兼容分支。
6. 字段级契约（固定）：
- `IDBLine2`: `start`, `end`
- `IDBCircle2`: `center`, `radius`
- `IDBArc2`: `center`, `radius`, `startAngle`, `endAngle`, `clockwise`
- `IDBEllipse2`: `center`, `rx`, `ry`, `rotation`
- `IDBEllipseArc2`: `center`, `rx`, `ry`, `rotation`, `startAngle`, `endAngle`, `clockwise`
- `IDBBSpline2`: `controlPoints`, `degree`, `expandedKnots`, `weights?`, `isPeriodic?`

---

## 8. 测试矩阵（实施前已定义）

### 8.1 文件清单

1. `packages/math/tests/line2.test.ts`
2. `packages/math/tests/circle2.test.ts`
3. `packages/math/tests/arc2.test.ts`
4. `packages/math/tests/ellipse2.test.ts`
5. `packages/math/tests/ellipse_arc2.test.ts`
6. `packages/math/tests/bspline2.test.ts`
7. `packages/math/tests/curve_serialize.test.ts`

### 8.2 必测项

1. 构造合法性与退化输入。
2. 参数边界：起点/终点/越界。
3. `reverse` 双反转一致性。
4. 圆系非相似变换抛错。
5. `split/trim` 返回类型与数量。
6. `closestPoint` 并列解最小参数规则。
7. B 样条 knots/multiplicities/weights 校验与行为。
8. 序列化 round-trip。
9. `isValid()` 必测：每类至少 1 组合法输入与 1 组非法输入。

---

## 9. 实施里程碑（按提交推进）

1. M0：基础层错误体系收口（`Mat3`/`Coord2D`/`GeomMgr` 的 `Error -> MathError`）。
2. M1：新增 `CircleCurve2`、`EllipseCurve2` 抽象层 + 测试骨架。
3. M2：实现 `Line2` + 测试。
4. M3：实现 `Circle2`、`Arc2` + 测试。
5. M4：实现 `Ellipse2`、`EllipseArc2` + 测试。
6. M5：实现 `BSpline2(NURBS)` + 测试。
7. M6：序列化接入 + round-trip 测试。
8. M7：文档收口与验收。

---

## 10. 验收标准

```bash
pnpm -C packages/math test:run
pnpm -C packages/math build
pnpm -C packages/math lint
```

全部通过后，视为可实施完成。

---

## 11. 实施前补充决议（第二轮确认）

以下条目为本轮新增且已确认的实施约束，优先级高于同主题的旧描述。

1. 参数域断言下沉到 `Interval/PeriodInterval`，不在 `Curve2` 额外包一层。  
新增断言接口（名称定稿）：
- `assertContains(u, eps?)`
- `assertContainsRange(range, eps?)`

2. `PeriodInterval` 新增周期窗口归一化能力，用于周期曲线 tie-break：  
- `normalizeInPeriod(u: number, start = this.start): number`  
语义：返回落在 `[start, start + period)` 的等价参数。

3. 相似变换判定能力放在 `Mat3`（不是 `MathUtils`）：  
- `isSimilarity2D(eps?)`
- `getSimilarityScale2D(eps?)`  
`Circle2/Arc2` 的变换合法性和半径缩放统一依赖这两个能力。

4. `trim(range)` 采用严格模式：  
- `range` 只要不完全在参数域内，直接抛 `MathError`；  
- 不做自动裁剪。

5. `length(range?)` 与 `trim(range)` 保持同一严格策略：  
- 传入 `range` 越界直接抛 `MathError`；  
- 不做自动裁剪。

6. `BSpline2` 双输入模式冲突规则：  
- 若同时提供 `expandedKnots` 与 `knots+multiplicities`，展开后必须一致；  
- 不一致直接抛 `MathError`；  
- 内部统一存储单一标准 `expandedKnots`。

7. `BSpline2` 周期输入在第一版显式拒绝：  
- 检测到 periodic 输入（含 `isPeriodic=true`）直接抛  
`MathError('BSpline2: periodic is not supported in v1')`；  
- 不做隐式降级为 non-periodic。

8. 容差策略继续采用“集中管理”：  
- 曲线相关阈值统一由 `Precision` 提供；  
- 禁止在曲线类实现中写 magic number。

9. 弧段同角语义：`startAngle == endAngle` 视为空弧；整圆/整椭圆由 `Circle2/Ellipse2` 表达。

10. 镜像方向规则：当相似变换线性部分 `det(A) < 0`，弧段方向标记自动翻转。

11. 序列化字段契约固定，不在实现阶段临时增删字段。

12. `BSpline2` dump 固定输出 `expandedKnots`，输入双模式只用于构造兼容。

13. periodic 显式拒绝仅以 `isPeriodic===true` 为判据，不做自动拓扑推断。

14. 退化输入构造期统一抛 `MathError`，不采用“构造成功 + isValid=false”策略。

15. 里程碑 M0 为强前置，不完成不进入曲线实现阶段。

16. `split(u)` 返回结果顺序固定为参数递增顺序。

17. `trim(range)` 返回结果顺序固定为参数递增顺序。

18. `closestPoint` 未收敛不返回近似值，直接抛 `MathError`。

19. `isValid()` 仅做结构合法性检查，不做高成本数值可解性验证。

20. `transform` 失败必须保持对象原子性（状态不变）。

21. `clone()` 严格深拷贝，禁止共享可变引用（控制点、节点、权重等）。

22. `split/trim` 返回结果中过滤零长度子曲线。

23. `boundingBox(accurate)` 统一容差口径：参数判定用 `CURVE_PARAM_EPS`，比较断言用 `CURVE_LENGTH_EPS`。

24. `BSpline2` 权重必须全正；未提供时自动补全为全 1。

25. `derivatives(u,n)` 必须返回 `n+1` 项；当 `n > degree`，高阶导数补零向量。

26. 边界参数统一吸附：`pointAt/tangentAt/derivatives` 在端点（含容差）先吸附后计算。

27. `closestPoint` 固定两阶段：粗采样找候选 + 局部迭代细化。

28. `paramAtLength` 固定流程：二分保底 + 牛顿加速 + 失败回退二分。

29. `length(range?)` 的数值积分固定为“Gauss-Legendre（固定阶）+ 自适应细分”。

30. `BSpline2` 导数能力支持任意阶（上限为 `degree`）。

31. `BSpline2` 在 `u == U[m-p-1]` 使用端点特判/夹紧到最后有效 span。

32. `BSpline2` 节点向量要求非递减（允许重复），首版不强制 open clamped。

33. `BSpline2.split(u)` 采用精确 `knot insertion`；`BSpline2.trim(range)` 基于两次精确 `split`。

34. `Circle2.trim(range)` 固定返回 `Arc2[]`，并允许 full-span arc（`sweep == period`）表达整圈结果。

35. 曲线首版 `equals` 采用结构等价（字段/参数等价），不做昂贵几何等价求解。

36. `transformed(m)` 与 `transform(m)` 失败语义一致，非法输入直接抛 `MathError`。
