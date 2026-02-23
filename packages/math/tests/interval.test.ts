import { describe, expect, it } from 'vitest'

import { Interval } from '../src/curves/interval'
import { MathConst } from '../src/constants/math_const'

describe('Interval', () => {
    it('sorts range in constructor', () => {
        const r = new Interval(5, 1)
        expect(r.start).toBe(1)
        expect(r.end).toBe(5)
    })

    it('supports point interval', () => {
        const r = new Interval(2, 2)
        expect(r.length()).toBe(0)
        expect(r.contains(2)).toBe(true)
    })

    it('throws when constructor receives NaN endpoint', () => {
        expect(() => new Interval(Number.NaN, 1)).toThrow('Interval: start/end must not be NaN')
    })

    it('contains and clamp', () => {
        const r = new Interval(1, 3)
        expect(r.contains(2)).toBe(true)
        expect(r.contains(4)).toBe(false)
        expect(r.clamp(-1)).toBe(1)
        expect(r.clamp(2)).toBe(2)
        expect(r.clamp(4)).toBe(3)
    })

    it('expand and expanded', () => {
        const r = new Interval(2, 4)
        const e = r.expanded(1)
        expect(e.start).toBe(1)
        expect(e.end).toBe(5)
        expect(r.start).toBe(2)
        expect(r.end).toBe(4)

        r.expand(0.5)
        expect(r.start).toBeCloseTo(1.5, 12)
        expect(r.end).toBeCloseTo(4.5, 12)
    })

    it('expand throws on over-shrink', () => {
        const r = new Interval(1, 2)
        expect(() => r.expand(-1)).toThrow()
    })

    it('intersect returns [] or one interval', () => {
        const a = new Interval(1, 3)
        const b = new Interval(2, 5)
        const c = new Interval(4, 6)
        const d = new Interval(3, 7)

        const ab = a.intersect(b)
        expect(ab.length).toBe(1)
        expect(ab[0].equals(new Interval(2, 3))).toBe(true)

        expect(a.intersect(c)).toEqual([])

        const ad = a.intersect(d)
        expect(ad.length).toBe(1)
        expect(ad[0].equals(new Interval(3, 3))).toBe(true)
    })

    it('union returns minimum covering range', () => {
        const a = new Interval(1, 2)
        const b = new Interval(4, 5)
        const u = a.union(b)
        expect(u.length).toBe(1)
        expect(u[0].equals(new Interval(1, 5))).toBe(true)
    })

    it('split behavior', () => {
        const r = new Interval(1, 5)
        const s = r.split(3)
        expect(s.length).toBe(2)
        expect(s[0].equals(new Interval(1, 3))).toBe(true)
        expect(s[1].equals(new Interval(3, 5))).toBe(true)

        expect(r.split(1)).toEqual([])
        expect(r.split(5)).toEqual([])
        expect(r.split(0)).toEqual([])
    })

    it('creates infinite interval', () => {
        const r = Interval.infinite()
        expect(r.start).toBe(MathConst.MIN)
        expect(r.end).toBe(MathConst.MAX)
    })

    it('merge returns [] on empty input', () => {
        expect(Interval.merge([])).toEqual([])
    })

    it('merge throws when eps is invalid', () => {
        expect(() => Interval.merge([new Interval(0, 1)], -1)).toThrow('Interval.merge: eps must be a non-negative finite number')
    })

    it('merge throws when endpoint is NaN', () => {
        const bad = { start: Number.NaN, end: 1, clone: () => new Interval(0, 0) } as unknown as Interval
        expect(() => Interval.merge([bad])).toThrow('Interval.merge: interval endpoint must not be NaN')
    })

    it('merge handles sorted and overlapping ranges', () => {
        const merged = Interval.merge([
            new Interval(1, 3),
            new Interval(2, 4),
            new Interval(6, 7),
        ])
        expect(merged.length).toBe(2)
        expect(merged[0].equals(new Interval(1, 4))).toBe(true)
        expect(merged[1].equals(new Interval(6, 7))).toBe(true)
    })

    it('merge handles unsorted ranges', () => {
        const merged = Interval.merge([
            new Interval(6, 7),
            new Interval(1, 3),
            new Interval(2, 4),
        ])
        expect(merged.length).toBe(2)
        expect(merged[0].equals(new Interval(1, 4))).toBe(true)
        expect(merged[1].equals(new Interval(6, 7))).toBe(true)
    })

    it('merge joins touching ranges with eps', () => {
        const merged = Interval.merge([
            new Interval(1, 2),
            new Interval(2 + 5e-10, 3),
        ], 1e-9)
        expect(merged.length).toBe(1)
        expect(merged[0].equals(new Interval(1, 3))).toBe(true)
    })

    it('merge keeps disjoint ranges', () => {
        const merged = Interval.merge([
            new Interval(1, 2),
            new Interval(3, 4),
        ])
        expect(merged.length).toBe(2)
        expect(merged[0].equals(new Interval(1, 2))).toBe(true)
        expect(merged[1].equals(new Interval(3, 4))).toBe(true)
    })

    it('merge returns new objects', () => {
        const source = [new Interval(1, 3), new Interval(2, 4)]
        const merged = Interval.merge(source)
        expect(merged[0]).not.toBe(source[0])
    })

})
