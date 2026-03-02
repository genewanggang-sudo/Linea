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

    it('normalizes parameter via normalizeParam', () => {
        expect(PeriodInterval.normalizeParam(370, 360)).toBe(10)
        expect(PeriodInterval.normalizeParam(-5, 360)).toBe(355)
    })

    it('normalizes parameter in given period window', () => {
        const r = new PeriodInterval(350, 30, 360)
        expect(PeriodInterval.normalizeParam(-10, r.period, 350)).toBe(350)
        expect(PeriodInterval.normalizeParam(725, r.period, 350)).toBe(365)
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

    it('isConnected follows periodic semantics', () => {
        const a = new PeriodInterval(350, 30, 360)
        const b = new PeriodInterval(10, 20, 360)
        expect(a.isConnected(b)).toBe(true)

        const c = new PeriodInterval(60, 80, 360)
        expect(a.isConnected(c)).toBe(false)
    })

    it('isConnected throws when period mismatches', () => {
        const a = new PeriodInterval(350, 30, 360)
        const b = new PeriodInterval(20, 80, 180)
        expect(() => a.isConnected(b)).toThrow('PeriodInterval.isConnected: period mismatch')
    })

    it('distanceTo follows periodic semantics', () => {
        const a = new PeriodInterval(350, 30, 360)
        const b = new PeriodInterval(10, 20, 360)
        expect(a.distanceTo(b)).toBe(-10)

        const c = new PeriodInterval(60, 80, 360)
        expect(a.distanceTo(c)).toBe(30)
        expect(c.distanceTo(a)).toBe(30)
    })

    it('distanceTo throws when period mismatches', () => {
        const a = new PeriodInterval(350, 30, 360)
        const b = new PeriodInterval(20, 80, 180)
        expect(() => a.distanceTo(b)).toThrow('PeriodInterval.distanceTo: period mismatch')
    })

})
