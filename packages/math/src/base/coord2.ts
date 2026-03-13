import { Vec2 } from './vec2';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { Coord } from './coord';
import { CONST } from '../type_define/const';
import { registerGeo } from '../loader/register_geo';
import { Matrix3 } from './matrix3';



/**
 * 二维坐标系
 */
@registerGeo
export class Coord2 extends Coord<Vec2> {
    /**
     * 构造XOY坐标系
     */
    public static XOY(): Coord2 {
        return new Coord2(new Vec2(0, 0), Vec2.X());
    }

    private _origin: Vec2;

    private _xDir: Vec2;

    // 计算出来的数据
    private _yDir: Vec2;

    constructor(origin?: types.IXY, xDir?: types.IXY) {
        super();
        this._origin = origin ? new Vec2(origin) : Vec2.O();
        this._xDir = xDir ? new Vec2(xDir).normalize() : Vec2.X();
        this._updateY();
    }

    /**
     * 获取X方向
     */
    public getDx(): Vec2 {
        return this._xDir.clone();
    }

    /**
     * 设置X方向
     * @param v
     */
    public setDx(v: types.IXY) {
        this._xDir = new Vec2(v);
        this._updateY();
    }

    /**
     * 获取Y方向
     */
    public getDy(): Vec2 {
        return this._yDir.clone();
    }

    /**
     * 获取原点
     */
    public getOrigin() {
        return this._origin.clone();
    }

    /**
     * 设置原点
     */
    public setOrigin(origin: types.IXY) {
        this._origin = new Vec2(origin);
    }

    /**
     * 将当前坐标系平移，改变自己
     * @param delta
     */
    public translate(delta: types.IXY): this {
        this._origin.add(delta);
        return this;
    }

    /**
     * 坐标系平移，得到一个新的坐标系对象
     * @param delta
     */
    public translated(delta: types.IXY): Coord2 {
        return this.clone().translate(delta);
    }

    /**
     * 将当前坐标系变换，改变自己。非等比缩放时，保证 dx 方向能正确变换
     * @param matrix
     */
    public transform(matrix: types.IMatrix3 | types.numberArrs3X3): this {
        this._origin.transform(matrix);
        this._xDir.vecTransform(matrix).normalize();
        this._updateY();
        return this;
    }

    /**
     * 坐标系变换，得到一个新的坐标系对象。非等比缩放时，保证 dx 方向能正确变换
     * @param matrix
     */
    public transformed(matrix: types.IMatrix3 | types.numberArrs3X3): Coord2 {
        return this.clone().transform(matrix);
    }

    /**
     * 根据局部坐标系的点获取世界坐标系的点
     * @param uv
     */
    public getWorldPtAt(uv: types.IXY): Vec2 {
        return this.getOrigin().add(this.getWorldVectorAt(uv));
    }

    /**
     * 根据世界坐标系的点获取局部坐标系的点
     * @param worldPt
     */
    public getLocalPtAt(worldPt: types.IXY): Vec2 {
        const OA = new Vec2(this._origin, worldPt);

        const x = OA.dot(this._xDir);
        const y = OA.dot(this._yDir);

        return new Vec2(x, y);
    }

    /**
     * 根据局部坐标系的向量获取世界坐标系的向量
     * @param localVec
     */
    public getWorldVectorAt(localVec: types.IXY): Vec2 {
        const { x, y } = localVec;

        const du = this.getDx();
        const dv = this.getDy();

        return du.multiply(x).add(dv.multiply(y));
    }

    /**
     * 根据世界坐标系的向量获取局部坐标系的向量
     * @param worldVec
     */
    public getLocalVectorAt(worldVec: types.IXY): Vec2 {
        const OA = new Vec2(worldVec);

        const x = OA.dot(this._xDir);
        const y = OA.dot(this._yDir);

        return new Vec2(x, y);
    }

    /**
     * 构造一个矩阵，将局部坐标系的(x, y)变换到世界坐标系
     */
    public getLocalToWorldMatrix(): Matrix3 {
        return new Matrix3(
            [
                [this._xDir.x, this._xDir.y, 0],
                [this._yDir.x, this._yDir.y, 0],
                [this._origin.x, this._origin.y, 1],
            ],
            false,
        );
    }

    /**
     * 构造一个矩阵，将世界坐标系位置变换到局部坐标系
     */
    public getWorldToLocalMatrix(): Matrix3 {
        return this.getLocalToWorldMatrix().inverse()!;
    }

    public dump(): types.IDBCoordinate2 {
        return {
            type: this.getType(),
            data: [this._origin.toArray2(), this._xDir.toArray2()],
        };
    }

    public load({ data: [o, x] }: types.IDBCoordinate2): this {
        this._origin.resetFromArray(o);
        this._xDir.resetFromArray(x);
        this._updateY();
        return this;
    }

    public clone(): Coord2 {
        return super.clone() as Coord2;
    }

    public getType(): EN_GEO_TYPE.COORD_2 {
        return EN_GEO_TYPE.COORD_2;
    }

    private _updateY() {
        this._yDir = this._xDir.vecRotated(CONST.PI_2);
    }
}