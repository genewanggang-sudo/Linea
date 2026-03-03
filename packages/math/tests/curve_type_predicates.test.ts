import { describe, expect, it } from 'vitest'

import { Arc2 } from '../src/curves/arc2'
import { BSpline2 } from '../src/curves/bspline2'
import { Circle2 } from '../src/curves/circle2'
import { Ellipse2 } from '../src/curves/ellipse2'
import { EllipseArc2 } from '../src/curves/ellipse_arc2'
import { Line2 } from '../src/curves/line2'
import { Vec2 } from '../src/core/vec2'

describe('curve type predicates', () => {
    it('reports type predicate flags on concrete curves', () => {
        const line = new Line2(new Vec2(0, 0), new Vec2(1, 0))
        expect(line.isLine()).toBe(true)
        expect(line.isCircle()).toBe(false)
        expect(line.isArc()).toBe(false)
        expect(line.isEllipse()).toBe(false)
        expect(line.isEllipseArc()).toBe(false)
        expect(line.isBSpline()).toBe(false)
    })

    it('reports closed semantics and type predicates on arc/circle/ellipse variants', () => {
        const circle = new Circle2(new Vec2(0, 0), 2)
        expect(circle.isClosed()).toBe(true)
        expect(circle.isCircle()).toBe(true)

        const arc = new Arc2(new Vec2(0, 0), 2, 0, Math.PI / 2, false)
        expect(arc.isClosed()).toBe(false)
        expect(arc.isArc()).toBe(true)

        const fullArc = new Arc2(new Vec2(0, 0), 2, 0, Math.PI * 2, false)
        expect(fullArc.isClosed()).toBe(true)

        const ellipse = new Ellipse2(new Vec2(0, 0), 3, 1, 0.2)
        expect(ellipse.isClosed()).toBe(true)
        expect(ellipse.isEllipse()).toBe(true)

        const ellipseArc = new EllipseArc2(new Vec2(0, 0), 3, 1, 0.2, 0, Math.PI / 2, false)
        expect(ellipseArc.isClosed()).toBe(false)
        expect(ellipseArc.isEllipseArc()).toBe(true)

        const fullEllipseArc = new EllipseArc2(new Vec2(0, 0), 3, 1, 0.2, 0, Math.PI * 2, false)
        expect(fullEllipseArc.isClosed()).toBe(true)
    })

    it('covers bspline continuity break extraction and predicate', () => {
        const bspline = new BSpline2({
            controlPoints: [
                new Vec2(0, 0),
                new Vec2(1, 1),
                new Vec2(2, 0),
                new Vec2(3, 1),
                new Vec2(4, 0),
            ],
            degree: 2,
            knots: [0, 0.5, 1],
            multiplicities: [3, 2, 3],
        })
        expect(bspline.isBSpline()).toBe(true)
        const breaks = bspline.getContinuityBreakParams()
        expect(breaks.length).toBe(1)
        expect(breaks[0]).toBeCloseTo(0.5, 12)
    })
})
