import { describe, expect, it } from 'vitest'

import { Arc2 } from '../src/curves/arc2'
import { BSpline2 } from '../src/curves/bspline2'
import { Circle2 } from '../src/curves/circle2'
import { Ellipse2 } from '../src/curves/ellipse2'
import { EllipseArc2 } from '../src/curves/ellipse_arc2'
import { Line2 } from '../src/curves/line2'
import { Vec2 } from '../src/core/vec2'
import { geomMgr } from '../src/serialize/geom_mgr'

describe('Curve serialize round-trip', () => {
    it('round-trips concrete curve types through geomMgr', () => {
        const line = new Line2(new Vec2(0, 0), new Vec2(3, 4))
        const circle = new Circle2(new Vec2(1, 2), 3)
        const arc = new Arc2(new Vec2(0, 0), 2, 0.2, 1.2, true)
        const ellipse = new Ellipse2(new Vec2(-1, 3), 4, 2, 0.3)
        const ellipseArc = new EllipseArc2(new Vec2(0, 0), 4, 2, 0.2, 0.1, 1.2, false)
        const bspline = new BSpline2({
            controlPoints: [new Vec2(0, 0), new Vec2(1, 1), new Vec2(2, 0)],
            degree: 2,
            knots: [0, 1],
            multiplicities: [3, 3],
        })

        const restoredLine = geomMgr.load<Line2>(line.dump())
        const restoredCircle = geomMgr.load<Circle2>(circle.dump())
        const restoredArc = geomMgr.load<Arc2>(arc.dump())
        const restoredEllipse = geomMgr.load<Ellipse2>(ellipse.dump())
        const restoredEllipseArc = geomMgr.load<EllipseArc2>(ellipseArc.dump())
        const restoredBSpline = geomMgr.load<BSpline2>(bspline.dump())

        expect(restoredLine.getPtAt(2).equals(line.getPtAt(2), 1e-9)).toBe(true)
        expect(restoredCircle.getPtAt(0.4).equals(circle.getPtAt(0.4), 1e-9)).toBe(true)
        expect(restoredArc.getPtAt(restoredArc.getStartParam()).equals(arc.getPtAt(arc.getStartParam()), 1e-9)).toBe(true)
        expect(restoredEllipse.getPtAt(0.8).equals(ellipse.getPtAt(0.8), 1e-6)).toBe(true)
        expect(restoredEllipseArc.getPtAt(restoredEllipseArc.getEndParam()).equals(ellipseArc.getPtAt(ellipseArc.getEndParam()), 1e-6)).toBe(true)
        expect(restoredBSpline.getPtAt(0.3).equals(bspline.getPtAt(0.3), 1e-6)).toBe(true)
    })
})
