import { Plane } from '@ccpc/math'

export class WorkPlane {
    // private _name = '工作平面'

    private _plane: Plane

    constructor()
    constructor(plane: Plane)
    constructor(plane?: Plane) {
        const oPlane = plane || Plane.XOY()
        this._plane = oPlane
    }

    public get plane() {
        return this._plane
    }

    public set plane(plane: Plane) {
        this._plane = plane
    }

    public clone() {
        const cl = new WorkPlane()
        cl.plane = this._plane.clone()
        return cl
    }
}
