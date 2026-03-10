import { EN_GEO_TYPE } from '../constants/geom_type'
import type { IDBVec3 } from '../serialize/dump_types'
import { RegisterGeom } from '../serialize/geom_mgr'
import type { IVec3 } from '../types/type_define'
import { Precision } from '../utils/precision'
import { GeomBase } from './geom_base'

@RegisterGeom
export class Vec3 extends GeomBase implements IVec3 {
    public static readonly type = EN_GEO_TYPE.Vec3

    public x: number
    public y: number
    public z: number

    constructor()
    constructor(x: number, y: number, z: number)
    constructor(obj: IVec3)
    constructor(xOrObj: number | IVec3 = 0, y = 0, z = 0) {
        super()
        if (typeof xOrObj === 'number') {
            this.x = xOrObj
            this.y = y
            this.z = z
        } else {
            this.x = xOrObj.x
            this.y = xOrObj.y
            this.z = xOrObj.z
        }
    }

    public static zero() {
        return new Vec3(0, 0, 0)
    }

    public static unitX() {
        return new Vec3(1, 0, 0)
    }

    public static unitY() {
        return new Vec3(0, 1, 0)
    }

    public static unitZ() {
        return new Vec3(0, 0, 1)
    }

    public clone() {
        return new Vec3(this.x, this.y, this.z)
    }

    public withX(x: number) {
        return new Vec3(x, this.y, this.z)
    }

    public withY(y: number) {
        return new Vec3(this.x, y, this.z)
    }

    public withZ(z: number) {
        return new Vec3(this.x, this.y, z)
    }

    public setX(x: number) {
        this.x = x
        return this
    }

    public setY(y: number) {
        this.y = y
        return this
    }

    public setZ(z: number) {
        this.z = z
        return this
    }

    public add(v: Vec3) {
        this.x += v.x
        this.y += v.y
        this.z += v.z
        return this
    }

    public added(v: Vec3) {
        return this.clone().add(v)
    }

    public subtract(v: Vec3) {
        this.x -= v.x
        this.y -= v.y
        this.z -= v.z
        return this
    }

    public subtracted(v: Vec3) {
        return this.clone().subtract(v)
    }

    public addScaled(v: Vec3, s: number) {
        this.x += v.x * s
        this.y += v.y * s
        this.z += v.z * s
        return this
    }

    public addScaleded(v: Vec3, s: number) {
        return this.clone().addScaled(v, s)
    }

    public negate() {
        this.x = -this.x
        this.y = -this.y
        this.z = -this.z
        return this
    }

    public negated() {
        return this.clone().negate()
    }

    public scale(s: number) {
        this.x *= s
        this.y *= s
        this.z *= s
        return this
    }

    public scaled(s: number) {
        return this.clone().scale(s)
    }

    public dot(v: Vec3) {
        return this.x * v.x + this.y * v.y + this.z * v.z
    }

    public cross(v: Vec3) {
        return new Vec3(
            this.y * v.z - this.z * v.y,
            this.z * v.x - this.x * v.z,
            this.x * v.y - this.y * v.x,
        )
    }

    public lenSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z
    }

    public len() {
        return Math.hypot(this.x, this.y, this.z)
    }

    public setLength(len: number, eps = Precision.LEN_EPS) {
        const l = this.len()
        if (l < eps) {
            this.x = 0
            this.y = 0
            this.z = 0
            return this
        }
        return this.scale(len / l)
    }

    public setLengthed(len: number, eps = Precision.LEN_EPS) {
        return this.clone().setLength(len, eps)
    }

    public normalize(eps = Precision.LEN_EPS) {
        const l = this.len()
        if (l < eps) {
            this.x = 0
            this.y = 0
            this.z = 0
            return this
        }
        return this.scale(1 / l)
    }

    public normalized(eps = Precision.LEN_EPS) {
        return this.clone().normalize(eps)
    }

    public distanceToSq(v: IVec3) {
        const dx = this.x - v.x
        const dy = this.y - v.y
        const dz = this.z - v.z
        return dx * dx + dy * dy + dz * dz
    }

    public distanceTo(v: IVec3) {
        return Math.sqrt(this.distanceToSq(v))
    }

    public equals(v: IVec3, eps = Precision.EPS) {
        return Math.abs(this.x - v.x) <= eps
            && Math.abs(this.y - v.y) <= eps
            && Math.abs(this.z - v.z) <= eps
    }

    public isFinite() {
        return Number.isFinite(this.x) && Number.isFinite(this.y) && Number.isFinite(this.z)
    }

    public dump(): IDBVec3 {
        return {
            type: Vec3.type,
            x: this.x,
            y: this.y,
            z: this.z,
        }
    }

    public static load(data: IDBVec3) {
        return new Vec3(data.x, data.y, data.z)
    }
}
