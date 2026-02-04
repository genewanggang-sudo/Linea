/*
 * Linea Math - Types
 * 类型安全相关的辅助定义
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Ctor = abstract new (...args: any[]) => unknown

/** 3x3 矩阵行主序数组 */
export type Num3x3 = readonly [
    number, number, number,
    number, number, number,
    number, number, number,
]
