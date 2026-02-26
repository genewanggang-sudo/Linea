# 数学库曲线离散模块设计（v1 定稿）

## 1. 设计结论（已拍板）

1. 离散化是独立大模块，不分散在各曲线类实现中。
2. 对外统一入口：`DiscretizeEngine.discretize(curve, options)`。
3. `Curve2` 仅提供薄封装：`curve.discretize(options)`（内部转发）。
4. v1 只实现 `world` 模式；`view` 模式只预留接口，不实现算法分支。

---

## 2. 架构收敛（重点）

### 2.1 为什么不再使用 `kernel` 命名

`kernel` 在 CAD 语境常指“几何内核产品（如 OCCT）”，会与模块内部算法单元混淆。  
因此统一改为 `strategy`，强调“按曲线类型可替换的离散策略”。

### 2.2 最终分层

```text
discretize/
  discretize_types.ts
  discretize_engine.ts
  strategy_registry.ts
  strategies/
    line_strategy.ts
    circle_strategy.ts
    ellipse_strategy.ts
    bspline_strategy.ts
  internal/
    sampling_utils.ts
    postprocess.ts
```

职责边界：

1. `discretize_engine.ts`：入口、参数校验、类型分发、错误收口；负责内置 strategy 的一次性注册。
2. `strategy_registry.ts`：Typed Strategy Registry，负责策略注册与匹配优先级。
3. `strategies/*`：各曲线离散算法。
4. `internal/postprocess.ts`：统一后处理（去重、吸附、顺序、闭合语义）。
5. 曲线类：只提供几何原语，不放离散策略代码。

这套分层是长期可维护方案：新增曲线时只新增 strategy，不改入口契约。

---

## 3. 公共接口

### 3.1 输入

```ts
export interface DiscretizeOptions {
  mode?: 'world' | 'view'        // v1: 仅 world

  chordTol?: number              // 弦高公差（world 单位），默认 1e-3
  angleTolRad?: number           // 相邻切向最大转角，默认 Math.PI / 180
  maxSegmentLength?: number      // 单段最大长度，默认 Infinity

  minSegments?: number           // 最小分段数，默认 8
  maxSegments?: number           // 最大分段数，默认 4096

  includeEnd?: boolean           // 开放曲线是否包含终点，默认 true
  pointMergeTol?: number         // 相邻点去重阈值（world），默认回退 chordTol

  // view 预留（v1 不实现）
  pixelTol?: number
  worldPerPixel?: number
}
```

默认值来源（架构约束）：

1. 离散默认参数统一定义在 `discretize_defaults.ts`（或同等独立配置文件）。
2. `Precision` 不承载离散策略默认值，仅保留通用数学数值常量。
3. 离散模块可在实现中引用 `Precision` 作为数值安全下限，但不反向污染 `Precision` 的职责边界。

### 3.2 输出

```ts
export interface PolylineSample {
  u: number
  p: Vec2
}

export interface DiscretizeResult {
  samples: PolylineSample[]      // 参数严格递增
  closed: boolean                // 闭合语义标记
}
```

---

## 4. 统一语义约束（硬规则）

1. `samples` 参数必须严格递增。
2. 闭合曲线 `closed=true`，且 `samples` 不重复首尾点。
3. 开放曲线默认包含终点（`includeEnd=true`）。
4. 当 `closed=true` 时忽略 `includeEnd`（始终不重复首尾点）。
5. 相邻重复点必须去重（按容差阈值）。
6. 端点容差范围内必须吸附到精确端点参数/点。
7. 退化曲线（零长度线段、空弧、极短可视段）离散结果统一返回 1 个点。

默认值（写死）：

1. `chordTol = 1e-3`
2. `angleTolRad = Math.PI / 180`
3. `maxSegmentLength = Infinity`
4. `minSegments = 8`
5. `maxSegments = 4096`
6. `includeEnd = true`
7. `pointMergeTol = chordTol`（若 `chordTol` 未传则使用默认 `1e-3`）

实现约束：

1. 以上默认值必须由 `discretize_defaults.ts` 提供，文档与代码同源。
2. 禁止在 strategy 实现中写 magic number。

参数合法性：

1. `chordTol/pointMergeTol > 0`
2. `angleTolRad > 0`
3. `maxSegmentLength > 0` 或 `Infinity`
4. `1 <= minSegments <= maxSegments`

---

## 5. 模式策略

### 5.1 world（v1 实现）

所有容差按模型空间处理，输出与视图缩放无关。

### 5.2 view（v1 预留）

v1 若 `mode='view'`，直接抛错：
- `MathError('DiscretizeNotSupported: view mode is not supported in v1')`

后续版本可在入口层先换算 `pixelTol -> chordTol(world)`，离散核心保持不变。

---

## 6. 策略算法（v1）

1. `line_strategy`
- 按长度和约束计算段数，均匀采样。

2. `circle_strategy`（Circle2/Arc2）
- 解析计算角步长，联合 `chordTol/angleTolRad/maxSegmentLength` 取最严约束。

3. `ellipse_strategy`（Ellipse2/EllipseArc2）
- 自适应细分（弦高 + 角度变化）。

4. `bspline_strategy`
- 自适应细分，重点覆盖高曲率区；受 `maxSegments` 硬上限保护。
5. 未识别曲线类型（未知 `Curve2` 子类）：
- v1 直接抛 `MathError('DiscretizeNotSupported: unsupported curve type')`
- 不走隐式 fallback（避免错误结果静默传播）

停止条件规则（已定）：

1. 已启用约束必须“全部满足”才停止。
2. 任一约束不满足则继续细分。
3. 到达 `maxSegments` 仍不满足则抛错。
4. 商用口径采用“独立点合并阈值”：
- `pointMergeTol` 独立于 `chordTol`
- 默认值回退到 `chordTol`
- 这是 CAD/几何内核常见做法：离散误差与拓扑清理阈值解耦，避免互相污染。
5. 详细执行口径（含后处理顺序、分发机制、输出下限）以第 12 节检查清单为准。

---

## 7. 错误语义（统一前缀）

所有失败都抛 `MathError`，不返回“尽力结果”。

建议错误前缀：

1. `DiscretizeOptionsError`：参数非法（负容差、`min>max` 等）。
2. `DiscretizeNotSupported`：当前版本不支持（如 `view` 模式）。
3. `DiscretizeOverflowError`：超过 `maxSegments`。
4. `DiscretizeConvergenceError`：数值细分不收敛。

---

## 8. 性能与稳定性

1. 默认 `maxSegments=4096`（单曲线硬上限）。
2. 输出必须确定性（同输入同输出顺序/结果）。
3. 失败路径可观测（固定错误前缀，便于上层分流）。

---

## 9. 与渲染层关系

1. 几何核心输出不重复首尾点。
2. 若渲染 API 需要闭合重复点，在渲染适配层补点。
3. 不为单一渲染 API 污染核心几何输出契约。

---

## 10. 测试计划

建议新增：

1. `tests/discretize/discretize_engine.test.ts`
2. `tests/discretize/line_strategy.test.ts`
3. `tests/discretize/circle_strategy.test.ts`
4. `tests/discretize/ellipse_strategy.test.ts`
5. `tests/discretize/bspline_strategy.test.ts`
6. `tests/discretize/postprocess.test.ts`

必测点：

1. 参数严格递增与去重。
2. 闭合不重复首尾点。
3. `maxSegments` 超限抛错。
4. `mode='view'` 抛 `DiscretizeNotSupported`。
5. 多约束“全部满足才停止”。

---

## 11. 分期实施

1. M1：类型、入口、分发、Curve2 薄封装 + `Line/Circle/Arc` strategy。
2. M2：`Ellipse/EllipseArc` strategy。
3. M3：`BSpline` strategy + 极端输入稳定性。
4. M4：统一后处理 + 测试补齐 + 文档示例。

批量接口决策：

1. v1 不实现 `discretizeMany`。
2. 仅在设计上预留，后续独立里程碑实现。

---

## 12. 实施口径补充（已确认）

### 12.1 实施检查清单（可直接验收）

1. [入口] `Curve2` 提供 `discretize(options)`，且仅做转发到 `DiscretizeEngine.discretize(this, options)`。
2. [入口] `DiscretizeEngine.discretize(curve, options)` 保持可用并与实例方法结果一致。
3. [闭合语义] `closed` 由曲线类型语义决定，不由“离散后首尾点距离”推断。
4. [闭合语义] `Circle2/Ellipse2` 输出 `closed=true`，且不重复首尾点。
5. [闭合语义] `Arc2/EllipseArc2` 满足 `|sweep - 2π| <= Precision.CURVE_PARAM_EPS` 时输出 `closed=true`，且不重复首尾点。
6. [闭合语义] `Line2/BSpline2` 默认输出 `closed=false`。
7. [停止规则] 启用的约束必须按“每一段局部”全部满足才停止，禁止全局平均判定。
8. [停止规则] 任一段任一约束不满足必须继续细分。
9. [Circle/Arc 算法] 采用解析角步长法；`dTheta = min(dThetaChord, dThetaAngle, dThetaLength)`。
10. [Circle/Arc 算法] 先计算 `requiredSegments = ceil(sweep / dTheta)`；若 `requiredSegments > maxSegments` 才能满足误差约束，则抛 `DiscretizeOverflowError`；否则 `segmentCount = clamp(requiredSegments, minSegments, maxSegments)`。
11. [Ellipse/BSpline 验收] 弦高判定固定使用 3 点采样（`0.25/0.5/0.75`）并取最大值。
12. [非法输入] `!curve.isValid()` 时抛 `MathError('DiscretizeOptionsError: invalid curve')`，不得返回尽力结果。
13. [退化输入] 仅“合法但极短”进入退化分支并统一返回 1 个点。
14. [端点规则] 开放曲线 `includeEnd=true` 时必须保留精确终点；去重不得吞掉终点（退化分支除外）。
15. [模式规则] `mode='view'` 在 v1 必须抛 `DiscretizeNotSupported`。
16. [模式规则] `mode='world'` 且传入 `pixelTol/worldPerPixel` 必须抛 `DiscretizeOptionsError`，禁止静默忽略。
17. [错误治理] 新增 `discretize_errors.ts` 并集中维护错误前缀常量/构造函数，业务代码禁止散落错误字符串。
18. [BSpline 错误分型] 超过 `maxSegments` 抛 `DiscretizeOverflowError`；数值异常/不收敛抛 `DiscretizeConvergenceError`。
19. [默认值治理] 新增 `discretize_defaults.ts` 并导出默认常量；调用级 `options` 可覆盖。
20. [默认值治理] 禁止全局可变默认值接口（如 `setDefaults`）。
21. [退化阈值] “合法但极短”的判定阈值统一使用 `Precision.CURVE_LENGTH_EPS`。
22. [sweep 口径] `Arc2/EllipseArc2` 的 `sweep` 统一以曲线内部参数域长度（`_range.length()`）为准。
23. [输出下限] 开放曲线在 `includeEnd=false` 时也必须至少返回 1 个采样点（非法输入除外）。
24. [后处理顺序] `postprocess` 顺序写死为：`去重 -> 端点吸附 -> includeEnd/closed 修正 -> 参数严格递增断言`。
25. [分发机制] 曲线分发采用 Typed Strategy Registry（构造器/类型守卫），禁止使用字符串 `type` 路由。
26. [封装架构] `Curve2.discretize()` 采用薄封装 + `DiscretizeEngine` + Typed Strategy Registry，不引入 `Curve2 <-> 离散实现` 双向强耦合。
27. [分发优先级] strategy 匹配规则写死为：`精确构造器命中` > `类型守卫命中` > `注册顺序`；若仍冲突则抛 `DiscretizeOptionsError`。
28. [注册时机] 内置策略由 `discretize_engine.ts` 内部懒初始化并保证只注册一次，不依赖外部 side-effect import 顺序。

---

## 13. 架构实施蓝图（便于落地）

### 13.1 模块依赖与边界（必须遵守）

1. 依赖方向固定为：`curve2.ts -> discretize/discretize_engine.ts -> strategy_registry -> strategies/* -> curves/* + discretize/internal/*`。
2. `strategies/*` 禁止互相依赖，公共逻辑只能下沉到 `internal/*`。
3. `internal/*` 仅允许被 `discretize/*` 使用，禁止被外部业务直接 import。
4. `Precision` 仅提供数值常量，不承载离散业务默认值。
5. 错误字符串禁止散落，必须通过 `discretize_errors.ts` 统一构造。
6. `Curve2` 仅依赖离散公共入口，不得反向依赖 `strategies/*` 或注册实现细节。
7. 内置 strategy 注册责任在 engine 内部，禁止由外部入口文件承担初始化顺序职责。

### 13.2 公共导出面（v1 冻结）

1. 对外导出：
   - `DiscretizeOptions`
   - `PolylineSample`
   - `DiscretizeResult`
   - `DISCRETIZE_DEFAULTS`（或等价只读常量）
   - `DiscretizeEngine`（或等价统一入口名）
2. 不对外导出：
   - `strategies/*`
   - `internal/*`
3. `Curve2.discretize()` 仅作为便捷入口，不承载额外参数语义。
4. 分发契约基于构造器/类型守卫，不暴露字符串 `type` 路由契约。

### 13.3 运行流水线（统一实现骨架）

1. `normalizeOptions`：补默认值、计算派生值（如 `pointMergeTol` 回退）。
2. `validateOptions`：执行参数合法性与模式冲突校验。
3. `validateCurve`：`curve.isValid()` 失败直接抛 `DiscretizeOptionsError`。
4. `dispatchStrategy`：通过 Typed Strategy Registry（构造器/类型守卫）分发到单一 strategy（优先级：精确构造器 > guard > 注册顺序）。
5. `postprocess`：固定顺序执行去重、端点吸附、`includeEnd/closed` 修正。
6. `finalAssert`：确保输出参数严格递增、点数合法、`closed` 契约满足。

### 13.4 里程碑交付物与 DoD

1. M1 DoD：
   - 入口/类型/默认值/错误治理落地；
   - `Line/Circle/Arc` 可用；
   - `Curve2.discretize` 与静态入口一致；
   - 对应测试通过。
2. M2 DoD：
   - `Ellipse/EllipseArc` 自适应策略可用；
   - 3 点弦高判定生效；
   - 极端扁椭圆样例通过。
3. M3 DoD：
   - `BSpline` 自适应策略可用；
   - `Overflow/Convergence` 分型准确；
   - 高曲率样例与病态样例可观测失败。
4. M4 DoD：
   - 后处理统一、测试补齐、文档示例补齐；
   - 公开 API 冻结并完成回归基线。

### 13.5 测试与质量门禁

1. 单测门禁：新增离散相关测试文件全部通过。
2. 回归门禁：已有曲线测试不得退化（全量 `packages/math` 测试通过）。
3. 静态门禁：`lint`、`build` 必须通过。
4. 错误门禁：关键错误码前缀必须有断言测试，防止漂移。
5. 确定性门禁：同输入重复执行输出序列必须一致。

### 13.6 风险清单与预案

1. 风险：`Curve2` 与离散模块循环依赖。
   - 预案：采用 `Curve2` 薄封装 + `DiscretizeEngine` + Typed Strategy Registry 单向依赖，不使用双向强引用。
2. 风险：`Ellipse/BSpline` 在极端参数下细分爆炸。
   - 预案：`maxSegments` 硬上限 + `OverflowError` 明确失败。
3. 风险：后处理去重导致端点丢失。
   - 预案：后处理末阶段执行 `includeEnd` 强保留校正。
4. 风险：错误码散落导致上层分流失效。
   - 预案：集中错误工厂 + 测试断言错误前缀。

### 13.7 实施顺序建议（团队协作）

1. 先落地 `types/defaults/errors`，再做入口和分发。
2. 再实现 `Line/Circle/Arc`（解析法）作为稳定基线。
3. 再上 `Ellipse`，最后 `BSpline`，避免高风险模块阻塞基础交付。
4. 每个里程碑结束前先补测试再并入主分支，避免技术债滚动。

---

## 14. OCCT 对标落地规则（实施前冻结）

### 14.1 误差语义

1. `chordTol` 采用绝对公差语义（world 单位），v1 不引入 relative deflection。
2. `angleTolRad` 与 `chordTol` 联合约束，策略必须同时满足两者（另加 `maxSegmentLength`）。
3. 文档与实现统一使用“工程验收阈值”表述，不宣称严格 Hausdorff 上界保证。

### 14.2 容差下限与安全截断

1. 有效弦高公差定义为 `effectiveChordTol = max(chordTol, Precision.CURVE_LENGTH_EPS)`。
2. 有效点合并阈值定义为 `effectivePointMergeTol = max(pointMergeTol, Precision.CURVE_LENGTH_EPS)`。
3. 当输入容差小于数值安全下限时，不报错，按上述规则自动截断到安全下限。
4. 计算顺序固定：先完成 `pointMergeTol` 默认回退（未传则回退到 `chordTol`），再执行安全下限截断。

### 14.3 Circle/Arc 稳定性约束

1. `Circle/Arc` 按解析角步长计算段数，不走递归细分。
2. 解析角步长同时受 `chordTol`、`angleTolRad`、`maxSegmentLength` 约束，取最严值。
3. 增加内部最小弦长保护：`minSegmentLengthInternal = Precision.CURVE_LENGTH_EPS`，用于避免极小段导致过细分震荡。
4. `minSegmentLengthInternal` 仅作防爆保护，不得放宽误差约束；若因此无法在 `maxSegments` 内满足约束，抛 `DiscretizeOverflowError`。

### 14.4 Ellipse/BSpline 稳定性约束

1. 自适应细分保持“每段局部全部约束满足才停止”。
2. 弦高判定固定 3 点采样（`0.25/0.5/0.75`）取最大值。
3. `BSpline` 细分前先按参数不连续点预分段（至少覆盖结点重数导致的连续性断点），再对每段执行自适应细分。

### 14.5 实施验收补充

1. 新增测试：输入 `chordTol < Precision.CURVE_LENGTH_EPS` 时，离散结果与 `effectiveChordTol` 路径一致。
2. 新增测试：`Circle/Arc` 在极小 sweep 与极小 `chordTol` 下不会无限细分，且不超过 `maxSegments`。
3. 新增测试：`BSpline` 在连续性断点附近不出现跨断点欠采样（先分段后细分路径生效）。
