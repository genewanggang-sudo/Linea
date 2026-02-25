# 数学库曲线离散模块设计（v1 定稿）

## 1. 设计结论（已拍板）

1. 离散化是独立大模块，不分散在各曲线类实现中。
2. 对外统一入口：`CurveDiscretizer.discretize(curve, options)`。
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
  curve_discretizer.ts
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

1. `curve_discretizer.ts`：入口、参数校验、类型分发、错误收口。
2. `strategies/*`：各曲线离散算法。
3. `internal/postprocess.ts`：统一后处理（去重、吸附、顺序、闭合语义）。
4. 曲线类：只提供几何原语，不放离散策略代码。

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

1. `tests/discretize/curve_discretizer.test.ts`
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

1. M1：类型、入口、分发、Curve2 薄封装。
2. M2：Line/Circle/Arc strategy。
3. M3：Ellipse/EllipseArc strategy。
4. M4：BSpline strategy + 极端输入稳定性。
5. M5：统一后处理 + 测试补齐 + 文档示例。

批量接口决策：

1. v1 不实现 `discretizeMany`。
2. 仅在设计上预留，后续独立里程碑实现。
