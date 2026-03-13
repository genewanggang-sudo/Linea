import * as numeric from 'numeric';
import { MathAssert } from '../util/assert';
import { Util } from '../util/util';
import { GeoElement } from './geo_element';
import { types } from '../type_define/i_types';
import { Tol } from './tol';
import { EN_GEO_TYPE } from '../type_define/i_element_type';



/**
 * 矩阵的基类,目前的矩阵只能是方阵，按列优先存储
 */
abstract class Matrix<IMatrixArray extends number[][]> extends GeoElement {
    protected readonly _data: number[][];

    constructor(protected _dim: number, data?: IMatrixArray, copy = true) {
        super();
        if (data) {
            if (copy) {
                this._data = new Array<number[]>(_dim);
                for (let i = 0; i < _dim; i++) {
                    this._data[i] = data[i].slice(0);
                }
            } else {
                this._data = data;
            }
        } else {
            this._data = new Array<number[]>(_dim);
            for (let i = 0; i < _dim; i++) {
                const row = new Array<number>(_dim).fill(0);
                row[i] = 1;
                this._data[i] = row;
            }
        }
    }

    /**
     * 将矩阵元素按列输出到一维数组中
     * @param array (可选参数) 存储结果的一维数组
     * @param offset (可选参数) 一维数组中的偏移量
     */
    public abstract toArray(array?: number[], offset?: number): number[];

    /**
     * 设置矩阵元素（依次设置每列）
     * @param array
     * @param offset ( 可选参数 ) 一维数组中的偏移量
     */
    public abstract fromArray(array: number[], offset?: number): this;

    /**
     * 右乘一个矩阵，得到新的矩阵对象
     * @param matrix
     */
    public abstract multiplied(matrix: types.IMatrix<IMatrixArray> | IMatrixArray): Matrix<IMatrixArray>;

    /**
     * 左乘一个矩阵，得到新的矩阵对象
     * @param matrix
     */
    public abstract preMultiplied(matrix: types.IMatrix<IMatrixArray> | IMatrixArray): Matrix<IMatrixArray>;

    /**
     * 右乘以缩放系数，得到新的矩阵对象
     * @param s
     */
    public abstract multipliedScalar(s: number): Matrix<IMatrixArray>;

    /**
     * 矩阵求逆，得到新的逆矩阵对象
     */
    public abstract inversed(): Matrix<IMatrixArray> | undefined;

    /**
     * 矩阵转置，得到新的转置矩阵对象
     */
    public abstract transposed(): Matrix<IMatrixArray>;

    /**
     * 行列式
     */
    public determinant(): number {
        return numeric.det(this._data);
    }

    /**
     * 将当前矩阵重置为逆矩阵,若矩阵行列式为0，没有逆矩阵，则返回undefined，否则返回this
     */
    public inverse(): this | undefined {
        try {
            const data = numeric.inv(this._data) as IMatrixArray;
            return this.copy(data);
        } catch (e) {
            return undefined;
        }
    }

    /**
     * 返回矩阵的维度
     * @property dim
     */
    public get dim(): number {
        return this._dim;
    }

    /**
     * 返回矩阵内部的数据
     */
    public get data(): number[][] {
        return this._data;
    }

    /**
     * 设置某个特定值
     * @param row 行
     * @param col 列
     * @param value 值
     */
    public set(row: number, col: number, value: number) {
        MathAssert.assert(row < this._dim && col < this._dim, 'error! out of range');
        this._data[col][row] = value;
    }

    /**
     * 使当前矩阵变为单位阵
     */
    public resetIdentity(): this {
        for (let i = 0; i < this._dim; i++) {
            const rowArr = this._data[i];
            rowArr.fill(0);
            rowArr[i] = 1;
        }
        return this;
    }

    /**
     * 是否是单位阵
     */
    public isIdentity(): boolean {
        for (let i = 0; i < this._dim; i++) {
            for (let j = 0; j < this._dim; j++) {
                if (i === j) {
                    if (!Util.isNearlyEqual(this.data[i][j], 1, Tol.NUMBER)) {
                        return false;
                    }
                } else if (!Util.isNearly0(this.data[i][j], Tol.NUMBER)) {
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * 右乘以另外一个矩阵，this * m，改变this
     * @param m
     */
    public multiply(matrix: types.IMatrix<IMatrixArray> | IMatrixArray): this {
        const m = (matrix as types.IMatrix<IMatrixArray>).data || matrix;
        const data = numeric.dot(m, this._data) as IMatrixArray;
        this.copy(data);
        return this;
    }

    /**
     * 左乘以另外一个矩阵，m * this，改变this
     * @param m
     */
    public preMultiply(matrix: types.IMatrix<IMatrixArray> | IMatrixArray): this {
        const m = (matrix as types.IMatrix<IMatrixArray>).data || matrix;
        const data = numeric.dot(this._data, m) as IMatrixArray;
        this.copy(data);
        return this;
    }

    /**
     * 右乘等于一个标量，改变自己
     * @param s
     */
    public multiplyScalar(s: number): this {
        for (const row of this._data) {
            for (let i = 0; i < this._dim; i++) {
                row[i] *= s;
            }
        }
        return this;
    }

    /**
     * 矩阵转置，改变自己
     */
    public transpose(): this {
        const data = numeric.transpose(this._data) as IMatrixArray;
        return this.copy(data);
    }

    /**
     * 将二维数组拷贝到矩阵内部，改变自己
     * @param another
     */
    public copy(another: types.IMatrix<IMatrixArray> | IMatrixArray): this {
        const data = (another as types.IMatrix<IMatrixArray>).data || another;

        for (let i = 0; i < this._dim; i++) {
            this._data[i].splice(0, this._dim, ...data[i]);
        }

        return this;
    }

    public dump(): types.IDBMatrix {
        return {
            type: this.getType(),
            data: this._data,
        };
    }

    public load({ data }: { type: EN_GEO_TYPE; data: IMatrixArray }): this {
        return this.copy(data);
    }
}

export { Matrix };