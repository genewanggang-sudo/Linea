import { describe, expect, it } from 'vitest'

import { Precision } from '../src/utils/precision'

describe('Precision', () => {
    it('equal supports absolute and relative tolerance', () => {
        expect(Precision.equal(1, 1 + 1e-10, 1e-9)).toBe(true)
        expect(Precision.equal(1_000_000, 1_000_000 + 0.5, 1e-6)).toBe(true)
        expect(Precision.equal(1_000_000, 1_000_000 + 2, 1e-6)).toBe(false)
    })

    it('nearlyZero and angleEqual', () => {
        expect(Precision.nearlyZero(1e-13)).toBe(true)
        expect(Precision.nearlyZero(1e-9)).toBe(false)
        expect(Precision.angleEqual(0, 5e-7)).toBe(true)
        expect(Precision.angleEqual(0, 5e-5)).toBe(false)
    })
})
