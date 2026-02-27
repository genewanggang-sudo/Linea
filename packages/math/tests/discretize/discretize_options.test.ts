import { describe, expect, it } from 'vitest'

import { DiscretizeOptions } from '../../src/discretize/discretize_options'

describe('DiscretizeOptions', () => {
    it('supports presets and clone', () => {
        const low = DiscretizeOptions.low
        const medium = DiscretizeOptions.medium
        const high = DiscretizeOptions.high
        const ultra = DiscretizeOptions.ultra

        expect(low.chordTol).toBeGreaterThan(medium.chordTol)
        expect(medium.chordTol).toBeGreaterThan(high.chordTol)
        expect(high.chordTol).toBeGreaterThan(ultra.chordTol)

        expect(low.angleTolRad).toBeGreaterThan(medium.angleTolRad)
        expect(medium.angleTolRad).toBeGreaterThan(high.angleTolRad)
        expect(high.angleTolRad).toBeGreaterThan(ultra.angleTolRad)

        expect(low.minSegmentLength).toBeGreaterThan(medium.minSegmentLength)
        expect(medium.minSegmentLength).toBeGreaterThan(high.minSegmentLength)
        expect(high.minSegmentLength).toBeGreaterThan(ultra.minSegmentLength)

        const custom = new DiscretizeOptions(1e-2, Math.PI / 30, 1e-4)
        const cloned = custom.clone()
        expect(cloned).not.toBe(custom)
        expect(cloned.chordTol).toBe(custom.chordTol)
        expect(cloned.angleTolRad).toBe(custom.angleTolRad)
        expect(cloned.minSegmentLength).toBe(custom.minSegmentLength)
    })

    it('validates minSegmentLength', () => {
        expect(() => new DiscretizeOptions(1e-3, Math.PI / 180, 0)).toThrow('DiscretizeOptionsError')
        expect(() => new DiscretizeOptions(1e-3, Math.PI / 180, -1)).toThrow('DiscretizeOptionsError')
    })
})
