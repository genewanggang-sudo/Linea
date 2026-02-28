import { describe, expect, it } from 'vitest'

import { Box2 } from '../src/core/box2'
import { Mat3 } from '../src/core/mat3'
import { Vec2 } from '../src/core/vec2'
import { EN_GEO_TYPE } from '../src/constants/geom_type'
import { Curve2 } from '../src/curves/curve2'
import { Interval } from '../src/curves/interval'
import { Precision } from '../src/utils/precision'
import type { IDB } from '../src/serialize/dump_types'

class MockCurve2 extends Curve2 {
    constructor() {
        super()
        this.setRange(new Interval(0, 1))
    }

    public override pointAt(u: number) {
        return new Vec2(u, 0)
    }

    public override tangentAt(u: number) {
        void u
        return new Vec2(1, 0)
    }

    public override derivatives(u: number, n: number) {
        const ret = [this.pointAt(u)]
        for (let i = 1; i <= n; i++) {
            ret.push(new Vec2(i, 0))
        }
        return ret
    }

    public override curvatureAt(u: number) {
        void u
        return 0
    }

    public override length(range?: Interval) {
        void range
        return 1
    }

    public override lengthAtParam(u: number) {
        return u
    }

    public override paramAtLength(s: number) {
        return s
    }

    public override split(u: number) {
        void u
        return []
    }

    public override trim(range: Interval) {
        void range
        return [this.clone()]
    }

    public override reverse() {
        return this
    }

    public override transform(m: Mat3) {
        void m
        return this
    }

    public override transformed(m: Mat3) {
        void m
        return this.clone()
    }

    public override closestPoint(p: Vec2) {
        const point = new Vec2(p.x, 0)
        return { point, param: p.x, distance: Math.abs(p.y) }
    }

    public override boundingBox() {
        return new Box2(new Vec2(0, 0), new Vec2(1, 0))
    }

    public override isValid() {
        return true
    }

    public override clone() {
        return new MockCurve2()
    }

    public override dump(): IDB {
        return { type: EN_GEO_TYPE.Vec2 }
    }

    public setRangeForTest(range: Interval) {
        this.setRange(range)
    }

    public solveParamByHybridNewtonForTest(
        target: number,
        start: number,
        end: number,
        tol: number,
        evalValue: (u: number) => number,
        evalSlope: (u: number) => number,
        failMessage: string,
        initialGuess?: number,
    ) {
        return this.solveParamByHybridNewton(target, start, end, tol, evalValue, evalSlope, failMessage, initialGuess)
    }

    public solveClosestPointBySampleNewtonForTest(
        p: Vec2,
        tol: number,
        sampleCount: number,
        evalPoint: (u: number) => Vec2,
        evalD1: (u: number) => Vec2,
        evalD2: (u: number) => Vec2,
        failMessage: string,
        compareParam?: (a: number, b: number) => number,
    ) {
        if (compareParam) {
            return this.solveClosestPointBySampleNewton(p, tol, sampleCount, evalPoint, evalD1, evalD2, failMessage, compareParam)
        }
        return this.solveClosestPointBySampleNewton(p, tol, sampleCount, evalPoint, evalD1, evalD2, failMessage)
    }
}

describe('Curve2 base methods', () => {
    it('stores param range in base class', () => {
        const c = new MockCurve2()
        const r = c.getRange()
        expect(r.equals(new Interval(0, 1))).toBe(true)
        expect(r).not.toBe(c.getRange())
    })

    it('getRange returns defensive copy', () => {
        const c = new MockCurve2()
        const r = c.getRange()
        r.expand(1)

        const current = c.getRange()
        expect(current.equals(new Interval(0, 1))).toBe(true)
    })

    it('setRange stores a defensive copy', () => {
        const c = new MockCurve2()
        const src = new Interval(2, 3)
        c.setRangeForTest(src)
        src.expand(1)
        expect(c.getRange().equals(new Interval(2, 3))).toBe(true)
    })

    it('containsParam checks param-domain membership with eps', () => {
        const c = new MockCurve2()
        expect(c.containsParam(0)).toBe(true)
        expect(c.containsParam(1)).toBe(true)
        expect(c.containsParam(-1)).toBe(false)
        expect(c.containsParam(1 + Precision.CURVE_PARAM_EPS * 0.5)).toBe(true)
    })

    it('derivativeAt derives from derivatives', () => {
        const c = new MockCurve2()
        const d2 = c.derivativeAt(0.3, 2)
        expect(d2.equals(new Vec2(2, 0))).toBe(true)
    })

    it('closestParam and distanceToPoint derive from closestPoint', () => {
        const c = new MockCurve2()
        const p = new Vec2(0.4, 3)
        expect(c.closestParam(p)).toBeCloseTo(0.4, 12)
        expect(c.distanceToPoint(p)).toBeCloseTo(3, 12)
    })

    it('derivativeAt validates order', () => {
        const c = new MockCurve2()
        expect(() => c.derivativeAt(0, -1)).toThrow()
    })

    it('solveParamByHybridNewton validates input and fallback branches', () => {
        const c = new MockCurve2()
        expect(() => c.solveParamByHybridNewtonForTest(1, 1, 1, 1e-6, (u) => u, () => 1, 'x')).toThrow('Curve2.solveParamByHybridNewton: invalid range')
        expect(() => c.solveParamByHybridNewtonForTest(1, 0, 1, 0, (u) => u, () => 1, 'x')).toThrow('Curve2.solveParamByHybridNewton: tol must be > 0')

        // 初值越界 + slope=0 触发二分回退
        const u = c.solveParamByHybridNewtonForTest(0.7, 0, 1, 1e-9, (x) => x, () => 1e-12, 'x', 0.9)
        expect(u).toBeCloseTo(0.7, 6)
        const u2 = c.solveParamByHybridNewtonForTest(0.3, 0, 1, 1e-9, (x) => x, () => 1, 'x', Number.POSITIVE_INFINITY)
        expect(u2).toBeCloseTo(0.3, 6)

        const oldIter = Precision.CURVE_MAX_ITER
        Precision.CURVE_MAX_ITER = 0
        expect(() => c.solveParamByHybridNewtonForTest(0.3, 0, 1, 1e-9, (x) => x, () => 1, 'hybrid fail')).toThrow('hybrid fail')
        Precision.CURVE_MAX_ITER = oldIter
    })

    it('solveClosestPointBySampleNewton validates and supports zero-span/tie-break/fail branches', () => {
        const c = new MockCurve2()
        expect(() => c.solveClosestPointBySampleNewtonForTest(
            new Vec2(0, 0),
            0,
            8,
            (u) => new Vec2(u, 0),
            () => new Vec2(1, 0),
            () => Vec2.zero(),
            'x',
        )).toThrow('Curve2.solveClosestPointBySampleNewton: tol must be > 0')

        expect(() => c.solveClosestPointBySampleNewtonForTest(
            new Vec2(0, 0),
            1e-6,
            0,
            (u) => new Vec2(u, 0),
            () => new Vec2(1, 0),
            () => Vec2.zero(),
            'x',
        )).toThrow('Curve2.solveClosestPointBySampleNewton: sampleCount must be a positive integer')

        c.setRangeForTest(new Interval(1, 1))
        const z = c.solveClosestPointBySampleNewtonForTest(
            new Vec2(0, 3),
            1e-6,
            8,
            (u) => new Vec2(u, 0),
            () => new Vec2(1, 0),
            () => Vec2.zero(),
            'x',
        )
        expect(z.param).toBe(1)

        c.setRangeForTest(new Interval(0, 1))
        const tie = c.solveClosestPointBySampleNewtonForTest(
            new Vec2(0.5, 1),
            2, // 放大容差触发 compareParam
            8,
            (u) => new Vec2(u, 0),
            () => new Vec2(0, 0), // fp=0，触发二分回退
            () => Vec2.zero(),
            'x',
        )
        expect(tie.param).toBeGreaterThanOrEqual(0)

        expect(() => c.solveClosestPointBySampleNewtonForTest(
            new Vec2(0, 0),
            1,
            2,
            () => new Vec2(1, 1),
            (u) => new Vec2(0, 1 + u),
            () => new Vec2(0, -1),
            'x',
            () => -1,
        )).toThrow('x')

        const oldIterForFp = Precision.CURVE_MAX_ITER
        try {
            Precision.CURVE_MAX_ITER = 3
            expect(() => c.solveClosestPointBySampleNewtonForTest(
                new Vec2(0, 0),
                1e-9,
                8,
                () => new Vec2(1, 1),
                () => new Vec2(1, 0),
                () => new Vec2(0, -1), // fp = d1·d1 + cp·d2 = 1 + (-1) = 0，覆盖 Newton 斜率退化分支
                'fp zero fail',
            )).toThrow('fp zero fail')
        } finally {
            Precision.CURVE_MAX_ITER = oldIterForFp
        }

        const oldIter = Precision.CURVE_MAX_ITER
        Precision.CURVE_MAX_ITER = 0
        expect(() => c.solveClosestPointBySampleNewtonForTest(
            new Vec2(0.2, 0.3),
            1e-12,
            8,
            (u) => new Vec2(u, 1),
            () => new Vec2(1, 0),
            () => Vec2.zero(),
            'closest fail',
        )).toThrow('closest fail')
        Precision.CURVE_MAX_ITER = oldIter
    })
})
