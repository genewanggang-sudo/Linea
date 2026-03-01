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

