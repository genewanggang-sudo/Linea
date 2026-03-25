import { GCurve2d, GGroup, GPoint2d } from '@ccpc/core'
import { Ln2, Plane, Vec2 } from '@ccpc/math'

import { SnapResult } from './snap_result'
import { EN_SNAP_TYPE } from './snap_type'

export class PtSnap extends SnapResult {
    private _snappedPt: Vec2

    private _anotherPt?: Vec2

    private _snappedDir?: Vec2

    private _disToCursor: number

    private _anotherSnapType?: EN_SNAP_TYPE

    constructor(
        snapType: EN_SNAP_TYPE,
        snappedPt: Vec2,
        disToCursor: number,
        snappedDir?: Vec2,
        anotherPt?: Vec2,
    ) {
        super(snapType)
        this._snappedPt = snappedPt
        this._disToCursor = disToCursor
        if (anotherPt) {
            this._anotherPt = anotherPt
        }
        if (snappedDir) {
            this._snappedDir = snappedDir
        }
    }

    public get snappedPt() {
        return this._snappedPt
    }

    public set snappedPt(pt: Vec2) {
        this._snappedPt = pt
    }

    public set snappedDir(snappedDir: Vec2 | undefined) {
        this._snappedDir = snappedDir
    }

    public get snappedDir() {
        return this._snappedDir
    }

    public set anotherSnapType(type: EN_SNAP_TYPE | undefined) {
        this._anotherSnapType = type
    }

    public get anotherSnapType() {
        return this._anotherSnapType
    }

    public set disToCursor(val: number) {
        this._disToCursor = val
    }

    public get disToCursor() {
        return this._disToCursor
    }

    // TODO待优化
    public getSnapPrompt(): GGroup {
        const res = new GGroup()
        if (this.getSnapType() === EN_SNAP_TYPE.PointOnSnapPlane) {
            return res
        }

        const plane = Plane.XOY()
        const point = new GPoint2d(plane, this._snappedPt.clone())
        point.setStyle({
            point: {
                size: 8,
                color: 0xffffff,
            },
        })
        res.addNode(point)

        switch (this.getSnapType()) {
            case EN_SNAP_TYPE.ParallelToX:
            case EN_SNAP_TYPE.ClosedLineParallelToX: {
                if (this._anotherPt) {
                    const line = new GCurve2d(plane, new Ln2(this._anotherPt, this._snappedPt))
                    line.setStyle({
                        line: {
                            width: 2,
                            color: 0xff0000,
                        },
                    })
                    res.addNode(line)
                }
                break
            }
            case EN_SNAP_TYPE.ParallelToY:
            case EN_SNAP_TYPE.ClosedLineParallelToY: {
                if (this._anotherPt) {
                    const line = new GCurve2d(plane, new Ln2(this._anotherPt, this._snappedPt))
                    line.setStyle({
                        line: {
                            width: 2,
                            color: 0x00ff00,
                        },
                    })
                    res.addNode(line)
                }
                break
            }
            default:
                break
        }

        return res
    }

    public getSnapPromptString(): string {
        const getPromptStringByType = (type: EN_SNAP_TYPE) => {
            let text = 'unknown'
            switch (type) {
                case EN_SNAP_TYPE.EndPoint:
                    text = '端点'
                    break
                case EN_SNAP_TYPE.Pole:
                    text = '极点'
                    break
                case EN_SNAP_TYPE.XPt:
                    text = '交点'
                    break
                case EN_SNAP_TYPE.MiddlePoint:
                    text = '中点'
                    break
                case EN_SNAP_TYPE.Center:
                    text = '中心'
                    break
                case EN_SNAP_TYPE.PerpendicularPoint:
                    text = '垂足'
                    break
                case EN_SNAP_TYPE.PointOnCurve:
                    text = '边线'
                    break
                case EN_SNAP_TYPE.ReferCurve:
                    text = '参考线'
                    break
                case EN_SNAP_TYPE.ExtensionPoint:
                    text = '延长线'
                    break
                case EN_SNAP_TYPE.VerticalToCurve:
                    text = '垂直于曲线'
                    break
                case EN_SNAP_TYPE.ParallelToCurve:
                    text = '平行于曲线'
                    break
                case EN_SNAP_TYPE.ParallelToX:
                    text = '平行X轴'
                    break
                case EN_SNAP_TYPE.ParallelToY:
                    text = '平行Y轴'
                    break
                case EN_SNAP_TYPE.ClosedLineParallelToX:
                    text = '平行X轴'
                    break
                case EN_SNAP_TYPE.ClosedLineParallelToY:
                    text = '平行Y轴'
                    break
                case EN_SNAP_TYPE.PointOnFace:
                    text = '在面上'
                    break
                case EN_SNAP_TYPE.PointOnSnapPlane:
                    text = ''
                    break
                default:
                    break
            }
            return text
        }

        return getPromptStringByType(this.getSnapType())
    }
}
