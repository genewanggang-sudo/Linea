import { Euler, EulerOrder } from './euler';
import { Matrix4 } from './matrix4';
import { Vec3 } from './vec3';



/**
 * 四元素
 */
export class Quaternion {
    private _x: number;

    private _y: number;

    private _z: number;

    private _w: number;

    constructor(x?: number, y?: number, z?: number, w?: number) {
        this._x = x || 0;
        this._y = y || 0;
        this._z = z || 0;
        this._w = w !== undefined ? w : 1;
    }

    public get x(): number {
        return this._x;
    }

    public set x(value: number) {
        this._x = value;
    }

    public get y(): number {
        return this._y;
    }

    public set y(value: number) {
        this._y = value;
    }

    public get z(): number {
        return this._z;
    }

    public set z(value: number) {
        this._z = value;
    }

    public get w(): number {
        return this._w;
    }

    public set w(value: number) {
        this._w = value;
    }

    public set(x: number, y: number, z: number, w: number): void {
        this._x = x;
        this._y = y;
        this._z = z;
        this._w = w;
    }

    public clone(): Quaternion {
        return new Quaternion(this._x, this._y, this._z, this._w);
    }

    public copy(quaternion: Quaternion): this {
        this._x = quaternion.x;
        this._y = quaternion.y;
        this._z = quaternion.z;
        this._w = quaternion.w;
        return this;
    }

    public setFromEuler(euler: Euler): this {
        const x = euler.x;
        const y = euler.y;
        const z = euler.z;
        const order = euler.order;

        const cos = Math.cos;
        const sin = Math.sin;

        const c1 = cos(x / 2);
        const c2 = cos(y / 2);
        const c3 = cos(z / 2);

        const s1 = sin(x / 2);
        const s2 = sin(y / 2);
        const s3 = sin(z / 2);

        if (order === EulerOrder.XYZ) {
            this._x = s1 * c2 * c3 + c1 * s2 * s3;
            this._y = c1 * s2 * c3 - s1 * c2 * s3;
            this._z = c1 * c2 * s3 + s1 * s2 * c3;
            this._w = c1 * c2 * c3 - s1 * s2 * s3;
        } else if (order === EulerOrder.YXZ) {
            this._x = s1 * c2 * c3 + c1 * s2 * s3;
            this._y = c1 * s2 * c3 - s1 * c2 * s3;
            this._z = c1 * c2 * s3 - s1 * s2 * c3;
            this._w = c1 * c2 * c3 + s1 * s2 * s3;
        } else if (order === EulerOrder.ZXY) {
            this._x = s1 * c2 * c3 - c1 * s2 * s3;
            this._y = c1 * s2 * c3 + s1 * c2 * s3;
            this._z = c1 * c2 * s3 + s1 * s2 * c3;
            this._w = c1 * c2 * c3 - s1 * s2 * s3;
        } else if (order === EulerOrder.ZYX) {
            this._x = s1 * c2 * c3 - c1 * s2 * s3;
            this._y = c1 * s2 * c3 + s1 * c2 * s3;
            this._z = c1 * c2 * s3 - s1 * s2 * c3;
            this._w = c1 * c2 * c3 + s1 * s2 * s3;
        } else if (order === EulerOrder.YZX) {
            this._x = s1 * c2 * c3 + c1 * s2 * s3;
            this._y = c1 * s2 * c3 + s1 * c2 * s3;
            this._z = c1 * c2 * s3 - s1 * s2 * c3;
            this._w = c1 * c2 * c3 - s1 * s2 * s3;
        } else if (order === EulerOrder.XZY) {
            this._x = s1 * c2 * c3 - c1 * s2 * s3;
            this._y = c1 * s2 * c3 - s1 * c2 * s3;
            this._z = c1 * c2 * s3 + s1 * s2 * c3;
            this._w = c1 * c2 * c3 + s1 * s2 * s3;
        }
        return this;
    }

    public setFromAxisAngle(axis: Vec3, angle: number): this {
        const halfAngle = angle / 2;
        const s = Math.sin(halfAngle);

        this._x = axis.x * s;
        this._y = axis.y * s;
        this._z = axis.z * s;
        this._w = Math.cos(halfAngle);
        return this;
    }

    public setFromRotationMatrix(m: Matrix4): this {
        // http://www.euclideanspace.com/maths/geometry/rotations/conversions/matrixToQuaternion/index.htm
        const te = m.data;
        const m11 = te[0][0];
        const m12 = te[1][0];
        const m13 = te[2][0];
        const m21 = te[0][1];
        const m22 = te[1][1];
        const m23 = te[2][1];
        const m31 = te[0][2];
        const m32 = te[1][2];
        const m33 = te[2][2];

        const trace = m11 + m22 + m33;
        let s: number;
        if (trace > 0) {
            s = 0.5 / Math.sqrt(trace + 1.0);
            this._w = 0.25 / s;
            this._x = (m32 - m23) * s;
            this._y = (m13 - m31) * s;
            this._z = (m21 - m12) * s;
        } else if (m11 > m22 && m11 > m33) {
            s = 2.0 * Math.sqrt(1.0 + m11 - m22 - m33);
            this._w = (m32 - m23) / s;
            this._x = 0.25 * s;
            this._y = (m12 + m21) / s;
            this._z = (m13 + m31) / s;
        } else if (m22 > m33) {
            s = 2.0 * Math.sqrt(1.0 + m22 - m11 - m33);
            this._w = (m13 - m31) / s;
            this._x = (m12 + m21) / s;
            this._y = 0.25 * s;
            this._z = (m23 + m32) / s;
        } else {
            s = 2.0 * Math.sqrt(1.0 + m33 - m11 - m22);
            this._w = (m21 - m12) / s;
            this._x = (m13 + m31) / s;
            this._y = (m23 + m32) / s;
            this._z = 0.25 * s;
        }
        return this;
    }

    public setFromUnitVectors(vFrom: Vec3, vTo: Vec3): this {
        const EPS = 0.000001;
        let r = vFrom.dot(vTo) + 1;

        let v1: Vec3;
        if (r < EPS) {
            r = 0;
            if (Math.abs(vFrom.x) > Math.abs(vFrom.z)) {
                v1 = new Vec3(-vFrom.y, vFrom.x, 0);
            } else {
                v1 = new Vec3(0, -vFrom.z, vFrom.y);
            }
        } else {
            v1 = vFrom.cross(vTo);
        }

        this._x = v1.x;
        this._y = v1.y;
        this._z = v1.z;
        this._w = r;

        this.normalize();
        return this;
    }

    public reverse(): this {
        this.conjugate();
        return this;
    }

    public conjugate(): this {
        this._x *= -1;
        this._y *= -1;
        this._z *= -1;
        return this;
    }

    public dot(v: Quaternion): number {
        return this._x * v._x + this._y * v._y + this._z * v._z + this._w * v._w;
    }

    public lengthSq(): number {
        return this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w;
    }

    public length(): number {
        return Math.sqrt(this._x * this._x + this._y * this._y + this._z * this._z + this._w * this._w);
    }

    public normalize(): this {
        let l = this.length();
        if (l === 0) {
            this._x = 0;
            this._y = 0;
            this._z = 0;
            this._w = 1;
        } else {
            l = 1 / l;
            this._x *= l;
            this._y *= l;
            this._z *= l;
            this._w *= l;
        }
        return this;
    }

    public multiply(q: Quaternion): this {
        this.multiplyQuaternions(this, q);
        return this;
    }

    public premultiply(q: Quaternion): this {
        this.multiplyQuaternions(q, this);
        return this;
    }

    public multiplyQuaternions(a: Quaternion, b: Quaternion): this {
        // from http://www.euclideanspace.com/maths/algebra/realNormedAlgebra/quaternions/code/index.htm
        const qax = a._x;
        const qay = a._y;
        const qaz = a._z;
        const qaw = a._w;
        const qbx = b._x;
        const qby = b._y;
        const qbz = b._z;
        const qbw = b._w;

        this._x = qax * qbw + qaw * qbx + qay * qbz - qaz * qby;
        this._y = qay * qbw + qaw * qby + qaz * qbx - qax * qbz;
        this._z = qaz * qbw + qaw * qbz + qax * qby - qay * qbx;
        this._w = qaw * qbw - qax * qbx - qay * qby - qaz * qbz;
        return this;
    }

    public fromArray(array: number[]): this {
        this._x = array[0];
        this._y = array[1];
        this._z = array[2];
        this._w = array[3];
        return this;
    }

    public toArray(): number[] {
        const array = new Array<number>(4);
        array[0] = this._x;
        array[1] = this._y;
        array[2] = this._z;
        array[3] = this._w;
        return array;
    }
}