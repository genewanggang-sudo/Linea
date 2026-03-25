import { GCurve2d, GPoint2d, GPolygon, GPolycurve, type GNode } from '@ccpc/core'
import { alg, type Curve2, type Vec2 } from '@ccpc/math'

import type { SnapContext } from './snap_context'
import { EN_SNAP_HELP_OBJ } from './snap_context'
import { PtSnap } from './point_snap_result'
import { SnapSetting } from './snap_setting'
import { EN_SNAP_TYPE } from './snap_type'
import { SnapUtil } from './snap_util'

/**
 * 点吸附计算
 */
export class SnapPoint {
    /**
     * 捕捉特征点
     */
    public static snapGPoint(snapContext: SnapContext, snappableGNode: GPoint2d): PtSnap[] {
        const res: PtSnap[] = []

        const snapType = (snappableGNode.geo.userData?.snapType ?? EN_SNAP_TYPE.XPt) as EN_SNAP_TYPE
        const ptSnap = SnapUtil.intersectPoint(snapContext.cursorWorld, snappableGNode.geo, snapType)
        if (ptSnap) {
            ptSnap.addSnappedGNode(snappableGNode)
            res.push(ptSnap)
        }
        return res
    }

    /**
     * 捕捉两条线的交点
     */
    public static snapCurvesXPoint(snapContext: SnapContext, snappableGNodes: GNode[]): PtSnap[] {
        const res: PtSnap[] = []
        const curveGroups = snappableGNodes
            .map(node => ({
                node,
                curves: this._getNodeCurves(node),
            }))
            .filter(item => item.curves.length > 0)

        if (curveGroups.length < 2) {
            return res
        }

        const base = curveGroups[0]
        for (let i = 1; i < curveGroups.length; i++) {
            const target = curveGroups[i]
            for (const curve1 of base.curves) {
                for (const curve2 of target.curves) {
                    const intersects = alg.X.curve2ds(curve1, curve2)
                    for (const intersect of intersects) {
                        const ptSnap = SnapUtil.intersectPoint(
                            snapContext.cursorWorld,
                            intersect.point,
                            EN_SNAP_TYPE.XPt,
                        )
                        if (ptSnap) {
                            ptSnap.addSnappedGNode(base.node)
                            ptSnap.addSnappedGNode(target.node)
                            res.push(ptSnap)
                        }
                    }
                }
            }
        }
        return res.sort((a, b) => a.disToCursor - b.disToCursor)
    }

    /**
     * 捕捉“端点”、“中点”
     */
    public static snapCurveFeaturePoint(snapContext: SnapContext, snappableGNode: GCurve2d | GPolycurve): PtSnap[] {
        let res: PtSnap[] = []
        const snapEndPts = this.snapEndOrMidPoint(snapContext, snappableGNode)
        if (snapEndPts.length > 0) {
            res = snapEndPts
        } else {
            const snapPointOnCurve = this.snapPointOnCurve(snapContext, snappableGNode)
            if (snapPointOnCurve.length > 0) {
                res = snapPointOnCurve
            }
        }
        return res
    }

    /**
     * 捕捉参考线
     */
    public static snapReferenceCurve(snapContext: SnapContext): PtSnap[] {
        const res: PtSnap[] = []
        const helpers = snapContext.getSnapHelpers(EN_SNAP_HELP_OBJ.CURVE)
        if (!helpers?.length || !SnapSetting.instance().canSnapHelperObject) {
            return res
        }

        const snapHelperCurves: Curve2[][] = []
        for (const snapHelper of helpers) {
            if (Array.isArray(snapHelper) && snapHelper.length && !snapHelper[0].isVector2()) {
                snapHelperCurves.push(snapHelper)
            }
        }

        for (const curves of snapHelperCurves) {
            for (const curve of curves) {
                const snapType = (curve.userData?.snapType ?? EN_SNAP_TYPE.ReferCurve) as EN_SNAP_TYPE
                const intersect = SnapUtil.intersectCurve(snapContext.cursorWorld, curve, snapType)
                if (intersect) {
                    res.push(intersect)
                    return res
                }
            }
        }
        return res
    }

    /**
     * 捕捉参考点
     */
    public static snapReferencePoint(snapContext: SnapContext): PtSnap[] {
        const res: PtSnap[] = []
        const helpers = snapContext.getSnapHelpers(EN_SNAP_HELP_OBJ.POINT)
        if (!helpers?.length || !SnapSetting.instance().canSnapHelperObject) {
            return res
        }

        const snapHelperPts = helpers.filter(_ => !Array.isArray(_)) as Vec2[]
        for (const pt of snapHelperPts) {
            const snapType = (pt.userData?.snapType ?? EN_SNAP_TYPE.XPt) as EN_SNAP_TYPE
            const intersect = SnapUtil.intersectPoint(snapContext.cursorWorld, pt, snapType)
            if (intersect) {
                res.push(intersect)
                return res
            }
        }
        return res
    }

    /**
     * 捕捉“端点”、“中点”
     */
    public static snapEndOrMidPoint(snapContext: SnapContext, snappableGNode: GCurve2d | GPolycurve): PtSnap[] {
        const res: PtSnap[] = []
        const cursorWorld = snapContext.cursorWorld

        if (snappableGNode instanceof GCurve2d) {
            const curve = snappableGNode.geo

            if (SnapSetting.instance().canSnapEndPt) {
                const startPt = curve.getStartPt()
                let ptSnap = SnapUtil.intersectPoint(cursorWorld, startPt, EN_SNAP_TYPE.EndPoint)
                if (ptSnap) {
                    ptSnap.addSnappedGNode(snappableGNode)
                    res.push(ptSnap)
                }

                const endPt = curve.getEndPt()
                ptSnap = SnapUtil.intersectPoint(cursorWorld, endPt, EN_SNAP_TYPE.EndPoint)
                if (ptSnap) {
                    ptSnap.addSnappedGNode(snappableGNode)
                    res.push(ptSnap)
                }
            }

            if (SnapSetting.instance().canSnapMidPt) {
                const midPt = curve.getMidPt()
                const ptSnap = SnapUtil.intersectPoint(cursorWorld, midPt, EN_SNAP_TYPE.MiddlePoint)
                if (ptSnap) {
                    ptSnap.addSnappedGNode(snappableGNode)
                    res.push(ptSnap)
                }
            }

            return res.sort((a, b) => a.disToCursor - b.disToCursor)
        }

        if (snappableGNode instanceof GPolycurve) {
            const curves = snappableGNode.geo.getAllCurves()
            if (!curves.length) {
                return res
            }

            if (SnapSetting.instance().canSnapEndPt) {
                const startPt = curves[0].getStartPt()
                const startSnap = SnapUtil.intersectPoint(cursorWorld, startPt, EN_SNAP_TYPE.EndPoint)
                if (startSnap) {
                    startSnap.addSnappedGNode(snappableGNode)
                    res.push(startSnap)
                }

                const endPt = curves[curves.length - 1].getEndPt()
                const endSnap = SnapUtil.intersectPoint(cursorWorld, endPt, EN_SNAP_TYPE.EndPoint)
                if (endSnap) {
                    endSnap.addSnappedGNode(snappableGNode)
                    res.push(endSnap)
                }
            }

            if (SnapSetting.instance().canSnapMidPt) {
                const midCurve = curves[Math.floor(curves.length / 2)]
                const midPt = midCurve.getMidPt()
                const midSnap = SnapUtil.intersectPoint(cursorWorld, midPt, EN_SNAP_TYPE.MiddlePoint)
                if (midSnap) {
                    midSnap.addSnappedGNode(snappableGNode)
                    res.push(midSnap)
                }
            }
        }

        return res.sort((a, b) => a.disToCursor - b.disToCursor)
    }

    /**
     * 线上的点
     */
    public static snapPointOnCurve(snapContext: SnapContext, snappableGNode: GCurve2d | GPolycurve): PtSnap[] {
        const res: PtSnap[] = []
        if (!SnapSetting.instance().canSnapPointOnCurve) {
            return res
        }

        if (snappableGNode instanceof GCurve2d) {
            const ptSnap = this._snapPtOnCurve(snappableGNode.geo, snapContext, snappableGNode)
            if (ptSnap) {
                res.push(ptSnap)
            }
            return res
        }

        if (snappableGNode instanceof GPolycurve) {
            for (const curve of snappableGNode.geo.getAllCurves()) {
                const ptSnap = this._snapPtOnCurve(curve, snapContext, snappableGNode)
                if (ptSnap) {
                    res.push(ptSnap)
                    return res
                }
            }
        }

        return res
    }

    /**
     * 面上的点
     */
    public static snapPointOnFace(snapContext: SnapContext, snappableGNode: GPolygon): PtSnap[] {
        const res: PtSnap[] = []
        if (!SnapSetting.instance().canSnapPointOnFace) {
            return res
        }

        const pjType = alg.PJ.ptToPolygon(
            snapContext.cursorWorld,
            snappableGNode.geo,
            SnapSetting.instance().getSnapTolInWorld(),
        )
        if (pjType === alg.PtLoopPJType.OUT) {
            return res
        }

        const ptSnap = new PtSnap(EN_SNAP_TYPE.PointOnFace, snapContext.cursorWorld.clone(), 0)
        ptSnap.addSnappedGNode(snappableGNode)
        res.push(ptSnap)
        return res
    }

    /**
     * 捕捉和曲线的交点
     */
    private static _snapPtOnCurve(curve: Curve2, snapContext: SnapContext, snappableGNode: GNode) {
        const ptSnap = SnapUtil.intersectCurve(snapContext.cursorWorld, curve, EN_SNAP_TYPE.PointOnCurve)
        if (ptSnap) {
            ptSnap.addSnappedGNode(snappableGNode)
            return ptSnap
        }
        return undefined
    }

    private static _getNodeCurves(gnode: GNode): Curve2[] {
        if (gnode instanceof GCurve2d) {
            return [gnode.geo]
        }
        if (gnode instanceof GPolycurve) {
            return gnode.geo.getAllCurves()
        }
        if (gnode instanceof GPolygon) {
            return gnode.geo.getAllCurves()
        }
        return []
    }
}
