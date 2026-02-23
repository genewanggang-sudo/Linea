import { describe, expect, it } from 'vitest'

import { Interval } from '../src/curves/interval'
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

    it('split returns [] on boundary', () => {
        const r = new PeriodInterval(350, 30, 360)
        expect(r.split(350)).toEqual([])
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

    it('union throws when other is not PeriodInterval', () => {
        const a = new PeriodInterval(350, 20, 360)
        const b = new Interval(0, 1)
        expect(() => a.union(b as unknown as PeriodInterval)).toThrow('PeriodInterval.union: other must be PeriodInterval')
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

    it('union throws when eps is invalid', () => {
        const a = new PeriodInterval(350, 20, 360)
        const b = new PeriodInterval(40, 80, 360)
        expect(() => a.union(b, -1)).toThrow('PeriodInterval.union: eps must be a non-negative finite number')
    })

    it('intersect throws when other is not PeriodInterval', () => {
        const a = new PeriodInterval(350, 30, 360)
        const b = new Interval(0, 1)
        expect(() => a.intersect(b as unknown as PeriodInterval)).toThrow('PeriodInterval.intersect: other must be PeriodInterval')
    })

    it('intersect throws when period mismatches', () => {
        const a = new PeriodInterval(350, 30, 360)
        const b = new PeriodInterval(20, 80, 180)
        expect(() => a.intersect(b)).toThrow('PeriodInterval.intersect: period mismatch')
    })

    it('contains/equals/intersect/split throw when eps is invalid', () => {
        const a = new PeriodInterval(350, 30, 360)
        const b = new PeriodInterval(20, 80, 360)
        expect(() => a.contains(10, -1)).toThrow('PeriodInterval.contains: eps must be a non-negative finite number')
        expect(() => a.equals(b, -1)).toThrow('PeriodInterval.equals: eps must be a non-negative finite number')
        expect(() => a.intersect(b, -1)).toThrow('PeriodInterval.intersect: eps must be a non-negative finite number')
        expect(() => a.split(10, -1)).toThrow('PeriodInterval.split: eps must be a non-negative finite number')
    })

})
