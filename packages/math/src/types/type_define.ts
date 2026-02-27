/*
 * Linea Math - Types
 * 数学库相关的通用类型定义
 */

import type { Num3x3 } from './type_guard'

/** 二维向量类型 */
export interface IVec2 {
    x: number
    y: number
}

/** 二维带权点（可用于齐次坐标或加权几何计算） */
export interface IWeightedPoint2 extends IVec2 {
    w: number
}

/** 二维坐标轴枚举 */
export enum Axis2D {
    X = 'x',
    Y = 'y',
}

/** 3x3 矩阵类型（对外行主序） */
export interface IMat3 {
    elements: Num3x3
}

/** 曲线最近点查询结果 */
export interface IClosestPointResult {
    /** 最近点坐标 */
    point: IVec2
    /** 最近点对应参数 */
    param: number
    /** 查询点到曲线的距离 */
    distance: number
}
