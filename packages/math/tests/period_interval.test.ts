import { describe, expect, it } from 'vitest'

import { PeriodInterval } from '../src/curves/period_interval'

describe('PeriodInterval', () => {
    it('throws when constructor receives non-finite endpoint', () => {
        expect(() => new PeriodInterval(Number.POSITIVE_INFINITY, 1, 360))
            .toThrow('PeriodInterval: start/end must be finite')
    })

    it('normalizes cross-period constructor input', () => {
        const r = new PeriodInterval(350, 30, 360)
        expect(r.start).toBe(350)
        expect(r.length()).toBe(40)
    })

    it('treats near-full-span input as full period with EPS tolerance', () => {
        const r = new PeriodInterval(0, 360 + 5e-10, 360)
        expect(r.length()).toBe(360)
        expect(r.contains(180)).toBe(true)
    })

    it('normalizes parameter', () => {
        const r = new PeriodInterval(0, 10, 360)
        expect(r.normalize(370)).toBe(10)
        expect(r.normalize(-5)).toBe(355)
    })

    it('normalizes parameter in given period window', () => {
        const r = new PeriodInterval(350, 30, 360)
        expect(r.normalizeInPeriod(-10, 350)).toBe(350)
        expect(r.normalizeInPeriod(725, 350)).toBe(365)
    })

    it('contains for cross-period range', () => {
        const r = new PeriodInterval(350, 30, 360)
        expect(r.contains(355)).toBe(true)
        expect(r.contains(10)).toBe(true)
        expect(r.contains(200)).toBe(false)
    })

    it('clamp uses nearest boundary when outside', () => {
        const r = new PeriodInterval(350, 30, 360)
        expect(r.clamp(200)).toBe(350)
        expect(r.clamp(356)).toBe(356)
        expect(r.clamp(40)).toBe(30)
    })

    it('intersect returns segmented linear ranges', () => {
        const a = new PeriodInterval(350, 30, 360)
        const b = new PeriodInterval(20, 80, 360)
        const r = a.intersect(b)
        expect(r.length).toBe(1)
        expect(r[0] instanceof PeriodInterval).toBe(true)
        expect(r[0].equals(new PeriodInterval(20, 30, 360))).toBe(true)
    })

    it('union allows multi-segment result', () => {
        const a = new PeriodInterval(350, 20, 360)
        const b = new PeriodInterval(40, 80, 360)
        const r = a.union(b)
        expect(r.length).toBe(2)
        expect(r[0] instanceof PeriodInterval).toBe(true)
        expect(r[1] instanceof PeriodInterval).toBe(true)
        expect(r[0].equals(new PeriodInterval(350, 380, 360))).toBe(true)
        expect(r[1].equals(new PeriodInterval(40, 80, 360))).toBe(true)
    })

    it('union also returns merged single segment without stitching', () => {
        const a = new PeriodInterval(10, 40, 360)
        const b = new PeriodInterval(30, 70, 360)
        const r = a.union(b)
        expect(r.length).toBe(1)
        expect(r[0].equals(new PeriodInterval(10, 70, 360))).toBe(true)

        const c = new PeriodInterval(10, 20, 360)
        const d = new PeriodInterval(100, 120, 360)
        const r2 = c.union(d)
        expect(r2.length).toBe(2)
    })

    it('split returns [] on boundary', () => {
        const r = new PeriodInterval(350, 30, 360)
        expect(r.split(350)).toEqual([])
        expect(r.split(200)).toEqual([])
    })

    it('split in middle returns two period intervals', () => {
        const r = new PeriodInterval(350, 30, 360)
        const s = r.split(10)
        expect(s.length).toBe(2)
        expect(s[0].length()).toBeCloseTo(20, 12)
        expect(s[1].length()).toBeCloseTo(20, 12)
    })

    it('shift keeps periodic semantics', () => {
        const r = new PeriodInterval(350, 30, 360).shift(30)
        expect(r.start).toBe(20)
        expect(r.length()).toBe(40)
    })

    it('equals handles period mismatch and full-span equivalence', () => {
        const a = new PeriodInterval(0, 360, 360)
        const b = new PeriodInterval(12, 372, 360)
        const c = new PeriodInterval(0, 360, 180)
        expect(a.equals(b)).toBe(true)
        expect(a.equals(c as unknown as PeriodInterval)).toBe(false)

        const half = new PeriodInterval(30, 120, 360)
        const inter = a.intersect(half)
        expect(inter.length).toBe(1)
        expect(inter[0].equals(half)).toBe(true)
    })

    it('union throws when period mismatches', () => {
        const a = new PeriodInterval(350, 20, 360)
        const b = new PeriodInterval(40, 80, 180)
        expect(() => a.union(b)).toThrow('PeriodInterval.union: period mismatch')
    })

    it('union supports custom eps for period compare', () => {
        const a = new PeriodInterval(350, 20, 360)
        const b = new PeriodInterval(40, 80, 360 + 5e-10)
        expect(() => a.union(b, 1e-12)).toThrow('PeriodInterval.union: period mismatch')
        expect(() => a.union(b, 1e-9)).not.toThrow()
    })

    it('intersect throws when period mismatches', () => {
        const a = new PeriodInterval(350, 30, 360)
        const b = new PeriodInterval(20, 80, 180)
        expect(() => a.intersect(b)).toThrow('PeriodInterval.intersect: period mismatch')
    })

})
