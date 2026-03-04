/*
 * Linea Math - Serialize
 * 搴忓垪鍖栫粨鏋勭被鍨嬪畾涔?
 */

import { EN_GEO_TYPE } from '../constants/geom_type'
import type { Num3x3 } from '../types/type_guard'

export type IDB = {
    type: EN_GEO_TYPE
}

export type IDBVec2 = IDB & {
    type: EN_GEO_TYPE.Vec2
    x: number
    y: number
}

export type IDBMat3 = IDB & {
    type: EN_GEO_TYPE.Mat3
    elements: Num3x3
}

export type IDBBox2 = IDB & {
    type: EN_GEO_TYPE.Box2
    minX: number
    minY: number
    maxX: number
    maxY: number
}

export type IDBCoord2D = IDB & {
    type: EN_GEO_TYPE.Coord2D
    origin: { x: number; y: number }
    xAxis: { x: number; y: number }
    yAxis: { x: number; y: number }
}

export type IDBLine2 = IDB & {
    type: EN_GEO_TYPE.Line2
    start: { x: number; y: number }
    end: { x: number; y: number }
}

export type IDBCircle2 = IDB & {
    type: EN_GEO_TYPE.Circle2
    center: { x: number; y: number }
    radius: number
}

export type IDBArc2 = IDB & {
    type: EN_GEO_TYPE.Arc2
    center: { x: number; y: number }
    radius: number
    startAngle: number
    endAngle: number
    clockwise: boolean
}

export type IDBEllipse2 = IDB & {
    type: EN_GEO_TYPE.Ellipse2
    center: { x: number; y: number }
    rx: number
    ry: number
    rotation: number
}

export type IDBEllipseArc2 = IDB & {
    type: EN_GEO_TYPE.EllipseArc2
    center: { x: number; y: number }
    rx: number
    ry: number
    rotation: number
    startAngle: number
    endAngle: number
    clockwise: boolean
}

export type IDBBSpline2 = IDB & {
    type: EN_GEO_TYPE.BSpline2
    controlPoints: Array<{ x: number; y: number }>
    degree: number
    knots: Array<number>
    multiplicities: Array<number>
    weights?: Array<number>
    isClosed?: boolean
    isPeriodic?: boolean
}
