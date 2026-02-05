/*
 * Linea Math - Core
 * Box2：二维轴对齐包围盒（AABB），不可变设计
 */

import { GeomBase } from './geom_base'
import { EN_GEO_TYPE } from '../constants/geom_type'
import { RegisterGeom } from '../serialize/geom_mgr'
import type { IDBBox2 } from '../serialize/dump_types'
import { Vec2 } from './vec2'
import { Mat3 } from './mat3'
import { Precision } from '../utils/precision'

@RegisterGeom
export class Box2 extends GeomBase {
    /** 序列化类型标识 */
    public static readonly type = EN_GEO_TYPE.Box2

    /** 最小/最大边界 */
    public readonly minX: number
    public readonly minY: number
    public readonly maxX: number
    public readonly maxY: number

    /** 创建 Box2（默认为空盒） */
    constructor()
    constructor(b: Box2)
    constructor(min: Vec2, max: Vec2)
    constructor(points: readonly Vec2[])
    constructor(minX: number, minY: number, maxX: number, maxY: number)
    constructor(
        a0?: Box2 | Vec2 | readonly Vec2[] | number,
        a1?: Vec2 | number,
        a2?: number,
        a3?: number,
    ) {
        super()
        if (a0 instanceof Box2) {
            this.minX = a0.minX
            this.minY = a0.minY
            this.maxX = a0.maxX
            this.maxY = a0.maxY
            return
        }

        if (a0 instanceof Vec2 && a1 instanceof Vec2) {
            this.minX = a0.x
            this.minY = a0.y
            this.maxX = a1.x
            this.maxY = a1.y
            return
        }

        if (Array.isArray(a0)) {
            const b = Box2.fromPoints(a0)
            this.minX = b.minX
            this.minY = b.minY
            this.maxX = b.maxX
            this.maxY = b.maxY
            return
        }

        const minX = typeof a0 === 'number' ? a0 : Infinity
        const minY = typeof a1 === 'number' ? a1 : Infinity
        const maxX = typeof a2 === 'number' ? a2 : -Infinity
        const maxY = typeof a3 === 'number' ? a3 : -Infinity
        this.minX = minX
        this.minY = minY
        this.maxX = maxX
        this.maxY = maxY
    }

    /** 空盒 */
    public static empty() {
        return new Box2()
    }

    /** 由最小/最大点创建 */
    public static fromMinMax(min: Vec2, max: Vec2) {
        return new Box2(min.x, min.y, max.x, max.y)
    }

    /** 由点集创建 */
    public static fromPoints(points: readonly Vec2[]) {
        if (points.length === 0) return Box2.empty()
        let minX = Infinity
        let minY = Infinity
        let maxX = -Infinity
        let maxY = -Infinity
        for (const p of points) {
            if (p.x < minX) minX = p.x
            if (p.y < minY) minY = p.y
            if (p.x > maxX) maxX = p.x
            if (p.y > maxY) maxY = p.y
        }
        return new Box2(minX, minY, maxX, maxY)
    }

    /** 克隆 */
    public clone() {
        return new Box2(this.minX, this.minY, this.maxX, this.maxY)
    }

    /** 是否为空盒 */
    public isEmpty() {
        return this.minX > this.maxX || this.minY > this.maxY
    }

    /** 是否为有限数 */
    public isFinite() {
        return (
            Number.isFinite(this.minX) &&
            Number.isFinite(this.minY) &&
            Number.isFinite(this.maxX) &&
            Number.isFinite(this.maxY)
        )
    }

    /** 宽度 */
    public width() {
        return this.isEmpty() ? 0 : this.maxX - this.minX
    }

    /** 高度 */
    public height() {
        return this.isEmpty() ? 0 : this.maxY - this.minY
    }

    /** 尺寸 */
    public size() {
        return new Vec2(this.width(), this.height())
    }

    /** 中心点 */
    public center() {
        if (this.isEmpty()) return Vec2.zero()
        return new Vec2(
            (this.minX + this.maxX) / 2,
            (this.minY + this.maxY) / 2,
        )
    }

    /** 是否包含点 */
    public containsPoint(v: Vec2) {
        if (this.isEmpty()) return false
        return (
            v.x >= this.minX &&
            v.x <= this.maxX &&
            v.y >= this.minY &&
            v.y <= this.maxY
        )
    }

    /** 是否包含盒 */
    public containsBox(b: Box2) {
        if (this.isEmpty() || b.isEmpty()) return false
        return (
            b.minX >= this.minX &&
            b.maxX <= this.maxX &&
            b.minY >= this.minY &&
            b.maxY <= this.maxY
        )
    }

    /** 是否相交 */
    public intersects(b: Box2) {
        if (this.isEmpty() || b.isEmpty()) return false
        return (
            b.maxX >= this.minX &&
            b.minX <= this.maxX &&
            b.maxY >= this.minY &&
            b.minY <= this.maxY
        )
    }

    /** 扩展以包含点 */
    public expandByPoint(v: Vec2) {
        if (this.isEmpty()) {
            return new Box2(v.x, v.y, v.x, v.y)
        }
        return new Box2(
            Math.min(this.minX, v.x),
            Math.min(this.minY, v.y),
            Math.max(this.maxX, v.x),
            Math.max(this.maxY, v.y),
        )
    }

    /** 按标量扩展 */
    public expandByScalar(s: number) {
        if (this.isEmpty()) return this.clone()
        return new Box2(
            this.minX - s,
            this.minY - s,
            this.maxX + s,
            this.maxY + s,
        )
    }

    /** 合并盒 */
    public union(b: Box2) {
        if (this.isEmpty()) return b.clone()
        if (b.isEmpty()) return this.clone()
        return new Box2(
            Math.min(this.minX, b.minX),
            Math.min(this.minY, b.minY),
            Math.max(this.maxX, b.maxX),
            Math.max(this.maxY, b.maxY),
        )
    }

    /** 平移 */
    public translate(dx: number, dy: number) {
        if (this.isEmpty()) return this.clone()
        return new Box2(
            this.minX + dx,
            this.minY + dy,
            this.maxX + dx,
            this.maxY + dy,
        )
    }

    /** 变换（返回新对象） */
    public transform(m: Mat3) {
        if (this.isEmpty()) return this.clone()
        const p1 = m.transformedPoint(new Vec2(this.minX, this.minY))
        const p2 = m.transformedPoint(new Vec2(this.minX, this.maxY))
        const p3 = m.transformedPoint(new Vec2(this.maxX, this.minY))
        const p4 = m.transformedPoint(new Vec2(this.maxX, this.maxY))
        const minX = Math.min(p1.x, p2.x, p3.x, p4.x)
        const minY = Math.min(p1.y, p2.y, p3.y, p4.y)
        const maxX = Math.max(p1.x, p2.x, p3.x, p4.x)
        const maxY = Math.max(p1.y, p2.y, p3.y, p4.y)
        return new Box2(minX, minY, maxX, maxY)
    }

    /** 变换（返回新对象） */
    public transformed(m: Mat3) {
        return this.transform(m)
    }

    /** 点到盒子的最短距离 */
    public distanceToPoint(p: Vec2) {
        if (this.isEmpty()) return Infinity
        const dx =
            p.x < this.minX ? this.minX - p.x :
                p.x > this.maxX ? p.x - this.maxX : 0
        const dy =
            p.y < this.minY ? this.minY - p.y :
                p.y > this.maxY ? p.y - this.maxY : 0
        return Math.hypot(dx, dy)
    }

    /** 将点限制在盒子范围内 */
    public clampPoint(p: Vec2) {
        if (this.isEmpty()) return p.clone()
        const x = Math.min(this.maxX, Math.max(this.minX, p.x))
        const y = Math.min(this.maxY, Math.max(this.minY, p.y))
        return new Vec2(x, y)
    }

    /** 交集盒 */
    public intersect(b: Box2) {
        if (this.isEmpty() || b.isEmpty()) return Box2.empty()
        const minX = Math.max(this.minX, b.minX)
        const minY = Math.max(this.minY, b.minY)
        const maxX = Math.min(this.maxX, b.maxX)
        const maxY = Math.min(this.maxY, b.maxY)
        return minX > maxX || minY > maxY ? Box2.empty() : new Box2(minX, minY, maxX, maxY)
    }

    /** 近似相等 */
    public equals(b: Box2, eps = Precision.EPS) {
        if (this.isEmpty() && b.isEmpty()) return true
        if (this.isEmpty() || b.isEmpty()) return false
        return (
            Precision.equal(this.minX, b.minX, eps) &&
            Precision.equal(this.minY, b.minY, eps) &&
            Precision.equal(this.maxX, b.maxX, eps) &&
            Precision.equal(this.maxY, b.maxY, eps)
        )
    }

    /** 序列化为结构对象 */
    public dump(): IDBBox2 {
        return {
            type: Box2.type,
            minX: this.minX,
            minY: this.minY,
            maxX: this.maxX,
            maxY: this.maxY,
        }
    }

    /** 从结构对象反序列化 */
    public static load(data: IDBBox2) {
        return new Box2(data.minX, data.minY, data.maxX, data.maxY)
    }
}
