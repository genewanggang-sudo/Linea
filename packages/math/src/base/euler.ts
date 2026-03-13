import { Vec3 } from './vec3';
import { Matrix4 } from './matrix4';
import { Util } from '../util/util';



export enum EulerOrder {
    XYZ,
    YZX,
    ZXY,
    XZY,
    YXZ,
    ZYX,
}

/**
 * 欧拉角
 */
export class Euler {
    public isEuler: boolean;

    private _x: number;

    private _y: number;

    private _z: number;

    private _order: EulerOrder;

    /**
     * 构造函数
     * @param x 绕X轴的旋转角度
     * @param y 绕Y轴的旋转角度
     * @param z 绕Z轴的旋转角度
     * @param order 旋转顺序
     */
    constructor(x: number = 0, y: number = 0, z: number = 0, order: EulerOrder = EulerOrder.XYZ) {
        this._x = x;
        this._y = y;
        this._z = z;
        this._order = order;
        this.isEuler = true;
    }

    /**
     * 获取X轴的旋转角度
     */
    public get x(): number {
        return this._x;
    }

    /**
     * 设置X轴的旋转角度
     */
    public set x(value: number) {
        this._x = value;
    }

    /**
     * 获取Y轴的旋转角度
     */
    public get y(): number {
        return this._y;
    }

    /**
     * 设置Y轴的旋转角度
     */
    public set y(value: number) {
        this._y = value;
    }

    /**
     * 获取Z轴的旋转角度
     */
    public get z(): number {
        return this._z;
    }

    /**
     * 设置Z轴的旋转角度
     */
    public set z(value: number) {
        this._z = value;
    }

    /**
     * 获取旋转顺序
     */
    public get order(): EulerOrder {
        return this._order;
    }

    /**
     * 设置旋转顺序
     */
    public set order(value: EulerOrder) {
        this._order = value;
    }

    /**
     * 设置角度及旋转顺序
     * @param x
     * @param y
     * @param z
     * @param order
     */
    public set(x: number, y: number, z: number, order: EulerOrder): void {
        this._x = x;
        this._y = y;
        this._z = z;
        this._order = order;
    }

    public clone(): Euler {
        return new Euler(this._x, this._y, this._z, this._order);
    }

    /**
     * 从另一个欧拉角复制，改变自己
     * @param euler
     */
    public copyFrom(euler: Euler): void {
        this._x = euler._x;
        this._y = euler._y;
        this._z = euler._z;
        this._order = euler._order;
    }

    /**
     * 从旋转矩阵，旋转顺序，计算出旋转角度
     * @param m
     * @param order
     */
    public setFromRotationMatrix(m: Matrix4, order: EulerOrder): void {
        const clamp = Util.clamp;

        // assumes the upper 3x3 of m is a pure rotation matrix (i.e, unscaled)
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

        if (order === EulerOrder.ZYX) {
            this._y = Math.asin(clamp(m13, -1, 1));
            if (Math.abs(m13) < 0.99999) {
                this._x = Math.atan2(-m23, m33);
                this._z = Math.atan2(-m12, m11);
            } else {
                this._x = Math.atan2(m32, m22);
                this._z = 0;
            }
        } else if (order === EulerOrder.ZXY) {
            this._x = Math.asin(-clamp(m23, -1, 1));
            if (Math.abs(m23) < 0.99999) {
                this._y = Math.atan2(m13, m33);
                this._z = Math.atan2(m21, m22);
            } else {
                this._y = Math.atan2(-m31, m11);
                this._z = 0;
            }
        } else if (order === EulerOrder.YXZ) {
            this._x = Math.asin(clamp(m32, -1, 1));
            if (Math.abs(m32) < 0.99999) {
                this._y = Math.atan2(-m31, m33);
                this._z = Math.atan2(-m12, m22);
            } else {
                this._y = 0;
                this._z = Math.atan2(m21, m11);
            }
        } else if (order === EulerOrder.XYZ) {
            this._y = Math.asin(-clamp(m31, -1, 1));
            if (Math.abs(m31) < 0.99999) {
                this._x = Math.atan2(m32, m33);
                this._z = Math.atan2(m21, m11);
            } else {
                this._x = 0;
                this._z = Math.atan2(-m12, m22);
            }
        } else if (order === EulerOrder.XZY) {
            this._z = Math.asin(clamp(m21, -1, 1));
            if (Math.abs(m21) < 0.99999) {
                this._x = Math.atan2(-m23, m22);
                this._y = Math.atan2(-m31, m11);
            } else {
                this._x = 0;
                this._y = Math.atan2(m13, m33);
            }
        } else if (order === EulerOrder.YZX) {
            this._z = Math.asin(-clamp(m12, -1, 1));
            if (Math.abs(m12) < 0.99999) {
                this._x = Math.atan2(m32, m22);
                this._y = Math.atan2(m13, m11);
            } else {
                this._x = Math.atan2(-m23, m33);
                this._y = 0;
            }
        } else {
            //
            console.warn(`THREE.Euler: .setFromRotationMatrix() given unsupported order: ${order}`);
        }
        this._order = order;
    }

    /**
     * 设置旋转角度和顺序（角度分别为向量的三个分量）
     * @param v
     * @param order
     */
    public setFromVector3(v: Vec3, order?: EulerOrder): void {
        return this.set(v.x, v.y, v.z, order !== undefined ? order : this._order);
    }

    public isEqual(euler: Euler): boolean {
        return euler._x === this._x && euler._y === this._y && euler._z === this._z && euler._order === this._order;
    }

    /**
     * 设置旋转角度和顺序（依次为数组0~3个元素）
     * @param array
     */
    public fromArray(array: any[]) {
        this._x = array[0];
        this._y = array[1];
        this._z = array[2];
        if (array[3] !== undefined) {
            this._order = array[3];
        }

        return this;
    }

    /**
     * 将旋转角度及顺序转成数组
     * @param array
     * @param offset
     */
    public toArray(): any[] {
        const array = new Array<any>(4);

        array[0] = this._x;
        array[1] = this._y;
        array[2] = this._z;
        array[3] = this._order;

        return array;
    }

    /**
     * 将旋转角度转成向量
     */
    public toVector(): Vec3 {
        return new Vec3(this._x, this._y, this._z);
    }
}