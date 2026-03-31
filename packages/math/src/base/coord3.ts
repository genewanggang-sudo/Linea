import { Vec3 } from './vec3';
import { Matrix4 } from './matrix4';
import { types } from '../type_define/i_types';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { Coord } from './coord';
import { registerGeo } from '../loader/register_geo';

/**
 * 坐标系
 */
@registerGeo
class Coord3 extends Coord<Vec3> {
    /**
     * 构造XOY坐标系
     * @param z 原点的Z坐标，默认为零
     */
    public static XOY(z = 0) {
        return new Coord3(new Vec3(0, 0, z), Vec3.X(), Vec3.Y());
    }

    /**
     * 构造YOZ坐标系
     * @param x 原点的X坐标，默认为零
     */
    public static YOZ(x = 0) {
        return new Coord3(new Vec3(x, 0, 0), Vec3.Y(), Vec3.Z());
    }

    /**
     * 构造ZOX坐标系
     * @param y 原点的Y坐标，默认为零
     */
    public static ZOX(y = 0) {
        return new Coord3(new Vec3(0, y, 0), Vec3.Z(), Vec3.X());
    }

    /**
     * 构造XOZ坐标系
     * @param y 原点的Y坐标，默认为零
     */
    public static XOZ(y = 0) {
        return new Coord3(new Vec3(0, y, 0), Vec3.X(), Vec3.Z());
    }

    /**
     * 从局部坐标系1到局部坐标系2的变换矩阵
     * Lp1 = Wp.M1
     * @param coor1
     * @param coor2
     */
    public static getTransformFrom1To2(coor1: Coord3, coor2: Coord3): Matrix4 | undefined {
        // 1.先变换到世界坐标系
        const m1 = coor1.getLocalToWorldMatrix();
        if (!m1) {
            return undefined;
        }
        // 2.再变换到coor2
        const m2 = coor2.getWorldToLocalMatrix();
        return m1.multiply(m2);
    }

    private _origin: Vec3;

    private _xDir!: Vec3;

    private _yDir!: Vec3;

    // 计算数据
    private _zDir!: Vec3;

    constructor();

    constructor(origin: types.IXYZ, zDir?: types.IXYZ);

    constructor(origin: types.IXYZ, xDir: types.IXYZ, yDir: types.IXYZ);

    constructor(origin?: types.IXYZ, aDir?: types.IXYZ, yDir?: types.IXYZ) {
        super();
        this._origin = origin ? new Vec3(origin) : new Vec3();
        if (yDir) {
            this.setXYDirs(aDir!, yDir);
        } else if (aDir) {
            const dz = new Vec3(aDir).normalize();
            const dx = dz.getPerpendicular();
            const dy = dz.cross(dx).normalize();
            this.setXYDirs(dx, dy);
        } else {
            this.setXYDirs(Vec3.X(), Vec3.Y());
        }
    }

    /**
     * 获取X方向
     */
    public getDx() {
        return this._xDir.clone();
    }

    /**
     * 设置X方向
     * @param v
     */
    public setDx(v: types.IXYZ) {
        this._xDir = new Vec3(v);
        this._update();
    }

    /**
     * 获取Y方向
     */
    public getDy() {
        return this._yDir.clone();
    }

    /**
     * 设置Y方向
     * @param v
     */
    public setDy(v: types.IXYZ) {
        this._yDir = new Vec3(v);
        this._update();
    }

    /**
     * 获取Z方向
     */
    public getDz(): Vec3 {
        return this._zDir.clone();
    }

    /**
     * 获取原点
     */
    public getOrigin() {
        return this._origin.clone();
    }

    /**
     * 设置原点
     * @param o 原点
     */
    public setOrigin(o: types.IXYZ) {
        this._origin = new Vec3(o);
    }

    /**
     * 设置XY方向
     * @param xDir X方向
     * @param yDir Y方向
     */
    public setXYDirs(xDir: types.IXYZ, yDir: types.IXYZ) {
        this._xDir = new Vec3(xDir).normalize();
        this._yDir = new Vec3(yDir).normalize();
        this._update();
        return this;
    }

    /**
     * z轴反向 (Y轴也会反向)
     */
    public reverseZDir() {
        this._zDir.reverse();
        this._yDir = this._zDir.cross(this._xDir);
        return this;
    }

    /**
     * 平移，改变自己
     * @param delta
     */
    public translate(delta: types.IXYZ): this {
        this._origin.add(delta);
        return this;
    }

    /**
     * 平移，得到一个新的对象
     * @param delta
     */
    public translated(delta: types.IXYZ): Coord3 {
        return this.clone().translate(delta);
    }

    /**
     * 矩阵变换，改变自己。非等比缩放时，保证 dx 方向变换
     * @param m
     */
    public transform(m: types.IMatrix4 | types.numberArrs4X4): this {
        this._origin.transform(m);
        this._xDir.vecTransform(m).normalize();
        const dy = this._yDir.vecTransform(m);
        this._yDir = this._xDir.cross(dy).cross(this._xDir).normalize();
        this._update();
        return this;
    }

    /**
     * 矩阵变换，得到一个新的对象。非等比缩放时，保证 dx 方向变换
     * @param m
     */
    public transformed(m: types.IMatrix4 | types.numberArrs4X4): Coord3 {
        return this.clone().transform(m);
    }

    /**
     * 根据当前局部坐标系的点获取世界坐标系的点
     * @param uvw
     */
    public getWorldPtAt(uvw: types.IXY | types.IXYZ): Vec3 {
        return this.getOrigin().add(this.getWorldVectorAt(uvw));
    }

    /**
     * 根据世界坐标系的点获取当前局部坐标系的点
     * @param worldPt
     */
    public getLocalPtAt(worldPt: types.IXYZ): Vec3 {
        const OA = new Vec3(worldPt).subtract(this._origin);

        const x = OA.dot(this._xDir);
        const y = OA.dot(this._yDir);
        const z = OA.dot(this._zDir);

        return new Vec3(x, y, z);
    }

    /**
     * 根据当前局部坐标系的向量获取世界坐标系的向量
     * @param localVec
     */
    public getWorldVectorAt(localVec: types.IXY | types.IXYZ): Vec3 {
        const { x, y } = localVec;
        const du = this.getDx();
        const dv = this.getDy();
        const ret = du.multiply(x).add(dv.multiply(y));

        const z = (localVec as types.IXYZ).z;
        return z ? ret.add(this.getDz().multiply(z)) : ret;
    }

    /**
     * 根据世界坐标系的向量获取当前局部坐标系的向量
     * @param worldVec
     */
    public getLocalVectorAt(worldVec: types.IXYZ): Vec3 {
        const OA = new Vec3(worldVec);

        const x = OA.dot(this._xDir);
        const y = OA.dot(this._yDir);
        const z = OA.dot(this._zDir);

        return new Vec3(x, y, z);
    }

    /**
     * 构造一个矩阵，将当前局部坐标系的位置变换到世界坐标系
     */
    public getLocalToWorldMatrix(): Matrix4 {
        return new Matrix4(
            [
                [this._xDir.x, this._xDir.y, this._xDir.z, 0],
                [this._yDir.x, this._yDir.y, this._yDir.z, 0],
                [this._zDir.x, this._zDir.y, this._zDir.z, 0],
                [this._origin.x, this._origin.y, this._origin.z, 1],
            ],
            false,
        );
    }

    /**
     * 构造一个矩阵，将世界坐标系位置变换到当前局部坐标系
     */
    public getWorldToLocalMatrix(): Matrix4 {
        return this.getLocalToWorldMatrix().inverse()!;
    }

    public clone(): Coord3 {
        return super.clone() as any;
    }

    public dump(): types.IDBCoordinate3 {
        return {
            type: this.getType(),
            data: [this._origin.toArray3(), this._xDir.toArray3(), this._yDir.toArray3()],
        };
    }

    public load({ data: [o, x, y] }: types.IDBCoordinate3): this {
        this._origin.resetFromArray(o);
        this._xDir.resetFromArray(x);
        this._yDir.resetFromArray(y);
        this._update();
        return this;
    }

    public getType(): EN_GEO_TYPE.COORD_3 {
        return EN_GEO_TYPE.COORD_3;
    }

    private _update() {
        this._zDir = this._xDir.cross(this._yDir);
    }
}

export { Coord3 };
