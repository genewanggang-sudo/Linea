/*
 * Linea Math - Types
 * 类型安全相关的辅助定义
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Ctor = abstract new (...args: any[]) => unknown

/** 2D 向量元组 */
export type Num2 = readonly [number, number]

/** 3D 向量元组 */
export type Num3 = readonly [number, number, number]

/** 4D 向量元组 */
export type Num4 = readonly [number, number, number, number]

/** 2x2 矩阵行主序数组 */
export type Num2x2 = readonly [
    number, number,
    number, number,
]

/** 3x3 矩阵行主序数组 */
export type Num3x3 = readonly [
    number, number, number,
    number, number, number,
    number, number, number,
]

/** 4x4 矩阵行主序数组 */
export type Num4x4 = readonly [
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
    number, number, number, number,
]
