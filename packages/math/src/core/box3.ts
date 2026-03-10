import { EN_GEO_TYPE } from '../constants/geom_type'
import type { IDBBox3 } from '../serialize/dump_types'
import { RegisterGeom } from '../serialize/geom_mgr'
import { Precision } from '../utils/precision'
import { GeomBase } from './geom_base'
import { Mat4 } from './mat4'
import { Vec3 } from './vec3'

@RegisterGeom
export class Box3 extends GeomBase {
    public static readonly type = EN_GEO_TYPE.Box3

    public readonly minX: number
    public readonly minY: number
    public readonly minZ: number
    public readonly maxX: number
    public readonly maxY: number
    public readonly maxZ: number

    constructor()
    constructor(b: Box3)
    constructor(min: Vec3, max: Vec3)
    constructor(points: readonly Vec3[])
    constructor(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number)
    constructor(
        a0?: Box3 | Vec3 | readonly Vec3[] | number,
        a1?: Vec3 | number,
        a2?: number,
        a3?: number,
        a4?: number,
        a5?: number,
    ) {
        super()
        if (a0 instanceof Box3) {
            this.minX = a0.minX
            this.minY = a0.minY
            this.minZ = a0.minZ
            this.maxX = a0.maxX
            this.maxY = a0.maxY
            this.maxZ = a0.maxZ
            return
        }

        if (a0 instanceof Vec3 && a1 instanceof Vec3) {
            this.minX = a0.x
            this.minY = a0.y
            this.minZ = a0.z
            this.maxX = a1.x
            this.maxY = a1.y
            this.maxZ = a1.z
            return
        }

        if (Array.isArray(a0)) {
            const b = Box3.fromPoints(a0)
            this.minX = b.minX
            this.minY = b.minY
            this.minZ = b.minZ
            this.maxX = b.maxX
            this.maxY = b.maxY
            this.maxZ = b.maxZ
            return
        }

        this.minX = typeof a0 === 'number' ? a0 : Infinity
        this.minY = typeof a1 === 'number' ? a1 : Infinity
        this.minZ = typeof a2 === 'number' ? a2 : Infinity
        this.maxX = typeof a3 === 'number' ? a3 : -Infinity
        this.maxY = typeof a4 === 'number' ? a4 : -Infinity
        this.maxZ = typeof a5 === 'number' ? a5 : -Infinity
    }

    public static empty() {
        return new Box3()
    }

    public static fromMinMax(min: Vec3, max: Vec3) {
        return new Box3(min.x, min.y, min.z, max.x, max.y, max.z)
    }

    public static fromPoints(points: readonly Vec3[]) {
        if (points.length === 0) return Box3.empty()
        let minX = Infinity
        let minY = Infinity
        let minZ = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        let maxZ = -Infinity
        for (const p of points) {
            if (p.x < minX) minX = p.x
            if (p.y < minY) minY = p.y
            if (p.z < minZ) minZ = p.z
            if (p.x > maxX) maxX = p.x
            if (p.y > maxY) maxY = p.y
            if (p.z > maxZ) maxZ = p.z
        }
        return new Box3(minX, minY, minZ, maxX, maxY, maxZ)
    }

    public clone() {
        return new Box3(this.minX, this.minY, this.minZ, this.maxX, this.maxY, this.maxZ)
    }

    public isEmpty() {
        return this.minX > this.maxX || this.minY > this.maxY || this.minZ > this.maxZ
    }

    public isFinite() {
        return (
            Number.isFinite(this.minX) &&
            Number.isFinite(this.minY) &&
            Number.isFinite(this.minZ) &&
            Number.isFinite(this.maxX) &&
            Number.isFinite(this.maxY) &&
            Number.isFinite(this.maxZ)
        )
    }

    public width() {
        return this.isEmpty() ? 0 : this.maxX - this.minX
    }

    public height() {
        return this.isEmpty() ? 0 : this.maxY - this.minY
    }

    public depth() {
        return this.isEmpty() ? 0 : this.maxZ - this.minZ
    }

    public size() {
        return new Vec3(this.width(), this.height(), this.depth())
    }

    public center() {
        if (this.isEmpty()) return Vec3.zero()
        return new Vec3(
            (this.minX + this.maxX) * 0.5,
            (this.minY + this.maxY) * 0.5,
            (this.minZ + this.maxZ) * 0.5,
        )
    }

    public containsPoint(v: Vec3) {
        if (this.isEmpty()) return false
        return (
            v.x >= this.minX &&
            v.x <= this.maxX &&
            v.y >= this.minY &&
            v.y <= this.maxY &&
            v.z >= this.minZ &&
            v.z <= this.maxZ
        )
    }

    public containsBox(b: Box3) {
        if (this.isEmpty() || b.isEmpty()) return false
        return (
            b.minX >= this.minX &&
            b.maxX <= this.maxX &&
            b.minY >= this.minY &&
            b.maxY <= this.maxY &&
            b.minZ >= this.minZ &&
            b.maxZ <= this.maxZ
        )
    }

    public intersects(b: Box3) {
        if (this.isEmpty() || b.isEmpty()) return false
        return (
            b.maxX >= this.minX &&
            b.minX <= this.maxX &&
            b.maxY >= this.minY &&
            b.minY <= this.maxY &&
            b.maxZ >= this.minZ &&
            b.minZ <= this.maxZ
        )
    }

    public expandByPoint(v: Vec3) {
        if (this.isEmpty()) {
            return new Box3(v.x, v.y, v.z, v.x, v.y, v.z)
        }
        return new Box3(
            Math.min(this.minX, v.x),
            Math.min(this.minY, v.y),
            Math.min(this.minZ, v.z),
            Math.max(this.maxX, v.x),
            Math.max(this.maxY, v.y),
            Math.max(this.maxZ, v.z),
        )
    }

    public expandByScalar(s: number) {
        if (this.isEmpty()) return this.clone()
        return new Box3(
            this.minX - s,
            this.minY - s,
            this.minZ - s,
            this.maxX + s,
            this.maxY + s,
            this.maxZ + s,
        )
    }

    public union(b: Box3) {
        if (this.isEmpty()) return b.clone()
        if (b.isEmpty()) return this.clone()
        return new Box3(
            Math.min(this.minX, b.minX),
            Math.min(this.minY, b.minY),
            Math.min(this.minZ, b.minZ),
            Math.max(this.maxX, b.maxX),
            Math.max(this.maxY, b.maxY),
            Math.max(this.maxZ, b.maxZ),
        )
    }

    public intersect(b: Box3) {
        if (this.isEmpty() || b.isEmpty()) return Box3.empty()
        const minX = Math.max(this.minX, b.minX)
        const minY = Math.max(this.minY, b.minY)
        const minZ = Math.max(this.minZ, b.minZ)
        const maxX = Math.min(this.maxX, b.maxX)
        const maxY = Math.min(this.maxY, b.maxY)
        const maxZ = Math.min(this.maxZ, b.maxZ)
        return minX > maxX || minY > maxY || minZ > maxZ
            ? Box3.empty()
            : new Box3(minX, minY, minZ, maxX, maxY, maxZ)
    }

    public translate(dx: number, dy: number, dz: number) {
        if (this.isEmpty()) return this.clone()
        return new Box3(
            this.minX + dx,
            this.minY + dy,
            this.minZ + dz,
            this.maxX + dx,
            this.maxY + dy,
            this.maxZ + dz,
        )
    }

    public transform(m: Mat4) {
        if (this.isEmpty()) return this.clone()
        const p1 = m.transformedPoint(new Vec3(this.minX, this.minY, this.minZ))
        const p2 = m.transformedPoint(new Vec3(this.minX, this.minY, this.maxZ))
        const p3 = m.transformedPoint(new Vec3(this.minX, this.maxY, this.minZ))
        const p4 = m.transformedPoint(new Vec3(this.minX, this.maxY, this.maxZ))
        const p5 = m.transformedPoint(new Vec3(this.maxX, this.minY, this.minZ))
        const p6 = m.transformedPoint(new Vec3(this.maxX, this.minY, this.maxZ))
        const p7 = m.transformedPoint(new Vec3(this.maxX, this.maxY, this.minZ))
        const p8 = m.transformedPoint(new Vec3(this.maxX, this.maxY, this.maxZ))
        return new Box3(
            Math.min(p1.x, p2.x, p3.x, p4.x, p5.x, p6.x, p7.x, p8.x),
            Math.min(p1.y, p2.y, p3.y, p4.y, p5.y, p6.y, p7.y, p8.y),
            Math.min(p1.z, p2.z, p3.z, p4.z, p5.z, p6.z, p7.z, p8.z),
            Math.max(p1.x, p2.x, p3.x, p4.x, p5.x, p6.x, p7.x, p8.x),
            Math.max(p1.y, p2.y, p3.y, p4.y, p5.y, p6.y, p7.y, p8.y),
            Math.max(p1.z, p2.z, p3.z, p4.z, p5.z, p6.z, p7.z, p8.z),
        )
    }

    public transformed(m: Mat4) {
        return this.transform(m)
    }

    public distanceToPoint(p: Vec3) {
        if (this.isEmpty()) return Infinity
        const dx =
            p.x < this.minX ? this.minX - p.x :
                p.x > this.maxX ? p.x - this.maxX : 0
        const dy =
            p.y < this.minY ? this.minY - p.y :
                p.y > this.maxY ? p.y - this.maxY : 0
        const dz =
            p.z < this.minZ ? this.minZ - p.z :
                p.z > this.maxZ ? p.z - this.maxZ : 0
        return Math.hypot(dx, dy, dz)
    }

    public clampPoint(p: Vec3) {
        if (this.isEmpty()) return p.clone()
        return new Vec3(
            Math.min(this.maxX, Math.max(this.minX, p.x)),
            Math.min(this.maxY, Math.max(this.minY, p.y)),
            Math.min(this.maxZ, Math.max(this.minZ, p.z)),
        )
    }

    public equals(b: Box3, eps = Precision.EPS) {
        if (this.isEmpty() && b.isEmpty()) return true
        if (this.isEmpty() || b.isEmpty()) return false
        return (
            Precision.equal(this.minX, b.minX, eps) &&
            Precision.equal(this.minY, b.minY, eps) &&
            Precision.equal(this.minZ, b.minZ, eps) &&
            Precision.equal(this.maxX, b.maxX, eps) &&
            Precision.equal(this.maxY, b.maxY, eps) &&
            Precision.equal(this.maxZ, b.maxZ, eps)
        )
    }

    public dump(): IDBBox3 {
        return {
            type: Box3.type,
            minX: this.minX,
            minY: this.minY,
            minZ: this.minZ,
            maxX: this.maxX,
            maxY: this.maxY,
            maxZ: this.maxZ,
        }
    }

    public static load(data: IDBBox3) {
        return new Box3(data.minX, data.minY, data.minZ, data.maxX, data.maxY, data.maxZ)
    }
}
