import type { Curve2 } from '../../curves/curve2'
import { Vec2 } from '../../core/vec2'
import { Precision } from '../../utils/precision'
import { MathUtils } from '../../utils/math_utils'

export type CurveSample = {
    u: number
    p: Vec2
}

export function sampleCurveByParam(curve: Curve2, segmentCount: number): CurveSample[] {
    const range = curve.getRange()
    const total = Math.max(2, segmentCount)
    const samples: CurveSample[] = []
    for (let i = 0; i <= total; i++) {
        const t = i / total
        const u = range.start + (range.end - range.start) * t
        samples.push({ u, p: curve.pointAt(u) })
    }
    return collapseDuplicateSamplePoints(samples)
}

export type AdaptiveSampleOptions = {
    maxDepth?: number
    chordErrorTol?: number
    tangentAngleTol?: number
    maxSamples?: number
}

export function sampleCurveAdaptive(curve: Curve2, targetSegmentCount: number, options: AdaptiveSampleOptions = {}): CurveSample[] {
    const range = curve.getRange()
    if (range.length() <= Precision.CURVE_PARAM_EPS) {
        return [{ u: range.start, p: curve.pointAt(range.start) }]
    }

    const bbox = curve.boundingBox()
    const diag = Math.hypot(bbox.width(), bbox.height())
    const scale = Math.max(diag, 1)
    const segCount = Math.max(8, targetSegmentCount)
    const maxDepth = options.maxDepth ?? (Math.ceil(Math.log2(segCount)) + 8)
    const chordErrorTol = options.chordErrorTol ?? Math.max(Precision.CURVE_LENGTH_EPS * 8, scale / (segCount * 10))
    const tangentAngleTol = options.tangentAngleTol ?? 0.22
    const maxSamples = options.maxSamples ?? segCount * 8

    const cutParams = collectCutParams(curve)
    const samples: CurveSample[] = []

    for (let i = 0; i < cutParams.length - 1; i++) {
        const u0 = cutParams[i]
        const u1 = cutParams[i + 1]
        if (u1 - u0 <= Precision.CURVE_PARAM_EPS) continue
        const p0 = curve.pointAt(u0)
        const p1 = curve.pointAt(u1)
        subdivideAdaptive(
            curve,
            u0,
            p0,
            u1,
            p1,
            0,
            maxDepth,
            chordErrorTol,
            tangentAngleTol,
            maxSamples,
            samples,
        )
    }

    // Ensure terminal endpoint is present.
    const end = cutParams[cutParams.length - 1]
    samples.push({ u: end, p: curve.pointAt(end) })

    return collapseDuplicateSamplePoints(samples)
}

function collectCutParams(curve: Curve2) {
    const range = curve.getRange()
    const cuts: number[] = [range.start]
    if (curve.isBSpline()) {
        for (const u of curve.getContinuityBreakParams(Precision.CURVE_PARAM_EPS)) {
            if (u > range.start + Precision.CURVE_PARAM_EPS && u < range.end - Precision.CURVE_PARAM_EPS) {
                cuts.push(u)
            }
        }
    }
    cuts.push(range.end)
    cuts.sort((a, b) => a - b)

    const unique: number[] = []
    for (const u of cuts) {
        if (unique.length === 0 || Math.abs(unique[unique.length - 1] - u) > Precision.CURVE_PARAM_EPS) {
            unique.push(u)
        }
    }
    return unique
}

function subdivideAdaptive(
    curve: Curve2,
    u0: number,
    p0: Vec2,
    u1: number,
    p1: Vec2,
    depth: number,
    maxDepth: number,
    chordErrorTol: number,
    tangentAngleTol: number,
    maxSamples: number,
    out: CurveSample[],
) {
    if (out.length >= maxSamples) {
        out.push({ u: u0, p: p0 })
        return
    }
    if (!shouldSplit(curve, u0, p0, u1, p1, depth, maxDepth, chordErrorTol, tangentAngleTol)) {
        out.push({ u: u0, p: p0 })
        return
    }

    const um = 0.5 * (u0 + u1)
    if (um <= u0 + Precision.CURVE_PARAM_EPS || um >= u1 - Precision.CURVE_PARAM_EPS) {
        out.push({ u: u0, p: p0 })
        return
    }
    const pm = curve.pointAt(um)
    subdivideAdaptive(curve, u0, p0, um, pm, depth + 1, maxDepth, chordErrorTol, tangentAngleTol, maxSamples, out)
    subdivideAdaptive(curve, um, pm, u1, p1, depth + 1, maxDepth, chordErrorTol, tangentAngleTol, maxSamples, out)
}

function shouldSplit(
    curve: Curve2,
    u0: number,
    p0: Vec2,
    u1: number,
    p1: Vec2,
    depth: number,
    maxDepth: number,
    chordErrorTol: number,
    tangentAngleTol: number,
) {
    if (depth >= maxDepth) return false
    if (u1 - u0 <= Precision.CURVE_PARAM_EPS * 2) return false

    const chord = p1.subtracted(p0)
    const chordLen = chord.len()
    if (chordLen <= Precision.CURVE_LENGTH_EPS) return true

    const um = 0.5 * (u0 + u1)
    const pm = curve.pointAt(um)
    const midError = pointToLineDistance(pm, p0, p1, chordLen)
    if (midError > chordErrorTol) return true

    const t0 = curve.getTangentAt(u0)
    const t1 = curve.getTangentAt(u1)
    if (t0.len() <= Precision.CURVE_NEWTON_EPS || t1.len() <= Precision.CURVE_NEWTON_EPS) return true

    const a0 = vectorAngle(t0, chord)
    const a1 = vectorAngle(t1, chord)
    const ae = vectorAngle(t0, t1)
    return a0 > tangentAngleTol || a1 > tangentAngleTol || ae > tangentAngleTol * 2
}

function pointToLineDistance(p: Vec2, a: Vec2, b: Vec2, abLen: number) {
    if (abLen <= Precision.CURVE_LENGTH_EPS) return p.distanceTo(a)
    const ap = p.subtracted(a)
    const ab = b.subtracted(a)
    return Math.abs(ap.cross(ab)) / abLen
}

function vectorAngle(v1: Vec2, v2: Vec2) {
    const l1 = v1.len()
    const l2 = v2.len()
    if (l1 <= Precision.CURVE_NEWTON_EPS || l2 <= Precision.CURVE_NEWTON_EPS) return Math.PI
    const x = v1.dot(v2) / (l1 * l2)
    return Math.acos(MathUtils.clamp(x, -1, 1))
}

function collapseDuplicateSamplePoints(samples: CurveSample[]) {
    if (samples.length <= 1) return samples
    const ret: CurveSample[] = [samples[0]]
    for (let i = 1; i < samples.length; i++) {
        const prev = ret[ret.length - 1]
        const cur = samples[i]
        if (prev.p.distanceTo(cur.p) <= Precision.CURVE_LENGTH_EPS) continue
        ret.push(cur)
    }
    return ret
}
