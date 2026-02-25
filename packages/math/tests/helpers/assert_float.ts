import { expect } from 'vitest'

import { Vec2 } from '../../src/core/vec2'

/** 浮点近似比较断言 */
export function expectNear(actual: number, expected: number, eps: number) {
    expect(Math.abs(actual - expected)).toBeLessThanOrEqual(eps)
}

/** 向量近似比较断言 */
export function expectVecNear(actual: Vec2, expected: Vec2, eps: number) {
    expect(actual.distanceTo(expected)).toBeLessThanOrEqual(eps)
}
