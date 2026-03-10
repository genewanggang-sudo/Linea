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
    public static readonly type = EN_GEO_TYPE.Mat4

    public elements: Num4x4

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

    private static toColumnMajor(e: Num4x4) {
        return [
            e[0], e[4], e[8], e[12],
            e[1], e[5], e[9], e[13],
            e[2], e[6], e[10], e[14],
            e[3], e[7], e[11], e[15],
        ] as const
    }

    private static toRowMajor(e: Num4x4) {
        return [
            e[0], e[4], e[8], e[12],
            e[1], e[5], e[9], e[13],
            e[2], e[6], e[10], e[14],
            e[3], e[7], e[11], e[15],
        ] as const
    }

    private setFromRowMajor(e: Num4x4) {
        this.elements = Mat4.toColumnMajor(e)
        return this
    }

    private at(row: 0 | 1 | 2 | 3, col: 0 | 1 | 2 | 3) {
        return this.elements[col * 4 + row]
    }

    public static identity() {
        return new Mat4()
    }

    public static translation(tx: number, ty: number, tz: number) {
        return new Mat4(
            1, 0, 0, tx,
            0, 1, 0, ty,
            0, 0, 1, tz,
            0, 0, 0, 1,
        )
    }

    public static makeTranslate(offset: IVec3) {
        return Mat4.translation(offset.x, offset.y, offset.z)
    }

    public static scaling(sx: number, sy: number, sz: number) {
        return new Mat4(
            sx, 0, 0, 0,
            0, sy, 0, 0,
            0, 0, sz, 0,
            0, 0, 0, 1,
        )
    }

    public static makeScale(center: IVec3, scale: number) {
        return Mat4.translation(center.x, center.y, center.z)
            .multiply(Mat4.scaling(scale, scale, scale))
            .multiply(Mat4.translation(-center.x, -center.y, -center.z))
    }

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

    public static makeRotateX(pivot: IVec3, rad: number) {
        return Mat4.translation(pivot.x, pivot.y, pivot.z)
            .multiply(Mat4.rotationX(rad))
            .multiply(Mat4.translation(-pivot.x, -pivot.y, -pivot.z))
    }

    public static makeRotateY(pivot: IVec3, rad: number) {
        return Mat4.translation(pivot.x, pivot.y, pivot.z)
            .multiply(Mat4.rotationY(rad))
            .multiply(Mat4.translation(-pivot.x, -pivot.y, -pivot.z))
    }

    public static makeRotateZ(pivot: IVec3, rad: number) {
        return Mat4.translation(pivot.x, pivot.y, pivot.z)
            .multiply(Mat4.rotationZ(rad))
            .multiply(Mat4.translation(-pivot.x, -pivot.y, -pivot.z))
    }

    public clone() {
        const e = Mat4.toRowMajor(this.elements)
        return new Mat4(
            e[0], e[1], e[2], e[3],
            e[4], e[5], e[6], e[7],
            e[8], e[9], e[10], e[11],
            e[12], e[13], e[14], e[15],
        )
    }

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

    public multiplied(m: Mat4) {
        return this.clone().multiply(m)
    }

    public premultiply(m: Mat4) {
        return this.setFromRowMajor(Mat4.toRowMajor(m.multiplied(this).elements))
    }

    public premultiplied(m: Mat4) {
        return this.clone().premultiply(m)
    }

    public translate(tx: number, ty: number, tz: number) {
        return this.multiply(Mat4.translation(tx, ty, tz))
    }

    public translated(tx: number, ty: number, tz: number) {
        return this.clone().translate(tx, ty, tz)
    }

    public scale(sx: number, sy: number, sz: number) {
        return this.multiply(Mat4.scaling(sx, sy, sz))
    }

    public scaled(sx: number, sy: number, sz: number) {
        return this.clone().scale(sx, sy, sz)
    }

    public rotateX(rad: number) {
        return this.multiply(Mat4.rotationX(rad))
    }

    public rotateY(rad: number) {
        return this.multiply(Mat4.rotationY(rad))
    }

    public rotateZ(rad: number) {
        return this.multiply(Mat4.rotationZ(rad))
    }

    public rotatedX(rad: number) {
        return this.clone().rotateX(rad)
    }

    public rotatedY(rad: number) {
        return this.clone().rotateY(rad)
    }

    public rotatedZ(rad: number) {
        return this.clone().rotateZ(rad)
    }

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

    public transformedPoint(v: Vec3) {
        return this.transformPoint(v.clone())
    }

    public transformVector(v: Vec3) {
        const x = this.at(0, 0) * v.x + this.at(0, 1) * v.y + this.at(0, 2) * v.z
        const y = this.at(1, 0) * v.x + this.at(1, 1) * v.y + this.at(1, 2) * v.z
        const z = this.at(2, 0) * v.x + this.at(2, 1) * v.y + this.at(2, 2) * v.z
        v.x = x
        v.y = y
        v.z = z
        return v
    }

    public transformedVector(v: Vec3) {
        return this.transformVector(v.clone())
    }

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

    public inverted(eps = Precision.LEN_EPS) {
        return this.clone().invert(eps)
    }

    public equals(m: Mat4, eps = Precision.EPS) {
        const a = this.elements
        const b = m.elements
        for (let i = 0; i < 16; i++) {
            if (!Precision.equal(a[i], b[i], eps)) return false
        }
        return true
    }

    public toArray() {
        return Mat4.toRowMajor(this.elements)
    }

    public dump(): IDBMat4 {
        return {
            type: Mat4.type,
            elements: this.toArray(),
        }
    }

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
