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

@RegisterGeom
export class Coord2D extends GeomBase {
    /** 序列化类型标识 */
    public static readonly type = EN_GEO_TYPE.Coord2D

    /** 原点 */
    public readonly origin: Vec2

    /** X 轴基向量（世界坐标） */
    public readonly xAxis: Vec2

    /** Y 轴基向量（世界坐标） */
    public readonly yAxis: Vec2

    /** 创建坐标系 */
    constructor(
        origin = Vec2.zero(),
        xAxis = new Vec2(1, 0),
        yAxis = new Vec2(0, 1),
    ) {
        super()
        this.origin = origin
        this.xAxis = xAxis
        this.yAxis = yAxis
    }

    /** 克隆 */
    public clone() {
        return new Coord2D(this.origin, this.xAxis, this.yAxis)
    }

    /** 是否为可用基（不退化） */
    public isValid(eps = Precision.LEN_EPS) {
        const det = this.xAxis.cross(this.yAxis)
        return Math.abs(det) > eps
    }

    /** 坐标系近似相等 */
    public equals(c: Coord2D, eps = Precision.EPS) {
        return (
            this.origin.equals(c.origin, eps) &&
            this.xAxis.equals(c.xAxis, eps) &&
            this.yAxis.equals(c.yAxis, eps)
        )
    }

    /** 局部坐标 -> 世界坐标 */
    public toWorld(p: Vec2) {
        return this.origin.add(this.xAxis.scale(p.x)).add(this.yAxis.scale(p.y))
    }

    /** 世界坐标 -> 局部坐标 */
    public toLocal(p: Vec2, eps = Precision.LEN_EPS) {
        const dx = p.x - this.origin.x
        const dy = p.y - this.origin.y
        const det = this.xAxis.cross(this.yAxis)
        if (Math.abs(det) <= eps) {
            throw new Error('Coord2D.toLocal: basis is degenerate')
        }
        const invDet = 1 / det
        const x = (dx * this.yAxis.y - dy * this.yAxis.x) * invDet
        const y = (dy * this.xAxis.x - dx * this.xAxis.y) * invDet
        return new Vec2(x, y)
    }

    /** 转为变换矩阵（列向量 + 右乘） */
    public toMat3() {
        return new Mat3(
            this.xAxis.x, this.yAxis.x, this.origin.x,
            this.xAxis.y, this.yAxis.y, this.origin.y,
            0, 0, 1,
        )
    }

    /** 替换原点 */
    public withOrigin(origin: Vec2) {
        return new Coord2D(origin, this.xAxis, this.yAxis)
    }

    /** 替换 X 轴 */
    public withXAxis(xAxis: Vec2) {
        return new Coord2D(this.origin, xAxis, this.yAxis)
    }

    /** 替换 Y 轴 */
    public withYAxis(yAxis: Vec2) {
        return new Coord2D(this.origin, this.xAxis, yAxis)
    }

    /** 序列化为结构对象 */
    public dump(): IDBCoord2D {
        return {
            type: Coord2D.type,
            origin: { x: this.origin.x, y: this.origin.y },
            xAxis: { x: this.xAxis.x, y: this.xAxis.y },
            yAxis: { x: this.yAxis.x, y: this.yAxis.y },
        }
    }

    /** 从结构对象反序列化 */
    public static load(data: IDBCoord2D) {
        return new Coord2D(
            new Vec2(data.origin.x, data.origin.y),
            new Vec2(data.xAxis.x, data.xAxis.y),
            new Vec2(data.yAxis.x, data.yAxis.y),
        )
    }
}
