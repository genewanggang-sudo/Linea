// mport numeric from 'numeric';
import * as numeric from 'numeric';
import { Matrix } from './matrix';
import { Vec3 } from './vec3';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { types } from '../type_define/i_types';
import { registerGeo } from '../loader/register_geo';
import { Tol } from './tol';
import { MathAssert } from '../util/assert';
import { Quaternion } from './quaternion';



/**
 * 4X4的方阵
 */
@registerGeo
class Matrix4 extends Matrix<types.numberArrs4X4> implements types.IMatrix4 {
    /**
     * 从给定矩阵构造矩阵
     * @param mat 源数据
     * @param copyData 是否拷贝数据，为假时，直接在原数据基础上构造矩阵
     */
    public static make(mat: types.IMatrix4 | types.numberArrs4X4, copyData = true): Matrix4 {
        if (mat instanceof Matrix4) return copyData ? mat.clone() : mat;

        return new Matrix4((mat as types.IMatrix4).data || mat, copyData);
    }

    /**
     * 构造一个平移矩阵
     */
    public static makeTranslate({ x, y, z }: types.IXYZ): Matrix4 {
        return new Matrix4(
            [
                [1, 0, 0, 0],
                [0, 1, 0, 0],
                [0, 0, 1, 0],
                [x, y, z, 1],
            ],
            false,
        );
    }

    /**
     * 构造一个旋转矩阵
     * @param ptOnAxis 旋转轴上的某个点
     * @param axisDir 旋转轴
     * @param angle 旋转角度
     */
    public static makeRotate(ptOnAxis: types.IXYZ, axisDir: types.IXYZ, angle: number): Matrix4 {
        const ax = axisDir.x;
        const ay = axisDir.y;
        const az = axisDir.z;

        const cos = Math.cos(angle);
        let sin = Math.sin(angle);

        const eps = Tol.LENGTH;
        const isXZero = Math.abs(ax) < eps;
        const isYZero = Math.abs(ay) < eps;
        const isZZero = Math.abs(az) < eps;

        if (isYZero && isZZero) {
            if (ax < 0) sin *= -1;
            const dy = ptOnAxis.y * (1 - cos) + ptOnAxis.z * sin;
            const dz = ptOnAxis.z * (1 - cos) - ptOnAxis.y * sin;

            return new Matrix4(
                [
                    [1, 0, 0, 0],
                    [0, cos, sin, 0],
                    [0, -sin, cos, 0],
                    [0, dy, dz, 1],
                ],
                false,
            );
        }

        if (isXZero && isZZero) {
            if (ay < 0) sin *= -1;
            const dz = ptOnAxis.z * (1 - cos) + ptOnAxis.x * sin;
            const dx = ptOnAxis.x * (1 - cos) - ptOnAxis.z * sin;

            return new Matrix4(
                [
                    [cos, 0, -sin, 0],
                    [0, 1, 0, 0],
                    [sin, 0, cos, 0],
                    [dx, 0, dz, 1],
                ],
                false,
            );
        }

        if (isXZero && isYZero) {
            if (az < 0) sin *= -1;
            const dx = ptOnAxis.x * (1 - cos) + ptOnAxis.y * sin;
            const dy = ptOnAxis.y * (1 - cos) - ptOnAxis.x * sin;

            return new Matrix4(
                [
                    [cos, sin, 0, 0],
                    [-sin, cos, 0, 0],
                    [0, 0, 1, 0],
                    [dx, dy, 0, 1],
                ],
                false,
            );
        }

        // 矩阵变换：变换到局部坐标系下，再变换回来
        const dz = axisDir instanceof Vec3 ? axisDir.normalized() : new Vec3(axisDir).normalize();
        const dx = dz.getPerpendicular();
        const dy = dz.cross(dx);
        const dxData = dx.data;
        const dyData = dy.data;
        const dzData = dz.data;

        const ret = Matrix4.makeTranslate({ x: -ptOnAxis.x, y: -ptOnAxis.y, z: -ptOnAxis.z });
        ret.preMultiply([
            [dxData[0], dyData[0], dzData[0], 0],
            [dxData[1], dyData[1], dzData[1], 0],
            [dxData[2], dyData[2], dzData[2], 0],
            [0, 0, 0, 1],
        ]);

        const newDx = dx.multiplied(cos).add(dy.multiplied(sin));
        const newDy = dx.multiplied(-sin).add(dy.multiplied(cos));
        const nxData = newDx.data;
        const nyData = newDy.data;

        ret.preMultiply([
            [...nxData, 0],
            [...nyData, 0],
            [...dzData, 0],
            [ptOnAxis.x, ptOnAxis.y, ptOnAxis.z, 1],
        ] as types.numberArrs4X4);
        return ret;
    }

    /**
     * 构造一个绕X轴正向旋转的矩阵
     * @param angle
     */
    public static makeRotateX(angle: number): Matrix4 {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Matrix4(
            [
                [1, 0, 0, 0],
                [0, cos, sin, 0],
                [0, -sin, cos, 0],
                [0, 0, 0, 1],
            ],
            false,
        );
    }

    /**
     * 构造一个绕Y轴正向旋转的矩阵
     * @param angle
     */
    public static makeRotateY(angle: number): Matrix4 {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Matrix4(
            [
                [cos, 0, -sin, 0],
                [0, 1, 0, 0],
                [sin, 0, cos, 0],
                [0, 0, 0, 1],
            ],
            false,
        );
    }

    /**
     * 构造一个绕Z轴正向旋转的矩阵
     * @param angle
     */
    public static makeRotateZ(angle: number): Matrix4 {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return new Matrix4(
            [
                [cos, sin, 0, 0],
                [-sin, cos, 0, 0],
                [0, 0, 1, 0],
                [0, 0, 0, 1],
            ],
            false,
        );
    }

    /**
     * 由四元素构造一个旋转矩阵
     * @param q
     */
    public static makeRotateFromQuaternion(q: Quaternion): Matrix4 {
        const matrix = new Matrix4();
        const te = matrix.data;

        const x = q.x;
        const y = q.y;
        const z = q.z;
        const w = q.w;
        const x2 = x + x;
        const y2 = y + y;
        const z2 = z + z;
        const xx = x * x2;
        const xy = x * y2;
        const xz = x * z2;
        const yy = y * y2;
        const yz = y * z2;
        const zz = z * z2;
        const wx = w * x2;
        const wy = w * y2;
        const wz = w * z2;

        te[0][0] = 1 - (yy + zz);
        te[1][0] = xy - wz;
        te[2][0] = xz + wy;

        te[0][1] = xy + wz;
        te[1][1] = 1 - (xx + zz);
        te[2][1] = yz - wx;

        te[0][2] = xz - wy;
        te[1][2] = yz + wx;
        te[2][2] = 1 - (xx + yy);

        te[0][3] = 0;
        te[1][3] = 0;
        te[2][3] = 0;

        te[3][0] = 0;
        te[3][1] = 0;
        te[3][2] = 0;
        te[3][3] = 1;
        return matrix;
    }

    /**
     * 构造一个缩放矩阵
     * number:等比缩放
     *
     * types.IXYZ:非等比缩放
     */
    public static makeScale(pos: types.IXYZ, scale: number | types.IXYZ): Matrix4 {
        const { x: sx, y: sy, z: sz } = typeof scale === 'number' ? { x: scale, y: scale, z: scale } : scale;

        return new Matrix4(
            [
                [sx, 0, 0, 0],
                [0, sy, 0, 0],
                [0, 0, sz, 0],
                [pos.x * (1 - sx), pos.y * (1 - sy), pos.z * (1 - sz), 1],
            ],
            false,
        );
    }

    /**
     * 构造一个镜像矩阵
     * @param origin 镜像平面上一点
     * @param normal 镜像平面的normal
     */
    public static makeMirror(origin: types.IXYZ, normal: types.IXYZ): Matrix4 {
        const { x: nx, y: ny, z: nz } = new Vec3(normal).normalize();
        const d11: number = 2 * nx * nx;
        const d12: number = 2 * nx * ny;
        const d13: number = 2 * nz * nx;
        const d22: number = 2 * ny * ny;
        const d23: number = 2 * ny * nz;
        const d33: number = 2 * nz * nz;
        const d: number = 2 * (nx * origin.x + ny * origin.y + nz * origin.z);

        return new Matrix4(
            [
                [1 - d11, -d12, -d13, 0],
                [-d12, 1 - d22, -d23, 0],
                [-d13, -d23, 1 - d33, 0],
                [d * nx, d * ny, d * nz, 1],
            ],
            false,
        );
    }

    /**
     * 从3阶矩阵构造一个z轴不变的4阶矩阵
     * @param m 三阶矩阵
     */
    public static makeByMatrix3(matrix: types.IMatrix3 | types.numberArrs3X3): Matrix4 {
        const [m0, m1, m2]: number[][] = (matrix as types.IMatrix3).data || matrix;
        return new Matrix4(
            [
                [m0[0], m0[1], 0, m0[2]],
                [m1[0], m1[1], 0, m1[2]],
                [0, 0, 1, 0],
                [m2[0], m2[1], 0, m2[2]],
            ],
            false,
        );
    }

    /**
     * 判断给定 svd 是否包含镜像变化
     * @param svd
     */
    public static isSvdMirror(svd: types.IMatrix4Svd): boolean {
        return svd.scale.x < 0;
    }

    /**
     * 判断给定 svd 是否为等比缩放
     * @param svd
     */
    public static isScaleEqual(scale: types.IXYZ): boolean {
        const isScaleEqual =
            Math.abs(scale.x) > Tol.NUMBER &&
            Math.abs(Math.abs(scale.y / scale.x) - 1) < Tol.NUMBER &&
            Math.abs(Math.abs(scale.z / scale.x) - 1) < Tol.NUMBER;
        return isScaleEqual;
    }

    /**
     * 判断给定 svd 是否包含缩放或者镜像等。判断是否只有刚体变换
     * @param svd
     */
    public static isOnlyTranslateAndRotate(scale: types.IXYZ): boolean {
        const isMoveAndRotate =
            Math.abs(scale.x - 1) < Tol.NUMBER &&
            Math.abs(scale.y - 1) < Tol.NUMBER &&
            Math.abs(scale.z - 1) < Tol.NUMBER;
        return isMoveAndRotate;
    }

    /**
     * 判断给定 svd 是否为等比缩放
     * @param svd
     */
    public static assertScaleEqual(scale: types.IXYZ): boolean {
        const isRatioed =
            Math.abs(scale.x) > Tol.NUMBER &&
            Math.abs(Math.abs(scale.y / scale.x) - 1) < Tol.NUMBER &&
            Math.abs(Math.abs(scale.z / scale.x) - 1) < Tol.NUMBER;
        MathAssert.warn(isRatioed, '暂不支持非等比缩放');
        return isRatioed;
    }

    constructor(data?: types.numberArrs4X4, copyData = true) {
        super(4, data, copyData);
    }

    /**
     * 返回矩阵内部的数据
     */
    public get data(): types.numberArrs4X4 {
        return this._data as types.numberArrs4X4;
    }

    /**
     * 按照列优先序输出矩阵
     * @param array 输出的目标数组
     * @param offset 输出的下标偏移量
     */
    public toArray(array?: number[], offset?: number): number[] {
        const ret = array || [];
        const ofs = offset || 0;

        const [d0, d1, d2, d3] = this._data;
        ret.splice(
            ofs,
            16,
            d0[0],
            d0[1],
            d0[2],
            d0[3],
            d1[0],
            d1[1],
            d1[2],
            d1[3],
            d2[0],
            d2[1],
            d2[2],
            d2[3],
            d3[0],
            d3[1],
            d3[2],
            d3[3],
        );
        return ret;
    }

    /**
     * 按照列优先序从数组中读取数据
     * @param array 源数组
     * @param offset 输入在数组中的下标偏移
     */
    public fromArray(array: number[], offset?: number): this {
        const offsetIndex = offset || 0;
        const [d0, d1, d2, d3] = this._data;

        d0[0] = array[offsetIndex];
        d0[1] = array[offsetIndex + 1];
        d0[2] = array[offsetIndex + 2];
        d0[3] = array[offsetIndex + 3];

        d1[0] = array[offsetIndex + 4];
        d1[1] = array[offsetIndex + 5];
        d1[2] = array[offsetIndex + 6];
        d1[3] = array[offsetIndex + 7];

        d2[0] = array[offsetIndex + 8];
        d2[1] = array[offsetIndex + 9];
        d2[2] = array[offsetIndex + 10];
        d2[3] = array[offsetIndex + 11];

        d3[0] = array[offsetIndex + 12];
        d3[1] = array[offsetIndex + 13];
        d3[2] = array[offsetIndex + 14];
        d3[3] = array[offsetIndex + 15];
        return this;
    }

    /**
     * 获取基础分量（三个坐标轴和平移分量）
     * @param index
     */
    public getBasicVec(index: number): Vec3 {
        return new Vec3(this._data[index]);
    }

    /**
     * 左乘一个旋转矩阵，改变自己
     * @param ptOnAxis 旋转轴上一点
     * @param axisDir 旋转轴方向
     * @param angle 旋转角度
     */
    public applyRotate(ptOnAxis: types.IXYZ, axisDir: types.IXYZ, angle: number): this {
        const m = Matrix4.makeRotate(ptOnAxis, axisDir, angle);
        return this.preMultiply(m);
    }

    /**
     * 左乘一个平移矩阵，改变自己
     */
    public applyTranslate({ x, y, z }: types.IXYZ): this {
        const ofs = this._data[3];
        ofs[0] += x;
        ofs[1] += y;
        ofs[2] += z;
        return this;
    }

    /**
     * 左乘一个缩放矩阵，改变自己
     * @param pos 缩放中心点
     * @param scales 缩放因子
     */
    public applyScale(pos: types.IXYZ, scales: number | types.IXYZ): this {
        const matrix4 = Matrix4.makeScale(pos, scales);
        return this.preMultiply(matrix4);
    }

    /**
     * 左乘一个镜像矩阵，改变自己
     * @param origin 镜像平面上一点
     * @param normal 镜像平面的法向
     */
    public applyMirror(origin: types.IXYZ, normal: types.IXYZ): this {
        const matrix4 = Matrix4.makeMirror(origin, normal);
        return this.preMultiply(matrix4);
    }

    /**
     * 获取平移分量
     */
    public getTranslation() {
        return new Vec3(this.data[3]);
    }

    /**
     * 设置当前矩阵的平移分量
     * @param translation
     */
    public setTranslation(translation: types.IXYZ): this {
        this.data[3][0] = translation.x;
        this.data[3][1] = translation.y;
        this.data[3][2] = translation.z;
        return this;
    }

    /**
     * 获取缩放分量
     */
    public getScale() {
        const a33 = this._data[3][3];
        const norm3 = (a: number[]) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) / a33;
        return new Vec3(norm3(this._data[0]), norm3(this._data[1]), norm3(this._data[2]));
    }

    /**
     * 将矩阵分解为平移、旋转、缩放矩阵，M = T*R*S
     * 对于非正交矩阵的情况，则返回空数组
     */
    public decomposeTRS(): Matrix4[] {
        const xAxis = this.getBasicVec(0);
        const yAxis = this.getBasicVec(1);
        const zAxis = this.getBasicVec(2);

        if (!xAxis.isPerpendicular(yAxis) || !xAxis.isPerpendicular(zAxis) || !yAxis.isPerpendicular(zAxis)) {
            return [];
        }

        const [d0, d1, d2, d3] = this._data;
        const translation: Matrix4 = Matrix4.makeTranslate({
            x: d3[0],
            y: d3[1],
            z: d3[2],
        });

        const leftHandSign = this.determinant() > 0 ? 1 : -1;
        const sx = xAxis.getLength() * leftHandSign;
        const sy = yAxis.getLength();
        const sz = zAxis.getLength();
        const scaling = new Matrix4(
            [
                [sx, 0, 0, 0],
                [0, sy, 0, 0],
                [0, 0, sz, 0],
                [0, 0, 0, 1],
            ],
            false,
        );

        const rotation = new Matrix4(
            [
                [d0[0] / sx, d0[1] / sx, d0[2] / sx, 0],
                [d1[0] / sy, d1[1] / sy, d1[2] / sy, 0],
                [d2[0] / sz, d2[1] / sz, d2[2] / sz, 0],
                [0, 0, 0, 1],
            ],
            false,
        );
        return [translation, rotation, scaling];
    }

    /**
     * 将矩阵分解为平移旋转、缩放、旋转矩阵，M = TR*S*R。分解保证 TR 与 R 的行列式 > 0，若输入矩阵含镜像分量，则 S.x < 0。
     */
    public decompose(): types.IMatrix4Svd {
        const transform = [this.data[0].slice(0, 3), this.data[1].slice(0, 3), this.data[2].slice(0, 3)];

        const svd = numeric.svd(transform);

        if (numeric.det(svd.U) < 0) {
            svd.U[0][0] *= -1;
            svd.U[1][0] *= -1;
            svd.U[2][0] *= -1;
            svd.S[0] *= -1;
        }
        if (numeric.det(svd.V) < 0) {
            svd.V[0][0] *= -1;
            svd.V[1][0] *= -1;
            svd.V[2][0] *= -1;
            svd.S[0] *= -1;
        }

        const [v0, v1, v2] = svd.V;
        const uTransform = [
            [v0[0], v1[0], v2[0], 0], //
            [v0[1], v1[1], v2[1], 0],
            [v0[2], v1[2], v2[2], 0],
            this._data[3].slice(0),
        ] as types.numberArrs4X4;

        const vRotate = [
            [...svd.U[0], 0],
            [...svd.U[1], 0],
            [...svd.U[2], 0],
            [0, 0, 0, 1],
        ] as types.numberArrs4X4;

        return {
            uTransform: new Matrix4(uTransform, false),
            scale: new Vec3(svd.S),
            vRotate: new Matrix4(vRotate, false),
        };
    }

    /**
     * 是否包含镜像
     */
    public isMirror(): boolean {
        return this.determinant() < 0;
    }

    public multiplied(matrix: types.IMatrix4 | types.numberArrs4X4): Matrix4 {
        return this.clone().multiply(matrix);
    }

    public preMultiplied(matrix: types.IMatrix4 | types.numberArrs4X4): Matrix4 {
        return this.clone().preMultiply(matrix);
    }

    public multipliedScalar(s: number): Matrix4 {
        return this.clone().multiplyScalar(s);
    }

    public multipliedVector4(vect: types.numberArr4): types.numberArr4 {
        return numeric.dot(vect, this.data) as types.numberArr4;
    }

    public inversed(): Matrix4 | undefined {
        return this.clone().inverse();
    }

    public transposed(): Matrix4 {
        return this.clone().transpose();
    }

    // override
    public getType(): EN_GEO_TYPE.MATRIX_4 {
        return EN_GEO_TYPE.MATRIX_4;
    }

    public dump(): types.IDBMatrix4 {
        return super.dump() as types.IDBMatrix4;
    }

    public clone(): Matrix4 {
        return super.clone() as Matrix4;
    }
}

export { Matrix4 };

