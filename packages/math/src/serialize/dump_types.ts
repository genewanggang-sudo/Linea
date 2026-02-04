/*
 * Linea Math - Serialize
 * 统一序列化数据结构定义
 */

import { EN_GEO_TYPE } from '../constants/geom_type'

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
    elements: readonly [
        number, number, number,
        number, number, number,
        number, number, number,
    ]
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
