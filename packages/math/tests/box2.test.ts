import { describe, expect, it } from 'vitest'

import { Box2 } from '../src/core/box2'
import { Vec2 } from '../src/core/vec2'

describe('Box2', () => {
    it('默认创建为空盒', () => {
        const b = new Box2()
        expect(b.isEmpty()).toBe(true)
        expect(b.width()).toBe(0)
        expect(b.height()).toBe(0)
    })

    it('fromMinMax/fromPoints', () => {
        const b = Box2.fromMinMax(new Vec2(1, 2), new Vec2(5, 6))
        expect(b.minX).toBe(1)
        expect(b.minY).toBe(2)
        expect(b.maxX).toBe(5)
        expect(b.maxY).toBe(6)

        const p = Box2.fromPoints([new Vec2(2, 3), new Vec2(-1, 10), new Vec2(5, 0)])
        expect(p.minX).toBe(-1)
        expect(p.minY).toBe(0)
        expect(p.maxX).toBe(5)
        expect(p.maxY).toBe(10)

        const empty = Box2.fromPoints([])
        expect(empty.isEmpty()).toBe(true)
    })

    it('contains/intersects/union', () => {
        const a = new Box2(0, 0, 10, 10)
        const b = new Box2(2, 2, 4, 4)
        const c = new Box2(9, 9, 12, 12)
        const d = new Box2(20, 20, 30, 30)

        expect(a.containsBox(b)).toBe(true)
        expect(a.containsPoint(new Vec2(5, 5))).toBe(true)
        expect(a.containsPoint(new Vec2(15, 5))).toBe(false)
        expect(a.intersects(c)).toBe(true)
        expect(a.intersects(d)).toBe(false)

        const u = a.union(d)
        expect(u.minX).toBe(0)
        expect(u.minY).toBe(0)
        expect(u.maxX).toBe(30)
        expect(u.maxY).toBe(30)
    })

    it('expand/translate/size/center', () => {
        const e = Box2.empty()
        const p = e.expandByPoint(new Vec2(3, -2))
        expect(p.minX).toBe(3)
        expect(p.maxX).toBe(3)
        expect(p.minY).toBe(-2)
        expect(p.maxY).toBe(-2)

        const ex = p.expandByScalar(2)
        expect(ex.minX).toBe(1)
        expect(ex.maxX).toBe(5)
        expect(ex.minY).toBe(-4)
        expect(ex.maxY).toBe(0)

        const t = ex.translate(1, 1)
        expect(t.minX).toBe(2)
        expect(t.maxX).toBe(6)
        expect(t.minY).toBe(-3)
        expect(t.maxY).toBe(1)

        const size = t.size()
        expect(size.x).toBe(4)
        expect(size.y).toBe(4)
        const center = t.center()
        expect(center.x).toBe(4)
        expect(center.y).toBe(-1)
    })

    it('equals/isFinite/clone', () => {
        const a = new Box2(0, 0, 1, 1)
        const b = new Box2(0 + 1e-10, 0 - 1e-10, 1 + 1e-10, 1 - 1e-10)
        expect(a.equals(b, 1e-9)).toBe(true)
        expect(a.isFinite()).toBe(true)

        const e1 = Box2.empty()
        const e2 = Box2.empty()
        expect(e1.equals(e2)).toBe(true)

        const c = a.clone()
        expect(c).not.toBe(a)
        expect(c.equals(a)).toBe(true)
    })

    it('dump/load', () => {
        const b = new Box2(-1, 2, 3, 4)
        const dumped = b.dump()
        expect(dumped.type).toBe(Box2.type)
        const restored = Box2.load(dumped)
        expect(restored.equals(b)).toBe(true)
    })
})
