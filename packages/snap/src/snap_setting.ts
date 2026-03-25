import { DebugUtil } from '@ccpc/core'

export enum EN_XY {
    X,
    Y,
}

interface ISnapSettingState {
    // 捕捉容差
    snapTolerance: number
    // 是否关闭捕捉
    isSnapOff: boolean
    canSnapEndPt: boolean
    canSnapMidPt: boolean
    canSnapCenter: boolean
    // 垂足点
    canSnapPerpendicularPoint: boolean
    // 延长线
    canSnapExtensionPoint: boolean
    // 垂直
    canSnapVertical: boolean
    // 平行于X轴
    canSnapParallelToX: boolean
    // 平行于Y轴
    canSnapParallelToY: boolean
    // 闭合线平行于X轴
    canSnapClosedLineParallelToX: boolean
    // 闭合线平行于Y轴
    canSnapClosedLineParallelToY: boolean
    // 点在线上
    canSnapPointOnCurve: boolean
    // 点在面上
    canSnapPointOnFace: boolean
    // 是否允许捕捉辅助吸附对象
    canSnapHelperObject: boolean
    // 是否允许捕捉辅助吸附方向
    canSnapHelperDir: boolean
}

/**
 * 捕捉选项设置，为单例类
 * 可用于UI上设置捕捉选项
 */
export class SnapSetting {
    private static _instance: SnapSetting

    public static instance(): SnapSetting {
        if (!SnapSetting._instance) {
            SnapSetting._instance = new SnapSetting()
        }
        return SnapSetting._instance
    }

    private _backup: ISnapSettingState | undefined

    // 1个世界单位对应多少像素
    private _pixelsPerUnit: number

    // 捕捉容差
    private _snapTolerance: number

    // 是否关闭捕捉
    private _isSnapOff: boolean

    private _canSnapEndPt!: boolean

    private _canSnapMidPt!: boolean

    private _canSnapCenter!: boolean

    // 垂足点
    private _canSnapPerpendicularPoint!: boolean

    // 延长线
    private _canSnapExtensionPoint!: boolean

    // 垂直
    private _canSnapVertical!: boolean

    // 平行于X轴
    private _canSnapParallelToX!: boolean

    // 平行于Y轴
    private _canSnapParallelToY!: boolean

    // 闭合线平行于X轴
    private _canSnapClosedLineParallelToX!: boolean

    // 闭合线平行于Y轴
    private _canSnapClosedLineParallelToY!: boolean

    // 点在线上
    private _canSnapPointOnCurve!: boolean

    // 点在面上
    private _canSnapPointOnFace!: boolean

    private _canSnapHelperObject!: boolean

    private _canSnapHelperDir!: boolean

    private constructor() {
        this._snapTolerance = 15
        this._isSnapOff = false
        this._pixelsPerUnit = 1
        this._reset(true)
    }

    /**
     * 修改snapSetting前备份原来状态
     */
    public backup() {
        this._backup = {
            snapTolerance: this._snapTolerance,
            isSnapOff: this._isSnapOff,
            canSnapEndPt: this._canSnapEndPt,
            canSnapMidPt: this._canSnapMidPt,
            canSnapCenter: this._canSnapCenter,
            canSnapPerpendicularPoint: this._canSnapPerpendicularPoint,
            canSnapExtensionPoint: this._canSnapExtensionPoint,
            canSnapVertical: this._canSnapVertical,
            canSnapParallelToX: this._canSnapParallelToX,
            canSnapParallelToY: this._canSnapParallelToY,
            canSnapClosedLineParallelToX: this._canSnapClosedLineParallelToX,
            canSnapClosedLineParallelToY: this._canSnapClosedLineParallelToY,
            canSnapPointOnCurve: this._canSnapPointOnCurve,
            canSnapPointOnFace: this._canSnapPointOnFace,
            canSnapHelperObject: this._canSnapHelperObject,
            canSnapHelperDir: this._canSnapHelperDir,
        }
    }

    /**
     * 恢复上次备份的snapSetting状态
     */
    public restore() {
        if (!this._backup) {
            return
        }
        this._snapTolerance = this._backup.snapTolerance
        this._isSnapOff = this._backup.isSnapOff
        this._canSnapEndPt = this._backup.canSnapEndPt
        this._canSnapMidPt = this._backup.canSnapMidPt
        this._canSnapCenter = this._backup.canSnapCenter
        this._canSnapPerpendicularPoint = this._backup.canSnapPerpendicularPoint
        this._canSnapExtensionPoint = this._backup.canSnapExtensionPoint
        this._canSnapVertical = this._backup.canSnapVertical
        this._canSnapParallelToX = this._backup.canSnapParallelToX
        this._canSnapParallelToY = this._backup.canSnapParallelToY
        this._canSnapClosedLineParallelToX = this._backup.canSnapClosedLineParallelToX
        this._canSnapClosedLineParallelToY = this._backup.canSnapClosedLineParallelToY
        this._canSnapPointOnCurve = this._backup.canSnapPointOnCurve
        this._canSnapPointOnFace = this._backup.canSnapPointOnFace
        this._canSnapHelperObject = this._backup.canSnapHelperObject
        this._canSnapHelperDir = this._backup.canSnapHelperDir
        delete this._backup
    }

    public getSnapTol(): number {
        return this._snapTolerance
    }

    // 设置捕捉精度，屏幕像素值
    public setSnapTol(tol: number) {
        this._snapTolerance = tol
    }

    public setPixelsPerUnit(pixelsPerUnit: number) {
        this._pixelsPerUnit = pixelsPerUnit
    }

    public getPixelsPerUnit() {
        return this._pixelsPerUnit
    }

    public getSnapTolInWorld() {
        if (this._pixelsPerUnit <= 0) {
            return this._snapTolerance
        }
        return this._snapTolerance / this._pixelsPerUnit
    }

    public get isSnapOff() {
        return this._isSnapOff
    }

    public set isSnapOff(val: boolean) {
        this._isSnapOff = val
    }

    public allowAll() {
        this._reset(true)
    }

    public disableAll() {
        this._reset(false)
    }

    public get canSnapEndPt() {
        return this._canSnapEndPt
    }

    public set canSnapEndPt(val: boolean) {
        this._canSnapEndPt = val
    }

    public get canSnapMidPt() {
        return this._canSnapMidPt
    }

    public set canSnapMidPt(val: boolean) {
        this._canSnapMidPt = val
    }

    public get canSnapCenter() {
        return this._canSnapCenter
    }

    public set canSnapCenter(val: boolean) {
        this._canSnapCenter = val
    }

    public get canSnapPerpendicularPoint() {
        return this._canSnapPerpendicularPoint
    }

    public set canSnapPerpendicularPoint(val: boolean) {
        this._canSnapPerpendicularPoint = val
    }

    public get canSnapExtensionPoint() {
        return this._canSnapExtensionPoint
    }

    public set canSnapExtensionPoint(val: boolean) {
        this._canSnapExtensionPoint = val
    }

    public get canSnapVertical() {
        return this._canSnapVertical
    }

    public set canSnapVertical(val: boolean) {
        this._canSnapVertical = val
    }

    public get canSnapHelperObject() {
        return this._canSnapHelperObject
    }

    public set canSnapHelperObject(val: boolean) {
        this._canSnapHelperObject = val
    }

    public get canSnapHelperDir() {
        return this._canSnapHelperDir
    }

    public set canSnapHelperDir(val: boolean) {
        this._canSnapHelperDir = val
    }

    public getCanSnapParallelToAxis(axis: EN_XY): boolean {
        switch (axis) {
            case EN_XY.X:
                return this._canSnapParallelToX
            case EN_XY.Y:
                return this._canSnapParallelToY
            default:
                DebugUtil.warn(false, '未定义类型', 'wg', '2026-03-25')
        }
        return false
    }

    public setCanSnapParallelToAxis(axis: EN_XY, val: boolean) {
        switch (axis) {
            case EN_XY.X:
                this._canSnapParallelToX = val
                return
            case EN_XY.Y:
                this._canSnapParallelToY = val
                return
            default:
                DebugUtil.warn(false, '未定义类型', 'wg', '2026-03-25')
        }
    }

    public getCanSnapClosedLineParallelToAxis(axis: EN_XY): boolean {
        switch (axis) {
            case EN_XY.X:
                return this._canSnapClosedLineParallelToX
            case EN_XY.Y:
                return this._canSnapClosedLineParallelToY
            default:
                DebugUtil.warn(false, '未定义类型', 'wg', '2026-03-25')
        }
        return false
    }

    public setCanSnapClosedLineParallelToAxis(axis: EN_XY, val: boolean) {
        switch (axis) {
            case EN_XY.X:
                this._canSnapClosedLineParallelToX = val
                return
            case EN_XY.Y:
                this._canSnapClosedLineParallelToY = val
                return
            default:
                DebugUtil.warn(false, '未定义类型', 'wg', '2026-03-25')
        }
    }

    public get canSnapPointOnCurve() {
        return this._canSnapPointOnCurve
    }

    public set canSnapPointOnCurve(val: boolean) {
        this._canSnapPointOnCurve = val
    }

    public get canSnapPointOnFace() {
        return this._canSnapPointOnFace
    }

    public set canSnapPointOnFace(val: boolean) {
        this._canSnapPointOnFace = val
    }

    private _reset(val: boolean) {
        this._canSnapEndPt = val
        this._canSnapMidPt = val
        this._canSnapCenter = val
        this._canSnapPerpendicularPoint = val
        this._canSnapExtensionPoint = val
        this._canSnapVertical = val
        this._canSnapParallelToX = val
        this._canSnapParallelToY = val
        this._canSnapClosedLineParallelToX = val
        this._canSnapClosedLineParallelToY = val
        this._canSnapPointOnCurve = val
        this._canSnapPointOnFace = val
        this._canSnapHelperObject = val
        this._canSnapHelperDir = val
    }
}
