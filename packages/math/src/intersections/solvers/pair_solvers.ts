import { Vec2 } from '../../core/vec2'
import type { Arc2 } from '../../curves/arc2'
import type { BSpline2 } from '../../curves/bspline2'
import type { Circle2 } from '../../curves/circle2'
import type { Curve2 } from '../../curves/curve2'
import type { Ellipse2 } from '../../curves/ellipse2'
import type { EllipseArc2 } from '../../curves/ellipse_arc2'
import type { Line2 } from '../../curves/line2'
import { Interval } from '../../curves/interval'
import { MathError } from '../../utils/math_error'
import { Precision } from '../../utils/precision'
import type { ICurvePairIntersector } from '../intersector'
import { collectIntervalClipSeeds } from '../internal/interval_clipping'
import { curvePointTolerance } from '../internal/tolerance'
import type { CurveXInfo } from '../types'
import { LineLinePairSolver } from './line_line_pair_solver'
import { PolylinePairIntersector } from './polyline_pair_intersector'

type LineParamPoint = {
    point: Vec2
    uLine: number
}

function solveQuadratic(a: number, b: number, c: number) {
    const eps = Precision.CURVE_NEWTON_EPS
    if (Math.abs(a) <= eps) {
        if (Math.abs(b) <= eps) return []
        return [-c / b]
    }

    const disc = b * b - 4 * a * c
    if (disc < -eps) return []
    if (Math.abs(disc) <= eps) return [-b / (2 * a)]

    const sqrtDisc = Math.sqrt(Math.max(0, disc))
    const q = -0.5 * (b + Math.sign(b || 1) * sqrtDisc)
    const r1 = q / a
    const r2 = c / q
    return r1 <= r2 ? [r1, r2] : [r2, r1]
}

function assertLine(curve: Curve2): Line2 {
    MathError.assert(curve.isLine(), `Expected Line2, got ${curve.getType()}`)
    return curve
}

function assertCircle(curve: Curve2): Circle2 {
    MathError.assert(curve.isCircle(), `Expected Circle2, got ${curve.getType()}`)
    return curve
}

function assertArc(curve: Curve2): Arc2 {
    MathError.assert(curve.isArc(), `Expected Arc2, got ${curve.getType()}`)
    return curve
}

function assertEllipse(curve: Curve2): Ellipse2 {
    MathError.assert(curve.isEllipse(), `Expected Ellipse2, got ${curve.getType()}`)
    return curve
}

function assertEllipseArc(curve: Curve2): EllipseArc2 {
    MathError.assert(curve.isEllipseArc(), `Expected EllipseArc2, got ${curve.getType()}`)
    return curve
}

function assertBSpline(curve: Curve2): BSpline2 {
    MathError.assert(curve.isBSpline(), `Expected BSpline2, got ${curve.getType()}`)
    return curve
}

function tryParamOnCurve(curve: Curve2, point: Vec2) {
    const tol = curvePointTolerance(curve)
    const cp = safeClosestPoint(curve, point, tol)
    if (!cp) return undefined
    if (cp.distance > tol * 16) return undefined
    return curve.getRange().clamp(cp.param)
}

function safeClosestPoint(curve: Curve2, point: Vec2, tol: number) {
    try {
        return curve.closestPoint(point, tol)
    } catch {
        PolylinePairIntersector.recordAnalyticClosestFallback()
        return sampleClosestPoint(curve, point, 64)
    }
}

function sampleClosestPoint(curve: Curve2, point: Vec2, sampleCount: number) {
    const range = curve.getRange()
    let bestParam = range.start
    let bestPoint = curve.pointAt(bestParam)
    let bestDist = bestPoint.distanceTo(point)
    const total = Math.max(8, sampleCount)
    for (let i = 1; i <= total; i++) {
        const t = i / total
        const u = range.start + (range.end - range.start) * t
        const q = curve.pointAt(u)
        const d = q.distanceTo(point)
        if (d < bestDist) {
            bestDist = d
            bestParam = u
            bestPoint = q
        }
    }

    // Local Newton refinement around the best sampled parameter.
    let u = bestParam
    for (let i = 0; i < 12; i++) {
        const p = curve.pointAt(u)
        const d1 = curve.derivativeAt(u, 1)
        const d2 = curve.derivativeAt(u, 2)
        const cp = p.subtracted(point)
        const f = cp.dot(d1)
        const fp = d1.dot(d1) + cp.dot(d2)
        if (!Number.isFinite(f) || !Number.isFinite(fp) || Math.abs(fp) <= Precision.CURVE_NEWTON_EPS) break
        const next = range.clamp(u - f / fp)
        if (Math.abs(next - u) <= Precision.CURVE_PARAM_EPS * 4) {
            u = next
            break
        }
        u = next
    }
    bestParam = u
    bestPoint = curve.pointAt(bestParam)
    bestDist = bestPoint.distanceTo(point)

    return {
        point: bestPoint,
        param: bestParam,
        distance: bestDist,
    }
}

function tryBuildPointInfo(c1: Curve2, c2: Curve2, point: Vec2): CurveXInfo | undefined {
    const u1 = tryParamOnCurve(c1, point)
    const u2 = tryParamOnCurve(c2, point)
    if (u1 === undefined || u2 === undefined) return undefined
    return {
        point,
        u1,
        u2,
        isOverlap: false,
    }
}

function pushUniqueResult(items: CurveXInfo[], candidate: CurveXInfo | undefined) {
    if (!candidate) return
    for (const item of items) {
        if (
            Math.abs(item.u1 - candidate.u1) <= Precision.CURVE_PARAM_EPS * 8 &&
            Math.abs(item.u2 - candidate.u2) <= Precision.CURVE_PARAM_EPS * 8 &&
            item.isOverlap === candidate.isOverlap
        ) {
            return
        }
    }
    items.push(candidate)
}

function collectUniqueResults(candidates: CurveXInfo[]) {
    const out: CurveXInfo[] = []
    for (const hit of candidates) {
        pushUniqueResult(out, hit)
    }
    return out
}

function lineCircleParamIntersections(line: Line2, center: Vec2, radius: number): LineParamPoint[] {
    const p0 = line.start
    const p1 = line.end
    const v = p1.subtracted(p0)
    const len = v.len()
    if (len <= Precision.CURVE_LENGTH_EPS) return []

    const d = v.scaled(1 / len)
    const f = p0.subtracted(center)
    const b = 2 * d.dot(f)
    const c = f.lenSq() - radius * radius
    const roots = solveQuadratic(1, b, c)
    const ret: LineParamPoint[] = []

    for (const s of roots) {
        if (s < -Precision.CURVE_LENGTH_EPS || s > len + Precision.CURVE_LENGTH_EPS) continue
        const uLine = Math.min(len, Math.max(0, s))
        const point = p0.added(d.scaled(uLine))
        ret.push({ point, uLine })
    }

    return ret
}

function lineEllipseParamIntersections(line: Line2, ellipse: Ellipse2 | EllipseArc2): LineParamPoint[] {
    const p0 = line.start
    const p1 = line.end
    const v = p1.subtracted(p0)
    const len = v.len()
    if (len <= Precision.CURVE_LENGTH_EPS) return []

    const d = v.scaled(1 / len)
    const c = Math.cos(ellipse.rotation)
    const s = Math.sin(ellipse.rotation)

    const rel0 = p0.subtracted(ellipse.center)
    const x0 = c * rel0.x + s * rel0.y
    const y0 = -s * rel0.x + c * rel0.y
    const dx = c * d.x + s * d.y
    const dy = -s * d.x + c * d.y

    const invRx2 = 1 / (ellipse.rx * ellipse.rx)
    const invRy2 = 1 / (ellipse.ry * ellipse.ry)

    const a = dx * dx * invRx2 + dy * dy * invRy2
    const b = 2 * (x0 * dx * invRx2 + y0 * dy * invRy2)
    const cc = x0 * x0 * invRx2 + y0 * y0 * invRy2 - 1
    const roots = solveQuadratic(a, b, cc)

    const ret: LineParamPoint[] = []
    for (const sLine of roots) {
        if (sLine < -Precision.CURVE_LENGTH_EPS || sLine > len + Precision.CURVE_LENGTH_EPS) continue
        const uLine = Math.min(len, Math.max(0, sLine))
        const point = p0.added(d.scaled(uLine))
        ret.push({ point, uLine })
    }
    return ret
}

function clamp01(x: number) {
    return Math.max(0, Math.min(1, x))
}

function linePointDistance(line: Line2, point: Vec2) {
    const dir = line.tangentAt(line.getRange().start)
    const v = point.subtracted(line.start)
    return Math.abs(v.cross(dir))
}

function splitByBreaks(curve: BSpline2) {
    const range = curve.getRange()
    const breaks = [range.start, ...curve.getContinuityBreakParams(Precision.CURVE_PARAM_EPS), range.end]
    breaks.sort((a, b) => a - b)
    const ret: Array<{ u0: number; u1: number }> = []
    for (let i = 0; i < breaks.length - 1; i++) {
        const u0 = breaks[i]
        const u1 = breaks[i + 1]
        if (u1 - u0 <= Precision.CURVE_PARAM_EPS * 4) continue
        ret.push({ u0, u1 })
    }
    return ret
}

function solveLineBSplineRoots(line: Line2, bspline: BSpline2) {
    const lineStart = line.start
    const lineEnd = line.end
    const lineDir = lineEnd.subtracted(lineStart)
    const lineLen = lineDir.len()
    if (lineLen <= Precision.CURVE_LENGTH_EPS) return []
    const lineUnit = lineDir.scaled(1 / lineLen)

    // Signed distance to line support.
    const f = (u: number) => bspline.pointAt(u).subtracted(lineStart).cross(lineUnit)
    const df = (u: number) => bspline.derivativeAt(u, 1).cross(lineUnit)

    const pointTol = curvePointTolerance(bspline) * 4
    const paramTol = Precision.CURVE_PARAM_EPS * 32
    const roots: number[] = []
    const intervals = splitByBreaks(bspline)

    const tryPushRoot = (u: number) => {
        const uu = bspline.getRange().clamp(u)
        for (const r of roots) {
            if (Math.abs(r - uu) <= paramTol) return
        }
        roots.push(uu)
    }

    for (const seg of intervals) {
        const localSamples = 16
        let prevU = seg.u0
        let prevF = f(prevU)
        if (Math.abs(prevF) <= pointTol) tryPushRoot(prevU)

        for (let i = 1; i <= localSamples; i++) {
            const t = i / localSamples
            const curU = seg.u0 + (seg.u1 - seg.u0) * t
            const curF = f(curU)
            if (Math.abs(curF) <= pointTol) {
                tryPushRoot(curU)
                prevU = curU
                prevF = curF
                continue
            }
            if (prevF === 0 || curF === 0 || prevF * curF < 0) {
                let lo = prevU
                let hi = curU
                let u = 0.5 * (lo + hi)
                let fu = f(u)

                for (let it = 0; it < 24; it++) {
                    const slope = df(u)
                    let next = Number.NaN
                    if (Math.abs(slope) > Precision.CURVE_NEWTON_EPS) {
                        next = u - fu / slope
                    }
                    if (!Number.isFinite(next) || next <= lo || next >= hi) {
                        next = 0.5 * (lo + hi)
                    }
                    const fnext = f(next)
                    if (Math.abs(fnext) <= pointTol) {
                        u = next
                        fu = fnext
                        break
                    }
                    if (f(lo) * fnext <= 0) {
                        hi = next
                    } else {
                        lo = next
                    }
                    if (hi - lo <= paramTol) {
                        u = 0.5 * (lo + hi)
                        fu = f(u)
                        break
                    }
                    u = next
                    fu = fnext
                }
                if (Math.abs(fu) <= pointTol * 2) tryPushRoot(u)
            }
            prevU = curU
            prevF = curF
        }
    }

    roots.sort((a, b) => a - b)
    const hits: CurveXInfo[] = []
    for (const uSpline of roots) {
        const p = bspline.pointAt(uSpline)
        const uLine = p.subtracted(lineStart).dot(lineUnit)
        if (uLine < -pointTol || uLine > lineLen + pointTol) continue
        if (linePointDistance(line, p) > pointTol * 3) continue
        hits.push({
            point: p,
            u1: clamp01(uLine / lineLen) * lineLen,
            u2: uSpline,
            isOverlap: false,
        })
    }
    return hits
}

type ScalarRootOptions = {
    valueTol: number
    paramTol: number
    sampleCount: number
}

function solveScalarRootsOnInterval(
    f: (u: number) => number,
    df: (u: number) => number,
    u0: number,
    u1: number,
    options: ScalarRootOptions,
) {
    const roots: number[] = []
    const samples = Math.max(8, options.sampleCount)
    const du = (u1 - u0) / samples

    const pushRoot = (u: number) => {
        const uu = Math.max(u0, Math.min(u1, u))
        for (const r of roots) {
            if (Math.abs(r - uu) <= options.paramTol) return
        }
        roots.push(uu)
    }

    const refineBracket = (a0: number, b0: number, fn: (u: number) => number, dfn: (u: number) => number) => {
        let a = a0
        let b = b0
        let fa = fn(a)
        let fb = fn(b)
        let u = 0.5 * (a + b)
        let fu = fn(u)
        for (let it = 0; it < 32; it++) {
            if (Math.abs(fu) <= options.valueTol || (b - a) <= options.paramTol) return u
            const slope = dfn(u)
            let next = Number.NaN
            if (Number.isFinite(slope) && Math.abs(slope) > Precision.CURVE_NEWTON_EPS) {
                next = u - fu / slope
            }
            if (!Number.isFinite(next) || next <= a || next >= b) {
                next = 0.5 * (a + b)
            }
            const fnext = fn(next)
            if (fa === 0 || fnext === 0 || fa * fnext <= 0) {
                b = next
                fb = fnext
            } else {
                a = next
                fa = fnext
            }
            if (Math.abs(fa) < Math.abs(fb)) {
                u = a
                fu = fa
            } else {
                u = b
                fu = fb
            }
        }
        return u
    }

    let prevU = u0
    let prevF = f(prevU)
    let prevDf = df(prevU)
    if (Math.abs(prevF) <= options.valueTol) pushRoot(prevU)

    for (let i = 1; i <= samples; i++) {
        const curU = i === samples ? u1 : (u0 + du * i)
        const curF = f(curU)
        const curDf = df(curU)

        if (Math.abs(curF) <= options.valueTol) {
            pushRoot(curU)
        }
        if (prevF === 0 || curF === 0 || prevF * curF < 0) {
            pushRoot(refineBracket(prevU, curU, f, df))
        }

        // Handle tangency: derivative changes sign but f does not.
        if (prevDf === 0 || curDf === 0 || prevDf * curDf < 0) {
            const uCritical = refineBracket(prevU, curU, df, () => 0)
            if (Math.abs(f(uCritical)) <= options.valueTol * 2) {
                pushRoot(uCritical)
            }
        }

        prevU = curU
        prevF = curF
        prevDf = curDf
    }

    roots.sort((a, b) => a - b)
    return roots
}

type ImplicitIntervalProbe = {
    signChanges: number
    nearZeroCount: number
    sampleCount: number
}

function probeImplicitInterval(
    f: (u: number) => number,
    u0: number,
    u1: number,
    baseSampleCount: number,
    valueTol: number,
) : ImplicitIntervalProbe {
    const probes = 24
    let signChanges = 0
    let nearZeroCount = 0
    let prev = f(u0)
    for (let i = 1; i <= probes; i++) {
        const t = i / probes
        const u = u0 + (u1 - u0) * t
        const cur = f(u)
        if (Math.abs(cur) <= valueTol * 2) {
            nearZeroCount++
        }
        if (prev === 0 || cur === 0 || prev * cur < 0) {
            signChanges++
        }
        prev = cur
    }

    const suggested = baseSampleCount + signChanges * 24 + nearZeroCount * 6
    return {
        signChanges,
        nearZeroCount,
        sampleCount: Math.max(baseSampleCount, Math.min(320, suggested)),
    }
}

type ImplicitEval = {
    value: number
    grad: Vec2
}

function solveImplicitBSplineRoots(
    target: Curve2,
    bspline: BSpline2,
    implicit: (p: Vec2) => ImplicitEval,
    valueTolScale = 1,
) {
    const pointTol = Math.max(curvePointTolerance(target), curvePointTolerance(bspline))
    const paramTol = Precision.CURVE_PARAM_EPS * 32
    const valueTol = Math.max(pointTol * pointTol * 4, pointTol * valueTolScale * 4)
    const targetProjectTol = pointTol * 8
    const range = bspline.getRange()
    const intervals = splitByBreaks(bspline)
    if (intervals.length === 0) {
        intervals.push({ u0: range.start, u1: range.end })
    }

    const f = (u: number) => {
        const p = bspline.pointAt(u)
        return implicit(p).value
    }
    const df = (u: number) => {
        const p = bspline.pointAt(u)
        const d1 = bspline.derivativeAt(u, 1)
        const evalv = implicit(p)
        return evalv.grad.dot(d1)
    }

    const allRoots: number[] = []
    const pushRootUnique = (roots: number[], u: number) => {
        let duplicate = false
        for (const r of roots) {
            if (Math.abs(r - u) <= paramTol) {
                duplicate = true
                break
            }
        }
        if (!duplicate) roots.push(u)
    }

    for (const seg of intervals) {
        const probe = probeImplicitInterval(f, seg.u0, seg.u1, 96, valueTol)
        const roots = solveScalarRootsOnInterval(f, df, seg.u0, seg.u1, {
            valueTol,
            paramTol,
            sampleCount: probe.sampleCount,
        })
        for (const u of roots) pushRootUnique(allRoots, u)

        // Second pass for oscillatory / near-tangent intervals:
        // increase sampling density and merge extra roots.
        if (probe.signChanges >= 2 || probe.nearZeroCount >= 2) {
            const denseRoots = solveScalarRootsOnInterval(f, df, seg.u0, seg.u1, {
                valueTol,
                paramTol,
                sampleCount: Math.min(640, probe.sampleCount * 2),
            })
            for (const u of denseRoots) pushRootUnique(allRoots, u)
        }
    }

    // Global dense isolation for missed tangent / close multi-roots.
    const globalDenseRoots = isolateRootsByDenseSampling(
        f,
        df,
        range.start,
        range.end,
        valueTol,
        paramTol,
    )
    for (const u of globalDenseRoots) {
        pushRootUnique(allRoots, u)
    }
    allRoots.sort((a, b) => a - b)

    const out: CurveXInfo[] = []
    for (const uSpline of allRoots) {
        const p = bspline.pointAt(uSpline)
        const ev = implicit(p)
        if (Math.abs(ev.value) > valueTol * 4) continue
        const cpTarget = safeClosestPoint(target, p, targetProjectTol)
        if (!cpTarget || cpTarget.distance > targetProjectTol * 2) continue
        out.push({
            point: p,
            u1: target.getRange().clamp(cpTarget.param),
            u2: uSpline,
            isOverlap: false,
        })
    }
    return out
}

function isolateRootsByDenseSampling(
    f: (u: number) => number,
    df: (u: number) => number,
    u0: number,
    u1: number,
    valueTol: number,
    paramTol: number,
) {
    const samples = 2048
    const us: number[] = new Array(samples + 1)
    const fs: number[] = new Array(samples + 1)
    for (let i = 0; i <= samples; i++) {
        const t = i / samples
        const u = u0 + (u1 - u0) * t
        us[i] = u
        fs[i] = f(u)
    }

    const roots: number[] = []
    const pushRoot = (u: number) => {
        for (const r of roots) {
            if (Math.abs(r - u) <= paramTol) return
        }
        roots.push(u)
    }

    const bisect = (a0: number, b0: number) => {
        let a = a0
        let b = b0
        let fa = f(a)
        let fb = f(b)
        if (Math.abs(fa) <= valueTol) return a
        if (Math.abs(fb) <= valueTol) return b
        if (fa * fb > 0) return 0.5 * (a + b)
        for (let it = 0; it < 48; it++) {
            const m = 0.5 * (a + b)
            const fm = f(m)
            if (Math.abs(fm) <= valueTol || (b - a) <= paramTol) return m
            if (fa * fm <= 0) {
                b = m
                fb = fm
            } else {
                a = m
                fa = fm
            }
        }
        return 0.5 * (a + b)
    }

    const refineLocal = (a0: number, b0: number, seed: number) => {
        let a = a0
        let b = b0
        let u = Math.max(a, Math.min(b, seed))
        let fu = f(u)
        for (let it = 0; it < 32; it++) {
            if (Math.abs(fu) <= valueTol || (b - a) <= paramTol) return u
            const slope = df(u)
            let next = Number.NaN
            if (Number.isFinite(slope) && Math.abs(slope) > Precision.CURVE_NEWTON_EPS) {
                next = u - fu / slope
            }
            if (!Number.isFinite(next) || next <= a || next >= b) {
                next = 0.5 * (a + b)
            }
            const fn = f(next)
            if (f(a) * fn <= 0) {
                b = next
            } else {
                a = next
            }
            u = next
            fu = fn
        }
        return u
    }

    for (let i = 1; i <= samples; i++) {
        const a = us[i - 1]
        const b = us[i]
        const fa = fs[i - 1]
        const fb = fs[i]
        if (Math.abs(fa) <= valueTol) pushRoot(a)
        if (Math.abs(fb) <= valueTol) pushRoot(b)
        if (fa === 0 || fb === 0 || fa * fb < 0) {
            pushRoot(bisect(a, b))
        }
    }

    // same-sign tangent / near-touch roots
    for (let i = 1; i < samples; i++) {
        const f0 = fs[i - 1]
        const f1 = fs[i]
        const f2 = fs[i + 1]
        if (Math.sign(f0) === Math.sign(f2) && Math.abs(f1) <= Math.min(Math.abs(f0), Math.abs(f2)) && Math.abs(f1) <= valueTol * 4) {
            const a = us[i - 1]
            const b = us[i + 1]
            pushRoot(refineLocal(a, b, us[i]))
        }
    }

    roots.sort((a, b) => a - b)
    return roots
}

function intersectImplicitBSplinePair(
    target: Curve2,
    bspline: BSpline2,
    implicit: (p: Vec2) => ImplicitEval,
    valueTolScale = 1,
) {
    return collectUniqueResults(solveImplicitBSplineRoots(target, bspline, implicit, valueTolScale))
}

type PairRefine = {
    u1: number
    u2: number
    point: Vec2
    residual: number
}

function refineCurvePairNewton(c1: Curve2, c2: Curve2, u1Seed: number, u2Seed: number, pointTol: number): PairRefine | undefined {
    const r1 = c1.getRange()
    const r2 = c2.getRange()
    let u1 = r1.clamp(u1Seed)
    let u2 = r2.clamp(u2Seed)
    let best = measurePair(c1, c2, u1, u2)

    for (let i = 0; i < 24; i++) {
        const p1 = c1.pointAt(u1)
        const p2 = c2.pointAt(u2)
        const diff = p1.subtracted(p2)
        if (diff.len() <= pointTol) return measurePair(c1, c2, u1, u2)

        const t1 = c1.derivativeAt(u1, 1)
        const t2 = c2.derivativeAt(u2, 1)
        const det = t1.cross(t2)
        if (Math.abs(det) <= Precision.CURVE_NEWTON_EPS) break

        const bx = -diff.x
        const by = -diff.y
        let du = (bx * (-t2.y) - by * (-t2.x)) / det
        let dv = (t1.x * by - t1.y * bx) / det
        if (!Number.isFinite(du) || !Number.isFinite(dv)) break

        const nextU1 = r1.clamp(u1 + du)
        const nextU2 = r2.clamp(u2 + dv)
        const cand = measurePair(c1, c2, nextU1, nextU2)
        if (cand.residual < best.residual) best = cand

        const delta = Math.abs(nextU1 - u1) + Math.abs(nextU2 - u2)
        u1 = nextU1
        u2 = nextU2
        if (delta <= Precision.CURVE_PARAM_EPS * 8) break
    }

    if (best.residual > pointTol * 4) return undefined
    return best
}

function measurePair(c1: Curve2, c2: Curve2, u1: number, u2: number): PairRefine {
    const p1 = c1.pointAt(u1)
    const p2 = c2.pointAt(u2)
    return {
        u1,
        u2,
        point: p1.added(p2).scale(0.5),
        residual: p1.distanceTo(p2),
    }
}

function seedFromClosestPass(c1: BSpline2, c2: BSpline2, pointTol: number) {
    const seeds: Array<{ u1: number; u2: number }> = []
    const push = (u1: number, u2: number) => {
        for (const s of seeds) {
            if (Math.abs(s.u1 - u1) <= Precision.CURVE_PARAM_EPS * 16 && Math.abs(s.u2 - u2) <= Precision.CURVE_PARAM_EPS * 16) {
                return
            }
        }
        seeds.push({ u1, u2 })
    }

    const r1 = c1.getRange()
    const r2 = c2.getRange()
    const samples = 80
    for (let i = 0; i <= samples; i++) {
        const u1 = r1.start + (r1.end - r1.start) * (i / samples)
        const p1 = c1.pointAt(u1)
        const cp2 = safeClosestPoint(c2, p1, pointTol * 2)
        if (!cp2 || cp2.distance > pointTol * 2) continue
        push(u1, r2.clamp(cp2.param))
    }
    for (let i = 0; i <= samples; i++) {
        const u2 = r2.start + (r2.end - r2.start) * (i / samples)
        const p2 = c2.pointAt(u2)
        const cp1 = safeClosestPoint(c1, p2, pointTol * 2)
        if (!cp1 || cp1.distance > pointTol * 2) continue
        push(r1.clamp(cp1.param), u2)
    }
    return seeds
}

function solveBSplineBSplineRoots(c1: BSpline2, c2: BSpline2) {
    const pointTol = Math.max(curvePointTolerance(c1), curvePointTolerance(c2))
    const clip = collectIntervalClipSeeds(c1, c2, {
        pointTol,
        seedParamTol: Precision.CURVE_PARAM_EPS * 16,
        maxDepth: 16,
        maxNodes: 12000,
        pointSeedLimit: 2048,
        overlapSeedLimit: 128,
    })
    const seeds: Array<{ u1: number; u2: number }> = []
    const pushSeed = (u1: number, u2: number) => {
        for (const s of seeds) {
            if (Math.abs(s.u1 - u1) <= Precision.CURVE_PARAM_EPS * 16 && Math.abs(s.u2 - u2) <= Precision.CURVE_PARAM_EPS * 16) {
                return
            }
        }
        seeds.push({ u1, u2 })
    }
    for (const s of clip.pointSeeds) {
        pushSeed(s.u1, s.u2)
    }
    for (const o of clip.overlapSeeds) {
        pushSeed(0.5 * (o.range1.start + o.range1.end), 0.5 * (o.range2.start + o.range2.end))
    }
    if (seeds.length < 8) {
        for (const s of seedFromClosestPass(c1, c2, pointTol)) {
            pushSeed(s.u1, s.u2)
        }
    }

    const out: CurveXInfo[] = []
    for (const seed of seeds) {
        const refined = refineCurvePairNewton(c1, c2, seed.u1, seed.u2, pointTol)
        if (!refined) continue
        pushUniqueResult(out, {
            point: refined.point,
            u1: refined.u1,
            u2: refined.u2,
            isOverlap: false,
        })
    }
    return out
}

function circleImplicit(circle: { center: Vec2; radius: number }) {
    return (p: Vec2): ImplicitEval => {
        const dx = p.x - circle.center.x
        const dy = p.y - circle.center.y
        return {
            value: dx * dx + dy * dy - circle.radius * circle.radius,
            grad: new Vec2(2 * dx, 2 * dy),
        }
    }
}

function ellipseImplicit(ellipse: Ellipse2 | EllipseArc2) {
    const c = Math.cos(ellipse.rotation)
    const s = Math.sin(ellipse.rotation)
    const invRx2 = 1 / (ellipse.rx * ellipse.rx)
    const invRy2 = 1 / (ellipse.ry * ellipse.ry)
    return (p: Vec2): ImplicitEval => {
        const dx = p.x - ellipse.center.x
        const dy = p.y - ellipse.center.y
        const x = c * dx + s * dy
        const y = -s * dx + c * dy
        const value = x * x * invRx2 + y * y * invRy2 - 1

        // grad_world = R * [2x/rx^2, 2y/ry^2]
        const gxLocal = 2 * x * invRx2
        const gyLocal = 2 * y * invRy2
        const gx = c * gxLocal - s * gyLocal
        const gy = s * gxLocal + c * gyLocal
        return {
            value,
            grad: new Vec2(gx, gy),
        }
    }
}

type CircleCircleResult =
    | { kind: 'none' }
    | { kind: 'overlap' }
    | { kind: 'points'; points: Vec2[] }

function circleCircleIntersections(
    c1Center: Vec2,
    c1Radius: number,
    c2Center: Vec2,
    c2Radius: number,
): CircleCircleResult {
    const delta = c2Center.subtracted(c1Center)
    const d = delta.len()
    const eps = Precision.CURVE_LENGTH_EPS

    if (d <= eps && Math.abs(c1Radius - c2Radius) <= eps) {
        return { kind: 'overlap' }
    }
    if (d <= eps) return { kind: 'none' }

    if (d > c1Radius + c2Radius + eps) return { kind: 'none' }
    if (d < Math.abs(c1Radius - c2Radius) - eps) return { kind: 'none' }

    const a = (c1Radius * c1Radius - c2Radius * c2Radius + d * d) / (2 * d)
    const h2 = c1Radius * c1Radius - a * a
    if (h2 < -eps) return { kind: 'none' }

    const base = c1Center.added(delta.scaled(a / d))
    if (Math.abs(h2) <= eps) return { kind: 'points', points: [base] }

    const h = Math.sqrt(Math.max(0, h2))
    const offset = new Vec2(-delta.y / d, delta.x / d).scale(h)
    return {
        kind: 'points',
        points: [base.added(offset), base.subtracted(offset)],
    }
}

function isSameSupportCircle(a: { center: Vec2; radius: number }, b: { center: Vec2; radius: number }) {
    return a.center.distanceTo(b.center) <= Precision.CURVE_LENGTH_EPS &&
        Math.abs(a.radius - b.radius) <= Precision.CURVE_LENGTH_EPS
}

function createOverlapInfo(c1: Curve2, c2: Curve2, point: Vec2, range1?: Interval, range2?: Interval): CurveXInfo | undefined {
    const u1 = tryParamOnCurve(c1, point)
    const u2 = tryParamOnCurve(c2, point)
    if (u1 === undefined || u2 === undefined) return undefined
    return {
        point,
        u1,
        u2,
        isOverlap: true,
        range1,
        range2,
    }
}

function sampleRangeContains(curve: Curve2, other: Curve2, sampleCount: number) {
    const range = curve.getRange()
    let hit = 0
    let representative: Vec2 | undefined
    for (let i = 0; i <= sampleCount; i++) {
        const t = i / sampleCount
        const u = range.start + (range.end - range.start) * t
        const p = curve.pointAt(u)
        const uOther = tryParamOnCurve(other, p)
        if (uOther === undefined) continue
        hit++
        representative = p
    }
    return { hit, representative }
}

function estimateOverlapRange(base: Curve2, other: Curve2, sampleCount: number) {
    const range = base.getRange()
    let start: number | undefined
    let end: number | undefined
    for (let i = 0; i <= sampleCount; i++) {
        const t = i / sampleCount
        const u = range.start + (range.end - range.start) * t
        const p = base.pointAt(u)
        if (tryParamOnCurve(other, p) === undefined) continue
        if (start === undefined) start = u
        end = u
    }
    if (start === undefined || end === undefined) return undefined
    if (Math.abs(end - start) <= Precision.CURVE_PARAM_EPS * 8) return undefined
    return new Interval(start, end)
}

export class LineCirclePairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const line = assertLine(c1)
        const circle = assertCircle(c2)
        const candidates = lineCircleParamIntersections(line, circle.center, circle.radius)
        const out: CurveXInfo[] = []
        for (const c of candidates) {
            const uCircle = tryParamOnCurve(circle, c.point)
            if (uCircle === undefined) continue
            pushUniqueResult(out, {
                point: c.point,
                u1: c.uLine,
                u2: uCircle,
                isOverlap: false,
            })
        }
        return out
    }
}

export class LineArcPairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const line = assertLine(c1)
        const arc = assertArc(c2)
        const candidates = lineCircleParamIntersections(line, arc.center, arc.radius)
        const out: CurveXInfo[] = []
        for (const c of candidates) {
            const uArc = tryParamOnCurve(arc, c.point)
            if (uArc === undefined) continue
            pushUniqueResult(out, {
                point: c.point,
                u1: c.uLine,
                u2: uArc,
                isOverlap: false,
            })
        }
        return out
    }
}

export class LineEllipsePairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const line = assertLine(c1)
        const ellipse = assertEllipse(c2)
        const candidates = lineEllipseParamIntersections(line, ellipse)
        const out: CurveXInfo[] = []
        for (const c of candidates) {
            const uEllipse = tryParamOnCurve(ellipse, c.point)
            if (uEllipse === undefined) continue
            pushUniqueResult(out, {
                point: c.point,
                u1: c.uLine,
                u2: uEllipse,
                isOverlap: false,
            })
        }
        return out
    }
}

export class LineEllipseArcPairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const line = assertLine(c1)
        const ellipseArc = assertEllipseArc(c2)
        const candidates = lineEllipseParamIntersections(line, ellipseArc)
        const out: CurveXInfo[] = []
        for (const c of candidates) {
            const uArc = tryParamOnCurve(ellipseArc, c.point)
            if (uArc === undefined) continue
            pushUniqueResult(out, {
                point: c.point,
                u1: c.uLine,
                u2: uArc,
                isOverlap: false,
            })
        }
        return out
    }
}

export class LineBSplinePairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const line = assertLine(c1)
        const bspline = assertBSpline(c2)
        return collectUniqueResults(solveLineBSplineRoots(line, bspline))
    }
}

export class CircleCirclePairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const circle1 = assertCircle(c1)
        const circle2 = assertCircle(c2)
        const hit = circleCircleIntersections(circle1.center, circle1.radius, circle2.center, circle2.radius)
        if (hit.kind === 'none') return []

        if (hit.kind === 'overlap') {
            const p = circle1.pointAt(circle1.getRange().start)
            const overlap = createOverlapInfo(circle1, circle2, p, circle1.getRange(), circle2.getRange())
            return overlap ? [overlap] : []
        }

        const out: CurveXInfo[] = []
        for (const p of hit.points) {
            pushUniqueResult(out, tryBuildPointInfo(circle1, circle2, p))
        }
        return out
    }
}

export class CircleArcPairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const circle = assertCircle(c1)
        const arc = assertArc(c2)

        if (isSameSupportCircle(circle, arc)) {
            const p = arc.pointAt(arc.getRange().start)
            const uStart = tryParamOnCurve(circle, arc.pointAt(arc.getRange().start))
            const uEnd = tryParamOnCurve(circle, arc.pointAt(arc.getRange().end))
            const range1 = (uStart !== undefined && uEnd !== undefined)
                ? new Interval(uStart, uEnd)
                : undefined
            const overlap = createOverlapInfo(circle, arc, p, range1, arc.getRange())
            return overlap ? [overlap] : []
        }

        const hit = circleCircleIntersections(circle.center, circle.radius, arc.center, arc.radius)
        if (hit.kind !== 'points') return []

        const out: CurveXInfo[] = []
        for (const p of hit.points) {
            const uArc = tryParamOnCurve(arc, p)
            if (uArc === undefined) continue
            pushUniqueResult(out, tryBuildPointInfo(circle, arc, p))
        }
        return out
    }
}

export class CircleEllipsePairSolver extends PolylinePairIntersector {
    constructor() { super(224, 64) }
}
export class CircleEllipseArcPairSolver extends PolylinePairIntersector {
    constructor() { super(224, 64) }
}
export class CircleBSplinePairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const circle = assertCircle(c1)
        const bspline = assertBSpline(c2)
        return intersectImplicitBSplinePair(circle, bspline, circleImplicit(circle), circle.radius)
    }
}

export class ArcArcPairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const arc1 = assertArc(c1)
        const arc2 = assertArc(c2)

        if (isSameSupportCircle(arc1, arc2)) {
            const sample1 = sampleRangeContains(arc1, arc2, 64)
            const sample2 = sampleRangeContains(arc2, arc1, 64)
            const sharedCount = Math.max(sample1.hit, sample2.hit)
            if (sharedCount >= 3) {
                const p = sample1.representative ?? sample2.representative ?? arc1.pointAt(arc1.getRange().start)
                const range1 = estimateOverlapRange(arc1, arc2, 128)
                const range2 = estimateOverlapRange(arc2, arc1, 128)
                const overlap = createOverlapInfo(arc1, arc2, p, range1, range2)
                if (overlap) return [overlap]
            }

            const out: CurveXInfo[] = []
            const endpoints = [
                arc1.pointAt(arc1.getRange().start),
                arc1.pointAt(arc1.getRange().end),
                arc2.pointAt(arc2.getRange().start),
                arc2.pointAt(arc2.getRange().end),
            ]
            for (const p of endpoints) {
                if (tryParamOnCurve(arc1, p) === undefined || tryParamOnCurve(arc2, p) === undefined) continue
                pushUniqueResult(out, tryBuildPointInfo(arc1, arc2, p))
            }
            return out
        }

        const hit = circleCircleIntersections(arc1.center, arc1.radius, arc2.center, arc2.radius)
        if (hit.kind !== 'points') return []

        const out: CurveXInfo[] = []
        for (const p of hit.points) {
            if (tryParamOnCurve(arc1, p) === undefined || tryParamOnCurve(arc2, p) === undefined) continue
            pushUniqueResult(out, tryBuildPointInfo(arc1, arc2, p))
        }
        return out
    }
}

export class ArcEllipsePairSolver extends PolylinePairIntersector {
    constructor() { super(224, 64) }
}
export class ArcEllipseArcPairSolver extends PolylinePairIntersector {
    constructor() { super(224, 64) }
}
export class ArcBSplinePairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const arc = assertArc(c1)
        const bspline = assertBSpline(c2)
        return intersectImplicitBSplinePair(arc, bspline, circleImplicit(arc), arc.radius)
    }
}
export class EllipseEllipsePairSolver extends PolylinePairIntersector {
    constructor() { super(240, 64) }
}
export class EllipseEllipseArcPairSolver extends PolylinePairIntersector {
    constructor() { super(240, 64) }
}
export class EllipseBSplinePairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const ellipse = assertEllipse(c1)
        const bspline = assertBSpline(c2)
        return intersectImplicitBSplinePair(
            ellipse,
            bspline,
            ellipseImplicit(ellipse),
            Math.max(ellipse.rx, ellipse.ry),
        )
    }
}
export class EllipseArcEllipseArcPairSolver extends PolylinePairIntersector {
    constructor() { super(240, 64) }
}
export class EllipseArcBSplinePairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const ellipseArc = assertEllipseArc(c1)
        const bspline = assertBSpline(c2)
        return intersectImplicitBSplinePair(
            ellipseArc,
            bspline,
            ellipseImplicit(ellipseArc),
            Math.max(ellipseArc.rx, ellipseArc.ry),
        )
    }
}
export class BSplineBSplinePairSolver implements ICurvePairIntersector {
    public intersect(c1: Curve2, c2: Curve2): CurveXInfo[] {
        const bs1 = assertBSpline(c1)
        const bs2 = assertBSpline(c2)
        return solveBSplineBSplineRoots(bs1, bs2)
    }
}

export { LineLinePairSolver }
