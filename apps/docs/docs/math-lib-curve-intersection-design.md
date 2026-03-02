
`CurveXInfo` 用于表达两条曲线一次求交事件的最小信息单元。
其中 `point/u1/u2` 始终表示一个可定位的交点锚点；当 `isOverlap=true` 时，`range1/range2` 用于补充重合区间参数。

```ts
import type { Vec2 } from '../core/vec2'
import type { Interval } from '../curves/interval'

export type CurveXInfo = {
    point: Vec2
    u1: number
    u2: number
    isOverlap: boolean
    range1?: Interval
    range2?: Interval
}
```
