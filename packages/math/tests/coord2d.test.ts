import { describe, expect, it } from 'vitest'

import { Coord2D } from '../src/core/coord2d'
import { Vec2 } from '../src/core/vec2'
import { Mat3 } from '../src/core/mat3'

describe('Coord2D', () => {
    it('default coord is identity', () => {
        const c = new Coord2D()
        const p = new Vec2(3, 4)
        const w = c.toWorld(p)
        const l = c.toLocal(p)
        expect(w.equals(p)).toBe(true)
        expect(l.equals(p)).toBe(true)
    })

    it('toWorld/toLocal are inverse', () => {
        const c = new Coord2D(
            new Vec2(10, -5),
            new Vec2(2, 0),
            new Vec2(0, 3),
        )
        const p = new Vec2(1, 2)
        const w = c.toWorld(p)
        const l = c.toLocal(w)
        expect(l.equals(p, 1e-9)).toBe(true)
    })

    it('toMat3 matches toWorld', () => {
        const c = new Coord2D(
            new Vec2(1, 2),
            new Vec2(2, 1),
            new Vec2(-1, 3),
        )
        const p = new Vec2(3, -1)
        const w1 = c.toWorld(p)
        const w2 = c.toMat3().transformedPoint(p)
        expect(w1.equals(w2, 1e-9)).toBe(true)
    })

    it('dump/load', () => {
        const c = new Coord2D(
            new Vec2(1, 2),
            new Vec2(0, 1),
            new Vec2(-1, 0),
        )
        const dumped = c.dump()
        const restored = Coord2D.load(dumped)
        expect(restored.equals(c)).toBe(true)
    })

    it('clone/equals/set*', () => {
        const c = new Coord2D(
            new Vec2(1, 2),
            new Vec2(2, 0),
            new Vec2(0, 3),
        )
        const cloned = c.clone()
        expect(cloned).not.toBe(c)
        expect(cloned.equals(c)).toBe(true)

        c.setOrigin(new Vec2(5, 6))
        expect(c.getOrigin().equals(new Vec2(5, 6))).toBe(true)

        c.setXAxis(new Vec2(1, 1))
        expect(c.getDx().equals(new Vec2(1, 1))).toBe(true)

        c.setYAxis(new Vec2(-1, 0))
        expect(c.getDy().equals(new Vec2(-1, 0))).toBe(true)
    })

    it('isValid and toLocal degenerate', () => {
        const deg = new Coord2D(
            new Vec2(0, 0),
            new Vec2(1, 0),
            new Vec2(2, 0),
        )
        expect(deg.isValid()).toBe(false)
        expect(() => deg.toLocal(new Vec2(1, 2))).toThrow()
    })

    it('isValid eps boundary', () => {
        const nearDeg = new Coord2D(
            new Vec2(0, 0),
            new Vec2(1, 0),
            new Vec2(1e-13, 1e-12),
        )
        expect(nearDeg.isValid()).toBe(false)
        expect(nearDeg.isValid(1e-13)).toBe(true)
        expect(() => nearDeg.toLocal(new Vec2(1, 0), 1e-12)).toThrow()
        expect(() => nearDeg.toLocal(new Vec2(1, 0), 1e-14)).not.toThrow()
    })

    it('equals eps boundary', () => {
        const a = new Coord2D(
            new Vec2(1, 2),
            new Vec2(1, 0),
            new Vec2(0, 1),
        )
        const b = new Coord2D(
            new Vec2(1 + 5e-10, 2 - 5e-10),
            new Vec2(1 + 5e-10, 0),
            new Vec2(0, 1 - 5e-10),
        )
        expect(a.equals(b, 1e-9)).toBe(true)
        expect(a.equals(b, 1e-12)).toBe(false)
    })

    it('toWorld/toLocal works for non-orthogonal basis', () => {
        const c = new Coord2D(
            new Vec2(-3, 4),
            new Vec2(2, 1),
            new Vec2(1, 2),
        )
        const p = new Vec2(0.5, -1.5)
        const w = c.toWorld(p)
        const l = c.toLocal(w)
        expect(l.equals(p, 1e-9)).toBe(true)
    })

    it('constructor overloads', () => {
        const base = new Coord2D(
            new Vec2(1, 2),
            new Vec2(2, 0),
            new Vec2(0, 3),
        )

        const copy = new Coord2D(base)
        expect(copy.equals(base)).toBe(true)

        const m = base.toMat3()
        const fromMat = new Coord2D(m)
        expect(fromMat.equals(base, 1e-9)).toBe(true)

        const fromAxes = new Coord2D(new Vec2(5, 6), new Vec2(3, 0))
        expect(fromAxes.getOrigin().equals(new Vec2(5, 6))).toBe(true)
        expect(fromAxes.getDx().equals(new Vec2(3, 0))).toBe(true)
        expect(fromAxes.getDy().equals(new Vec2(0, 3))).toBe(true)
    })

    it('transform/transformed', () => {
        const c = new Coord2D(
            new Vec2(1, 2),
            new Vec2(2, 0),
            new Vec2(0, 3),
        )
        const m = Mat3.translation(5, -4)
        const t = c.transformed(m)
        expect(t).not.toBe(c)
        expect(t.getOrigin().equals(new Vec2(6, -2))).toBe(true)
        expect(t.getDx().equals(new Vec2(2, 0))).toBe(true)
        expect(t.getDy().equals(new Vec2(0, 3))).toBe(true)
    })

    it('inverse', () => {
        const c = new Coord2D(
            new Vec2(10, -5),
            new Vec2(2, 0),
            new Vec2(0, 3),
        )
        const inv = c.inverse()
        const p = new Vec2(1, 2)
        const w = c.toWorld(p)
        const l = inv.toWorld(w)
        expect(l.equals(p, 1e-9)).toBe(true)
    })

    it('getScale/setScale', () => {
        const c = new Coord2D(
            new Vec2(0, 0),
            new Vec2(2, 0),
            new Vec2(0, 3),
        )
        const s = c.getScale()
        expect(s.equals(new Vec2(2, 3))).toBe(true)

        c.setScale(4, 5)
        const s2 = c.getScale()
        expect(s2.equals(new Vec2(4, 5))).toBe(true)
        expect(c.getDx().equals(new Vec2(4, 0))).toBe(true)
        expect(c.getDy().equals(new Vec2(0, 5))).toBe(true)
    })
})
