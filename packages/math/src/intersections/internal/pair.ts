export type CurveKind = 'line' | 'circle' | 'arc' | 'ellipse' | 'ellipseArc' | 'bspline'

export type PairKey = `${CurveKind}|${CurveKind}`

type PairNormalizeResult = {
    key: PairKey
    swapped: boolean
}

const kindOrder: Record<CurveKind, number> = {
    line: 0,
    circle: 1,
    arc: 2,
    ellipse: 3,
    ellipseArc: 4,
    bspline: 5,
}

export function normalizePair(k1: CurveKind, k2: CurveKind): PairNormalizeResult {
    if (kindOrder[k1] <= kindOrder[k2]) {
        return { key: `${k1}|${k2}`, swapped: false }
    }
    return { key: `${k2}|${k1}`, swapped: true }
}

