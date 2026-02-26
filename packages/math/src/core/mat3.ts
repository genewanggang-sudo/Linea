/*
 * Linea Math - Core
 * Mat3：二维仿射矩阵，列向量 + 右乘约定
 */

import { GeomBase } from './geom_base'
import { EN_GEO_TYPE } from '../constants/geom_type'
import { RegisterGeom } from '../serialize/geom_mgr'
import type { IDBMat3 } from '../serialize/dump_types'
import { Vec2 } from './vec2'
import type { Num3x3 } from '../types/type_guard'
import type { IMat3 } from '../types/type_define'
import { Precision } from '../utils/precision'
import { MathError } from '../utils/math_error'

@RegisterGeom
export class Mat3 extends GeomBase implements IMat3 {
    /** 序列化类型标识 */
    public static readonly type = EN_GEO_TYPE.Mat3

    /**
     * 矩阵元素（列主序存储）
     * 对外输入/输出使用行主序
     */
    public elements: Num3x3

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

    /** 使用行主序数组设置矩阵 */
    private setFromRowMajor(e: Num3x3) {
        this.elements = Mat3.toColumnMajor(e)
        return this
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

    /** 右乘：this * m（就地修改） */
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
        return this.setFromRowMajor([a00, a01, a02, a10, a11, a12, a20, a21, a22])
    }

    /** 右乘：this * m（返回新对象） */
    public multiplied(m: Mat3) {
        return this.clone().multiply(m)
    }

    /** 左乘：m * this（就地修改） */
    public premultiply(m: Mat3) {
        const a00 = m.at(0, 0) * this.at(0, 0) + m.at(0, 1) * this.at(1, 0) + m.at(0, 2) * this.at(2, 0)
        const a01 = m.at(0, 0) * this.at(0, 1) + m.at(0, 1) * this.at(1, 1) + m.at(0, 2) * this.at(2, 1)
        const a02 = m.at(0, 0) * this.at(0, 2) + m.at(0, 1) * this.at(1, 2) + m.at(0, 2) * this.at(2, 2)
        const a10 = m.at(1, 0) * this.at(0, 0) + m.at(1, 1) * this.at(1, 0) + m.at(1, 2) * this.at(2, 0)
        const a11 = m.at(1, 0) * this.at(0, 1) + m.at(1, 1) * this.at(1, 1) + m.at(1, 2) * this.at(2, 1)
        const a12 = m.at(1, 0) * this.at(0, 2) + m.at(1, 1) * this.at(1, 2) + m.at(1, 2) * this.at(2, 2)
        const a20 = m.at(2, 0) * this.at(0, 0) + m.at(2, 1) * this.at(1, 0) + m.at(2, 2) * this.at(2, 0)
        const a21 = m.at(2, 0) * this.at(0, 1) + m.at(2, 1) * this.at(1, 1) + m.at(2, 2) * this.at(2, 1)
        const a22 = m.at(2, 0) * this.at(0, 2) + m.at(2, 1) * this.at(1, 2) + m.at(2, 2) * this.at(2, 2)
        return this.setFromRowMajor([a00, a01, a02, a10, a11, a12, a20, a21, a22])
    }

    /** 左乘：m * this（返回新对象） */
    public premultiplied(m: Mat3) {
        return this.clone().premultiply(m)
    }

    /** 平移（右乘，就地修改） */
    public translate(tx: number, ty: number) {
        return this.multiply(Mat3.translation(tx, ty))
    }

    /** 平移（右乘，返回新对象） */
    public translated(tx: number, ty: number) {
        return this.clone().translate(tx, ty)
    }

    /** 旋转（右乘，就地修改） */
    public rotate(rad: number) {
        return this.multiply(Mat3.rotation(rad))
    }

    /** 旋转（右乘，返回新对象） */
    public rotated(rad: number) {
        return this.clone().rotate(rad)
    }

    /** 缩放（右乘，就地修改） */
    public scale(sx: number, sy: number) {
        return this.multiply(Mat3.scaling(sx, sy))
    }

    /** 缩放（右乘，返回新对象） */
    public scaled(sx: number, sy: number) {
        return this.clone().scale(sx, sy)
    }

    /** 变换点（就地修改） */
    public transformPoint(v: Vec2) {
        const x = this.at(0, 0) * v.x + this.at(0, 1) * v.y + this.at(0, 2)
        const y = this.at(1, 0) * v.x + this.at(1, 1) * v.y + this.at(1, 2)
        v.x = x
        v.y = y
        return v
    }

    /** 变换点（返回新对象） */
    public transformedPoint(v: Vec2) {
        return v.clone().applyMat3(this)
    }

    /** 变换向量（就地修改，不含平移） */
    public transformVector(v: Vec2) {
        const x = this.at(0, 0) * v.x + this.at(0, 1) * v.y
        const y = this.at(1, 0) * v.x + this.at(1, 1) * v.y
        v.x = x
        v.y = y
        return v
    }

    /** 变换向量（返回新对象，不含平移） */
    public transformedVector(v: Vec2) {
        return new Vec2(
            this.at(0, 0) * v.x + this.at(0, 1) * v.y,
            this.at(1, 0) * v.x + this.at(1, 1) * v.y,
        )
    }

    /** 行列式 */
    public determinant() {
        const a = this.at(0, 0), b = this.at(0, 1), c = this.at(0, 2)
        const d = this.at(1, 0), e = this.at(1, 1), f = this.at(1, 2)
        const g = this.at(2, 0), h = this.at(2, 1), i = this.at(2, 2)
        return a * e * i + b * f * g + c * d * h - c * e * g - b * d * i - a * f * h
    }

    /** 逆矩阵（就地修改，不可逆抛错） */
    public invert(eps = Precision.LEN_EPS) {
        const det = this.determinant()
        if (Math.abs(det) <= eps) {
            MathError.throw('Mat3.invert: matrix is not invertible')
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
        return this.setFromRowMajor([
            A * invDet, B * invDet, C * invDet,
            D * invDet, E * invDet, F * invDet,
            G * invDet, H * invDet, I * invDet,
        ])
    }

    /** 逆矩阵（返回新对象） */
    public inverted(eps = Precision.LEN_EPS) {
        return this.clone().invert(eps)
    }

    /** 近似相等 */
    public equals(m: Mat3, eps = Precision.EPS) {
        const a = this.elements
        const b = m.elements
        return (
            Precision.equal(a[0], b[0], eps) &&
            Precision.equal(a[1], b[1], eps) &&
            Precision.equal(a[2], b[2], eps) &&
            Precision.equal(a[3], b[3], eps) &&
            Precision.equal(a[4], b[4], eps) &&
            Precision.equal(a[5], b[5], eps) &&
            Precision.equal(a[6], b[6], eps) &&
            Precision.equal(a[7], b[7], eps) &&
            Precision.equal(a[8], b[8], eps)
        )
    }

    /** 转为数组（行主序） */
    public toArray() {
        return Mat3.toRowMajor(this.elements)
    }

    /**
     * 分解为平移/旋转/缩放
     * - 假定矩阵不包含剪切
     * - 旋转角为弧度
     */
    public decompose() {
        const e = this.toArray()
        const m00 = e[0], m01 = e[1], m02 = e[2]
        const m10 = e[3], m11 = e[4], m12 = e[5]

        const tx = m02
        const ty = m12

        const sx = Math.hypot(m00, m10)
        let sy = Math.hypot(m01, m11)

        const det = m00 * m11 - m01 * m10
        if (det < 0) {
            sy = -sy
        }

        const rotation = Math.atan2(m10, m00)

        return {
            translation: new Vec2(tx, ty),
            rotation,
            scale: new Vec2(sx, sy),
        }
    }

    /**
     * 判断矩阵是否为二维相似变换。
     * 对线性部分 A 的要求：
     * - 在容差内满足 A^T A = s^2 I
     * - s > 0
     * 允许镜像（det(A) < 0）。
     */
    public isSimilarity2D(eps = Precision.CURVE_PARAM_EPS) {
        const e = this.toArray()
        if (!Precision.nearlyZero(e[6], eps) || !Precision.nearlyZero(e[7], eps) || !Precision.equal(e[8], 1, eps)) {
            return false
        }

        const a = e[0]
        const b = e[1]
        const c = e[3]
        const d = e[4]

        const col0Sq = a * a + c * c
        const col1Sq = b * b + d * d
        const colDot = a * b + c * d

        if (col0Sq <= eps * eps || col1Sq <= eps * eps) return false
        if (!Precision.nearlyZero(colDot, eps)) return false
        return Precision.equal(col0Sq, col1Sq, eps)
    }

    /**
     * 返回二维相似变换的统一缩放系数。
     * 若矩阵不是二维相似变换则抛错。
     */
    public getSimilarityScale2D(eps = Precision.CURVE_PARAM_EPS) {
        MathError.assert(this.isSimilarity2D(eps), 'Mat3.getSimilarityScale2D: matrix is not a 2D similarity transform')
        const e = this.toArray()
        const col0Sq = e[0] * e[0] + e[3] * e[3]
        const col1Sq = e[1] * e[1] + e[4] * e[4]
        return Math.sqrt((col0Sq + col1Sq) * 0.5)
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
