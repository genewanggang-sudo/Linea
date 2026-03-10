/*
 * Linea Math - Core
 * Coord2D: 2D 坐标系（原点 + 基向量），不可变
 */

import { GeomBase } from './geom_base'
import { EN_GEO_TYPE } from '../constants/geom_type'
import { RegisterGeom } from '../serialize/geom_mgr'
import type { IDBCoord2D } from '../serialize/dump_types'
import { Vec2 } from './vec2'
import { Mat3 } from './mat3'
import { Precision } from '../utils/precision'
import { MathError } from '../utils/math_error'

@RegisterGeom
export class Coord2D extends GeomBase {
    /** 序列化类型标识 */
    public static readonly type = EN_GEO_TYPE.Coord2D

    /** 原点 */
    private _origin: Vec2

    /** X 轴基向量（世界坐标） */
    private _xAxis: Vec2

    /** Y 轴基向量（世界坐标） */
    private _yAxis: Vec2

    /** 创建坐标系 */
    constructor()
    constructor(c: Coord2D)
    constructor(m: Mat3)
    constructor(origin: Vec2, xAxis?: Vec2, yAxis?: Vec2)
    constructor(
        a0?: Coord2D | Mat3 | Vec2,
        a1?: Vec2,
        a2?: Vec2,
    ) {
        super()
        if (a0 instanceof Coord2D) {
            this._origin = a0._origin
            this._xAxis = a0._xAxis
            this._yAxis = a0._yAxis
            return
        }
        if (a0 instanceof Mat3) {
            const e = a0.toArray()
            this._origin = new Vec2(e[2], e[5])
            this._xAxis = new Vec2(e[0], e[3])
            this._yAxis = new Vec2(e[1], e[4])
            return
        }

        const origin = a0 ?? Vec2.zero()
        const xAxis = a1 ?? Vec2.unitX()
        const yAxis = a2 ?? xAxis.perped()
        this._origin = origin
        this._xAxis = xAxis
        this._yAxis = yAxis
    }

    /** 克隆 */
    public clone() {
        return new Coord2D(this._origin, this._xAxis, this._yAxis)
    }

    /** 获取原点 */
    public getOrigin() {
        return this._origin
    }

    /** 获取 X 轴方向 */
    public getDx() {
        return this._xAxis
    }

    /** 获取 Y 轴方向 */
    public getDy() {
        return this._yAxis
    }

    /** 是否为可用基（不退化） */
    public isValid(eps = Precision.LEN_EPS) {
        const det = this._xAxis.cross(this._yAxis)
        return Math.abs(det) > eps
    }

    /** 坐标系近似相等 */
    public equals(c: Coord2D, eps = Precision.EPS) {
        return (
            this._origin.equals(c._origin, eps) &&
            this._xAxis.equals(c._xAxis, eps) &&
            this._yAxis.equals(c._yAxis, eps)
        )
    }

    /** 局部坐标 -> 世界坐标 */
    public toWorld(p: Vec2) {
        return this._origin
            .added(this._xAxis.scaled(p.x))
            .added(this._yAxis.scaled(p.y))
    }

    /** 世界坐标 -> 局部坐标 */
    public toLocal(p: Vec2, eps = Precision.LEN_EPS) {
        const dx = p.x - this._origin.x
        const dy = p.y - this._origin.y
        const det = this._xAxis.cross(this._yAxis)
        if (Math.abs(det) <= eps) {
            MathError.throw('Coord2D.toLocal: basis is degenerate')
        }
        const invDet = 1 / det
        const x = (dx * this._yAxis.y - dy * this._yAxis.x) * invDet
        const y = (dy * this._xAxis.x - dx * this._xAxis.y) * invDet
        return new Vec2(x, y)
    }

    /** 转为变换矩阵（列向量 + 右乘约定） */
    public toMat3() {
        return new Mat3(
            this._xAxis.x, this._yAxis.x, this._origin.x,
            this._xAxis.y, this._yAxis.y, this._origin.y,
            0, 0, 1,
        )
    }

    /** 变换坐标系（就地修改） */
    public transform(m: Mat3) {
        this._origin = this._origin.clone().applyMat3(m)
        this._xAxis = m.transformedVector(this._xAxis)
        this._yAxis = m.transformedVector(this._yAxis)
        return this
    }

    /** 变换坐标系（返回新对象） */
    public transformed(m: Mat3) {
        return this.clone().transform(m)
    }

    /**
     * 逆坐标系（世界 <-> 局部）
     * - 用于把世界坐标转换为该坐标系的局部坐标
     */
    public inverse(eps = Precision.LEN_EPS) {
        const inv = this.toMat3().inverted(eps)
        return new Coord2D(inv)
    }

    /** 设置原点（就地修改） */
    public setOrigin(origin: Vec2) {
        this._origin = origin
        return this
    }

    /** 设置 X 轴（就地修改） */
    public setXAxis(xAxis: Vec2) {
        this._xAxis = xAxis
        return this
    }

    /** 设置 Y 轴（就地修改） */
    public setYAxis(yAxis: Vec2) {
        this._yAxis = yAxis
        return this
    }

    /** 获取缩放（轴长度） */
    public getScale() {
        return new Vec2(this._xAxis.len(), this._yAxis.len())
    }

    /** 设置缩放（保持轴方向不变） */
    public setScale(sx: number, sy: number, eps = Precision.LEN_EPS) {
        this._xAxis = this._xAxis.clone().setLength(sx, eps)
        this._yAxis = this._yAxis.clone().setLength(sy, eps)
        return this
    }

    /** 序列化为结构对象 */
    public dump(): IDBCoord2D {
        return {
            type: Coord2D.type,
            origin: this._origin.dump(),
            xAxis: this._xAxis.dump(),
            yAxis: this._yAxis.dump(),
        }
    }

    /** 从结构对象反序列化 */
    public static load(data: IDBCoord2D) {
        return new Coord2D(
            Vec2.load(data.origin),
            Vec2.load(data.xAxis),
            Vec2.load(data.yAxis),
        )
    }
}
