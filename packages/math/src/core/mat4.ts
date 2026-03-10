import { EN_GEO_TYPE } from '../constants/geom_type'
import type { IDBMat4 } from '../serialize/dump_types'
import { RegisterGeom } from '../serialize/geom_mgr'
import type { IMat4, IVec3 } from '../types/type_define'
import type { Num4x4 } from '../types/type_guard'
import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { GeomBase } from './geom_base'
import { Vec3 } from './vec3'

type MutableNum4x4 = [...Num4x4]

@RegisterGeom
export class Mat4 extends GeomBase implements IMat4 {
    /** 序列化类型标识 */
    public static readonly type = EN_GEO_TYPE.Mat4

    /**
     * 矩阵元素（列主序存储）
     * - 对外构造和导出使用行主序
     */
    public elements: Num4x4

    /** 创建一个 4x4 矩阵（对外按行主序输入） */
    constructor(
        m00 = 1, m01 = 0, m02 = 0, m03 = 0,
        m10 = 0, m11 = 1, m12 = 0, m13 = 0,
        m20 = 0, m21 = 0, m22 = 1, m23 = 0,
        m30 = 0, m31 = 0, m32 = 0, m33 = 1,
    ) {
        super()
        this.elements = Mat4.toColumnMajor([
            m00, m01, m02, m03,
            m10, m11, m12, m13,
            m20, m21, m22, m23,
            m30, m31, m32, m33,
        ])
    }

    /** 行主序 -> 列主序 */
    private static toColumnMajor(e: Num4x4) {
        return [
            e[0], e[4], e[8], e[12],
            e[1], e[5], e[9], e[13],
            e[2], e[6], e[10], e[14],
            e[3], e[7], e[11], e[15],
        ] as const
    }

    /** 列主序 -> 行主序 */
    private static toRowMajor(e: Num4x4) {
        return [
            e[0], e[4], e[8], e[12],
            e[1], e[5], e[9], e[13],
            e[2], e[6], e[10], e[14],
            e[3], e[7], e[11], e[15],
        ] as const
    }

    /** 使用行主序数组设置当前矩阵 */
    private setFromRowMajor(e: Num4x4) {
        this.elements = Mat4.toColumnMajor(e)
        return this
    }

    /** 读取指定行列的元素（索引从 0 开始） */
    private at(row: 0 | 1 | 2 | 3, col: 0 | 1 | 2 | 3) {
        return this.elements[col * 4 + row]
    }

    /** 单位矩阵 */
    public static identity() {
        return new Mat4()
    }

    /** 平移矩阵 */
    public static translation(tx: number, ty: number, tz: number) {
        return new Mat4(
            1, 0, 0, tx,
            0, 1, 0, ty,
            0, 0, 1, tz,
            0, 0, 0, 1,
        )
    }

    /** 由平移向量构造平移矩阵 */
    public static makeTranslate(offset: IVec3) {
        return Mat4.translation(offset.x, offset.y, offset.z)
    }

    /** 缩放矩阵 */
    public static scaling(sx: number, sy: number, sz: number) {
        return new Mat4(
            sx, 0, 0, 0,
            0, sy, 0, 0,
            0, 0, sz, 0,
            0, 0, 0, 1,
        )
    }

    /**
     * 以指定中心点构造等比缩放矩阵
     * @param center 缩放中心
     * @param scale 缩放因子
     */
    public static makeScale(center: IVec3, scale: number) {
        return Mat4.translation(center.x, center.y, center.z)
            .multiply(Mat4.scaling(scale, scale, scale))
            .multiply(Mat4.translation(-center.x, -center.y, -center.z))
    }

    /** 绕 X 轴旋转矩阵（弧度） */
    public static rotationX(rad: number) {
        const c = Math.cos(rad)
        const s = Math.sin(rad)
        return new Mat4(
            1, 0, 0, 0,
            0, c, -s, 0,
            0, s, c, 0,
            0, 0, 0, 1,
        )
    }

    /** 绕 Y 轴旋转矩阵（弧度） */
    public static rotationY(rad: number) {
        const c = Math.cos(rad)
        const s = Math.sin(rad)
        return new Mat4(
            c, 0, s, 0,
            0, 1, 0, 0,
            -s, 0, c, 0,
            0, 0, 0, 1,
        )
    }

    /** 绕 Z 轴旋转矩阵（弧度） */
    public static rotationZ(rad: number) {
        const c = Math.cos(rad)
        const s = Math.sin(rad)
        return new Mat4(
            c, -s, 0, 0,
            s, c, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        )
    }

    /** 绕指定点作 X 轴旋转矩阵（弧度） */
    public static makeRotateX(pivot: IVec3, rad: number) {
        return Mat4.translation(pivot.x, pivot.y, pivot.z)
            .multiply(Mat4.rotationX(rad))
            .multiply(Mat4.translation(-pivot.x, -pivot.y, -pivot.z))
    }

    /** 绕指定点作 Y 轴旋转矩阵（弧度） */
    public static makeRotateY(pivot: IVec3, rad: number) {
        return Mat4.translation(pivot.x, pivot.y, pivot.z)
            .multiply(Mat4.rotationY(rad))
            .multiply(Mat4.translation(-pivot.x, -pivot.y, -pivot.z))
    }

    /** 绕指定点作 Z 轴旋转矩阵（弧度） */
    public static makeRotateZ(pivot: IVec3, rad: number) {
        return Mat4.translation(pivot.x, pivot.y, pivot.z)
            .multiply(Mat4.rotationZ(rad))
            .multiply(Mat4.translation(-pivot.x, -pivot.y, -pivot.z))
    }

    /** 克隆矩阵 */
    public clone() {
        const e = Mat4.toRowMajor(this.elements)
        return new Mat4(
            e[0], e[1], e[2], e[3],
            e[4], e[5], e[6], e[7],
            e[8], e[9], e[10], e[11],
            e[12], e[13], e[14], e[15],
        )
    }

    /** 右乘：this = this * m */
    public multiply(m: Mat4) {
        const out: MutableNum4x4 = [
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
        ]
        for (let row = 0 as 0 | 1 | 2 | 3; row < 4; row++) {
            for (let col = 0 as 0 | 1 | 2 | 3; col < 4; col++) {
                let sum = 0
                for (let k = 0 as 0 | 1 | 2 | 3; k < 4; k++) {
                    sum += this.at(row, k) * m.at(k, col)
                }
                out[row * 4 + col] = sum
            }
        }
        return this.setFromRowMajor(out)
    }

    /** 右乘并返回新矩阵 */
    public multiplied(m: Mat4) {
        return this.clone().multiply(m)
    }

    /** 左乘：this = m * this */
    public premultiply(m: Mat4) {
        return this.setFromRowMajor(Mat4.toRowMajor(m.multiplied(this).elements))
    }

    /** 左乘并返回新矩阵 */
    public premultiplied(m: Mat4) {
        return this.clone().premultiply(m)
    }

    /** 右乘平移矩阵（就地修改） */
    public translate(tx: number, ty: number, tz: number) {
        return this.multiply(Mat4.translation(tx, ty, tz))
    }

    /** 右乘平移矩阵（返回新矩阵） */
    public translated(tx: number, ty: number, tz: number) {
        return this.clone().translate(tx, ty, tz)
    }

    /** 右乘缩放矩阵（就地修改） */
    public scale(sx: number, sy: number, sz: number) {
        return this.multiply(Mat4.scaling(sx, sy, sz))
    }

    /** 右乘缩放矩阵（返回新矩阵） */
    public scaled(sx: number, sy: number, sz: number) {
        return this.clone().scale(sx, sy, sz)
    }

    /** 右乘 X 轴旋转矩阵（就地修改） */
    public rotateX(rad: number) {
        return this.multiply(Mat4.rotationX(rad))
    }

    /** 右乘 Y 轴旋转矩阵（就地修改） */
    public rotateY(rad: number) {
        return this.multiply(Mat4.rotationY(rad))
    }

    /** 右乘 Z 轴旋转矩阵（就地修改） */
    public rotateZ(rad: number) {
        return this.multiply(Mat4.rotationZ(rad))
    }

    /** 右乘 X 轴旋转矩阵（返回新矩阵） */
    public rotatedX(rad: number) {
        return this.clone().rotateX(rad)
    }

    /** 右乘 Y 轴旋转矩阵（返回新矩阵） */
    public rotatedY(rad: number) {
        return this.clone().rotateY(rad)
    }

    /** 右乘 Z 轴旋转矩阵（返回新矩阵） */
    public rotatedZ(rad: number) {
        return this.clone().rotateZ(rad)
    }

    /**
     * 变换点（就地修改）
     * - 包含平移分量
     * - 若 w 不为 1，会自动做齐次除法
     */
    public transformPoint(v: Vec3) {
        const x = this.at(0, 0) * v.x + this.at(0, 1) * v.y + this.at(0, 2) * v.z + this.at(0, 3)
        const y = this.at(1, 0) * v.x + this.at(1, 1) * v.y + this.at(1, 2) * v.z + this.at(1, 3)
        const z = this.at(2, 0) * v.x + this.at(2, 1) * v.y + this.at(2, 2) * v.z + this.at(2, 3)
        const w = this.at(3, 0) * v.x + this.at(3, 1) * v.y + this.at(3, 2) * v.z + this.at(3, 3)
        if (Math.abs(w) > Precision.LEN_EPS && Math.abs(w - 1) > Precision.EPS) {
            v.x = x / w
            v.y = y / w
            v.z = z / w
            return v
        }
        v.x = x
        v.y = y
        v.z = z
        return v
    }

    /** 变换点并返回新对象 */
    public transformedPoint(v: Vec3) {
        return this.transformPoint(v.clone())
    }

    /**
     * 变换向量（就地修改）
     * - 不包含平移分量
     */
    public transformVector(v: Vec3) {
        const x = this.at(0, 0) * v.x + this.at(0, 1) * v.y + this.at(0, 2) * v.z
        const y = this.at(1, 0) * v.x + this.at(1, 1) * v.y + this.at(1, 2) * v.z
        const z = this.at(2, 0) * v.x + this.at(2, 1) * v.y + this.at(2, 2) * v.z
        v.x = x
        v.y = y
        v.z = z
        return v
    }

    /** 变换向量并返回新对象 */
    public transformedVector(v: Vec3) {
        return this.transformVector(v.clone())
    }

    /** 计算行列式 */
    public determinant() {
        const m: MutableNum4x4 = [...Mat4.toRowMajor(this.elements)]
        let det = 1
        let sign = 1
        for (let i = 0; i < 4; i++) {
            let pivot = i
            for (let r = i + 1; r < 4; r++) {
                if (Math.abs(m[r * 4 + i]) > Math.abs(m[pivot * 4 + i])) pivot = r
            }
            const pivotVal = m[pivot * 4 + i]
            if (Math.abs(pivotVal) <= Precision.LEN_EPS) return 0
            if (pivot !== i) {
                for (let c = 0; c < 4; c++) {
                    const idxA = i * 4 + c
                    const idxB = pivot * 4 + c
                    const tmp = m[idxA]
                    m[idxA] = m[idxB]
                    m[idxB] = tmp
                }
                sign *= -1
            }
            det *= m[i * 4 + i]
            for (let r = i + 1; r < 4; r++) {
                const factor = m[r * 4 + i] / m[i * 4 + i]
                for (let c = i; c < 4; c++) {
                    m[r * 4 + c] -= factor * m[i * 4 + c]
                }
            }
        }
        return det * sign
    }

    /**
     * 计算逆矩阵（就地修改）
     * @throws 当矩阵不可逆时抛出异常
     */
    public invert(eps = Precision.LEN_EPS) {
        const a: MutableNum4x4 = [...Mat4.toRowMajor(this.elements)]
        const inv: MutableNum4x4 = [...Mat4.toRowMajor(Mat4.identity().elements)]

        for (let i = 0; i < 4; i++) {
            let pivot = i
            for (let r = i + 1; r < 4; r++) {
                if (Math.abs(a[r * 4 + i]) > Math.abs(a[pivot * 4 + i])) pivot = r
            }
            const pivotVal = a[pivot * 4 + i]
            if (Math.abs(pivotVal) <= eps) {
                MathError.throw('Mat4.invert: matrix is not invertible')
            }

            if (pivot !== i) {
                for (let c = 0; c < 4; c++) {
                    let tmp = a[i * 4 + c]
                    a[i * 4 + c] = a[pivot * 4 + c]
                    a[pivot * 4 + c] = tmp

                    tmp = inv[i * 4 + c]
                    inv[i * 4 + c] = inv[pivot * 4 + c]
                    inv[pivot * 4 + c] = tmp
                }
            }

            const scale = a[i * 4 + i]
            for (let c = 0; c < 4; c++) {
                a[i * 4 + c] /= scale
                inv[i * 4 + c] /= scale
            }

            for (let r = 0; r < 4; r++) {
                if (r === i) continue
                const factor = a[r * 4 + i]
                if (Math.abs(factor) <= eps) continue
                for (let c = 0; c < 4; c++) {
                    a[r * 4 + c] -= factor * a[i * 4 + c]
                    inv[r * 4 + c] -= factor * inv[i * 4 + c]
                }
            }
        }

        return this.setFromRowMajor(inv)
    }

    /** 计算逆矩阵并返回新对象 */
    public inverted(eps = Precision.LEN_EPS) {
        return this.clone().invert(eps)
    }

    /** 近似相等判断 */
    public equals(m: Mat4, eps = Precision.EPS) {
        const a = this.elements
        const b = m.elements
        for (let i = 0; i < 16; i++) {
            if (!Precision.equal(a[i], b[i], eps)) return false
        }
        return true
    }

    /** 导出为行主序数组 */
    public toArray() {
        return Mat4.toRowMajor(this.elements)
    }

    /** 序列化为结构对象 */
    public dump(): IDBMat4 {
        return {
            type: Mat4.type,
            elements: this.toArray(),
        }
    }

    /** 从结构对象反序列化 */
    public static load(data: IDBMat4) {
        const e = data.elements
        return new Mat4(
            e[0], e[1], e[2], e[3],
            e[4], e[5], e[6], e[7],
            e[8], e[9], e[10], e[11],
            e[12], e[13], e[14], e[15],
        )
    }
}
