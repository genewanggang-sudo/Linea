import { describe, expect, it } from 'vitest'
import { Arc2 } from '../src/curves/arc2'
import { Circle2 } from '../src/curves/circle2'
import { Line2 } from '../src/curves/line2'
import { Vec2 } from '../src/core/vec2'
import { intersectCurveCurve } from '../src/intersections'

describe('intersections degenerate / near-degenerate', () => {
    it('handles near-tangent circles', () => {
        const c1 = new Circle2(new Vec2(0, 0), 5)
        const c2 = new Circle2(new Vec2(10 - 1e-7, 0), 5)
        const hits = intersectCurveCurve(c1, c2)
        expect(hits.length).toBeGreaterThan(0)
        for (const h of hits) {
            expect(Number.isFinite(h.point.x) && Number.isFinite(h.point.y)).toBe(true)
        }
    })

    it('handles near-parallel long lines', () => {
        const l1 = new Line2(new Vec2(-1e6, -1), new Vec2(1e6, 1))
        const l2 = new Line2(new Vec2(-1e6, -0.9999), new Vec2(1e6, 1.0001))
        const hits = intersectCurveCurve(l1, l2)
        expect(Array.isArray(hits)).toBe(true)
    })

    it('handles tiny overlap segment', () => {
        const l1 = new Line2(new Vec2(0, 0), new Vec2(10, 0))
        const l2 = new Line2(new Vec2(9.9999, 0), new Vec2(20, 0))
        const hits = intersectCurveCurve(l1, l2)
        expect(hits.length).toBeGreaterThan(0)
        expect(hits.some((h) => h.isOverlap || h.point.distanceTo(new Vec2(9.9999, 0)) < 1e-4)).toBe(true)
    })

    it('handles very small scale geometry', () => {
        const line = new Line2(new Vec2(-1e-5, 0), new Vec2(1e-5, 0))
        const circle = new Circle2(new Vec2(0, 0), 5e-6)
        const hits = intersectCurveCurve(line, circle)
        expect(Array.isArray(hits)).toBe(true)
        for (const h of hits) {
            expect(Number.isFinite(h.u1) && Number.isFinite(h.u2)).toBe(true)
        }
    })

    it('handles very large scale geometry', () => {
        const line = new Line2(new Vec2(-1e7, 1e6), new Vec2(1e7, 1e6))
        const circle = new Circle2(new Vec2(0, 0), 2e6)
        const hits = intersectCurveCurve(line, circle)
        expect(hits.length).toBeGreaterThan(0)
        for (const h of hits) {
            expect(Number.isFinite(h.point.x) && Number.isFinite(h.point.y)).toBe(true)
        }
    })

    it('handles arc endpoint touch', () => {
        const a1 = new Arc2(new Vec2(0, 0), 3, 0, Math.PI * 0.5, false)
        const a2 = new Arc2(new Vec2(3, 3), 3, Math.PI, Math.PI * 1.5, false)
        const hits = intersectCurveCurve(a1, a2)
        expect(Array.isArray(hits)).toBe(true)
    })
})
