import { Interval } from '../../curves/interval'
import type { Curve2 } from '../../curves/curve2'
import type { Vec2 } from '../../core/vec2'
import { Precision } from '../../utils/precision'
import { intersectSegments, lerp, makeSegment, segmentBoxesMayIntersect, segmentDistance } from './segment'

export type ClipPointSeed = {
    u1: number
    u2: number
}

export type ClipOverlapSeed = {
    range1: Interval
    range2: Interval
}

export type IntervalClipOptions = {
    pointTol: number
    seedParamTol: number
    maxDepth: number
    maxNodes: number
    pointSeedLimit: number
    overlapSeedLimit: number
}

export type IntervalClipDiagnostics = {
    nodesVisited: number
    aborted: boolean
}

export type IntervalClipResult = {
    pointSeeds: ClipPointSeed[]
    overlapSeeds: ClipOverlapSeed[]
    diagnostics: IntervalClipDiagnostics
}

type ClipState = {
    nodes: number
    aborted: boolean
}

export function collectIntervalClipSeeds(
    c1: Curve2,
    c2: Curve2,
    options: IntervalClipOptions,
): IntervalClipResult {
    const r1 = c1.getRange()
    const r2 = c2.getRange()
    if (r1.length() <= Precision.CURVE_PARAM_EPS || r2.length() <= Precision.CURVE_PARAM_EPS) {
        return {
            pointSeeds: [],
            overlapSeeds: [],
            diagnostics: { nodesVisited: 0, aborted: false },
        }
    }

    const pointSeeds: ClipPointSeed[] = []
    const overlapSeeds: ClipOverlapSeed[] = []
    const state: ClipState = {
        nodes: 0,
        aborted: false,
    }
    const cache1 = new Map<string, Vec2>()
    const cache2 = new Map<string, Vec2>()
    const getPoint = (curve: Curve2, cache: Map<string, Vec2>, u: number) => {
        const key = u.toPrecision(15)
        const found = cache.get(key)
        if (found) return found
        const p = curve.pointAt(u)
        cache.set(key, p)
        return p
    }

    const recurse = (u0: number, u1: number, v0: number, v1: number, depth: number) => {
        if (state.aborted) return
        if (state.nodes++ > options.maxNodes) {
            state.aborted = true
            return
        }
        if (u1 - u0 <= Precision.CURVE_PARAM_EPS && v1 - v0 <= Precision.CURVE_PARAM_EPS) return

        const p10 = getPoint(c1, cache1, u0)
        const p11 = getPoint(c1, cache1, u1)
        const p20 = getPoint(c2, cache2, v0)
        const p21 = getPoint(c2, cache2, v1)
        const s1 = makeSegment(p10, p11)
        const s2 = makeSegment(p20, p21)

        if (!segmentBoxesMayIntersect(s1, s2, options.pointTol)) return

        const hit = intersectSegments(s1, s2)
        if (hit.kind === 'point') {
            addPointSeed(
                pointSeeds,
                lerp(u0, u1, hit.t1),
                lerp(v0, v1, hit.t2),
                options.seedParamTol,
                options.pointSeedLimit,
            )
        } else if (hit.kind === 'overlap') {
            addOverlapSeed(
                overlapSeeds,
                {
                    range1: new Interval(lerp(u0, u1, hit.t1s), lerp(u0, u1, hit.t1e)),
                    range2: new Interval(lerp(v0, v1, hit.t2s), lerp(v0, v1, hit.t2e)),
                },
                options.overlapSeedLimit,
            )
            addPointSeed(
                pointSeeds,
                0.5 * (lerp(u0, u1, hit.t1s) + lerp(u0, u1, hit.t1e)),
                0.5 * (lerp(v0, v1, hit.t2s) + lerp(v0, v1, hit.t2e)),
                options.seedParamTol,
                options.pointSeedLimit,
            )
        }

        const dist = segmentDistance(s1, s2)
        const uSpan = u1 - u0
        const vSpan = v1 - v0
        const paramTiny = uSpan <= Precision.CURVE_PARAM_EPS * 32 && vSpan <= Precision.CURVE_PARAM_EPS * 32
        const geomTiny = Math.max(s1.len, s2.len) <= options.pointTol * 1.25
        if (depth >= options.maxDepth || paramTiny || geomTiny) {
            if (dist <= options.pointTol * 1.75) {
                addPointSeed(
                    pointSeeds,
                    0.5 * (u0 + u1),
                    0.5 * (v0 + v1),
                    options.seedParamTol,
                    options.pointSeedLimit,
                )
            }
            return
        }

        if (dist > Math.max(s1.len, s2.len) + options.pointTol * 3) return

        const splitU = s1.len >= s2.len
        if (splitU) {
            const um = 0.5 * (u0 + u1)
            if (um <= u0 + Precision.CURVE_PARAM_EPS || um >= u1 - Precision.CURVE_PARAM_EPS) return
            recurse(u0, um, v0, v1, depth + 1)
            recurse(um, u1, v0, v1, depth + 1)
            return
        }

        const vm = 0.5 * (v0 + v1)
        if (vm <= v0 + Precision.CURVE_PARAM_EPS || vm >= v1 - Precision.CURVE_PARAM_EPS) return
        recurse(u0, u1, v0, vm, depth + 1)
        recurse(u0, u1, vm, v1, depth + 1)
    }

    recurse(r1.start, r1.end, r2.start, r2.end, 0)
    return {
        pointSeeds,
        overlapSeeds,
        diagnostics: {
            nodesVisited: state.nodes,
            aborted: state.aborted,
        },
    }
}

function addPointSeed(seeds: ClipPointSeed[], u1: number, u2: number, paramTol: number, limit: number) {
    if (limit > 0 && seeds.length >= limit) return
    for (const seed of seeds) {
        if (Math.abs(seed.u1 - u1) <= paramTol && Math.abs(seed.u2 - u2) <= paramTol) {
            return
        }
    }
    seeds.push({ u1, u2 })
}

function addOverlapSeed(seeds: ClipOverlapSeed[], next: ClipOverlapSeed, limit: number) {
    for (let i = 0; i < seeds.length; i++) {
        const cur = seeds[i]
        const overlap1 = next.range1.intersect(cur.range1, Precision.CURVE_PARAM_EPS * 8)
        const overlap2 = next.range2.intersect(cur.range2, Precision.CURVE_PARAM_EPS * 8)
        if (overlap1.length === 0 || overlap2.length === 0) continue
        seeds[i] = {
            range1: new Interval(cur.range1.start, next.range1.end),
            range2: new Interval(cur.range2.start, next.range2.end),
        }
        return
    }
    if (limit > 0 && seeds.length >= limit) return
    seeds.push(next)
}
