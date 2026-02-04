/*
 * Linea Math - Core
 * Vec2：二维向量，采用不可变设计，支持链式调用。
 */

import { GeomBase } from './geom_base'
import { EN_GEO_TYPE } from '../constants/geom_type'
import { RegisterGeom } from '../serialize/geom_mgr'
import type { IDBVec2 } from '../serialize/dump_types'
import { Precision } from '../utils/precision'

@RegisterGeom
export class Vec2 extends GeomBase {
    /** 序列化类型标识 */
    public static readonly type = EN_GEO_TYPE.Vec2
    /** X 分量 */
    public readonly x: number
    /** Y 分量 */
    public readonly y: number

    /** 创建一个向量实例 */
    constructor(x: number, y: number) {
        super();
        this.x = x
        this.y = y
    }

    /** 零向量 */
    public static zero() {
        return new Vec2(0, 0)
    }

    /** 从对象结构创建向量 */
    public static from(obj: { x: number; y: number }) {
        return new Vec2(obj.x, obj.y)
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

    /** 向量相加 */
    public add(v: Vec2) {
        return new Vec2(this.x + v.x, this.y + v.y)
    }

    /** 向量相减 */
    public sub(v: Vec2) {
        return new Vec2(this.x - v.x, this.y - v.y)
    }

    /** 标量缩放 */
    public scale(s: number) {
        return new Vec2(this.x * s, this.y * s)
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

    /** 归一化，极短向量返回零向量 */
    public normalize(eps = Precision.LEN_EPS) {
        const l = this.len()
        if (l < eps) return Vec2.zero()
        return this.scale(1 / l)
    }

    /** 到目标向量的距离 */
    public distanceTo(v: Vec2) {
        return Math.hypot(this.x - v.x, this.y - v.y)
    }

    /** 线性插值 */
    public lerp(v: Vec2, t: number) {
        return new Vec2(this.x + (v.x - this.x) * t, this.y + (v.y - this.y) * t)
    }

    /** 计算到目标向量的夹角（弧度） */
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
