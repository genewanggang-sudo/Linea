import { describe, expect, it } from 'vitest'

import { Interval } from '../src/curves/interval'
import { MathConst } from '../src/constants/math_const'

describe('Interval', () => {
    it('supports empty constructor as infinite interval', () => {
        const r = new Interval()
        expect(r.start).toBe(MathConst.MIN)
        expect(r.end).toBe(MathConst.MAX)
    })

    it('throws when constructor receives only one argument', () => {
        expect(() => new Interval(1 as unknown as number)).toThrow('Interval: 构造函数仅支持 0 或 2 个参数')
    })

    it('sorts range in constructor', () => {
        const r = new Interval(5, 1)
        expect(r.start).toBe(1)
        expect(r.end).toBe(5)
    })

    it('supports point interval', () => {
        const r = new Interval(2, 2)
        expect(r.length()).toBe(0)
        expect(r.mid()).toBe(2)
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

    it('assertContains and assertContainsRange', () => {
        const r = new Interval(1, 3)
        expect(() => r.assertContains(2)).not.toThrow()
        expect(() => r.assertContains(10)).toThrow('Interval.assertContains: parameter out of range')

        expect(() => r.assertContainsRange(new Interval(1.2, 2.8))).not.toThrow()
        expect(() => r.assertContainsRange(new Interval(0, 2))).toThrow('Interval.assertContainsRange: range out of bounds')
    })

    it('containsInterval checks full containment', () => {
        const r = new Interval(1, 3)
        expect(r.containsInterval(new Interval(1.2, 2.8))).toBe(true)
        expect(r.containsInterval(new Interval(0, 2))).toBe(false)
    })

    it('expandByPt', () => {
        const r = new Interval(2, 4)
        const e = r.clone().expandByPt(1)
        expect(e.start).toBe(1)
        expect(e.end).toBe(4)
        expect(r.start).toBe(2)
        expect(r.end).toBe(4)

        r.expandByPt(5)
        expect(r.start).toBeCloseTo(2, 12)
        expect(r.end).toBeCloseTo(5, 12)
    })

    it('expandByPt validates finite point', () => {
        const r = new Interval(1, 2)
        expect(() => r.expandByPt(Number.POSITIVE_INFINITY)).toThrow()
    })

    it('multiply scales interval around origin', () => {
        const r = new Interval(2, 6).multiply(2)
        expect(r.start).toBe(4)
        expect(r.end).toBe(12)

        const z = new Interval(2, 6).multiply(0)
        expect(z.start).toBe(0)
        expect(z.end).toBe(0)

        const n = new Interval(2, 6).multiply(-1)
        expect(n.start).toBe(-6)
        expect(n.end).toBe(-2)
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

    it('union returns exact set union', () => {
        const a = new Interval(1, 2)
        const b = new Interval(4, 5)
        const u = a.union(b)
        expect(u.length).toBe(2)
        expect(u[0].equals(new Interval(1, 2))).toBe(true)
        expect(u[1].equals(new Interval(4, 5))).toBe(true)

        const c = new Interval(1, 3)
        const d = new Interval(2, 5)
        const ud = c.union(d)
        expect(ud.length).toBe(1)
        expect(ud[0].equals(new Interval(1, 5))).toBe(true)
    })

    it('coverRange returns minimum covering range', () => {
        const a = new Interval(1, 2)
        const b = new Interval(4, 5)
        const cover = a.coverRange(b)
        expect(cover.equals(new Interval(1, 5))).toBe(true)
    })

    it('isConnected checks disjoint/overlap/touching', () => {
        const a = new Interval(1, 2)
        const b = new Interval(4, 5)
        expect(a.isConnected(b)).toBe(false)

        const c = new Interval(1, 3)
        const d = new Interval(2, 4)
        expect(c.isConnected(d)).toBe(true)

        const e = new Interval(1, 2)
        const f = new Interval(2 + 5e-10, 3)
        expect(e.isConnected(f, 1e-9)).toBe(true)
    })

    it('mid and distanceTo', () => {
        const a = new Interval(1, 5)
        expect(a.mid()).toBe(3)

        const overlap = new Interval(4, 6)
        expect(a.distanceTo(overlap)).toBe(0)

        const touching = new Interval(5 + 5e-10, 8)
        expect(a.distanceTo(touching, 1e-9)).toBe(0)

        const disjoint = new Interval(8, 10)
        expect(a.distanceTo(disjoint)).toBe(3)
        expect(disjoint.distanceTo(a)).toBe(3)
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

    it('subtracted supports single and multiple cutters', () => {
        const r = new Interval(1, 10)
        const s1 = r.subtracted([new Interval(3, 7)])
        expect(s1.length).toBe(2)
        expect(s1[0].equals(new Interval(1, 3))).toBe(true)
        expect(s1[1].equals(new Interval(7, 10))).toBe(true)

        const s2 = r.subtracted([
            new Interval(-5, 2),
            new Interval(8, 20),
        ])
        expect(s2.length).toBe(1)
        expect(s2[0].equals(new Interval(2, 8))).toBe(true)

        const s3 = r.subtracted([
            new Interval(2, 4),
            new Interval(3, 6),
            new Interval(8, 9),
        ])
        expect(s3.length).toBe(3)
        expect(s3[0].equals(new Interval(1, 2))).toBe(true)
        expect(s3[1].equals(new Interval(6, 8))).toBe(true)
        expect(s3[2].equals(new Interval(9, 10))).toBe(true)
    })

    it('creates infinite interval', () => {
        const r = Interval.infinite()
        expect(r.start).toBe(MathConst.MIN)
        expect(r.end).toBe(MathConst.MAX)
    })

    it('merge returns [] on empty input', () => {
        expect(Interval.merge([])).toEqual([])
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
