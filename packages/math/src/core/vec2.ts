/*
 * Linea Math - Core
 * Vec2：二维向量，采用不可变设计，支持链式调用。
 */

import { GeomBase } from './geom_base'
import { EN_GEO_TYPE } from '../constants/geom_type'
import { RegisterGeom } from '../serialize/geom_mgr'
import type { IDBVec2 } from '../serialize/dump_types'
import { Precision } from '../utils/precision'
import type { IVec2 } from '../types/type_define'
import type { Mat3 } from './mat3'

@RegisterGeom
export class Vec2 extends GeomBase implements IVec2 {
    /** 序列化类型标识 */
    public static readonly type = EN_GEO_TYPE.Vec2

    /** X 分量 */
    public x: number

    /** Y 分量 */
    public y: number

    /** 创建一个向量实例 */
    constructor()

    constructor(x: number, y: number)

    constructor(obj: IVec2)

    constructor(xOrObj: number | IVec2 = 0, y = 0) {
        super()
        if (typeof xOrObj === 'number') {
            this.x = xOrObj
            this.y = y
        } else {
            this.x = xOrObj.x
            this.y = xOrObj.y
        }
    }

    /** 零向量 */
    public static zero() {
        return new Vec2(0, 0)
    }

    /** 单位向量 X */
    public static unitX() {
        return new Vec2(1, 0)
    }

    /** 单位向量 Y */
    public static unitY() {
        return new Vec2(0, 1)
    }

    /** 克隆当前向量 */
    public clone() {
        return new Vec2(this.x, this.y)
    }

    /** 返回替换 X 分量的新向量 */
    public withX(x: number) {
        return new Vec2(x, this.y)
    }

    /** 返回替换 Y 分量的新向量 */
    public withY(y: number) {
        return new Vec2(this.x, y)
    }

    /** 设置 X 分量（就地修改） */
    public setX(x: number) {
        this.x = x
        return this
    }

    /** 设置 Y 分量（就地修改） */
    public setY(y: number) {
        this.y = y
        return this
    }

    /** 向量相加（就地修改） */
    public add(v: Vec2) {
        this.x += v.x
        this.y += v.y
        return this
    }

    /** 向量相加（返回新对象） */
    public added(v: Vec2) {
        return this.clone().add(v)
    }

    /** 向量相减（就地修改） */
    public subtract(v: Vec2) {
        this.x -= v.x
        this.y -= v.y
        return this
    }

    /** 向量相减（返回新对象） */
    public subtracted(v: Vec2) {
        return this.clone().subtract(v)
    }

    /**
     * 向量线性叠加：this + v * s
     * - 常用于积分、插值、偏移等计算
     */
    public addScaled(v: Vec2, s: number) {
        this.x += v.x * s
        this.y += v.y * s
        return this
    }

    /** 向量线性叠加（返回新对象） */
    public addScaleded(v: Vec2, s: number) {
        return this.clone().addScaled(v, s)
    }

    /** 反向量（取相反方向） */
    public negate() {
        this.x = -this.x
        this.y = -this.y
        return this
    }

    /** 反向量（返回新对象） */
    public negated() {
        return this.clone().negate()
    }

    /**
     * 绕原点旋转（弧度）
     * - 逆时针为正方向
     */
    public rotate(rad: number) {
        const c = Math.cos(rad)
        const s = Math.sin(rad)
        const x = this.x * c - this.y * s
        const y = this.x * s + this.y * c
        this.x = x
        this.y = y
        return this
    }

    /** 绕原点旋转（返回新对象） */
    public rotated(rad: number) {
        return this.clone().rotate(rad)
    }

    /**
     * 垂直向量（默认逆时针 90°）
     * - (x, y) -> (-y, x)
     * - 若需顺时针方向，可对结果取反
     */
    public perp() {
        const x = -this.y
        const y = this.x
        this.x = x
        this.y = y
        return this
    }

    /** 垂直向量（返回新对象） */
    public perped() {
        return this.clone().perp()
    }

    /** 标量缩放 */
    public scale(s: number) {
        this.x *= s
        this.y *= s
        return this
    }

    /** 标量缩放（返回新对象） */
    public scaled(s: number) {
        return this.clone().scale(s)
    }

    /** 点积 */
    public dot(v: Vec2) {
        return this.x * v.x + this.y * v.y
    }

    /** 叉积（返回标量） */
    public cross(v: Vec2) {
        return this.x * v.y - this.y * v.x
    }

    /** 长度平方 */
    public lenSq() {
        return this.x * this.x + this.y * this.y
    }

    /** 向量长度 */
    public len() {
        return Math.hypot(this.x, this.y)
    }

    /**
     * 设置向量长度（保持方向）
     * - 零向量返回零向量
     */
    public setLength(len: number, eps = Precision.LEN_EPS) {
        const l = this.len()
        if (l < eps) {
            this.x = 0
            this.y = 0
            return this
        }
        return this.scale(len / l)
    }

    /** 设置向量长度（返回新对象） */
    public setLengthed(len: number, eps = Precision.LEN_EPS) {
        return this.clone().setLength(len, eps)
    }

    /** 归一化，极短向量返回零向量 */
    public normalize(eps = Precision.LEN_EPS) {
        const l = this.len()
        if (l < eps) {
            this.x = 0
            this.y = 0
            return this
        }
        return this.scale(1 / l)
    }

    /** 归一化（返回新对象） */
    public normalized(eps = Precision.LEN_EPS) {
        return this.clone().normalize(eps)
    }

    /**
     * 应用 Mat3 变换（就地修改）
     */
    public applyMat3(m: Mat3) {
        return m.transformPoint(this)
    }

    /** 应用 Mat3 变换（返回新对象） */
    public appliedMat3(m: Mat3) {
        return this.clone().applyMat3(m)
    }

    /** 到目标向量的距离 */
    public distanceTo(v: Vec2) {
        return Math.hypot(this.x - v.x, this.y - v.y)
    }

    /** 到目标向量的距离平方（避免开方，更高效） */
    public distanceToSq(v: Vec2) {
        const dx = this.x - v.x
        const dy = this.y - v.y
        return dx * dx + dy * dy
    }

    /**
     * 向量投影（投影到目标向量上）
     * - 若目标向量为零向量，则返回零向量
     * - 结果与目标向量共线
     */
    public project(on: Vec2, eps = Precision.LEN_EPS) {
        const denom = on.lenSq()
        if (Precision.nearlyZeroSq(denom, eps)) {
            this.x = 0
            this.y = 0
            return this
        }
        const scale = this.dot(on) / denom
        this.x = on.x * scale
        this.y = on.y * scale
        return this
    }

    /** 向量投影（返回新对象） */
    public projected(on: Vec2, eps = Precision.LEN_EPS) {
        return this.clone().project(on, eps)
    }

    /**
     * 返回向量的方向角（弧度）
     * - 相对于 +X 轴的角度
     * - 结果范围为 [-PI, PI]
     */
    public angle() {
        return Math.atan2(this.y, this.x)
    }

    /** 线性插值 */
    public lerp(v: Vec2, t: number) {
        return new Vec2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t)
    }

    /**
     * 计算当前向量到目标向量的夹角（弧度）
     * - 结果范围为 [-PI, PI]
     * - 使用 atan2(cross, dot)，保留方向（顺时针/逆时针）
     */
    public angleTo(v: Vec2) {
        const dot = this.dot(v)
        const det = this.cross(v)
        return Math.atan2(det, dot)
    }

    /** 判断分量是否为有限数 */
    public isFinite() {
        return Number.isFinite(this.x) && Number.isFinite(this.y)
    }

    /** 判断是否近似相等 */
    public equals(v: Vec2, eps = Precision.EPS) {
        return Precision.equal(this.x, v.x, eps) && Precision.equal(this.y, v.y, eps)
    }

    /** 转为元组 */
    public toArray() {
        return [this.x, this.y] as const
    }

    /** 序列化为结构对象 */
    public dump():IDBVec2 {
        return { type: Vec2.type, x: this.x, y: this.y }
    }

    /** 从结构对象反序列化 */
    public static load(data: IDBVec2) {
        return new Vec2(data.x, data.y)
    }
}
