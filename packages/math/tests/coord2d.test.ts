import { describe, expect, it } from 'vitest'

import { Coord2D } from '../src/core/coord2d'
import { Vec2 } from '../src/core/vec2'

describe('Coord2D', () => {
    it('默认坐标系为单位正交基', () => {
        const c = new Coord2D()
        const p = new Vec2(3, 4)
        const w = c.toWorld(p)
        const l = c.toLocal(p)
        expect(w.equals(p)).toBe(true)
        expect(l.equals(p)).toBe(true)
    })

    it('toWorld/toLocal 互为逆变换', () => {
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

    it('toMat3 与 toWorld 一致', () => {
        const c = new Coord2D(
            new Vec2(1, 2),
            new Vec2(2, 1),
            new Vec2(-1, 3),
        )
        const p = new Vec2(3, -1)
        const w1 = c.toWorld(p)
        const w2 = c.toMat3().transformPoint(p)
        expect(w1.equals(w2, 1e-9)).toBe(true)
    })

    it('序列化与反序列化', () => {
        const c = new Coord2D(
            new Vec2(1, 2),
            new Vec2(0, 1),
            new Vec2(-1, 0),
        )
        const dumped = c.dump()
        const restored = Coord2D.load(dumped)
        expect(restored.equals(c)).toBe(true)
    })

    it('clone/equals/with*', () => {
        const c = new Coord2D(
            new Vec2(1, 2),
            new Vec2(2, 0),
            new Vec2(0, 3),
        )
        const cloned = c.clone()
        expect(cloned).not.toBe(c)
        expect(cloned.equals(c)).toBe(true)

        const moved = c.withOrigin(new Vec2(5, 6))
        expect(moved.origin.equals(new Vec2(5, 6))).toBe(true)
        expect(moved.equals(c)).toBe(false)

        const xRepl = c.withXAxis(new Vec2(1, 1))
        expect(xRepl.xAxis.equals(new Vec2(1, 1))).toBe(true)

        const yRepl = c.withYAxis(new Vec2(-1, 0))
        expect(yRepl.yAxis.equals(new Vec2(-1, 0))).toBe(true)
    })

    it('isValid 与 toLocal 退化分支', () => {
        const deg = new Coord2D(
            new Vec2(0, 0),
            new Vec2(1, 0),
            new Vec2(2, 0),
        )
        expect(deg.isValid()).toBe(false)
        expect(() => deg.toLocal(new Vec2(1, 2))).toThrow()
    })

    it('isValid 边界与 toLocal eps 边界', () => {
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

    it('equals 的容差边界', () => {
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

    it('toWorld/toLocal 在非正交基下仍可逆', () => {
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
})
