import { describe, it, expect } from 'vitest'

import { Vec2 } from '../src/core/vec2'

describe('Vec2', () => {
    it('creates and clones', () => {
        const v = new Vec2(1, 2)
        const c = v.clone()
        expect(c).not.toBe(v)
        expect(c.x).toBe(1)
        expect(c.y).toBe(2)
    })

    it('zero and from', () => {
        const z = Vec2.zero()
        expect(z.x).toBe(0)
        expect(z.y).toBe(0)

        const f = Vec2.from({ x: 3, y: 4 })
        expect(f.x).toBe(3)
        expect(f.y).toBe(4)
    })

    it('withX/withY', () => {
        const v = new Vec2(1, 2)
        expect(v.withX(9).x).toBe(9)
        expect(v.withX(9).y).toBe(2)
        expect(v.withY(7).x).toBe(1)
        expect(v.withY(7).y).toBe(7)
    })

    it('add/sub/scale', () => {
        const a = new Vec2(1, 2)
        const b = new Vec2(3, 4)
        const add = a.add(b)
        const sub = b.sub(a)
        const s = a.scale(2)
        expect(add.x).toBe(4)
        expect(add.y).toBe(6)
        expect(sub.x).toBe(2)
        expect(sub.y).toBe(2)
        expect(s.x).toBe(2)
        expect(s.y).toBe(4)
    })

    it('dot/cross', () => {
        const a = new Vec2(1, 2)
        const b = new Vec2(3, 4)
        expect(a.dot(b)).toBe(11)
        expect(a.cross(b)).toBe(-2)
    })

    it('len/lenSq/normalize', () => {
        const v = new Vec2(3, 4)
        expect(v.lenSq()).toBe(25)
        expect(v.len()).toBe(5)
        const n = v.normalize()
        expect(n.len()).toBeCloseTo(1, 12)
    })

    it('normalize on near-zero vector returns zero', () => {
        const v = new Vec2(1e-15, -1e-15)
        const n = v.normalize(1e-12)
        expect(n.x).toBe(0)
        expect(n.y).toBe(0)
    })

    it('distanceTo', () => {
        const a = new Vec2(1, 2)
        const b = new Vec2(4, 6)
        expect(a.distanceTo(b)).toBe(5)
    })

    it('lerp', () => {
        const a = new Vec2(0, 0)
        const b = new Vec2(10, 10)
        const m = a.lerp(b, 0.5)
        expect(m.x).toBe(5)
        expect(m.y).toBe(5)
    })

    it('angleTo', () => {
        const a = new Vec2(1, 0)
        const b = new Vec2(0, 1)
        expect(a.angleTo(b)).toBeCloseTo(Math.PI / 2, 10)
    })

    it('isFinite/equals', () => {
        const a = new Vec2(1, 2)
        const b = new Vec2(1 + 1e-10, 2 - 1e-10)
        const c = new Vec2(Infinity, 0)
        expect(a.isFinite()).toBe(true)
        expect(c.isFinite()).toBe(false)
        expect(a.equals(b, 1e-9)).toBe(true)
        expect(a.equals(new Vec2(1.1, 2), 1e-9)).toBe(false)
    })

    it('negate/distanceToSq', () => {
        const a = new Vec2(3, -4)
        const n = a.negate()
        expect(n.x).toBe(-3)
        expect(n.y).toBe(4)

        const b = new Vec2(6, 0)
        expect(a.distanceToSq(b)).toBe(25)
    })

    it('project', () => {
        const a = new Vec2(3, 4)
        const on = new Vec2(1, 0)
        const p1 = a.project(on)
        expect(p1.equals(new Vec2(3, 0))).toBe(true)

        const zero = a.project(Vec2.zero())
        expect(zero.equals(Vec2.zero())).toBe(true)

        const nearZero = a.project(new Vec2(1e-13, 0))
        expect(nearZero.equals(Vec2.zero())).toBe(true)
    })

    it('angleTo sign', () => {
        const a = new Vec2(1, 0)
        const b = new Vec2(0, 1)
        const c = new Vec2(0, -1)
        expect(a.angleTo(b)).toBeCloseTo(Math.PI / 2, 10)
        expect(a.angleTo(c)).toBeCloseTo(-Math.PI / 2, 10)
    })

    it('angle', () => {
        const a = new Vec2(1, 0)
        const b = new Vec2(0, 1)
        expect(a.angle()).toBeCloseTo(0, 12)
        expect(b.angle()).toBeCloseTo(Math.PI / 2, 12)
    })

    it('toArray', () => {
        const v = new Vec2(7, 8)
        expect(v.toArray()).toEqual([7, 8])
    })

    it('dump/load', () => {
        const v = new Vec2(2, 3)
        const dumped = v.dump()
        expect(dumped.type).toBe(Vec2.type)
        const restored = Vec2.load(dumped)
        expect(restored.x).toBe(2)
        expect(restored.y).toBe(3)
    })
})
