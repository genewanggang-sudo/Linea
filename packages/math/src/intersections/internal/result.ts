import { Interval } from '../../curves/interval'
import { Precision } from '../../utils/precision'
import type { CurveXInfo } from '../types'

export type CurveXQuality = {
    rawCount: number
    uniqueCount: number
    overlapCount: number
    uniquePointCount: number
    duplicatePointCount: number
}

export function swapCurveXInfos(items: CurveXInfo[]) {
    return items.map((item) => ({
        point: item.point.clone(),
        u1: item.u2,
        u2: item.u1,
        isOverlap: item.isOverlap,
        range1: item.range2 ? new Interval(item.range2.start, item.range2.end) : undefined,
        range2: item.range1 ? new Interval(item.range1.start, item.range1.end) : undefined,
    }))
}

export function postprocessCurveXInfos(items: CurveXInfo[], pointTol = Precision.CURVE_LENGTH_EPS * 8) {
    const deduped = deduplicateCurveXInfos(items, pointTol)
    const merged = mergeOverlaps(deduped)
    return merged.sort((a, b) => a.u1 - b.u1 || a.u2 - b.u2)
}

export function analyzeCurveXInfosQuality(items: CurveXInfo[], pointTol = Precision.CURVE_LENGTH_EPS * 8): CurveXQuality {
    const rawCount = items.length
    const overlapCount = items.filter((x) => x.isOverlap).length
    const uniquePoints: CurveXInfo[] = []
    for (const item of items) {
        if (item.isOverlap) continue
        const dup = uniquePoints.some((u) => u.point.distanceTo(item.point) <= pointTol)
        if (!dup) uniquePoints.push(item)
    }
    const uniquePointCount = uniquePoints.length
    const uniqueCount = uniquePointCount + overlapCount
    const duplicatePointCount = Math.max(0, rawCount - overlapCount - uniquePointCount)
    return {
        rawCount,
        uniqueCount,
        overlapCount,
        uniquePointCount,
        duplicatePointCount,
    }
}

function deduplicateCurveXInfos(items: CurveXInfo[], pointTol: number) {
    const sorted = [...items].sort((a, b) => a.u1 - b.u1 || a.u2 - b.u2)
    const ret: CurveXInfo[] = []
    for (const cur of sorted) {
        let merged = false
        for (const prev of ret) {
            if (!isSameCurveXInfo(prev, cur, pointTol)) continue
            if (prev.isOverlap) {
                prev.range1 = mergeRange(prev.range1, cur.range1)
                prev.range2 = mergeRange(prev.range2, cur.range2)
            }
            merged = true
            break
        }
        if (!merged) ret.push(cur)
    }
    return ret
}

function mergeOverlaps(items: CurveXInfo[]) {
    const points = items.filter((x) => !x.isOverlap)
    const overlaps = items.filter((x) => x.isOverlap)
    if (overlaps.length <= 1) return [...points, ...overlaps]

    overlaps.sort((a, b) => (a.range1?.start ?? a.u1) - (b.range1?.start ?? b.u1))
    const merged: CurveXInfo[] = [normalizeOverlap(overlaps[0])]

    for (let i = 1; i < overlaps.length; i++) {
        const cur = normalizeOverlap(overlaps[i])
        const prev = merged[merged.length - 1]
        if (!prev.range1 || !cur.range1 || !prev.range2 || !cur.range2) {
            merged.push(cur)
            continue
        }
        if (cur.range1.start <= prev.range1.end + Precision.CURVE_PARAM_EPS) {
            prev.range1 = new Interval(prev.range1.start, Math.max(prev.range1.end, cur.range1.end))
            prev.range2 = new Interval(prev.range2.start, Math.max(prev.range2.end, cur.range2.end))
            continue
        }
        merged.push(cur)
    }

    return [...points, ...merged]
}

function mergeRange(a?: Interval, b?: Interval) {
    if (!a) return b ? new Interval(b.start, b.end) : undefined
    if (!b) return new Interval(a.start, a.end)
    return new Interval(Math.min(a.start, b.start), Math.max(a.end, b.end))
}

function isSameCurveXInfo(a: CurveXInfo, b: CurveXInfo, pointTol: number) {
    if (a.isOverlap !== b.isOverlap) return false

    const paramTol = Precision.CURVE_PARAM_EPS * 8
    if (!a.isOverlap && a.point.distanceTo(b.point) <= pointTol) {
        return true
    }

    if (
        Math.abs(a.u1 - b.u1) <= paramTol * 8 &&
        Math.abs(a.u2 - b.u2) <= paramTol * 8 &&
        a.point.distanceTo(b.point) <= pointTol * 2
    ) {
        return true
    }

    if (!a.isOverlap || !a.range1 || !a.range2 || !b.range1 || !b.range2) {
        return false
    }
    const a1 = normalizeRange(a.range1)
    const a2 = normalizeRange(a.range2)
    const b1 = normalizeRange(b.range1)
    const b2 = normalizeRange(b.range2)
    return (
        Math.abs(a1.start - b1.start) <= paramTol &&
        Math.abs(a1.end - b1.end) <= paramTol &&
        Math.abs(a2.start - b2.start) <= paramTol &&
        Math.abs(a2.end - b2.end) <= paramTol
    )
}

function normalizeOverlap(item: CurveXInfo): CurveXInfo {
    if (!item.isOverlap) return item
    return {
        ...item,
        range1: item.range1 ? normalizeRange(item.range1) : undefined,
        range2: item.range2 ? normalizeRange(item.range2) : undefined,
    }
}

function normalizeRange(x: Interval) {
    return x.start <= x.end ? x : new Interval(x.end, x.start)
}
