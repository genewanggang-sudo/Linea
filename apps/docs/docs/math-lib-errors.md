# Math 库异常处理方案（草案）

## 目标
- 统一异常语义与抛出路径，避免各模块自行 `throw`。
- 异常可扩展，便于调用方处理。

## 方案概述
- 统一入口：使用 `MathError` 抛出异常。
- 统一约定：业务调用方以 `try/catch` 处理。
- 数值迭代超过 `maxIter` 或误差仍大于 `tol` 时视为失败并抛异常。

## MathError 设计（简版）
- 作为统一异常类，用于替代 `throw new Error`。
- 提供以下方法：
  - `MathError.throw(message, detail?)`
  - `MathError.assert(condition, message, detail?)`
  - `MathError.warn(message, detail?)`

## 使用示例
```ts
import { MathError } from '@linea/math'

MathError.assert(radius > 0, 'radius must be positive', { method: 'Circle' })
MathError.throw('param out of range', { method: 'lengthAtParam', u })
MathError.warn('numeric not converged', { method: 'closestPoint', tol, maxIter })
```

## 参数说明（文字约定）
- `message`：面向开发者的错误说明。
- `detail`：可选的上下文信息，用于调试定位（如 method/params/tol/maxIter）。

## 调用方建议
- 高频调用（采样、动画）建议在上层集中 `try/catch`。
- 一次性查询可局部 `try/catch` 并提示错误。

## 待补充
- 是否区分开发/生产策略
- 是否需要日志开关与统计
