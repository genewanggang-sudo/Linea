/*
 * Linea Math - Core
 * Mat3：二维仿射矩阵，列向量 + 右乘约定
 */

import { GeomBase } from './geom_base'
import { EN_GEO_TYPE } from '../constants/geom_type'
import { RegisterGeom } from '../serialize/geom_mgr'
import type { IDBMat3 } from '../serialize/dump_types'
import { Vec2 } from './Vec2'
import type { Num3x3 } from '../types/type_guard'

@RegisterGeom
export class Mat3 extends GeomBase {
    /** 序列化类型标识 */
    public static readonly type = EN_GEO_TYPE.Mat3

    /**
     * 矩阵元素（列主序存储）
     * 对外输入/输出使用行主序
     */
    public readonly elements: Num3x3

    /** 创建一个 3x3 矩阵（对外行主序输入，内部列主序存储） */
    constructor(
        m00 = 1, m01 = 0, m02 = 0,
        m10 = 0, m11 = 1, m12 = 0,
        m20 = 0, m21 = 0, m22 = 1,
    ) {
        super()
        this.elements = Mat3.toColumnMajor([
            m00, m01, m02,
            m10, m11, m12,
            m20, m21, m22,
        ])
    }

    /** 行主序 -> 列主序 */
    private static toColumnMajor(e: Num3x3) {
        return [
            e[0], e[3], e[6],
            e[1], e[4], e[7],
            e[2], e[5], e[8],
        ] as const
    }

    /** 列主序 -> 行主序 */
    private static toRowMajor(e: Num3x3) {
        return [
            e[0], e[3], e[6],
            e[1], e[4], e[7],
            e[2], e[5], e[8],
        ] as const
    }

    /** 取行列元素（row/col 从 0 开始） */
    private at(row: 0 | 1 | 2, col: 0 | 1 | 2) {
        return this.elements[col * 3 + row]
    }

    /** 单位矩阵 */
    public static identity() {
        return new Mat3()
    }

    /** 平移矩阵 */
    public static translation(tx: number, ty: number) {
        return new Mat3(
            1, 0, tx,
            0, 1, ty,
            0, 0, 1,
        )
    }

    /** 旋转矩阵（弧度） */
    public static rotation(rad: number) {
        const c = Math.cos(rad)
        const s = Math.sin(rad)
        return new Mat3(
            c, -s, 0,
            s, c, 0,
            0, 0, 1,
        )
    }

    /** 缩放矩阵 */
    public static scaling(sx: number, sy: number) {
        return new Mat3(
            sx, 0, 0,
            0, sy, 0,
            0, 0, 1,
        )
    }

    /** 克隆 */
    public clone() {
        const e = Mat3.toRowMajor(this.elements)
        return new Mat3(
            e[0], e[1], e[2],
            e[3], e[4], e[5],
            e[6], e[7], e[8],
        )
    }

    /** 右乘：this * m（列向量约定，链式时右侧先作用） */
    public multiply(m: Mat3) {
        const a00 = this.at(0, 0) * m.at(0, 0) + this.at(0, 1) * m.at(1, 0) + this.at(0, 2) * m.at(2, 0)
        const a01 = this.at(0, 0) * m.at(0, 1) + this.at(0, 1) * m.at(1, 1) + this.at(0, 2) * m.at(2, 1)
        const a02 = this.at(0, 0) * m.at(0, 2) + this.at(0, 1) * m.at(1, 2) + this.at(0, 2) * m.at(2, 2)
        const a10 = this.at(1, 0) * m.at(0, 0) + this.at(1, 1) * m.at(1, 0) + this.at(1, 2) * m.at(2, 0)
        const a11 = this.at(1, 0) * m.at(0, 1) + this.at(1, 1) * m.at(1, 1) + this.at(1, 2) * m.at(2, 1)
        const a12 = this.at(1, 0) * m.at(0, 2) + this.at(1, 1) * m.at(1, 2) + this.at(1, 2) * m.at(2, 2)
        const a20 = this.at(2, 0) * m.at(0, 0) + this.at(2, 1) * m.at(1, 0) + this.at(2, 2) * m.at(2, 0)
        const a21 = this.at(2, 0) * m.at(0, 1) + this.at(2, 1) * m.at(1, 1) + this.at(2, 2) * m.at(2, 1)
        const a22 = this.at(2, 0) * m.at(0, 2) + this.at(2, 1) * m.at(1, 2) + this.at(2, 2) * m.at(2, 2)
        return new Mat3(a00, a01, a02, a10, a11, a12, a20, a21, a22)
    }

    /** 左乘：m * this */
    public premultiply(m: Mat3) {
        return m.multiply(this)
    }

    /** 平移（右乘） */
    public translate(tx: number, ty: number) {
        return this.multiply(Mat3.translation(tx, ty))
    }

    /** 旋转（右乘） */
    public rotate(rad: number) {
        return this.multiply(Mat3.rotation(rad))
    }

    /** 缩放（右乘） */
    public scale(sx: number, sy: number) {
        return this.multiply(Mat3.scaling(sx, sy))
    }

    /** 变换点（列向量） */
    public transformPoint(v: Vec2) {
        const x = this.at(0, 0) * v.x + this.at(0, 1) * v.y + this.at(0, 2)
        const y = this.at(1, 0) * v.x + this.at(1, 1) * v.y + this.at(1, 2)
        return new Vec2(x, y)
    }

    /** 行列式 */
    public determinant() {
        const a = this.at(0, 0), b = this.at(0, 1), c = this.at(0, 2)
        const d = this.at(1, 0), e = this.at(1, 1), f = this.at(1, 2)
        const g = this.at(2, 0), h = this.at(2, 1), i = this.at(2, 2)
        return a * e * i + b * f * g + c * d * h - c * e * g - b * d * i - a * f * h
    }

    /** 逆矩阵（不可逆抛错） */
    public invert(eps = 1e-12) {
        const det = this.determinant()
        if (Math.abs(det) <= eps) {
            throw new Error('Mat3.invert: matrix is not invertible')
        }
        const a = this.at(0, 0), b = this.at(0, 1), c = this.at(0, 2)
        const d = this.at(1, 0), e = this.at(1, 1), f = this.at(1, 2)
        const g = this.at(2, 0), h = this.at(2, 1), i = this.at(2, 2)

        const A = e * i - f * h
        const B = c * h - b * i
        const C = b * f - c * e
        const D = f * g - d * i
        const E = a * i - c * g
        const F = c * d - a * f
        const G = d * h - e * g
        const H = b * g - a * h
        const I = a * e - b * d

        const invDet = 1 / det
        return new Mat3(
            A * invDet, B * invDet, C * invDet,
            D * invDet, E * invDet, F * invDet,
            G * invDet, H * invDet, I * invDet,
        )
    }

    /** 近似相等 */
    public equals(m: Mat3, eps = 1e-9) {
        const a = this.elements
        const b = m.elements
        return (
            Math.abs(a[0] - b[0]) <= eps &&
            Math.abs(a[1] - b[1]) <= eps &&
            Math.abs(a[2] - b[2]) <= eps &&
            Math.abs(a[3] - b[3]) <= eps &&
            Math.abs(a[4] - b[4]) <= eps &&
            Math.abs(a[5] - b[5]) <= eps &&
            Math.abs(a[6] - b[6]) <= eps &&
            Math.abs(a[7] - b[7]) <= eps &&
            Math.abs(a[8] - b[8]) <= eps
        )
    }

    /** 转为数组（行主序） */
    public toArray() {
        return Mat3.toRowMajor(this.elements)
    }

    /** 序列化为结构对象 */
    public dump(): IDBMat3 {
        return {
            type: Mat3.type,
            elements: this.toArray(),
        }
    }

    /** 从结构对象反序列化 */
    public static load(data: IDBMat3) {
        const e = data.elements
        return new Mat3(
            e[0], e[1], e[2],
            e[3], e[4], e[5],
            e[6], e[7], e[8],
        )
    }
}
