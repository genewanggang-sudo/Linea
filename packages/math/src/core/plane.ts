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
    public static readonly type = EN_GEO_TYPE.Plane

    private _origin: Vec3
    private _normal: Vec3

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

    public clone() {
        return new Plane(this._origin, this._normal)
    }

    public getOrigin() {
        return this._origin
    }

    public getNormal() {
        return this._normal
    }

    public isValid(eps = Precision.LEN_EPS) {
        return this._normal.len() > eps
    }

    public equals(p: Plane, eps = Precision.EPS) {
        return this._origin.equals(p._origin, eps) && this._normal.equals(p._normal, eps)
    }

    public normalizedNormal(eps = Precision.LEN_EPS) {
        return this._normal.normalized(eps)
    }

    public signedDistanceToPoint(p: Vec3, eps = Precision.LEN_EPS) {
        if (!this.isValid(eps)) {
            MathError.throw('Plane.signedDistanceToPoint: plane is degenerate')
        }
        const n = this.normalizedNormal(eps)
        return p.subtracted(this._origin).dot(n)
    }

    public distanceToPoint(p: Vec3, eps = Precision.LEN_EPS) {
        return Math.abs(this.signedDistanceToPoint(p, eps))
    }

    public containsPoint(p: Vec3, tolerance = Precision.LEN_EPS) {
        return this.distanceToPoint(p, tolerance) <= tolerance
    }

    public projectPoint(p: Vec3, eps = Precision.LEN_EPS) {
        const n = this.normalizedNormal(eps)
        const d = this.signedDistanceToPoint(p, eps)
        return p.subtracted(n.scaled(d))
    }

    public mirrorPoint(p: Vec3, eps = Precision.LEN_EPS) {
        const n = this.normalizedNormal(eps)
        const d = this.signedDistanceToPoint(p, eps)
        return p.subtracted(n.scaled(2 * d))
    }

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

    public toWorld(p: Vec2, eps = Precision.LEN_EPS) {
        return this.toCoord3D(eps).toWorld(new Vec3(p.x, p.y, 0))
    }

    public toLocal(p: Vec3, eps = Precision.LEN_EPS) {
        const local = this.toCoord3D(eps).toLocal(p)
        return new Vec2(local.x, local.y)
    }

    public transform(m: Mat4) {
        this._origin = m.transformedPoint(this._origin)
        this._normal = m.transformedVector(this._normal)
        return this
    }

    public transformed(m: Mat4) {
        return this.clone().transform(m)
    }

    public setOrigin(origin: Vec3) {
        this._origin = origin
        return this
    }

    public setNormal(normal: Vec3) {
        this._normal = normal
        return this
    }

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

    public dump(): IDBPlane {
        return {
            type: Plane.type,
            origin: { x: this._origin.x, y: this._origin.y, z: this._origin.z },
            normal: { x: this._normal.x, y: this._normal.y, z: this._normal.z },
        }
    }

    public static load(data: IDBPlane) {
        return new Plane(new Vec3(data.origin), new Vec3(data.normal))
    }
}
