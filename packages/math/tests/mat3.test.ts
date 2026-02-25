import { describe, expect, it } from 'vitest'

import { Mat3 } from '../src/core/mat3'
import { Vec2 } from '../src/core/vec2'

describe('Mat3', () => {
    it('identity leaves point unchanged', () => {
        const m = Mat3.identity()
        const p = new Vec2(3, 4)
        const r = m.transformedPoint(p)
        expect(r.x).toBe(3)
        expect(r.y).toBe(4)
    })

    it('translation works on points', () => {
        const m = Mat3.translation(10, -5)
        const r = m.transformedPoint(new Vec2(1, 2))
        expect(r.x).toBe(11)
        expect(r.y).toBe(-3)

        const t = Mat3.identity().translated(3, 4)
        expect(t.transformedPoint(new Vec2(0, 0)).equals(new Vec2(3, 4))).toBe(true)
    })

    it('rotation works on points', () => {
        const m = Mat3.rotation(Math.PI / 2)
        const r = m.transformedPoint(new Vec2(1, 0))
        expect(r.x).toBeCloseTo(0, 10)
        expect(r.y).toBeCloseTo(1, 10)

        const rr = Mat3.identity().rotated(Math.PI / 2)
        expect(rr.transformedPoint(new Vec2(1, 0)).y).toBeCloseTo(1, 10)
    })

    it('scaling works on points', () => {
        const m = Mat3.scaling(2, 3)
        const r = m.transformedPoint(new Vec2(2, 1))
        expect(r.x).toBe(4)
        expect(r.y).toBe(3)

        const ss = Mat3.identity().scaled(2, 3)
        expect(ss.transformedPoint(new Vec2(2, 1)).equals(r)).toBe(true)
    })

    it('transformVector ignores translation', () => {
        const m = Mat3.translation(10, 0)
        const v = new Vec2(1, 2)
        const r = m.transformedVector(v)
        expect(r.x).toBe(1)
        expect(r.y).toBe(2)

        const vm = new Vec2(2, 3)
        m.transformVector(vm)
        expect(vm.equals(new Vec2(2, 3))).toBe(true)
    })

    it('decompose translation/rotation/scale', () => {
        const tx = 3
        const ty = -2
        const rot = Math.PI / 6
        const sx = 2
        const sy = 3
        const m = new Mat3()
            .translate(tx, ty)
            .rotate(rot)
            .scale(sx, sy)
        const d = m.decompose()
        expect(d.translation.equals(new Vec2(tx, ty), 1e-10)).toBe(true)
        expect(d.rotation).toBeCloseTo(rot, 10)
        expect(d.scale.equals(new Vec2(sx, sy), 1e-10)).toBe(true)

        const mirror = Mat3.scaling(-2, 3)
        const dm = mirror.decompose()
        expect(dm.scale.x).toBeCloseTo(2, 12)
        expect(dm.scale.y).toBeCloseTo(-3, 12)
    })

    it('right-multiply order applies rhs first', () => {
        const m = Mat3.identity()
            .translate(10, 0)
            .rotate(Math.PI / 2)
        const r = m.transformedPoint(new Vec2(1, 0))
        expect(r.x).toBeCloseTo(10, 10)
        expect(r.y).toBeCloseTo(1, 10)
    })

    it('invert restores original point', () => {
        const m = Mat3.translation(5, -2).rotate(0.3).scale(2, 3)
        const inv = m.inverted()
        const p = new Vec2(7, 9)
        const r = inv.transformedPoint(m.transformedPoint(p))
        expect(r.x).toBeCloseTo(p.x, 9)
        expect(r.y).toBeCloseTo(p.y, 9)
        expect(m.determinant()).not.toBe(0)
        expect(() => new Mat3(
            1, 0, 0,
            0, 0, 0,
            0, 0, 1,
        ).invert()).toThrow('Mat3.invert: matrix is not invertible')
    })

    it('clone equals and toArray', () => {
        const m = new Mat3(
            1, 2, 3,
            4, 5, 6,
            7, 8, 9,
        )
        const c = m.clone()
        expect(c.equals(m)).toBe(true)
        expect(c.toArray()).toEqual(m.toArray())
    })

    it('premultiply and multiply are different orders', () => {
        const t = Mat3.translation(2, 0)
        const r = Mat3.rotation(Math.PI / 2)
        const right = t.multiplied(r)
        const left = t.premultiplied(r)
        const p = new Vec2(1, 0)
        const pr = right.transformedPoint(p)
        const pl = left.transformedPoint(p)
        expect(pr.equals(pl)).toBe(false)
    })

    it('dump/load round-trip', () => {
        const m = new Mat3(
            1, 2, 3,
            4, 5, 6,
            7, 8, 9,
        )
        const dumped = m.dump()
        const restored = Mat3.load(dumped)
        expect(restored.toArray()).toEqual(m.toArray())
    })

    it('isSimilarity2D and getSimilarityScale2D', () => {
        const sim = Mat3.rotation(0.2).scale(2, 2)
        expect(sim.isSimilarity2D()).toBe(true)
        expect(sim.getSimilarityScale2D()).toBeCloseTo(2, 12)

        const mirror = Mat3.scaling(-3, 3)
        expect(mirror.isSimilarity2D()).toBe(true)
        expect(mirror.getSimilarityScale2D()).toBeCloseTo(3, 12)

        const shear = new Mat3(
            1, 1, 0,
            0, 1, 0,
            0, 0, 1,
        )
        expect(shear.isSimilarity2D()).toBe(false)
        expect(() => shear.getSimilarityScale2D()).toThrow('Mat3.getSimilarityScale2D: matrix is not a 2D similarity transform')

        const notAffine = new Mat3(
            1, 0, 0,
            0, 1, 0,
            1e-2, 0, 1,
        )
        expect(notAffine.isSimilarity2D()).toBe(false)
    })
})
