import { Interval } from '../../curves/interval'
import type { Curve2 } from '../../curves/curve2'
import type { Vec2 } from '../../core/vec2'
import { Precision } from '../../utils/precision'
export type ClosestPointLike = {
    param: number
    distance: number
}

export type ClosestPointProvider = (curve: Curve2, p: Vec2, tol: number) => ClosestPointLike | undefined

export type ParamPairCandidate = {
    u1: number
    u2: number
    residual: number
}

export type CertifiedParamPair = {
    point: Vec2
    u1: number
    u2: number
    residual: number
}

export type ResidualEnvelope = {
    lowerBound: number
    upperBound: number
    minSample: number
    maxSample: number
}

export type CertificationOutcome = {
    pair: CertifiedParamPair
    usedDegenerateRescue: boolean
    envelopeUpperBound: number
}

export function certifyParamPair(
    c1: Curve2,
    c2: Curve2,
    candidate: ParamPairCandidate,
    tol: number,
    closestPoint: ClosestPointProvider,
): CertificationOutcome | undefined {
    const cp2 = closestPoint(c2, c1.pointAt(candidate.u1), tol * 2)
    const cp1 = closestPoint(c1, c2.pointAt(candidate.u2), tol * 2)
    if (!cp1 || !cp2) return undefined
    if (cp1.distance > tol * 3 || cp2.distance > tol * 3) return undefined
    const measured = measureParamPair(c1, c2, cp1.param, cp2.param)
    if (measured.residual > tol * 3) return undefined
    const envelope = estimateResidualEnvelopeAdaptive(c1, c2, measured.u1, measured.u2, 4)
    if (envelope.upperBound <= tol * 6) {
        return {
            pair: measured,
            usedDegenerateRescue: false,
            envelopeUpperBound: envelope.upperBound,
        }
    }

    if (!isNearDegenerate(c1, c2, measured.u1, measured.u2)) return undefined
    const rescued = tryDegenerateRescue(c1, c2, measured, tol, closestPoint)
    if (!rescued) return undefined
    return {
        pair: rescued.pair,
        usedDegenerateRescue: true,
        envelopeUpperBound: rescued.envelope.upperBound,
    }
}

export function projectRangeToCurve(
    baseCurve: Curve2,
    otherCurve: Curve2,
    rangeOnBase: Interval,
    tol: number,
    closestPoint: ClosestPointProvider,
): Interval | undefined {
    const startOnBase = baseCurve.pointAt(rangeOnBase.start)
    const endOnBase = baseCurve.pointAt(rangeOnBase.end)
    const cpStart = closestPoint(otherCurve, startOnBase, tol)
    const cpEnd = closestPoint(otherCurve, endOnBase, tol)
    if (!cpStart || !cpEnd) return undefined
    return new Interval(Math.min(cpStart.param, cpEnd.param), Math.max(cpStart.param, cpEnd.param))
}

export function certifyOverlapMonotone(
    baseCurve: Curve2,
    otherCurve: Curve2,
    rangeOnBase: Interval,
    tol: number,
    paramTol: number,
    closestPoint: ClosestPointProvider,
) {
    const samples = [0, 0.25, 0.5, 0.75, 1]
    let pass = 0
    const paramsOnOther: number[] = []
    for (const t of samples) {
        const u = rangeOnBase.start + (rangeOnBase.end - rangeOnBase.start) * t
        const p = baseCurve.pointAt(u)
        const cp = closestPoint(otherCurve, p, tol)
        if (!cp) continue
        paramsOnOther.push(cp.param)
        if (cp.distance <= tol * 2.5) pass++
    }

    if (pass < 4 || paramsOnOther.length < 4) return false

    let nonDecreasing = true
    let nonIncreasing = true
    for (let i = 1; i < paramsOnOther.length; i++) {
        if (paramsOnOther[i] < paramsOnOther[i - 1] - paramTol) nonDecreasing = false
        if (paramsOnOther[i] > paramsOnOther[i - 1] + paramTol) nonIncreasing = false
    }
    return nonDecreasing || nonIncreasing
}

function measureParamPair(c1: Curve2, c2: Curve2, u1: number, u2: number): CertifiedParamPair {
    const p1 = c1.pointAt(u1)
    const p2 = c2.pointAt(u2)
    return {
        u1,
        u2,
        point: p1.added(p2).scale(0.5),
        residual: p1.distanceTo(p2),
    }
}

function estimateResidualEnvelopeAdaptive(
    c1: Curve2,
    c2: Curve2,
    u1: number,
    u2: number,
    maxDepth: number,
): ResidualEnvelope {
    let w1 = buildCertificationWindow(c1, u1, 1)
    let w2 = buildCertificationWindow(c2, u2, 1)
    let upper = Number.POSITIVE_INFINITY
    let lower = 0
    let minSample = Number.POSITIVE_INFINITY
    let maxSample = 0

    for (let depth = 0; depth <= maxDepth; depth++) {
        const env = evaluateWindowEnvelope(c1, c2, w1, w2)
        lower = Math.max(lower, env.lowerBound)
        upper = Math.min(upper, env.upperBound)
        minSample = Math.min(minSample, env.minSample)
        maxSample = Math.max(maxSample, env.maxSample)
        if (w1.length() <= Precision.CURVE_PARAM_EPS * 32 && w2.length() <= Precision.CURVE_PARAM_EPS * 32) {
            break
        }
        w1 = shrinkWindowAroundParam(c1, w1, u1, 0.5)
        w2 = shrinkWindowAroundParam(c2, w2, u2, 0.5)
    }

    const half1 = 0.5 * (w1.end - w1.start)
    const half2 = 0.5 * (w2.end - w2.start)
    const l1 = maxTangentNorm(c1, w1)
    const l2 = maxTangentNorm(c2, w2)
    const drift = l1 * half1 + l2 * half2

    const conservativeUpper = Number.isFinite(upper) ? upper + drift * 0.25 : maxSample + drift
    const conservativeLower = Math.max(0, lower - drift * 0.25)
    return {
        lowerBound: conservativeLower,
        upperBound: Math.max(conservativeUpper, maxSample),
        minSample,
        maxSample,
    }
}

function tryDegenerateRescue(
    c1: Curve2,
    c2: Curve2,
    measured: CertifiedParamPair,
    tol: number,
    closestPoint: ClosestPointProvider,
) {
    const w1 = buildCertificationWindow(c1, measured.u1, 2)
    const w2 = buildCertificationWindow(c2, measured.u2, 2)
    const grid = sampleInterval5(w1)
    const grid2 = sampleInterval5(w2)

    let best = measured
    for (const u of grid) {
        const p1 = c1.pointAt(u)
        for (const v of grid2) {
            const p2 = c2.pointAt(v)
            const d = p1.distanceTo(p2)
            if (d >= best.residual) continue
            best = {
                u1: u,
                u2: v,
                point: p1.added(p2).scale(0.5),
                residual: d,
            }
        }
    }

    const cp2 = closestPoint(c2, c1.pointAt(best.u1), tol * 3)
    if (cp2) {
        const cp1 = closestPoint(c1, c2.pointAt(cp2.param), tol * 3)
        if (cp1) {
            best = measureParamPair(c1, c2, cp1.param, cp2.param)
        }
    }
    if (best.residual > tol * 2.8) return undefined

    const envelope = evaluateWindowEnvelope(c1, c2, buildCertificationWindow(c1, best.u1, 1), buildCertificationWindow(c2, best.u2, 1))
    if (envelope.upperBound > tol * 8) return undefined
    return {
        pair: best,
        envelope,
    }
}

function evaluateWindowEnvelope(c1: Curve2, c2: Curve2, w1: Interval, w2: Interval): ResidualEnvelope {
    const uSamples = sampleInterval5(w1)
    const vSamples = sampleInterval5(w2)
    let minSample = Number.POSITIVE_INFINITY
    let maxSample = 0

    for (const a of uSamples) {
        const p1 = c1.pointAt(a)
        for (const b of vSamples) {
            const p2 = c2.pointAt(b)
            const r = p1.distanceTo(p2)
            if (r < minSample) minSample = r
            if (r > maxSample) maxSample = r
        }
    }

    const half1 = 0.5 * (w1.end - w1.start)
    const half2 = 0.5 * (w2.end - w2.start)
    const l1 = maxTangentNorm(c1, w1)
    const l2 = maxTangentNorm(c2, w2)
    const drift = l1 * half1 + l2 * half2
    return {
        lowerBound: Math.max(0, minSample - drift),
        upperBound: maxSample + drift,
        minSample,
        maxSample,
    }
}

function buildCertificationWindow(curve: Curve2, u: number, scale: number) {
    const range = curve.getRange()
    const span = Math.max(range.length(), Precision.CURVE_PARAM_EPS)
    const half = Math.max(Precision.CURVE_PARAM_EPS * 16, span * 1e-4 * scale)
    const start = Math.max(range.start, u - half)
    const end = Math.min(range.end, u + half)
    if (end <= start + Precision.CURVE_PARAM_EPS) {
        const clamped = range.clamp(u)
        return new Interval(clamped, clamped)
    }
    return new Interval(start, end)
}

function sampleInterval3(x: Interval) {
    if (x.end - x.start <= Precision.CURVE_PARAM_EPS) {
        return [x.start]
    }
    return [x.start, 0.5 * (x.start + x.end), x.end]
}

function sampleInterval5(x: Interval) {
    if (x.end - x.start <= Precision.CURVE_PARAM_EPS) {
        return [x.start]
    }
    const a = x.start
    const b = x.end
    return [
        a,
        a + 0.25 * (b - a),
        a + 0.5 * (b - a),
        a + 0.75 * (b - a),
        b,
    ]
}

function maxTangentNorm(curve: Curve2, x: Interval) {
    const samples = sampleInterval3(x)
    let ret = Precision.CURVE_NEWTON_EPS
    for (const u of samples) {
        const n = curve.tangentAt(u).len()
        if (Number.isFinite(n)) ret = Math.max(ret, n)
    }
    return ret
}

function isNearDegenerate(c1: Curve2, c2: Curve2, u1: number, u2: number) {
    const t1 = c1.tangentAt(u1)
    const t2 = c2.tangentAt(u2)
    const n1 = t1.len()
    const n2 = t2.len()
    if (n1 <= Precision.CURVE_NEWTON_EPS || n2 <= Precision.CURVE_NEWTON_EPS) return true
    const sin = Math.abs(t1.cross(t2)) / (n1 * n2)
    return sin <= 1e-3
}

function shrinkWindowAroundParam(curve: Curve2, window: Interval, center: number, factor: number) {
    const range = curve.getRange()
    const half = Math.max(Precision.CURVE_PARAM_EPS * 8, 0.5 * window.length() * factor)
    const u = range.clamp(center)
    const start = Math.max(range.start, u - half)
    const end = Math.min(range.end, u + half)
    if (end <= start + Precision.CURVE_PARAM_EPS) {
        return new Interval(u, u)
    }
    return new Interval(start, end)
}
