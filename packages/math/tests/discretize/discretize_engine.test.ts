import { describe, expect, it } from 'vitest'

import { EN_GEO_TYPE } from '../../src/constants/geom_type'
import { Box2 } from '../../src/core/box2'
import { Mat3 } from '../../src/core/mat3'
import { Vec2 } from '../../src/core/vec2'
import { Arc2 } from '../../src/curves/arc2'
import { BSpline2 } from '../../src/curves/bspline2'
import { Circle2 } from '../../src/curves/circle2'
import { Curve2 } from '../../src/curves/curve2'
import { Ellipse2 } from '../../src/curves/ellipse2'
import { EllipseArc2 } from '../../src/curves/ellipse_arc2'
import { Interval } from '../../src/curves/interval'
import { Line2 } from '../../src/curves/line2'
import { DiscretizeEngine } from '../../src/discretize/discretize_engine'
import { DiscretizeOptions } from '../../src/discretize/discretize_options'
import { Precision } from '../../src/utils/precision'
import type { IDB } from '../../src/serialize/dump_types'
import type { IClosestPointResult } from '../../src/types/type_define'

type Sample = { u: number; p: Vec2 }

type EnginePrivate = {
    discretizeLineCurve(curve: Curve2): Sample[]
    discretizeCircleLikeCurve(curve: Circle2 | Arc2, options: DiscretizeOptions): Sample[]
    discretizeEllipseLikeCurve(curve: Curve2, options: DiscretizeOptions): Sample[]
    discretizeBSplineCurve(curve: BSpline2, options: DiscretizeOptions): Sample[]
    postprocessResult(curve: Curve2, raw: Sample[], options: DiscretizeOptions): Sample[]
    refineAdaptiveSegments(curve: Curve2, initialSegments: Array<{ u0: number; u1: number; p0: Vec2; p1: Vec2 }>, options: DiscretizeOptions): Array<{ u0: number; u1: number; p0: Vec2; p1: Vec2 }>
    evaluateAdaptiveSegment(curve: Curve2, segment: { u0: number; u1: number; p0: Vec2; p1: Vec2 }, options: DiscretizeOptions): { split: boolean; blocked: boolean; score: number }
    segmentsToSamples(segments: Array<{ u0: number; u1: number; p0: Vec2; p1: Vec2 }>): Sample[]
    maxChordDeviationAtFractions(curve: Curve2, u0: number, u1: number, p0: Vec2, p1: Vec2, fractions?: readonly number[]): number
    distancePointToSegment(point: Vec2, segStart: Vec2, segEnd: Vec2): number
    tangentTurnAbs(curve: Curve2, u0: number, u1: number): number
    deduplicateAdjacent(samples: Sample[], tol: number): Sample[]
    buildInitialEllipseSegments(curve: Curve2, segmentCount: number): Array<{ u0: number; u1: number; p0: Vec2; p1: Vec2 }>
    buildInitialBSplineSegments(curve: BSpline2): Array<{ u0: number; u1: number; p0: Vec2; p1: Vec2 }>
    buildCircleLikeSamples(curve: Curve2, segmentCount: number, closed: boolean): Sample[]
    dThetaByChord(radius: number, chordTol: number): number
}

class UnsupportedCurve extends Curve2 {
    public static readonly type = 'UnsupportedCurve'

    constructor() {
        super()
        this.setRange(new Interval(0, 1))
    }

    public override pointAt(u: number): Vec2 {
        return new Vec2(u, u * u)
    }

    public override getPtAt(u: number): Vec2 {
        return new Vec2(u, u * u)
    }

    public override getTangentAt(u: number): Vec2 {
        return new Vec2(1, 2 * u)
    }

    public override getDerivatives(u: number, n: number): Vec2[] {
        const ret: Vec2[] = [this.pointAt(u)]
        for (let i = 1; i <= n; i++) ret.push(i === 1 ? this.getTangentAt(u) : Vec2.zero())
        return ret
    }

    public override curvatureAt(u: number): number {
        void u
        return 0
    }

    public override getLength(range?: Interval): number {
        void range
        return 1
    }

    public override lengthAtParam(u: number): number {
        return u
    }

    public override paramAtLength(s: number): number {
        return s
    }

    public override split(u: number): Curve2[] {
        void u
        return []
    }

    public override trim(range: Interval): Curve2[] {
        void range
        return [this.clone()]
    }

    public override reverse(): this {
        return this
    }

    public override transform(m: Mat3): this {
        void m
        return this
    }

    public override transformed(m: Mat3): this {
        void m
        return this.clone()
    }

    public override closestPoint(p: Vec2): IClosestPointResult {
        return { point: p.clone(), param: 0, distance: 0 }
    }

    public override getParamAt(p: Vec2): number {
        return p.x
    }

    public override getBBox(): Box2 {
        return new Box2(new Vec2(0, 0), new Vec2(1, 1))
    }

    public override isValid(): boolean {
        return true
    }

    public override clone(): this {
        return new UnsupportedCurve() as this
    }

    public override dump(): IDB {
        return { type: EN_GEO_TYPE.Vec2 } as unknown as IDB
    }
}

class InvalidCurve extends UnsupportedCurve {
    public override isValid(): boolean {
        return false
    }
}

describe('DiscretizeEngine', () => {
    const engine = DiscretizeEngine as unknown as EnginePrivate

    it('covers private constructor function via runtime cast', () => {
        const EngineCtor = DiscretizeEngine as unknown as { new(): object }
        const instance = new EngineCtor()
        expect(typeof instance).toBe('object')
    })

    it('covers public discretize flow for all supported curve kinds', () => {
        const line = new Line2(new Vec2(0, 0), new Vec2(2, 0))
        const circle = new Circle2(new Vec2(0, 0), 1)
        const arc = new Arc2(new Vec2(0, 0), 1, 0, Math.PI / 2, false)
        const ellipse = new Ellipse2(new Vec2(0, 0), 3, 1, 0.1)
        const ellipseArc = new EllipseArc2(new Vec2(0, 0), 3, 1, 0.1, 0, Math.PI / 2, false)
        const bspline = new BSpline2({
            controlPoints: [new Vec2(0, 0), new Vec2(1, 2), new Vec2(2, 0), new Vec2(3, 1)],
            degree: 2,
            knots: [0, 1, 2],
            multiplicities: [3, 1, 3],
        })

        const linePts = DiscretizeEngine.discretize(line)
        expect(linePts.length).toBe(2)
        expect(linePts[0].equals(line.pointAt(line.getStartParam()), 1e-12)).toBe(true)
        expect(linePts[1].equals(line.pointAt(line.getEndParam()), 1e-12)).toBe(true)

        const circlePts = DiscretizeEngine.discretize(circle, DiscretizeOptions.low)
        expect(circlePts.length).toBeGreaterThan(3)
        expect(circlePts[0].distanceTo(circlePts[circlePts.length - 1])).toBeGreaterThan(1e-8)

        const arcPts = DiscretizeEngine.discretize(arc, DiscretizeOptions.low)
        expect(arcPts[0].equals(arc.pointAt(arc.getStartParam()), 1e-12)).toBe(true)
        expect(arcPts[arcPts.length - 1].equals(arc.pointAt(arc.getEndParam()), 1e-12)).toBe(true)

        const tightEllipse = DiscretizeEngine.discretize(ellipse, new DiscretizeOptions(1e-12, 1e-12, 1e-3))
        expect(tightEllipse.length).toBeGreaterThan(2)

        const eaPts = DiscretizeEngine.discretize(ellipseArc, DiscretizeOptions.low)
        expect(eaPts[eaPts.length - 1].equals(ellipseArc.pointAt(ellipseArc.getEndParam()), 1e-12)).toBe(true)

        const bPts = DiscretizeEngine.discretize(bspline, DiscretizeOptions.low)
        expect(bPts.length).toBeGreaterThan(1)
    })

    it('throws for invalid and unsupported curve', () => {
        expect(() => DiscretizeEngine.discretize(new InvalidCurve())).toThrow('离散参数错误: 曲线无效')
        expect(() => DiscretizeEngine.discretize(new UnsupportedCurve())).toThrow('离散不支持')
    })

    it('covers circle/arc branches: degenerate and angular-step bounds', () => {
        const degenerateArc = new Arc2(new Vec2(0, 0), 1, 0, 0, false)
        const degenerate = engine.discretizeCircleLikeCurve(degenerateArc, DiscretizeOptions.low)
        expect(degenerate.length).toBe(1)

        const tinyTol = new DiscretizeOptions(1e-12, 1e-6, 1e-2)
        const normalCircle = new Circle2(new Vec2(0, 0), 10)
        const circlePts = DiscretizeEngine.discretize(normalCircle, tinyTol)
        expect(circlePts.length).toBeGreaterThan(8)

        expect(engine.dThetaByChord(1, 3)).toBeCloseTo(Math.PI * 2, 12)
        expect(engine.dThetaByChord(1, -1)).toBeCloseTo(0, 12)
    })

    it('covers ellipse and bspline empty-initial / degenerate branches', () => {
        const ellipse = new Ellipse2(new Vec2(0, 0), 3, 1, 0)
        const ellipsePts = DiscretizeEngine.discretize(ellipse, new DiscretizeOptions(1e-6, 1e-6, 1e-2))
        expect(ellipsePts.length).toBeGreaterThan(2)

        const degLine = engine.discretizeLineCurve({
            isDegenerate: () => true,
            getRange: () => new Interval(2, 3),
            pointAt: (u: number) => new Vec2(u, 0),
        } as unknown as Curve2)
        expect(degLine.length).toBe(1)

        const degEllipse = engine.discretizeEllipseLikeCurve({
            isDegenerate: () => true,
            getRange: () => new Interval(4, 5),
            pointAt: (u: number) => new Vec2(u, 1),
            getTangentAt: (u: number) => {
                void u
                return new Vec2(1, 0)
            },
        } as unknown as Curve2, DiscretizeOptions.low)
        expect(degEllipse.length).toBe(1)

        const degBspline = engine.discretizeBSplineCurve({
            isDegenerate: () => true,
            getRange: () => new Interval(6, 7),
            pointAt: (u: number) => new Vec2(u, 2),
            getContinuityBreakParams: (eps?: number) => {
                void eps
                return []
            },
        } as unknown as BSpline2, DiscretizeOptions.low)
        expect(degBspline.length).toBe(1)

        const zeroRangeBspline = {
            isDegenerate: () => false,
            getRange: () => new Interval(0, 0),
            pointAt: (u: number) => {
                void u
                return new Vec2(1, 2)
            },
            getContinuityBreakParams: (eps?: number) => {
                void eps
                return []
            },
        } as unknown as BSpline2
        const b0 = engine.discretizeBSplineCurve(zeroRangeBspline, DiscretizeOptions.low)
        expect(b0.length).toBe(1)
        expect(b0[0].p.equals(new Vec2(1, 2), 1e-12)).toBe(true)
    })

    it('covers postprocess branches: empty-raw, closed tail removal and open end replacement', () => {
        const opts = new DiscretizeOptions(1e-6, Math.PI / 180, 1e-4)

        const line = new Line2(new Vec2(0, 0), new Vec2(1, 0))
        const openRes = engine.postprocessResult(line, [{ u: 0.4, p: new Vec2(9, 9) }], opts)
        expect(openRes[openRes.length - 1].p.equals(line.pointAt(line.getEndParam()), 1e-12)).toBe(true)

        const emptyRawRes = engine.postprocessResult(line, [], opts)
        expect(emptyRawRes.length).toBe(1)
        expect(emptyRawRes[0].p.equals(line.pointAt(line.getEndParam()), 1e-12)).toBe(true)

        const circle = new Circle2(new Vec2(0, 0), 1)
        const s = circle.getStartParam()
        const p = circle.pointAt(s)
        const middle = circle.pointAt(s + Math.PI / 2)
        const nearHead = p.added(new Vec2(1e-8, 0))
        const closedRes = engine.postprocessResult(
            circle,
            [{ u: s, p: p.clone() }, { u: s + Math.PI / 2, p: middle }, { u: s + Math.PI * 2, p: nearHead }],
            new DiscretizeOptions(1e-6, Math.PI / 180, 1e-4),
        )
        expect(closedRes.length).toBe(2)

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const oldDedup: EnginePrivate['deduplicateAdjacent'] = engine.deduplicateAdjacent
        try {
            engine.deduplicateAdjacent = () => []
            const pushed = engine.postprocessResult(line, [{ u: 0.3, p: new Vec2(1, 1) }], opts)
            expect(pushed.length).toBe(1)
            expect(pushed[0].p.equals(line.pointAt(line.getEndParam()), 1e-12)).toBe(true)
        } finally {
            engine.deduplicateAdjacent = oldDedup
        }
    })

    it('covers adaptive refinement fail branches and helper utilities', () => {
        const opts = new DiscretizeOptions(1e-9, 1e-9, 1e-8)

        const blockedCurve = {
            pointAt: (u: number) => {
                return new Vec2(u * 1e8, 0)
            },
            getTangentAt: (u: number) => (u === 0 ? new Vec2(1, 0) : new Vec2(0, 1)),
        } as unknown as Curve2
        expect(() => engine.refineAdaptiveSegments(
            blockedCurve,
            [{ u0: 0, u1: Precision.CURVE_PARAM_EPS / 2, p0: new Vec2(0, 0), p1: new Vec2(0, 0) }],
            opts,
        )).toThrow('无法继续细分')

        const nonConvCurve = {
            pointAt: (u: number) => new Vec2(u * 1e9, 0),
            getTangentAt: (u: number) => (u === 0 ? new Vec2(1, 0) : new Vec2(0, 1)),
        } as unknown as Curve2
        expect(() => engine.refineAdaptiveSegments(
            nonConvCurve,
            [{
                u0: 0,
                u1: Precision.CURVE_PARAM_EPS / 2,
                p0: new Vec2(0, 0),
                p1: new Vec2((Precision.CURVE_PARAM_EPS / 2) * 1e9, 0),
            }],
            opts,
        )).toThrow(/离散不收敛|无法继续细分/)

        const noSplit = engine.evaluateAdaptiveSegment(
            {
                pointAt: (u: number) => new Vec2(u, 0),
                getTangentAt: (u: number) => {
                    void u
                    return new Vec2(1, 0)
                },
            } as unknown as Curve2,
            { u0: 0, u1: 1, p0: new Vec2(0, 0), p1: new Vec2(1, 0) },
            new DiscretizeOptions(1, Math.PI, 1e-3),
        )
        expect(noSplit.split).toBe(false)

        expect(engine.distancePointToSegment(new Vec2(1, 1), new Vec2(0, 0), new Vec2(0, 0))).toBeCloseTo(Math.sqrt(2), 12)
        expect(engine.tangentTurnAbs(
            {
                getTangentAt: (u: number) => {
                    void u
                    return Vec2.zero()
                },
            } as unknown as Curve2,
            0,
            1,
        )).toBe(0)

        const samples = engine.segmentsToSamples([
            { u0: 0, u1: 0.5, p0: new Vec2(0, 0), p1: new Vec2(1, 0) },
            { u0: 0.5, u1: 1, p0: new Vec2(1, 0), p1: new Vec2(2, 0) },
        ])
        expect(samples.length).toBe(3)

        expect(engine.deduplicateAdjacent([{ u: 0, p: new Vec2(0, 0) }], 1e-3).length).toBe(1)
        expect(
            engine.deduplicateAdjacent(
                [{ u: 0, p: new Vec2(0, 0) }, { u: 0.2, p: new Vec2(0, 0) }, { u: 1, p: new Vec2(1, 0) }],
                1e-6,
            ).length,
        ).toBe(2)

        expect(engine.maxChordDeviationAtFractions(
            {
                pointAt: (u: number) => new Vec2(u, u * (1 - u)),
            } as unknown as Curve2,
            0,
            1,
            new Vec2(0, 0),
            new Vec2(1, 0),
            [0.2, 0.5, 0.8],
        )).toBeGreaterThan(0)
    })

    it('covers build helpers directly', () => {
        const line = new Line2(new Vec2(0, 0), new Vec2(2, 0))
        const init = engine.buildInitialEllipseSegments(line, 2)
        expect(init.length).toBe(2)

        const bspline = new BSpline2({
            controlPoints: [new Vec2(0, 0), new Vec2(1, 1), new Vec2(2, 0), new Vec2(3, 1), new Vec2(4, 0)],
            degree: 2,
            knots: [0, 0.5, 1],
            multiplicities: [3, 2, 3],
        })
        const bInit = engine.buildInitialBSplineSegments(bspline)
        expect(bInit.length).toBeGreaterThan(0)

        const skippedTiny = engine.buildInitialBSplineSegments({
            getRange: () => new Interval(0, 1),
            getContinuityBreakParams: () => [0.5, 0.5 + Precision.CURVE_PARAM_EPS / 2],
            pointAt: (u: number) => new Vec2(u, 0),
        } as unknown as BSpline2)
        expect(skippedTiny.length).toBe(2)

        const builtOpen = engine.buildCircleLikeSamples(new Arc2(new Vec2(0, 0), 1, 0, Math.PI / 2, false), 4, false)
        const builtClosed = engine.buildCircleLikeSamples(new Circle2(new Vec2(0, 0), 1), 4, true)
        expect(builtOpen.length).toBe(5)
        expect(builtClosed.length).toBe(4)
    })

    it('uses Curve2.discretize entry', () => {
        const pts = new Line2(new Vec2(0, 0), new Vec2(1, 0)).discretize()
        expect(pts.length).toBe(2)
    })
})
