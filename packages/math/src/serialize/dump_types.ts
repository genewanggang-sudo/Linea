/*
 * Linea Math - Serialize
 * 搴忓垪鍖栫粨鏋勭被鍨嬪畾涔?
 */

import { EN_GEO_TYPE } from '../constants/geom_type'
import type { Num3x3, Num4x4 } from '../types/type_guard'

export type IDB = {
    type: EN_GEO_TYPE
}

export type IDBVec2 = IDB & {
    type: EN_GEO_TYPE.Vec2
    x: number
    y: number
}

export type IDBVec3 = IDB & {
    type: EN_GEO_TYPE.Vec3
    x: number
    y: number
    z: number
}

export type IDBMat3 = IDB & {
    type: EN_GEO_TYPE.Mat3
    elements: Num3x3
}

export type IDBMat4 = IDB & {
    type: EN_GEO_TYPE.Mat4
    elements: Num4x4
}

export type IDBBox2 = IDB & {
    type: EN_GEO_TYPE.Box2
    minX: number
    minY: number
    maxX: number
    maxY: number
}

export type IDBBox3 = IDB & {
    type: EN_GEO_TYPE.Box3
    minX: number
    minY: number
    minZ: number
    maxX: number
    maxY: number
    maxZ: number
}

export type IDBCoord2D = IDB & {
    type: EN_GEO_TYPE.Coord2D
    origin: IDBVec2
    xAxis: IDBVec2
    yAxis: IDBVec2
}

export type IDBCoord3D = IDB & {
    type: EN_GEO_TYPE.Coord3D
    origin: IDBVec3
    xAxis: IDBVec3
    yAxis: IDBVec3
    zAxis: IDBVec3
}

export type IDBPlane = IDB & {
    type: EN_GEO_TYPE.Plane
    coord: IDBCoord3D
}

export type IDBLine2 = IDB & {
    type: EN_GEO_TYPE.Line2
    start: IDBVec2
    end: IDBVec2
}

export type IDBCircle2 = IDB & {
    type: EN_GEO_TYPE.Circle2
    center: IDBVec2
    radius: number
}

export type IDBArc2 = IDB & {
    type: EN_GEO_TYPE.Arc2
    center: IDBVec2
    radius: number
    startAngle: number
    endAngle: number
    clockwise: boolean
}

export type IDBEllipse2 = IDB & {
    type: EN_GEO_TYPE.Ellipse2
    center: IDBVec2
    rx: number
    ry: number
    rotation: number
}

export type IDBEllipseArc2 = IDB & {
    type: EN_GEO_TYPE.EllipseArc2
    center: IDBVec2
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
