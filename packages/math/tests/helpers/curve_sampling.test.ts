import { describe, expect, it } from 'vitest'

import { Interval } from '../../src/curves/interval'
import { PeriodInterval } from '../../src/curves/period_interval'
import { sampleParams } from './curve_sampling'

describe('curve_sampling helper', () => {
    it('handles zero-length interval branch', () => {
        const params = sampleParams(new Interval(1, 1), 4)
        expect(params).toEqual([1])
    })

    it('adds seam samples only for full-period ranges', () => {
        const partial = sampleParams(new PeriodInterval(0, Math.PI, Math.PI * 2), 4)
        expect(partial.every((u) => u >= 0 && u <= Math.PI)).toBe(true)

        const full = sampleParams(new PeriodInterval(0, Math.PI * 2, Math.PI * 2), 4)
        expect(full.length).toBeGreaterThan(partial.length)
    })
})
