import { types } from '../type_define/i_types';
import { GeoElement } from './geo_element';
import { Tol } from './tol';
import { DiscreteParam } from './discrete_param';



/**
 *  向量和点
 */
export abstract class IVector extends GeoElement {
    protected abstract readonly _data: number[];

    constructor() {
        super();
    }

    public abstract clone(): IVector;

    /**
     * 向量相加，返回一个新对象
     * @param another
     */
    public abstract added(another: types.IXY | IVector): IVector;

    /**
     * 向量相减，返回一个新对象
     * @param another
     */
    public abstract subtracted(another: types.IXY | IVector): IVector;

    /**
     * 向量相乘，返回一个新对象
     * @param scale
     */
    public abstract multiplied(scale: number): IVector;

    /**
     * 向量反向，返回一个新对象
     */
    public abstract reversed(): IVector;

    /**
     * 向量插值，返回一个新对象
     * @param another
     */
    public abstract interpolated(another: types.IXY | IVector, alpha: number): IVector;

    /**
     * 向量插值，返回两者中点
     * @param another
     */
    public abstract midTo(another: types.IXY | IVector): IVector;

    /**
     * 单位化向量，返回一个新对象
     */
    public abstract normalized(): IVector;

    /**
     * 点的平移，返回一个新对象
     * @param vector
     */
    public abstract translated(vector: types.IXY | IVector): IVector;

    /**
     * 两向量之间的夹角，区间[0,PI]
     * @param another
     */
    public abstract angle(another: types.IXY | IVector): number;

    /**
     * 两向量是否垂直
     * @param another
     * @param eps 容差
     */
    public abstract isPerpendicular(another: types.IXY | IVector, eps: number): boolean;

    /**
     * 两向量是否平行（同向或反向）
     * @param another
     * @param eps  容差
     */
    public abstract isParallel(another: types.IXY | IVector, eps: number): boolean;

    /**
     * 向量点乘
     * @param another
     */
    public abstract dot(another: types.IXY | IVector): number;

    /**
     * 与另外一个向量的距离
     */
    public abstract distanceTo(another: types.IXY | IVector): number;

    /**
     * 与另外一个向量的平方距离
     */
    public abstract sqDistanceTo(another: types.IXY | IVector): number;

    /**
     * 向量是否相等
     * @param param
     * @param eps 容差
     */
    public abstract equals(another: types.IXY | IVector, eps?: number): boolean;

    public get data(): number[] {
        return this._data;
    }

    /**
     * 两向量是否同向(平行且方向相同)
     * @param another
     * @param eps 容差
     */
    public isSameDirection(another: types.IXY | IVector, eps: number = Tol.ANGLE): boolean {
        return this.isParallel(another, eps) && this.dot(another) > 0;
    }

    /**
     * 两向量是否反向(平行且方向相反)
     * @param another
     * @param eps 容差
     */
    public isOpposite(another: types.IXY | IVector, eps: number = Tol.ANGLE): boolean {
        return this.isParallel(another, eps) && this.dot(another) < 0;
    }

    // /**
    //  * 向量是否相等 // 统一形式，用isEqual()接口逐渐代替equals，并且isCoincide()作用也一样。
    //  * @param param
    //  * @param eps 容差
    //  */
    // public isEqual(another: types.IXYZ, eps: number = Tol.LENGTH) {
    //     return this.subtracted(another).isZero(eps);
    // }

    /**
     * 向量的长度是否为0
     * @param eps 容差
     */
    public isZero(eps: number = Tol.LENGTH): boolean {
        return this.getSqLength() <= eps * eps;
    }

    /**
     * 转成数组
     */
    public toArray2(): types.IXYArr {
        return [this._data[0], this._data[1]];
    }

    public toArray3(): types.IXYZArr {
        return [this._data[0], this._data[1], this._data[2] || 0];
    }

    /**
     * 转成types.types.IXY
     */
    public toXY(): types.IXY {
        return {
            x: this._data[0],
            y: this._data[1],
        };
    }

    /**
     * 转成types.IXYZ
     */
    public toXYZ(): types.IXYZ {
        return { x: this._data[0], y: this._data[1], z: this._data[2] || 0 };
    }

    /**
     *  计算向量的模长
     */
    public getLength(): number {
        return Math.sqrt(this.getSqLength());
    }

    /**
     *  计算平方距离
     */
    public getSqLength(): number {
        let sum = 0;
        for (const d of this._data) {
            sum += d * d;
        }
        return sum;
    }

    // 序列化
    public dump(): types.IDBVector {
        return {
            type: this.getType(),
            data: this._data,
        };
    }

    // 反序列化
    public load({ data }: types.IDBVector): this {
        this._resetData(data);
        return this;
    }

    //  重置向量
    private _resetData(array: number[]): this {
        this._data.splice(0);
        if (array) {
            this._data.push(...array);
        }
        return this;
    }
}