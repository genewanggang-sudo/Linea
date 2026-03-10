/*
 * Linea Math - Core
 * Plane: 3D 平面（原点 + 法向）
 */

import { EN_GEO_TYPE } from '../constants/geom_type'
import type { IDBPlane } from '../serialize/dump_types'
import { RegisterGeom } from '../serialize/geom_mgr'
import { MathError } from '../utils/math_error'
import { Precision } from '../utils/precision'
import { Coord3D } from './coord3d'
import { GeomBase } from './geom_base'
import { Mat4 } from './mat4'
import { Vec2 } from './vec2'
import { Vec3 } from './vec3'

@RegisterGeom
export class Plane extends GeomBase {
    /** 序列化类型标识 */
    public static readonly type = EN_GEO_TYPE.Plane

    /** 平面上一点 */
    private _origin: Vec3
    /** 平面法向 */
    private _normal: Vec3

    /** 创建平面 */
    constructor()
    constructor(p: Plane)
    constructor(origin: Vec3, normal: Vec3)
    constructor(p0: Vec3, p1: Vec3, p2: Vec3)
    constructor(coord: Coord3D)
    constructor(
        a0?: Plane | Coord3D | Vec3,
        a1?: Vec3,
        a2?: Vec3,
    ) {
        super()
        if (a0 instanceof Plane) {
            this._origin = a0._origin
            this._normal = a0._normal
            return
        }
        if (a0 instanceof Coord3D) {
            this._origin = a0.getOrigin()
            this._normal = a0.getDz()
            return
        }
        if (a0 instanceof Vec3 && a1 instanceof Vec3 && a2 instanceof Vec3) {
            this._origin = a0
            this._normal = a1.subtracted(a0).cross(a2.subtracted(a0))
            return
        }
        if (a0 instanceof Vec3 && a1 instanceof Vec3) {
            this._origin = a0
            this._normal = a1
            return
        }

        this._origin = Vec3.zero()
        this._normal = Vec3.unitZ()
    }

    /** 克隆平面 */
    public clone() {
        return new Plane(this._origin, this._normal)
    }

    /** 获取平面上一点 */
    public getOrigin() {
        return this._origin
    }

    /** 获取平面法向 */
    public getNormal() {
        return this._normal
    }

    /** 判断平面是否有效（法向不退化） */
    public isValid(eps = Precision.LEN_EPS) {
        return this._normal.len() > eps
    }

    /** 近似相等判断 */
    public equals(p: Plane, eps = Precision.EPS) {
        return this._origin.equals(p._origin, eps) && this._normal.equals(p._normal, eps)
    }

    /** 获取单位法向 */
    public normalizedNormal(eps = Precision.LEN_EPS) {
        return this._normal.normalized(eps)
    }

    /**
     * 计算点到平面的有符号距离
     * - 法向正侧为正
     * - 法向反侧为负
     */
    public signedDistanceToPoint(p: Vec3, eps = Precision.LEN_EPS) {
        if (!this.isValid(eps)) {
            MathError.throw('Plane.signedDistanceToPoint: plane is degenerate')
        }
        const n = this.normalizedNormal(eps)
        return p.subtracted(this._origin).dot(n)
    }

    /** 计算点到平面的绝对距离 */
    public distanceToPoint(p: Vec3, eps = Precision.LEN_EPS) {
        return Math.abs(this.signedDistanceToPoint(p, eps))
    }

    /** 判断点是否在平面上 */
    public containsPoint(p: Vec3, tolerance = Precision.LEN_EPS) {
        return this.distanceToPoint(p, tolerance) <= tolerance
    }

    /** 将点正交投影到平面上 */
    public projectPoint(p: Vec3, eps = Precision.LEN_EPS) {
        const n = this.normalizedNormal(eps)
        const d = this.signedDistanceToPoint(p, eps)
        return p.subtracted(n.scaled(d))
    }

    /** 计算点关于平面的镜像点 */
    public mirrorPoint(p: Vec3, eps = Precision.LEN_EPS) {
        const n = this.normalizedNormal(eps)
        const d = this.signedDistanceToPoint(p, eps)
        return p.subtracted(n.scaled(2 * d))
    }

    /**
     * 将平面转换为一个局部坐标系
     * - 原点取平面原点
     * - Z 轴取单位法向
     * - X/Y 轴按稳定参考轴构造
     */
    public toCoord3D(eps = Precision.LEN_EPS) {
        if (!this.isValid(eps)) {
            MathError.throw('Plane.toCoord3D: plane is degenerate')
        }
        const z = this.normalizedNormal(eps)
        const ax = Math.abs(z.x)
        const ay = Math.abs(z.y)
        const az = Math.abs(z.z)
        const ref =
            ax <= ay && ax <= az ? Vec3.unitX() :
                ay <= az ? Vec3.unitY() :
                    Vec3.unitZ()
        const x = ref.cross(z).normalized(eps)
        const y = z.cross(x)
        return new Coord3D(this._origin, x, y, z)
    }

    /** 将平面局部二维坐标映射为三维世界坐标 */
    public toWorld(p: Vec2, eps = Precision.LEN_EPS) {
        return this.toCoord3D(eps).toWorld(new Vec3(p.x, p.y, 0))
    }

    /** 将三维世界坐标映射为平面局部二维坐标 */
    public toLocal(p: Vec3, eps = Precision.LEN_EPS) {
        const local = this.toCoord3D(eps).toLocal(p)
        return new Vec2(local.x, local.y)
    }

    /**
     * 变换平面（就地修改）
     * - 原点按点变换
     * - 法向按向量变换
     */
    public transform(m: Mat4) {
        this._origin = m.transformedPoint(this._origin)
        this._normal = m.transformedVector(this._normal)
        return this
    }

    /** 变换平面（返回新对象） */
    public transformed(m: Mat4) {
        return this.clone().transform(m)
    }

    /** 设置平面上一点（就地修改） */
    public setOrigin(origin: Vec3) {
        this._origin = origin
        return this
    }

    /** 设置平面法向（就地修改） */
    public setNormal(normal: Vec3) {
        this._normal = normal
        return this
    }

    /**
     * 导出为一般式系数
     * ax + by + cz + d = 0
     */
    public toEquation(eps = Precision.LEN_EPS) {
        if (!this.isValid(eps)) {
            MathError.throw('Plane.toEquation: plane is degenerate')
        }
        const n = this.normalizedNormal(eps)
        return {
            a: n.x,
            b: n.y,
            c: n.z,
            d: -n.dot(this._origin),
        }
    }

    /** 序列化为结构对象 */
    public dump(): IDBPlane {
        return {
            type: Plane.type,
            origin: { x: this._origin.x, y: this._origin.y, z: this._origin.z },
            normal: { x: this._normal.x, y: this._normal.y, z: this._normal.z },
        }
    }

    /** 从结构对象反序列化 */
    public static load(data: IDBPlane) {
        return new Plane(new Vec3(data.origin), new Vec3(data.normal))
    }
}
