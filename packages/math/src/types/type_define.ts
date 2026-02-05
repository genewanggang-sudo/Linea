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

/** 3x3 矩阵类型（对外行主序） */
export interface IMat3 {
    elements: Num3x3
}
