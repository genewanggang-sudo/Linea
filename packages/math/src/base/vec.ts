import { types } from '../type_define/i_types';
import { Util } from '../util/util';
import { IVector } from './ivector';
import { Tol } from './tol';



/**
 *  向量
 */
export abstract class Vec extends IVector {
    constructor() {
        super();
    }

    public get x() {
        return this._data[0];
    }

    public get y() {
        return this._data[1];
    }

    public set x(x: number) {
        this._data[0] = x;
    }

    public set y(y: number) {
        this._data[1] = y;
    }

    public abstract clone(): Vec;

    /**
     * 向量加等于，会改变this，返回this
     * @param another
     */
    public abstract add(another: types.IXY | Vec): this;

    /**
     * 向量减等于，会改变this，返回this
     * @param another
     */
    public abstract subtract(another: types.IXY | Vec): this;

    /**
     * 向量线性插值等于，会改变this，返回this
     * this = (1 - alpha)* this + alpha * another
     * @param anotherVector
     */
    public abstract interpolate(another: types.IXY | Vec, alpha: number): this;

    public abstract copy(another: types.IXY | Vec): this;

    /**
     * 向量乘等于，会改变this，返回this
     * @param scale
     */
    public multiply(scale: number): this {
        for (let i = 0; i < this._data.length; i++) {
            this._data[i] *= scale;
        }
        return this;
    }

    /**
     * 向量反向，会改变this，返回this
     */
    public reverse(): this {
        for (let i = 0; i < this._data.length; i++) {
            this._data[i] = -this._data[i];
        }
        return this;
    }

    /**
     * 单位化向量，会改变this
     * @returns 返回this
     */
    public normalize(): this {
        const len2 = this.getSqLength();
        if (Util.isNearlyEqual(len2, 1, Tol.CALCULATE_EPS2)) return this;

        const z: number = (this as any).z;
        if (len2 < Tol.CALCULATE_EPS2) {
            return this;
            // if (z === undefined) {
            //     this.resetFromArray([1, 0, 0]);
            // } else {
            //     this.resetFromArray([1, 0]);
            // }
            // return this;
        }

        const len = Math.sqrt(len2);
        const newX = this.x / len;
        const newY = this.y / len;

        if (z === undefined) {
            this.resetFromArray([newX, newY]);
        } else {
            this.resetFromArray([newX, newY, z / len]);
        }
        return this;
    }

    public translate(vec: types.IXY | Vec): this {
        return this.add(vec);
    }

    public resetFromArray(array: number[]): this {
        for (let i = this._data.length - 1; i >= 0; i--) {
            this._data[i] = array[i];
        }
        return this;
    }
}