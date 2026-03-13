import * as numeric from 'numeric';
import { Vec } from './vec';
import { types } from '../type_define/i_types';
import { CONST } from '../type_define/const';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { registerGeo } from '../loader/register_geo';
import { Util } from '../util/util';
import { Matrix4 } from './matrix4';
import { Tol } from './tol';



/**
 *  既是向量，也是点，三维可变
 */
@registerGeo
export class Vec3 extends Vec implements types.IXYZ {
    public static O(): Vec3 {
        return new Vec3(0, 0, 0);
    }

    public static X(x: number = 1): Vec3 {
        return new Vec3(x, 0, 0);
    }

    public static Y(y: number = 1): Vec3 {
        return new Vec3(0, y, 0);
    }

    public static Z(z: number = 1): Vec3 {
        return new Vec3(0, 0, z);
    }

    public static XY({ x, y }: types.IXY, z = 0): Vec3 {
        return new Vec3(x, y, z);
    }

    /**
     * 全局的临时变量，使用该变量能减少对象的创建
     */
    public static tmp(x = 0, y = 0, z = 0): Vec3 {
        let v = (this as any).__tmp;
        if (!v) {
            v = new Vec3();
            (this as any).__tmp = v;
        }
        v.x = x;
        v.y = y;
        v.z = z;

        return v;
    }

    /**
     *  只读常量 Vec2(0, 0, 0)
     */
    public static rO(): Vec3 {
        let v = (this as any).__zero;
        if (!v) {
            v = new Vec3(0, 0, 0);
            Object.freeze(v);
            (this as any).__zero = v;
        }

        return v;
    }

    /**
     *  只读常量 Vec2(1, 0, 0)
     */
    public static rX(): Vec3 {
        let v = (this as any).__X;
        if (!v) {
            v = new Vec3(1, 0, 0);
            Object.freeze(v);
            (this as any).__X = v;
        }

        return v;
    }

    /**
     *  只读常量 (0, 1, 0)
     */
    public static rY(): Vec3 {
        let v = (this as any).__Y;
        if (!v) {
            v = new Vec3(0, 1, 0);
            Object.freeze(v);
            (this as any).__Y = v;
        }

        return v;
    }

    /**
     *  只读常量 Vec3(0, 0, 1)
     */
    public static rZ(): Vec3 {
        let v = (this as any).__Z;
        if (!v) {
            v = new Vec3(0, 0, 1);
            Object.freeze(v);
            (this as any).__Z = v;
        }

        return v;
    }

    public get z() {
        return this._data[2];
    }

    public set z(y: number) {
        this._data[2] = y;
    }

    public get data(): types.numberArr3 {
        return this._data as types.numberArr3;
    }

    protected readonly _data: number[] = [0, 0, 0];

    /**
     * 返回zero
     */
    constructor();

    /**
     * 根据x值y值z值构造
     * @param x
     * @param y
     */
    constructor(x: number, y: number, z: number);

    /**
     * 根据XYZ接口(xyz都是小写)来构造
     */
    constructor(xyz: types.IXYZ);

    /**
     * 两点构造一个向量
     * @param pointA
     * @param pointB
     */
    constructor(pointA: types.IXYZ, pointB: types.IXYZ);

    /**
     * 根据数组构造，默认取数组的前3个元素
     */
    constructor(xyz: number[]);

    constructor(a?: any, b?: any, c?: any) {
        super();
        if (c !== undefined) {
            this._reset(a, b, c);
        } else if (b) {
            this._reset(b.x - a.x, b.y - a.y, b.z - a.z);
        } else if (a instanceof Array) {
            this._reset(a[0], a[1], a[2] || 0);
        } else if (a) {
            this._reset(a.x, a.y, a.z);
        } else {
            this._reset(0, 0, 0);
        }
    }

    public add(another: types.IXYZ): this {
        this.x += another.x;
        this.y += another.y;
        this.z += another.z || 0;
        return this;
    }

    public added(another: types.IXYZ): Vec3 {
        return new Vec3(this.x + another.x, this.y + another.y, this.z + (another.z || 0));
    }

    public subtract(another: types.IXYZ): this {
        this.x -= another.x;
        this.y -= another.y;
        this.z -= another.z || 0;
        return this;
    }

    public subtracted(another: types.IXYZ): Vec3 {
        return new Vec3(this.x - another.x, this.y - another.y, this.z - (another.z || 0));
    }

    public multiplied(scale: number): Vec3 {
        return new Vec3(this.x * scale, this.y * scale, this.z * scale);
    }

    public dot(another: types.IXYZ): number {
        return this.x * another.x + this.y * another.y + this.z * (another.z || 0);
    }

    public reversed(): Vec3 {
        return new Vec3(-this.x, -this.y, -this.z);
    }

    public interpolate(another: types.IXYZ, alpha: number): this {
        this.x += (another.x - this.x) * alpha;
        this.y += (another.y - this.y) * alpha;
        this.z += ((another.z || 0) - this.z) * alpha;
        return this;
    }

    public interpolated(another: types.IXYZ, alpha: number): Vec3 {
        return new Vec3(
            this.x + (another.x - this.x) * alpha,
            this.y + (another.y - this.y) * alpha,
            this.z + ((another.z || 0) - this.z) * alpha,
        );
    }

    public midTo(another: types.IXYZ): Vec3 {
        return new Vec3((this.x + another.x) * 0.5, (this.y + another.y) * 0.5, (this.z + (another.z || 0)) * 0.5);
    }

    public normalized(): Vec3 {
        return this.clone().normalize();
    }

    public translated(vec: types.IXYZ): Vec3 {
        return this.added(vec);
    }

    /**
     * 点的变换，包括平移、选择、缩放，会改变this
     * @param matrix
     */
    public transform(matrix: types.IMatrix4 | types.numberArrs4X4): this {
        const data = (matrix as types.IMatrix4).data || matrix;
        const result = numeric.dot([...this._data, 1], data) as number[];
        const w1 = result.pop()!;

        if (!Util.isNearlyEqual(w1, 1) && !Util.isNearly0(w1)) {
            const w = 1 / w1;
            result[0] *= w;
            result[1] *= w;
            result[2] *= w;
        }

        this.resetFromArray(result);
        return this;
    }

    public transformed(matrix: types.IMatrix4 | types.numberArrs4X4): Vec3 {
        return this.clone().transform(matrix);
    }

    /**
     * 向量的变换，会自动忽略平移量，会改变this
     * @param matrix
     */
    public vecTransform(matrix: types.IMatrix4 | types.numberArrs4X4): this {
        const data = (matrix as types.IMatrix4).data || matrix;
        const dataCopy = [data[0], data[1], data[2], [0, 0, 0, data[3][3]]];
        return this.transform(dataCopy as types.numberArrs4X4);
    }

    public vecTransformed(matrix: types.IMatrix4 | types.numberArrs4X4): Vec3 {
        return this.clone().vecTransform(matrix);
    }

    /**
     * 点的旋转，改变自己
     * @param refPt 参考点
     * @param angle 弧度制
     */
    public rotate(ptOnAxis: types.IXYZ, axis: types.IXYZ, angle: number): this {
        return this.transform(Matrix4.makeRotate(ptOnAxis, axis, angle));
    }

    /**
     * 点的旋转
     * @param refPt 参考点
     * @param angle 弧度制
     */
    public rotated(ptOnAxis: types.IXYZ, axis: types.IXYZ, angle: number): Vec3 {
        return this.clone().rotate(ptOnAxis, axis, angle);
    }

    /**
     * 向量的旋转，改变自己
     * @param angle 弧度制
     */
    public vecRotate(axis: types.IXYZ, angle: number): this {
        return this.vecTransform(Matrix4.makeRotate(Vec3.O(), axis, angle));
    }

    /**
     * 向量的旋转，返回一个新的向量对象
     * @param angle 弧度制
     */
    public vecRotated(axis: types.IXYZ, angle: number): Vec3 {
        return this.clone().vecRotate(axis, angle);
    }

    /**
     * 获取任意垂线
     */
    public getPerpendicular(): Vec3 {
        const ref = this.isParallel(Vec3.rZ()) ? { x: 0, y: -1, z: 0 } : { x: 0, y: 0, z: -1 };
        return this.cross(ref).normalize();
    }

    /**
     * | i  j  k  |
     * | ux uy uv |
     * | vx vy vz |
     * @param another
     */
    public cross(another: types.IXYZ): Vec3 {
        const x = this.y * another.z - this.z * another.y;
        const y = this.z * another.x - this.x * another.z;
        const z = this.x * another.y - this.y * another.x;
        return new Vec3(x, y, z);
    }

    /**
     * 两向量是否平行（同向或反向）
     * @param another
     * @param eps  角度容差
     */
    public isParallel(another: types.IXYZ, eps: number = Tol.ANGLE): boolean {
        const sqLen1 = this.getSqLength();
        const { x, y, z } = another;
        const sqLen2 = x * x + y * y + z * z;

        const cross2 = this.cross(another).getSqLength();
        return cross2 <= eps * eps * sqLen1 * sqLen2;
    }

    public isPerpendicular(another: types.IXYZ, eps: number = Tol.ANGLE): boolean {
        const sqLen1 = this.getSqLength();
        const { x, y, z } = another;
        const sqLen2 = x * x + y * y + z * z;
        const dot = this.dot(another);
        return dot * dot <= eps * eps * sqLen1 * sqLen2;
    }

    /**
     * 两向量之间的夹角，区间[0,PI]
     * @param another 另一个向量
     * @param axisOut 两向量之间的旋转轴
     */
    public angle(another: types.IXYZ, axisOut?: types.IXYZ, tol = Tol.DEFAULT): number {
        const v = new Vec3(another);
        if (this.isZero(tol.lengthEps) || v.isZero(tol.lengthEps)) {
            return 0; // 定义0向量和任何向量的夹角为0
        }
        const rotateAxis = this.cross(v);
        const len = rotateAxis.getLength();
        if (axisOut) {
            if (tol.isLengthZero(len)) {
                axisOut.x = 0;
                axisOut.y = 0;
                axisOut.z = 0;
            } else {
                axisOut.x = rotateAxis.x / len;
                axisOut.y = rotateAxis.y / len;
                axisOut.z = rotateAxis.z / len;
            }
        }
        return Math.atan2(len, this.dot(v));
    }

    /**
     * 获取当前向量逆时针旋转至另一向量的夹角
     * @param other   另一个向量
     * @param refVec  参考向量（逆时针方向的确定依赖于观察方向，观察方向由该参数在平面法向上的分量确定）
     * @return 夹角[0, 2 * PI]
     */
    public angleTo(other: types.IXYZ, refVec: types.IXYZ): number {
        const crossed = this.cross(other);
        const angle = this.angle(other);

        if (crossed.dot(refVec) < 0.0 && angle < CONST.PI && angle > 0) {
            return CONST.PI2 - angle;
        }
        return angle;
    }

    /**
     * 与另外一个向量的距离
     */
    public distanceTo(another: types.IXYZ): number {
        return this.subtracted(another).getLength();
    }

    /**
     * 与另外一个向量的平方距离
     */
    public sqDistanceTo(another: types.IXYZ): number {
        return this.subtracted(another).getSqLength();
    }

    /**
     * 向量是否相等
     * @param param
     * @param eps 容差
     */
    public equals(another: types.IXYZ, eps: number = Tol.LENGTH): boolean {
        return this.subtracted(another).isZero(eps);
    }

    public getType(): EN_GEO_TYPE.VEC_3 {
        return EN_GEO_TYPE.VEC_3;
    }

    public dump(): types.IDBVector3 {
        return {
            type: EN_GEO_TYPE.VEC_3,
            data: this._data as types.numberArr3,
        };
    }

    public clone(): Vec3 {
        return new Vec3(this._data);
    }

    public copy(another: types.IXYZ): this {
        this._data[0] = another.x;
        this._data[1] = another.y;
        this._data[2] = another.z;
        return this;
    }

    private _reset(x: number, y: number, z: number) {
        this._data[0] = x;
        this._data[1] = y;
        this._data[2] = z;
    }
}