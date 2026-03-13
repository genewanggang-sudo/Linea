import * as numeric from 'numeric';
import { Matrix } from './matrix';
import { Vec2 } from './vec2';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { registerGeo } from '../loader/register_geo';
import { Tol } from './tol';
import { MathAssert } from '../util/assert';



/**
 * 3X3的方阵
 */
@registerGeo
class Matrix3 extends Matrix<types.numberArrs3X3> implements types.IMatrix3 {
    /**
     * 从给定矩阵构造矩阵
     * @param mat 源矩阵
     * @param copyData 是否拷贝数据，为假时，直接在原数据基础上构造矩阵
     */
    public static make(mat: types.IMatrix3 | types.numberArrs3X3, copyData = true): Matrix3 {
        if (mat instanceof Matrix3) return copyData ? mat.clone() : mat;

        return new Matrix3((mat as types.IMatrix3).data || mat, copyData);
    }

    /**
     * 构造一个平移矩阵
     */
    public static makeTranslate({ x, y }: types.IXY): Matrix3 {
        return new Matrix3(
            [
                [1, 0, 0],
                [0, 1, 0],
                [x, y, 1],
            ],
            false,
        );
    }

    /**
     * 构造一个旋转矩阵
     * @param pivot 旋转中心点
     * @param theta 旋转角度
     */
    public static makeRotate(pivot: types.IXY, theta: number): Matrix3 {
        const cos = Math.cos(theta);
        const sin = Math.sin(theta);
        const ofsX = (1 - cos) * pivot.x + sin * pivot.y;
        const ofsY = (1 - cos) * pivot.y - sin * pivot.x;
        return new Matrix3(
            [
                [cos, sin, 0],
                [-sin, cos, 0],
                [ofsX, ofsY, 1],
            ],
            false,
        );
    }

    /**
     * 构造一个缩放矩阵
     * @param pos 缩放中心点
     * @param scale 缩放因子
     */
    public static makeScale(pos: types.IXY, scale: number | types.IXY): Matrix3 {
        const s = typeof scale === 'number' ? { x: scale, y: scale } : scale;
        const ofsX = (1 - s.x) * pos.x;
        const ofsY = (1 - s.y) * pos.y;

        return new Matrix3(
            [
                [s.x, 0, 0],
                [0, s.y, 0],
                [ofsX, ofsY, 1],
            ],
            false,
        );
    }

    /**
     * 构造一个镜像矩阵
     * @param origin 镜像轴上一点
     * @param dir 镜像轴的方向
     */
    public static makeMirror(origin: types.IXY, dir: types.IXY): Matrix3 {
        // 构造局部坐标系
        const { x: nx, y: ny } = new Vec2(-dir.y, dir.x).normalize();
        const d11: number = 2 * nx * nx;
        const d12: number = 2 * nx * ny;
        const d22: number = 2 * ny * ny;
        const d: number = 2 * (nx * origin.x + ny * origin.y);

        return new Matrix3(
            [
                [1 - d11, -d12, 0],
                [-d12, 1 - d22, 0],
                [d * nx, d * ny, 1],
            ],
            false,
        );
    }

    /**
     * 判断给定 svd 分解结果是否包含镜像变化
     * @param svd
     */
    public static isSvdMirror(svd: types.IMatrix3Svd): boolean {
        return svd.scale.x < 0;
    }

    /**
     * 判断给定 svd 是否为等比缩放
     * @param svd
     */
    public static assertScaleEqual(scale: types.IXY): boolean {
        const isRatioed =
            Math.abs(scale.x) > Tol.NUMBER &&
            Math.abs(Math.abs(scale.y / scale.x) - 1) < Tol.NUMBER;
        MathAssert.warn(isRatioed, '暂不支持非等比缩放');
        return isRatioed;
    }

    /**
     * 单位阵
     */
    constructor(data?: types.numberArrs3X3, copyData = true) {
        super(3, data, copyData);
    }

    /**
     * 返回矩阵内部的数据
     */
    public get data(): types.numberArrs3X3 {
        return this._data as any;
    }

    /**
     * 按照列优先序将矩阵转为数组输出
     * @param array 目标数组
     * @param offset 输出在数组中的下标偏移
     */
    public toArray(array?: number[], offset?: number): number[] {
        const ret = array || [];
        const ofs = offset || 0;
        const [d0, d1, d2] = this._data;
        ret.splice(ofs, 9, d0[0], d0[1], d0[2], d1[0], d1[1], d1[2], d2[0], d2[1], d2[2]);
        return ret;
    }

    /**
     * 按照列优先序从数组中读取数据
     * @param array 源数组
     * @param offset 输入在数组中的下标偏移
     */
    public fromArray(array: number[], offset?: number): this {
        const offsetIndex = offset || 0;
        const [d0, d1, d2] = this._data;

        d0[0] = array[offsetIndex];
        d0[1] = array[offsetIndex + 1];
        d0[2] = array[offsetIndex + 2];

        d1[0] = array[offsetIndex + 3];
        d1[1] = array[offsetIndex + 4];
        d1[2] = array[offsetIndex + 5];

        d2[0] = array[offsetIndex + 6];
        d2[1] = array[offsetIndex + 7];
        d2[2] = array[offsetIndex + 8];
        return this;
    }

    /**
     * 获取基础分量（两个轴和平移分量）
     * @param index
     */
    public getBasicVec(index: number): Vec2 {
        return new Vec2(this._data[index]);
    }

    /**
     * 是镜像矩阵
     */
    public isMirror() {
        const vx = new Vec2(this._data[0]);
        const vy = new Vec2(this._data[1]);
        return vx.cross(vy) < 0;
    }

    /**
     * 左乘一个平移矩阵，改变自己
     * @param param0
     */
    public applyTranslate({ x, y }: types.IXY): this {
        const m = this._data[2];
        m[0] += x;
        m[1] += y;
        return this;
    }

    /**
     * 左乘一个旋转矩阵，改变自己
     * @param pivot 旋转中心点
     * @param theta 旋转角度
     */
    public applyRotate(pivot: types.IXY, theta: number): this {
        const m = Matrix3.makeRotate(pivot, theta);
        return this.preMultiply(m);
    }

    /**
     * 左乘一个镜像矩阵，改变自己
     * @param origin 轴上一点
     * @param dir 轴的方向
     */
    public applyMirror(origin: types.IXY, dir: types.IXY): this {
        const m = Matrix3.makeMirror(origin, dir);
        return this.preMultiply(m);
    }

    /**
     * 左乘一个缩放矩阵，改变自己
     * @param pos
     * @param scale
     */
    public applyScale(pos: types.IXY, scale: number | types.IXY): this {
        const m = Matrix3.makeScale(pos, scale);
        return this.preMultiply(m);
    }

    /**
     * 将矩阵分解为平移、旋转、缩放矩阵，M = T*R*S
     * 对于非正交矩阵的情况，则返回空数组
     */
    public decomposeTRS(): Matrix3[] {
        const xAxis = this.getBasicVec(0);
        const yAxis = this.getBasicVec(1);

        if (!xAxis.isPerpendicular(yAxis)) {
            return [];
        }

        const [d0, d1, d2] = this._data;
        const translation: Matrix3 = Matrix3.makeTranslate({
            x: d2[0],
            y: d2[1],
        });

        const leftHandSign = this.determinant() > 0 ? 1 : -1;
        const sx = xAxis.getLength() * leftHandSign;
        const sy = yAxis.getLength();
        const scaling = new Matrix3(
            [
                [sx, 0, 0],
                [0, sy, 0],
                [0, 0, 1],
            ],
            false,
        );

        const rotation = new Matrix3(
            [
                [d0[0] / sx, d0[1] / sx, 0],
                [d1[0] / sy, d1[1] / sy, 0],
                [0, 0, 1],
            ],
            false,
        );
        return [translation, rotation, scaling];
    }

    /**
     * 将矩阵分解为平移旋转、缩放、旋转矩阵，M = TR*S*R
     */
    public decompose(): types.IMatrix3Svd {
        const transform = [this.data[0].slice(0, 2), this.data[1].slice(0, 2)];

        const svd = numeric.svd(transform);

        if (numeric.det(svd.U) < 0) {
            svd.U[0][0] *= -1;
            svd.U[1][0] *= -1;
            svd.S[0] *= -1;
        }
        if (numeric.det(svd.V) < 0) {
            svd.V[0][0] *= -1;
            svd.V[1][0] *= -1;
            svd.S[0] *= -1;
        }

        const uTransform: types.numberArrs3X3 = [
            [svd.V[0][0], svd.V[1][0], 0],
            [svd.V[0][1], svd.V[1][1], 0],
            [this.data[2][0], this.data[2][1], 1],
        ];
        const vRotate = [
            [...svd.U[0], 0],
            [...svd.U[1], 0],
            [0, 0, 1],
        ] as types.numberArrs3X3;

        return {
            uTransform: new Matrix3(uTransform, false),
            scale: new Vec2(svd.S),
            vRotate: new Matrix3(vRotate, false),
        };
    }

    public multiplied(matrix: types.IMatrix3 | types.numberArrs3X3): Matrix3 {
        return this.clone().multiply(matrix);
    }

    public preMultiplied(matrix: types.IMatrix3 | types.numberArrs3X3): Matrix3 {
        return this.clone().preMultiply(matrix);
    }

    public multipliedScalar(s: number): Matrix3 {
        return this.clone().multiplyScalar(s);
    }

    public multipliedVector3(vect: types.numberArr3): types.numberArr3 {
        return numeric.dot(vect, this.data) as types.numberArr3;
    }

    public inversed(): Matrix3 | undefined {
        return this.clone().inverse();
    }

    public transposed(): Matrix3 {
        return this.clone().transpose();
    }

    public getType(): EN_GEO_TYPE.MATRIX_3 {
        return EN_GEO_TYPE.MATRIX_3;
    }

    public clone(): Matrix3 {
        return super.clone() as Matrix3;
    }

    public dump(): types.IDBMatrix3 {
        return super.dump() as types.IDBMatrix3;
    }
}

export { Matrix3 };