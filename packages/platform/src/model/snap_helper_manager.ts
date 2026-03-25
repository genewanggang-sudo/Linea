import type { Curve2, Vec2 } from '@ccpc/math'

export enum EN_SNAP_HELPER_TYPE {
    UNKENOW = -1,
    BRIEF = 0, // 短期的， 一般一次取点结束后清空，清空时机业务定
    PERMANENT = 2, // 永久的，一直存在
}

type SnapHelperKey = string

export class SnapHelpMgr {
    private static _instance: SnapHelpMgr

    public static instance(): SnapHelpMgr {
        if (!SnapHelpMgr._instance) {
            SnapHelpMgr._instance = new SnapHelpMgr()
        }
        return SnapHelpMgr._instance
    }

    // 参考线
    private _snapHelperCvs: Map<EN_SNAP_HELPER_TYPE, SnapHelperKey[]>

    // 参考方向
    private _snapHelperDirs: Map<EN_SNAP_HELPER_TYPE, SnapHelperKey[]>

    // 参考点
    private _snapHelperPts: Map<EN_SNAP_HELPER_TYPE, SnapHelperKey[]>

    private _keyToSnapHelperCvs: Map<SnapHelperKey, Curve2[]>

    private _keyToSnapHelperDirs: Map<SnapHelperKey, Vec2>

    private _keyToSnapHelperPts: Map<SnapHelperKey, Vec2>

    private constructor() {
        this._snapHelperCvs = new Map()
        this._snapHelperDirs = new Map()
        this._snapHelperPts = new Map()
        this._keyToSnapHelperCvs = new Map()
        this._keyToSnapHelperDirs = new Map()
        this._keyToSnapHelperPts = new Map()
    }

    public addSnapHelperCurves(snapHelperType: EN_SNAP_HELPER_TYPE, curves: Curve2[]) {
        if (!curves.length || this._keyToSnapHelperCvs.get(curves[0].toString())) {
            return
        }
        if (!this._snapHelperCvs.get(snapHelperType)) {
            this._snapHelperCvs.set(snapHelperType, [curves[0].toString()])
        } else {
            if (this._snapHelperCvs.get(snapHelperType)!.length > 1) {
                this._snapHelperCvs.get(snapHelperType)!.splice(0, this._snapHelperCvs.get(snapHelperType)!.length - 1)
            }
            this._snapHelperCvs.get(snapHelperType)!.push(curves[0].toString())
        }
        this._keyToSnapHelperCvs.set(curves[0].toString(), curves)
    }

    public addSnapHelperDirs(snapHelperType: EN_SNAP_HELPER_TYPE, dir: Vec2) {
        const key = dir.toString()
        if (this._keyToSnapHelperDirs.get(key)) {
            return
        }
        if (!this._snapHelperDirs.get(snapHelperType)) {
            this._snapHelperDirs.set(snapHelperType, [key])
        } else {
            if (this._snapHelperDirs.get(snapHelperType)!.length > 1) {
                this._snapHelperDirs.get(snapHelperType)!.splice(0, this._snapHelperDirs.get(snapHelperType)!.length - 1)
            }
            this._snapHelperDirs.get(snapHelperType)!.push(key)
        }
        this._keyToSnapHelperDirs.set(key, dir)
    }

    public addSnapHelperPoints(snapHelperType: EN_SNAP_HELPER_TYPE, point: Vec2) {
        const key = point.toString()
        if (this._keyToSnapHelperPts.get(key)) {
            return
        }
        if (!this._snapHelperPts.get(snapHelperType)) {
            this._snapHelperPts.set(snapHelperType, [key])
        } else {
            this._snapHelperPts.get(snapHelperType)!.push(key)
        }
        this._keyToSnapHelperPts.set(key, point)
    }

    public deleteSnapHelperPoints(snapHelperType: EN_SNAP_HELPER_TYPE, points: Vec2[]) {
        const keys = this._snapHelperPts.get(snapHelperType)
        if (!keys) {
            return
        }
        points.forEach(p => {
            const deleteKey = p.toString()
            const idx = keys.findIndex(_ => deleteKey === _)
            if (idx > -1) {
                keys.splice(idx, 1)
            }
            this._keyToSnapHelperPts.delete(deleteKey)
        })
    }

    public clearSnapHelperObjects(snapHelperType: EN_SNAP_HELPER_TYPE) {
        this._snapHelperCvs.get(snapHelperType)?.splice(0).forEach(c => this._keyToSnapHelperCvs.delete(c))
        this._snapHelperDirs.get(snapHelperType)?.splice(0).forEach(c => this._keyToSnapHelperDirs.delete(c))
        this._snapHelperPts.get(snapHelperType)?.splice(0).forEach(c => this._keyToSnapHelperPts.delete(c))

        this._snapHelperCvs.delete(snapHelperType)
        this._snapHelperDirs.delete(snapHelperType)
        this._snapHelperPts.delete(snapHelperType)
    }

    public deleteAllSnapHelperCurves() {
        this._snapHelperCvs = new Map()
        this._keyToSnapHelperCvs = new Map()
    }

    public deleteAllSnapHelperDirs() {
        this._snapHelperDirs = new Map()
        this._keyToSnapHelperDirs = new Map()
    }

    public deleteAllSnapHelperPoints() {
        this._snapHelperPts = new Map()
        this._keyToSnapHelperPts = new Map()
    }

    public getAllSnapHelperCurves(): Curve2[][] {
        const res: Curve2[][] = []
        for (const curvesKey of this._snapHelperCvs.values()) {
            curvesKey.forEach(key => {
                const curves = this._keyToSnapHelperCvs.get(key)
                if (curves) {
                    res.push(curves)
                }
            })
        }
        return res
    }

    public getAllSnapHelperDirs(): Vec2[] {
        const res: Vec2[] = []
        for (const keys of this._snapHelperDirs.values()) {
            keys.forEach(key => {
                const dir = this._keyToSnapHelperDirs.get(key)
                if (dir) {
                    res.push(dir)
                }
            })
        }
        return res
    }

    public getAllSnapHelperPoints(): Vec2[] {
        const res: Vec2[] = []
        for (const keys of this._snapHelperPts.values()) {
            keys.forEach(key => {
                const pt = this._keyToSnapHelperPts.get(key)
                if (pt) {
                    res.push(pt)
                }
            })
        }
        return res
    }

    public getSnapHelperPoints(type: EN_SNAP_HELPER_TYPE): Vec2[] {
        const res: Vec2[] = []
        for (const key of this._snapHelperPts.get(type) || []) {
            const pt = this._keyToSnapHelperPts.get(key)
            if (pt) {
                res.push(pt)
            }
        }
        return res
    }
}
