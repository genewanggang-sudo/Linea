import { describe, expect, it } from 'vitest'

import { MathUtils } from '../src/utils/math_utils'

describe('MathUtils', () => {
    it('clamp', () => {
        expect(MathUtils.clamp(5, 0, 10)).toBe(5)
        expect(MathUtils.clamp(-1, 0, 10)).toBe(0)
        expect(MathUtils.clamp(11, 0, 10)).toBe(10)
        expect(() => MathUtils.clamp(1, 10, 0)).toThrow()
    })

    it('lerp', () => {
        expect(MathUtils.lerp(0, 10, 0)).toBe(0)
        expect(MathUtils.lerp(0, 10, 1)).toBe(10)
        expect(MathUtils.lerp(0, 10, 0.5)).toBe(5)
        expect(MathUtils.lerp(0, 10, -1)).toBe(-10)
        expect(MathUtils.lerp(0, 10, 2)).toBe(20)
    })

    it('almostEqual', () => {
        expect(MathUtils.almostEqual(1, 1 + 1e-10)).toBe(true)
        expect(MathUtils.almostEqual(1, 1 + 1e-6)).toBe(false)
    })
})
