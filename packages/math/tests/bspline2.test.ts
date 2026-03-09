import { describe, expect, it } from 'vitest'

import { BSpline2 } from '../src/curves/bspline2'
import { DiscretizeOptions } from '../src/discretize/discretize_options'
import { Interval } from '../src/curves/interval'
import { PeriodInterval } from '../src/curves/period_interval'
import { Mat3 } from '../src/core/mat3'
import { Vec2 } from '../src/core/vec2'
import { Precision } from '../src/utils/precision'

describe('BSpline2', () => {
    const cps = [new Vec2(0, 0), new Vec2(1, 0), new Vec2(2, 0)]
    const degree = 2
    const knots: [number, number, ...number[]] = [0, 1]
    const multiplicities: [number, number, ...number[]] = [3, 3]

    it('constructs from expanded knots and evaluates curve', () => {
        const c = new BSpline2({ controlPoints: cps, degree, knots, multiplicities })
        expect(c.getRange().equals(new Interval(0, 1))).toBe(true)
        expect(c.pointAt(0).equals(new Vec2(0, 0), 1e-9)).toBe(true)
        expect(c.pointAt(1).equals(new Vec2(2, 0), 1e-9)).toBe(true)
        expect(c.pointAt(0.5).equals(new Vec2(1, 0), 1e-9)).toBe(true)
    })

    it('supports compact knot input and mismatch checks', () => {
        const c = new BSpline2({
            controlPoints: cps,
            degree,
            knots: [0, 1],
            multiplicities: [3, 3],
        })
        expect(c.pointAt(0.5).equals(new Vec2(1, 0), 1e-9)).toBe(true)

        expect(() => new BSpline2({
            controlPoints: cps,
            degree,
            knots: [0, 1],
            multiplicities: [2, 4],
        })).toThrow('BSpline2: invalid parameter domain')
    })

    it('enforces weight and base constraints', () => {
        expect(() => new BSpline2({ controlPoints: cps, degree, knots, multiplicities, weights: [1, -1, 1] })).toThrow('BSpline2: weight must be > 0')
        expect(() => new BSpline2({ controlPoints: cps, degree: 0, knots, multiplicities })).toThrow('BSpline2: degree must be an integer >= 1')
        expect(() => new BSpline2({ controlPoints: [new Vec2(0, 0), new Vec2(1, 1)], degree, knots, multiplicities })).toThrow('BSpline2: controlPoints.length must be >= degree + 1')
        expect(() => new BSpline2({ controlPoints: cps, degree, knots: [0, 1], multiplicities: [3] })).toThrow('BSpline2: knots and multiplicities length mismatch')
        expect(() => new BSpline2({ controlPoints: cps, degree, knots: [0, 1], multiplicities: [2, 4] })).toThrow('BSpline2: invalid parameter domain')
        expect(() => new BSpline2({ controlPoints: cps, degree, knots: [0, 1, Number.NaN, 1], multiplicities: [3, 1, 1, 1] })).toThrow('BSpline2: knot must be finite')
        expect(() => new BSpline2({ controlPoints: cps, degree, knots: [0, 1, 0.5, 1], multiplicities: [3, 1, 1, 1] })).toThrow('BSpline2: knots must be non-decreasing')
        expect(() => new BSpline2({ controlPoints: cps, degree, knots: [0, 1], multiplicities: [3, 0] })).toThrow('BSpline2: multiplicity must be positive integer')
    })

    it('supports periodic eval normalization and periodic validation', () => {
        const periodic = new BSpline2({ controlPoints: cps, degree, knots, multiplicities, isPeriodic: true })
        expect(periodic.isPeriodic).toBe(true)
        expect(periodic.isClosed()).toBe(true)
        expect(periodic.getDomain().equals(new PeriodInterval(0, 1, 1))).toBe(true)
        expect(periodic.pointAt(0.2).equals(periodic.pointAt(1.2), 1e-9)).toBe(true)
        expect(periodic.getTangentAt(0.2).equals(periodic.getTangentAt(1.2), 1e-9)).toBe(true)
        expect(periodic.pointAt(1).equals(periodic.pointAt(0), 1e-9)).toBe(true)
        expect(periodic.split(1.2)).toEqual([])
        expect(() => periodic.getLength(new Interval(0, 1.2))).toThrow('Interval.assertContainsRange: range out of bounds')
        expect(() => periodic.trim(new Interval(0, 1.2))).toThrow('Interval.assertContainsRange: range out of bounds')

        expect(() => new BSpline2({
            controlPoints: cps,
            degree,
            knots: [0, 1, 2],
            multiplicities: [3, 1, 2],
            isPeriodic: true,
        })).toThrow('BSpline2: invalid periodic input')
    })

    it('derivatives contract and high-order zeros', () => {
        const c = new BSpline2({ controlPoints: cps, degree, knots, multiplicities })
        expect(c.getDomain().equals(c.getRange())).toBe(true)
        const d = c.getDerivatives(0.5, 5)
        expect(d.length).toBe(6)
        expect(d[3].equals(Vec2.zero(), 1e-12)).toBe(true)
        expect(d[4].equals(Vec2.zero(), 1e-12)).toBe(true)
        expect(d[5].equals(Vec2.zero(), 1e-12)).toBe(true)
        expect(c.curvatureAt(0.5)).toBeCloseTo(0, 12)
    })

    it('getLength/paramAtLength/split/trim', () => {
        const c = new BSpline2({ controlPoints: cps, degree, knots, multiplicities })
        expect(c.getLength()).toBeCloseTo(2, 6)
        expect(c.getLength(new Interval(0.25, 0.5))).toBeCloseTo(0.5, 5)
        expect(c.lengthAtParam(0.5)).toBeCloseTo(1, 6)
        expect(c.paramAtLength(1)).toBeCloseTo(0.5, 6)
        expect(c.paramAtLength(0, 1e-8)).toBeCloseTo(0, 10)
        expect(c.paramAtLength(c.getLength(), 1e-8)).toBeCloseTo(1, 10)
        expect(() => c.paramAtLength(1, 0)).toThrow('BSpline2.paramAtLength: tol must be > 0')

        const nonlinear = new BSpline2({
            controlPoints: [new Vec2(0, 0), new Vec2(1, 2), new Vec2(2, -1), new Vec2(3, 1)],
            degree: 2,
            knots: [0, 1, 2], multiplicities: [3, 1, 3],
        })
        // 非线性曲线确保 paramAtLength 不会在首轮直接命中，覆盖 slope 回调路径。
        expect(nonlinear.paramAtLength(nonlinear.getLength() * 0.37)).toBeGreaterThan(0)

        const s = c.split(0.5)
        expect(s.length).toBe(2)
        expect(s[0].pointAt(s[0].getEndParam()).equals(new Vec2(1, 0), 1e-6)).toBe(true)
        expect(s[1].pointAt(s[1].getStartParam()).equals(new Vec2(1, 0), 1e-6)).toBe(true)
        expect(c.split(0)).toEqual([])

        const t = c.trim(new Interval(0.25, 0.75))
        expect(t.length).toBe(1)
        expect(t[0].getStartParam()).toBeGreaterThanOrEqual(0.25 - 1e-9)
        expect(c.trim(new Interval(0.2, 0.2))).toEqual([])
        expect(c.trim(new Interval(c.getStartParam(), 0.8)).length).toBe(1)
        expect(c.trim(new Interval(0.2, c.getEndParam())).length).toBe(1)
        const tiny = new BSpline2({
            controlPoints: [new Vec2(0, 0), new Vec2(5e-13, 0), new Vec2(1e-12, 0)],
            degree: 2,
            knots: [0, 1], multiplicities: [3, 3],
        })
        expect(tiny.trim(tiny.getRange())).toEqual([])
    })

    it('closestPoint, reverse, transform and dump/load', () => {
        const c = new BSpline2({ controlPoints: cps, degree, knots, multiplicities })
        const cp = c.closestPoint(new Vec2(1.1, 2))
        expect(cp.point.y).toBeCloseTo(0, 6)
        expect(c.getParamAt(new Vec2(1.1, 2))).toBeCloseTo(0.55, 2)
        expect(c.getParamAt(new Vec2(1, 0))).toBeCloseTo(0.5, 2)
        expect(c.containsProjectedPt(new Vec2(1, 0))).toBe(true)
        expect(c.containsProjectedPt(new Vec2(-10, 0))).toBe(true)
        expect(c.getProjectedPtBy(c.getPtAt(0.5)).equals(c.getPtAt(0.5), 1e-9)).toBe(true)
        expect(c.getProjectedPtBy(new Vec2(1.1, 2)).equals(c.getPtAt(c.getParamAt(new Vec2(1.1, 2))), 1e-9)).toBe(true)
        expect(c.containsPt(c.getPtAt(0.5))).toBe(true)
        expect(c.containsPt(new Vec2(-10, 10))).toBe(false)
        expect(() => c.closestPoint(new Vec2(0, 0), 0)).toThrow('BSpline2.closestPoint: tol must be > 0')

        const rev = c.clone().reverse()
        expect(rev.pointAt(rev.getStartParam()).equals(c.pointAt(c.getEndParam()), 1e-6)).toBe(true)

        const moved = c.transformed(Mat3.translation(1, 2))
        expect(moved.pointAt(0).equals(new Vec2(1, 2), 1e-6)).toBe(true)
        expect(() => c.transform(new Mat3(1, 0, Number.POSITIVE_INFINITY, 0, 1, 0, 0, 0, 1))).toThrow('BSpline2: control point must be finite')
        expect(c.getBBox().isFinite()).toBe(true)

        const restored = BSpline2.load(c.dump())
        expect(restored.pointAt(0.3).equals(c.pointAt(0.3), 1e-6)).toBe(true)
        expect(restored.equals(c)).toBe(true)
        const changed = new BSpline2({ controlPoints: cps, degree, knots, multiplicities, weights: [1, 2, 1] })
        expect(c.equals(changed)).toBe(false)

        const changedDegree = new BSpline2({
            controlPoints: [new Vec2(0, 0), new Vec2(1, 0), new Vec2(2, 0), new Vec2(3, 0)],
            degree: 3,
            knots: [0, 1], multiplicities: [4, 4],
        })
        expect(c.equals(changedDegree as unknown as BSpline2)).toBe(false)
        const changedCpCount = new BSpline2({
            controlPoints: [new Vec2(0, 0), new Vec2(1, 0), new Vec2(2, 0), new Vec2(3, 0)],
            degree: 2,
            knots: [0, 1, 2], multiplicities: [3, 1, 3],
        })
        expect(c.equals(changedCpCount as unknown as BSpline2)).toBe(false)
        const changedWeightCount = c.clone()
        ;(changedWeightCount as unknown as { _weights: Array<number> })._weights = [1, 1]
        expect(c.equals(changedWeightCount)).toBe(false)
        const changedKnotCount = c.clone()
        ;(changedKnotCount as unknown as { _knots: Array<number> })._knots = [0, 0, 1]
        expect(c.equals(changedKnotCount)).toBe(false)
        const changedControlPoint = c.clone()
        ;(changedControlPoint as unknown as { _controlPoints: Vec2[] })._controlPoints = [...(changedControlPoint as unknown as { _controlPoints: Vec2[] })._controlPoints]
        ;(changedControlPoint as unknown as { _controlPoints: Vec2[] })._controlPoints[0] = new Vec2(999, 0)
        expect(c.equals(changedControlPoint)).toBe(false)
    })

    it('covers remaining algorithm branches and validity guards', () => {
        const nonlinear = new BSpline2({
            controlPoints: [
                new Vec2(0, 0),
                new Vec2(1, 2),
                new Vec2(2, -1),
                new Vec2(3, 2),
                new Vec2(4, 0),
                new Vec2(5, 1),
            ],
            degree: 3,
            knots: [0, 1, 2, 3], multiplicities: [4, 1, 1, 4],
        })

        const p = nonlinear.pointAt(1.7)
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
        expect(nonlinear.getLength()).toBeGreaterThan(0)
        const depthLimited = (nonlinear as unknown as { integrateLength: (u0: number, u1: number, depth: number) => number })
            .integrateLength(0, 1, Precision.CURVE_INTEGRAL_MAX_DEPTH)
        expect(depthLimited).toBeGreaterThan(0)
        const reverseIntegral = (nonlinear as unknown as { integrateLength: (u0: number, u1: number, depth: number) => number })
            .integrateLength(1, 0, 0)
        expect(reverseIntegral).toBe(0)
        expect(nonlinear.controlPoints[0].equals(new Vec2(0, 0))).toBe(true)
        expect(nonlinear.degree).toBe(3)
        expect(nonlinear.expandedKnots.length).toBe(10)
        expect(nonlinear.weights.length).toBe(6)

        const oldIter = Precision.CURVE_MAX_ITER
        Precision.CURVE_MAX_ITER = 0
        expect(() => nonlinear.paramAtLength(0.1)).toThrow('BSpline2.paramAtLength: failed to converge')
        expect(() => nonlinear.closestPoint(new Vec2(3, 0))).toThrow('BSpline2.closestPoint: failed to converge')
        Precision.CURVE_MAX_ITER = oldIter

        const periodic = new BSpline2({ controlPoints: cps, degree, knots, multiplicities, isPeriodic: true })
        expect(periodic.getParamAt(new Vec2(10, 0))).toBeGreaterThanOrEqual(periodic.getStartParam())
        expect(periodic.getParamAt(new Vec2(10, 0))).toBeLessThanOrEqual(periodic.getEndParam())

        const invalidDegree = nonlinear as unknown as { _degree: number }
        invalidDegree._degree = 0
        expect(nonlinear.isValid()).toBe(false)
        invalidDegree._degree = 3

        const invalidWeights = nonlinear as unknown as { _weights: Array<number> }
        invalidWeights._weights = [1]
        expect(nonlinear.isValid()).toBe(false)

        invalidWeights._weights = Array<number>(6).fill(1)
        const invalidKnots = nonlinear as unknown as { _knots: Array<number> }
        invalidKnots._knots = [0, 0, 0]
        expect(nonlinear.isValid()).toBe(false)

        const invalidCP = nonlinear as unknown as { _controlPoints: Vec2[] }
        invalidCP._controlPoints = [new Vec2(0, 0)]
        expect(nonlinear.isValid()).toBe(false)
        invalidCP._controlPoints = [
            new Vec2(0, 0),
            new Vec2(1, 2),
            new Vec2(2, -1),
            new Vec2(3, 2),
            new Vec2(4, 0),
            new Vec2(5, 1),
        ]

        invalidKnots._knots = [0, 0, 0, 0, 1, 2, 3, 3, 3, 3]
        invalidWeights._weights = [1, 1, 1, 1, 1, 0]
        expect(nonlinear.isValid()).toBe(false)

        invalidWeights._weights = Array<number>(6).fill(1)
        invalidKnots._knots = [0, 0, 0, 0, 2, 1, 3, 3, 3, 3]
        expect(nonlinear.isValid()).toBe(false)

        invalidKnots._knots = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        expect(nonlinear.isValid()).toBe(false)
        invalidKnots._knots = [0, 0, 0, 0, 1, 2, 3, 3, 3, 3]

        const other = nonlinear.clone()
        ;(other as unknown as { _weights: Array<number> })._weights = [...(other as unknown as { _weights: Array<number> })._weights]
        ;(other as unknown as { _weights: Array<number> })._weights[0] += 0.1
        expect(nonlinear.equals(other)).toBe(false)
        ;(other as unknown as { _weights: Array<number> })._weights[0] = 1
        ;(other as unknown as { _knots: Array<number> })._knots = [...(other as unknown as { _knots: Array<number> })._knots]
        ;(other as unknown as { _knots: Array<number> })._knots[0] += 0.1
        expect(nonlinear.equals(other)).toBe(false)

        const privateApi = BSpline2 as unknown as {
            insertKnotOnce: (points: { x: number; y: number; w: number }[], knots: Array<number>, degree: number, u: number) => unknown
            basisFunctionDerivatives: (span: number, u: number, p: number, n: number, U: ReadonlyArray<number>) => Array<Array<number>>
        }
        privateApi.insertKnotOnce(
            [{ x: 0, y: 0, w: 1 }, { x: 1, y: 0, w: 1 }, { x: 2, y: 0, w: 1 }],
            [0, 0, 0, 0, 1, 1],
            2,
            0.5,
        )
        const ders = privateApi.basisFunctionDerivatives(2, 0, 2, 2, [0, 0, 0, 0, 1, 1, 1])
        expect(ders.length).toBe(3)

        expect((BSpline2 as unknown as { binomial: (n: number, k: number) => number }).binomial(2, 3)).toBe(0)
        expect((BSpline2 as unknown as { binomial: (n: number, k: number) => number }).binomial(6, 4)).toBe(15)
    })

    it('getBBox supports fast and accurate modes with tighter result', () => {
        const c = new BSpline2({
            controlPoints: [
                new Vec2(0, 0),
                new Vec2(1, 6),
                new Vec2(2, -5),
                new Vec2(3, 8),
                new Vec2(4, -4),
                new Vec2(5, 1),
            ],
            degree: 3,
            knots: [0, 1, 2, 3], multiplicities: [4, 1, 1, 4],
        })

        const fastBox = c.getBBox()
        const tightBox = c.getBBox(true)

        // Fast mode should remain control-point-safe.
        for (const cp of c.controlPoints) {
            expect(fastBox.containsPoint(cp)).toBe(true)
        }

        // Accurate mode should contain dense discretized samples.
        const samples = c.discretize(DiscretizeOptions.ultra)
        for (const p of samples) {
            expect(tightBox.containsPoint(p)).toBe(true)
        }
        expect(tightBox.containsPoint(c.pointAt(c.getStartParam()))).toBe(true)
        expect(tightBox.containsPoint(c.pointAt(c.getEndParam()))).toBe(true)

        const fastArea = fastBox.width() * fastBox.height()
        const tightArea = tightBox.width() * tightBox.height()
        expect(tightArea).toBeLessThanOrEqual(fastArea + 1e-9)

        // Reverse should preserve accurate bbox.
        const reversed = c.clone().reverse()
        expect(reversed.getBBox(true).equals(tightBox, 1e-6)).toBe(true)
    })
})


