/*
 * Linea Math - Core
 * Coord3D: 3D 坐标系（原点 + 三个基向量）
 */

import { EN_GEO_TYPE } from '../constants/geom_type'
import type { IDBCoord3D } from '../serialize/dump_types'
import { RegisterGeom } from '../serialize/geom_mgr'
import { Precision } from '../utils/precision'
import { GeomBase } from './geom_base'
import { Mat4 } from './mat4'
import { Vec3 } from './vec3'

@RegisterGeom
export class Coord3D extends GeomBase {
    public static readonly type = EN_GEO_TYPE.Coord3D

    private _origin: Vec3
    private _xAxis: Vec3
    private _yAxis: Vec3
    private _zAxis: Vec3

    constructor()
    constructor(c: Coord3D)
    constructor(m: Mat4)
    constructor(origin: Vec3, xAxis: Vec3, yAxis: Vec3, zAxis: Vec3)
    constructor(
        a0?: Coord3D | Mat4 | Vec3,
        a1?: Vec3,
        a2?: Vec3,
        a3?: Vec3,
    ) {
        super()
        if (a0 instanceof Coord3D) {
            this._origin = a0._origin
            this._xAxis = a0._xAxis
            this._yAxis = a0._yAxis
            this._zAxis = a0._zAxis
            return
        }
        if (a0 instanceof Mat4) {
            const e = a0.toArray()
            this._origin = new Vec3(e[3], e[7], e[11])
            this._xAxis = new Vec3(e[0], e[4], e[8])
            this._yAxis = new Vec3(e[1], e[5], e[9])
            this._zAxis = new Vec3(e[2], e[6], e[10])
            return
        }

        this._origin = a0 ?? Vec3.zero()
        this._xAxis = a1 ?? Vec3.unitX()
        this._yAxis = a2 ?? Vec3.unitY()
        this._zAxis = a3 ?? Vec3.unitZ()
    }

    public clone() {
        return new Coord3D(this._origin, this._xAxis, this._yAxis, this._zAxis)
    }

    public getOrigin() {
        return this._origin
    }

    public getDx() {
        return this._xAxis
    }

    public getDy() {
        return this._yAxis
    }

    public getDz() {
        return this._zAxis
    }

    public isValid(eps = Precision.LEN_EPS) {
        const triple = this._xAxis.cross(this._yAxis).dot(this._zAxis)
        return Math.abs(triple) > eps
    }

    public equals(c: Coord3D, eps = Precision.EPS) {
        return (
            this._origin.equals(c._origin, eps) &&
            this._xAxis.equals(c._xAxis, eps) &&
            this._yAxis.equals(c._yAxis, eps) &&
            this._zAxis.equals(c._zAxis, eps)
        )
    }

    public toWorld(p: Vec3) {
        return this._origin
            .added(this._xAxis.scaled(p.x))
            .added(this._yAxis.scaled(p.y))
            .added(this._zAxis.scaled(p.z))
    }

    public toLocal(p: Vec3, eps = Precision.LEN_EPS) {
        return this.inverse(eps).toWorld(p)
    }

    public toMat4() {
        return new Mat4(
            this._xAxis.x, this._yAxis.x, this._zAxis.x, this._origin.x,
            this._xAxis.y, this._yAxis.y, this._zAxis.y, this._origin.y,
            this._xAxis.z, this._yAxis.z, this._zAxis.z, this._origin.z,
            0, 0, 0, 1,
        )
    }

    public transform(m: Mat4) {
        this._origin = m.transformedPoint(this._origin)
        this._xAxis = m.transformedVector(this._xAxis)
        this._yAxis = m.transformedVector(this._yAxis)
        this._zAxis = m.transformedVector(this._zAxis)
        return this
    }

    public transformed(m: Mat4) {
        return this.clone().transform(m)
    }

    public inverse(eps = Precision.LEN_EPS) {
        return new Coord3D(this.toMat4().inverted(eps))
    }

    public setOrigin(origin: Vec3) {
        this._origin = origin
        return this
    }

    public setXAxis(xAxis: Vec3) {
        this._xAxis = xAxis
        return this
    }

    public setYAxis(yAxis: Vec3) {
        this._yAxis = yAxis
        return this
    }

    public setZAxis(zAxis: Vec3) {
        this._zAxis = zAxis
        return this
    }

    public getScale() {
        return new Vec3(this._xAxis.len(), this._yAxis.len(), this._zAxis.len())
    }

    public setScale(sx: number, sy: number, sz: number, eps = Precision.LEN_EPS) {
        this._xAxis = this._xAxis.clone().setLength(sx, eps)
        this._yAxis = this._yAxis.clone().setLength(sy, eps)
        this._zAxis = this._zAxis.clone().setLength(sz, eps)
        return this
    }

    public dump(): IDBCoord3D {
        return {
            type: Coord3D.type,
            origin: { x: this._origin.x, y: this._origin.y, z: this._origin.z },
            xAxis: { x: this._xAxis.x, y: this._xAxis.y, z: this._xAxis.z },
            yAxis: { x: this._yAxis.x, y: this._yAxis.y, z: this._yAxis.z },
            zAxis: { x: this._zAxis.x, y: this._zAxis.y, z: this._zAxis.z },
        }
    }

    public static load(data: IDBCoord3D) {
        return new Coord3D(
            new Vec3(data.origin),
            new Vec3(data.xAxis),
            new Vec3(data.yAxis),
            new Vec3(data.zAxis),
        )
    }
}
