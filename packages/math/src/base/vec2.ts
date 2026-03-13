import * as numeric from 'numeric';
import { Util } from '../util/util';
import { Vec } from './vec';
import { types } from '../type_define/i_types';
import { CONST } from '../type_define/const';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { registerGeo } from '../loader/register_geo';
import { Matrix3 } from './matrix3';
import { Tol } from './tol';



/**
 *  既是向量，也是点，二维可变
 */
@registerGeo
class Vec2 extends Vec implements types.IXY {
    /**
     *  定义常量
     */
    public static O(): Vec2 {
        return new Vec2(0, 0);
    }

    public static X(x: number = 1): Vec2 {
        return new Vec2(x, 0);
    }

    public static Y(y: number = 1): Vec2 {
        return new Vec2(0, y);
    }

    /**
     * 全局的临时变量，使用该变量能减少对象的创建
     */
    public static tmp(x = 0, y = 0): Vec2 {
        let v = (this as any).__tmp;
        if (!v) {
            v = new Vec2();
            (this as any).__tmp = v;
        }
        v.x = x;
        v.y = y;

        return v;
    }

    /**
     *  只读常量 Vec2(0, 0)
     */
    public static rO(): Vec2 {
        let v = (this as any).__zero;
        if (!v) {
            v = new Vec2(0, 0);
            Object.freeze(v);
            (this as any).__zero = v;
        }

        return v;
    }

    /**
     *  只读常量 Vec2(1, 0)
     */
    public static rX(): Vec2 {
        let v = (this as any).__X;
        if (!v) {
            v = new Vec2(1, 0);
            Object.freeze(v);
            (this as any).__X = v;
        }

        return v;
    }

    /**
     *  只读常量 Vec2(0, 1)
     */
    public static rY(): Vec2 {
        let v = (this as any).__Y;
        if (!v) {
            v = new Vec2(0, 1);
            Object.freeze(v);
            (this as any).__Y = v;
        }

        return v;
    }

    protected readonly _data: number[] = [0, 0];

    /**
     * 空的构造方法，默认都是0
     * @param x
     * @param y
     */
    constructor();

    /**
     * 根据x值与y值构造
     * @param x
     * @param y
     */
    constructor(x: number, y: number);

    /**
     * 根据XY接口(xy都是小写)来构造
     */
    constructor(xy: types.IXY);

    /**
     * 两点构造一个向量
     * @param pointA
     * @param pointB
     */
    constructor(pointA: types.IXY, pointB: types.IXY);

    /**
     * 根据数组构造，默认取数组的前2个元素
     */
    constructor(xy: number[]);

    constructor(a?: any, b?: any) {
        super();

        if (b !== undefined) {
            if (typeof b === 'number') {
                this._reset(a, b);
            } else {
                this._reset(b.x - a.x, b.y - a.y);
            }
        } else if (a instanceof Array) {
            this._reset(a[0], a[1]);
        } else if (a) {
            this._reset(a.x, a.y);
        } else {
            this._reset(0, 0);
        }
    }

    public get data(): types.numberArr2 {
        return this._data as types.numberArr2;
    }

    public add(another: types.IXY): this {
        this._data[0] += another.x;
        this._data[1] += another.y;
        return this;
    }

    public added(another: types.IXY): Vec2 {
        return new Vec2(this.x + another.x, this.y + another.y);
    }

    public subtract(another: types.IXY): this {
        this._data[0] -= another.x;
        this._data[1] -= another.y;
        return this;
    }

    public subtracted(another: types.IXY | Vec2): Vec2 {
        return new Vec2(this.x - another.x, this.y - another.y);
    }

    public multiplied(scale: number): Vec2 {
        return new Vec2(this.x * scale, this.y * scale);
    }

    public dot(another: types.IXY): number {
        return this._data[0] * another.x + this._data[1] * another.y;
    }

    public reversed(): Vec2 {
        return new Vec2(-this.x, -this.y);
    }

    public interpolate(another: types.IXY, alpha: number): this {
        this.x += (another.x - this.x) * alpha;
        this.y += (another.y - this.y) * alpha;
        return this;
    }

    public interpolated(another: types.IXY, alpha: number): Vec2 {
        return new Vec2(this.x + (another.x - this.x) * alpha, this.y + (another.y - this.y) * alpha);
    }

    public midTo(another: types.IXY): Vec2 {
        return new Vec2((this.x + another.x) * 0.5, (this.y + another.y) * 0.5);
    }

    public normalized(): Vec2 {
        return this.clone().normalize();
    }

    public translated(vec: types.IXY): Vec2 {
        return this.added(vec);
    }

    /**
     * 点的变换，包括平移、选择、缩放，会改变this
     * @param matrix
     */
    public transform(matrix: types.IMatrix3 | types.numberArrs3X3): this {
        const data = (matrix as types.IMatrix3).data || matrix;
        const result = numeric.dot([...this._data, 1], data) as number[];
        const w1 = result.pop()!;

        if (!Util.isNearlyEqual(w1, 1) && !Util.isNearly0(w1)) {
            const w = 1 / w1;
            result[0] *= w;
            result[1] *= w;
        }

        this.resetFromArray(result);
        return this;
    }

    /**
     * 向量的变换，会自动忽略平移量，会改变this
     * @param matrix
     */
    public vecTransform(matrix: types.IMatrix3 | types.numberArrs3X3): this {
        const data = (matrix as types.IMatrix3).data || matrix;
        const dataCopy: number[][] = [data[0], data[1], [0, 0, data[2][2]]];
        return this.transform(dataCopy as types.numberArrs3X3);
    }

    public transformed(matrix: types.IMatrix3 | types.numberArrs3X3): Vec2 {
        return this.clone().transform(matrix);
    }

    public vecTransformed(matrix: types.IMatrix3 | types.numberArrs3X3): Vec2 {
        return this.clone().vecTransform(matrix);
    }

    /**
     * 点的旋转，改变自己
     * @param refPt 参考点
     * @param angle 弧度制
     */
    public rotate(refPt: types.IXY, angle: number): this {
        return this.transform(Matrix3.makeRotate(refPt, angle));
    }

    /**
     * 点的旋转，得到一个新的对象
     * @param refPt 参考点
     * @param angle 弧度制
     */
    public rotated(refPt: types.IXY, angle: number): Vec2 {
        return this.clone().rotate(refPt, angle);
    }

    /**
     * 向量的旋转，改变自己
     * @param angle
     */
    public vecRotate(angle: number): this {
        // 90°的倍数时，特殊处理，提高效率
        const mod = angle % CONST.PI2;
        if (Util.isNearly0(mod)) {
            // 旋转0°±360°
            return this;
        }
        if (Util.isNearlyEqual(CONST.PI_2, mod)) {
            // 旋转90°±360°
            [this.x, this.y] = [-this.y, this.x];
            return this;
        }
        if (Util.isNearlyEqual(-CONST.PI_2, mod)) {
            // 旋转-90°±360°
            [this.x, this.y] = [this.y, -this.x];
            return this;
        }
        if (Util.isNearlyEqual(CONST.PI, Math.abs(mod))) {
            // 旋转±180°±360°
            [this.x, this.y] = [-this.x, -this.y];
            return this;
        }
        if (Util.isNearlyEqual(3 * CONST.PI_2, mod)) {
            // 旋转270°±360°
            [this.x, this.y] = [this.y, -this.x];
            return this;
        }
        if (Util.isNearlyEqual(-3 * CONST.PI_2, mod)) {
            // 旋转-270°±360°
            [this.x, this.y] = [-this.y, this.x];
            return this;
        }

        // x*cosA-y*sinA  x*sinA+y*cosA
        const cosA = Math.cos(angle);
        const sinA = Math.sin(angle);
        const { x, y } = this;
        [this.x, this.y] = [x * cosA - y * sinA, x * sinA + y * cosA];
        return this;
    }

    /**
     * 向量的旋转，得到一个新对象
     * @param angle
     */
    public vecRotated(angle: number): Vec2 {
        return this.clone().vecRotate(angle);
    }

    /**
     * 二维向量的叉乘 a X b = |a|·|b|·sinAB，
     * 该值其实是第三个轴的分量
     * @param another
     */
    public cross(another: types.IXY): number {
        return this.x * another.y - this.y * another.x;
    }

    /**
     * 两向量之间的夹角，区间[0,PI]
     * @param another
     */
    public angle(another: types.IXY): number {
        return Math.atan2(Math.abs(this.cross(another)), this.dot(another));
    }

    /**
     *  从this转到anotherr的有向角，区间[0,2*PI)
     */
    public angleTo(another: types.IXY): number {
        const crossed = this.cross(another);
        const angle = this.angle(another);

        if (crossed < 0.0 && angle < CONST.PI && angle > 0) {
            return CONST.PI2 - angle;
        }
        return angle;
    }

    /**
     * 两向量是否平行（同向或反向）
     * @param another
     * @param tolerance  角度容差
     */
    public isParallel(another: types.IXY, tolerance: number = Tol.ANGLE): boolean {
        const v1 = this.normalized();
        const v2 = new Vec2(another).normalized();
        const cross = Math.abs(v1.cross(v2));

        return cross < tolerance;
    }

    public isPerpendicular(another: types.IXY, eps: number = Tol.ANGLE): boolean {
        return Math.abs(this.dot(another)) < eps;
    }

    /**
     * 与另外一个向量的距离
     */
    public distanceTo(another: types.IXY): number {
        return this.subtracted(another).getLength();
    }

    /**
     * 与另外一个向量的平方距离
     */
    public sqDistanceTo(another: types.IXY): number {
        return this.subtracted(another).getSqLength();
    }

    /**
     * 向量是否相等
     * @param param
     * @param eps 容差
     */
    public equals(another: types.IXY, eps: number = Tol.LENGTH): boolean {
        return this.subtracted(another).isZero(eps);
    }

    public getType(): EN_GEO_TYPE.VEC_2 {
        return EN_GEO_TYPE.VEC_2;
    }

    public dump(): types.IDBVector2 {
        return {
            type: EN_GEO_TYPE.VEC_2,
            data: this._data as types.numberArr2,
        };
    }

    public clone(): Vec2 {
        return new Vec2(this._data);
    }

    public copy(another: types.IXY): this {
        this._data[0] = another.x;
        this._data[1] = another.y;
        return this;
    }

    private _reset(x: number, y: number) {
        this._data[0] = x;
        this._data[1] = y;
    }
}

export { Vec2 };