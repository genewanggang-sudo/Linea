import { describe, expect, it } from 'vitest'

import { DiscretizeOptions } from '../../src/discretize/discretize_options'

describe('DiscretizeOptions', () => {
    it('supports presets and clone', () => {
        const low = DiscretizeOptions.low
        const medium = DiscretizeOptions.medium
        const high = DiscretizeOptions.high

        expect(low.maxSegments).toBeLessThan(medium.maxSegments)
        expect(medium.maxSegments).toBeLessThanOrEqual(high.maxSegments)

        const custom = new DiscretizeOptions(1e-2, Math.PI / 30, 128)
        const cloned = custom.clone()
        expect(cloned).not.toBe(custom)
        expect(cloned.chordTol).toBe(custom.chordTol)
        expect(cloned.angleTolRad).toBe(custom.angleTolRad)
        expect(cloned.maxSegments).toBe(custom.maxSegments)
    })

    it('validates maxSegments', () => {
        expect(() => new DiscretizeOptions(1e-3, Math.PI / 180, 0)).toThrow('DiscretizeOptionsError')
        expect(() => new DiscretizeOptions(1e-3, Math.PI / 180, 1.2)).toThrow('DiscretizeOptionsError')
    })
})
