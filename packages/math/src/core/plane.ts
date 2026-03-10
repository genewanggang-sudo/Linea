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

    private _coord: Coord3D

    public static fromPointNormal(origin: Vec3, normal: Vec3, xDir: Vec3) {
        return new Plane(Plane.makeCoordFromOriginNormalX(origin, normal, xDir))
    }

    public static fromThreePoints(p0: Vec3, p1: Vec3, p2: Vec3, eps = Precision.LEN_EPS) {
        const xDir = p1.subtracted(p0)
        if (xDir.len() <= eps) {
            MathError.throw('Plane: points must not be coincident')
        }

        const normal = p1.subtracted(p0).cross(p2.subtracted(p0))
        if (normal.len() <= eps) {
            MathError.throw('Plane: three points must not be collinear')
        }

        return Plane.fromPointNormal(p0, normal, xDir)
    }

    constructor()
    constructor(p: Plane)
    constructor(coord: Coord3D)
    constructor(a0?: Plane | Coord3D) {
        super()

        if (a0 instanceof Plane) {
            this._coord = a0._coord.clone()
            return
        }

        if (a0 instanceof Coord3D) {
            this._coord = a0.clone()
            return
        }

        this._coord = new Coord3D()
    }

    private static makeCoordFromOriginNormalX(origin: Vec3, normal: Vec3, xDir: Vec3, eps = Precision.LEN_EPS) {
        if (normal.len() <= eps) {
            MathError.throw('Plane: normal must be non-zero')
        }

        const z = normal.normalized(eps)
        const xProjected = xDir.subtracted(z.scaled(xDir.dot(z)))
        if (xProjected.len() <= eps) {
            MathError.throw('Plane: xDir must not be parallel to normal')
        }

        const x = xProjected.normalized(eps)
        const y = z.cross(x)
        return new Coord3D(origin, x, y, z)
    }

    private _unitNormal(eps = Precision.LEN_EPS) {
        const normal = this.getNormal()
        if (normal.len() <= eps) {
            MathError.throw('Plane: plane is degenerate')
        }
        return normal.normalized(eps)
    }

    public clone() {
        return new Plane(this._coord)
    }

    public getOrigin() {
        return this._coord.getOrigin()
    }

    public getNormal() {
        return this._coord.getDz()
    }

    public getUDir() {
        return this._coord.getDx().clone()
    }

    public getVDir() {
        return this._coord.getDy().clone()
    }

    public isValid(eps = Precision.LEN_EPS) {
        return this._coord.isValid(eps)
    }

    public equals(p: Plane, eps = Precision.EPS) {
        return this._coord.equals(p._coord, eps)
    }

    public signedDistanceToPoint(p: Vec3, eps = Precision.LEN_EPS) {
        const n = this._unitNormal(eps)
        return p.subtracted(this.getOrigin()).dot(n)
    }

    public distanceToPoint(p: Vec3, eps = Precision.LEN_EPS) {
        return Math.abs(this.signedDistanceToPoint(p, eps))
    }

    public containsPoint(p: Vec3, tolerance = Precision.LEN_EPS) {
        return this.distanceToPoint(p, tolerance) <= tolerance
    }

    public projectPoint(p: Vec3, eps = Precision.LEN_EPS) {
        const n = this._unitNormal(eps)
        const d = this.signedDistanceToPoint(p, eps)
        return p.subtracted(n.scaled(d))
    }

    public mirrorPoint(p: Vec3, eps = Precision.LEN_EPS) {
        const n = this._unitNormal(eps)
        const d = this.signedDistanceToPoint(p, eps)
        return p.subtracted(n.scaled(2 * d))
    }

    public toCoord3D() {
        return this._coord.clone()
    }

    public getPtAt(uv: Vec2) {
        return this._coord.toWorld(new Vec3(uv.x, uv.y, 0))
    }

    public getUVAt(pt: Vec3, eps = Precision.LEN_EPS) {
        const local = this._coord.toLocal(pt, eps)
        return new Vec2(local.x, local.y)
    }

    public transform(m: Mat4) {
        this._coord.transform(m)
        return this
    }

    public transformed(m: Mat4) {
        return this.clone().transform(m)
    }

    public reverse() {
        const origin = this.getOrigin()
        const x = this._coord.getDx().clone()
        const y = this._coord.getDy().negated()
        const z = x.cross(y)
        this._coord = new Coord3D(origin, x, y, z)
        return this
    }

    public setOrigin(origin: Vec3) {
        this._coord.setOrigin(origin)
        return this
    }

    public setNormal(normal: Vec3, xDir?: Vec3, eps = Precision.LEN_EPS) {
        this._coord = Plane.makeCoordFromOriginNormalX(
            this.getOrigin(),
            normal,
            xDir ?? this.getUDir(),
            eps,
        )
        return this
    }

    public toEquation(eps = Precision.LEN_EPS) {
        const n = this._unitNormal(eps)
        return {
            a: n.x,
            b: n.y,
            c: n.z,
            d: -n.dot(this.getOrigin()),
        }
    }

    public dump(): IDBPlane {
        return {
            type: Plane.type,
            coord: this._coord.dump(),
        }
    }

    public static load(data: IDBPlane) {
        return new Plane(Coord3D.load(data.coord))
    }
}
