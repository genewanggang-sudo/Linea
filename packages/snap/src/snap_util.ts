import { GCurve2d, GNODE_TYPE, GPolygon, GPolycurve, type GNode } from '@ccpc/core'
import { Curve2, Vec2, alg } from '@ccpc/math'

import { PtSnap } from './point_snap_result'
import { SnapSetting } from './snap_setting'
import { EN_SNAP_TYPE } from './snap_type'

/**
 * 吸附计算公共方法
 */
export class SnapUtil {
    /**
     * 点吸附
     */
    public static intersectPoint(cursorWorld: Vec2, pt: Vec2, snapType: EN_SNAP_TYPE) {
        const dis = cursorWorld.distanceTo(pt)
        const tol = SnapSetting.instance().getSnapTolInWorld()
        if (dis > tol) {
            return undefined
        }

        return new PtSnap(snapType, pt.clone(), dis)
    }

    /**
     * 曲线吸附
     */
    public static intersectCurve(
        cursorWorld: Vec2,
        curve: Curve2,
        snapType: EN_SNAP_TYPE,
        anotherPt?: Vec2,
    ) {
        const footPt = new Vec2()
        const dis = alg.D.ptToCurve2d(cursorWorld, curve, footPt)
        const tol = SnapSetting.instance().getSnapTolInWorld()
        if (dis > tol) {
            return undefined
        }

        const ptSnap = new PtSnap(snapType, footPt.clone(), dis, undefined, anotherPt)
        ptSnap.addSnappedObject(curve)
        return ptSnap
    }

    public static curveIntersectGNode(curve: Curve2, gnode: GNode) {
        let curves: Curve2[] = []
        if (gnode.getType() === GNODE_TYPE.GCurve2d) {
            curves = [(gnode as GCurve2d).geo]
        } else if (gnode.getType() === GNODE_TYPE.GPolycurve) {
            curves = (gnode as GPolycurve).geo.getAllCurves()
        } else if (gnode.getType() === GNODE_TYPE.GPolygon) {
            curves = (gnode as GPolygon).geo.getAllCurves()
        }

        const res: Array<{
            pt: Vec2;
            c: Curve2;
        }> = []
        curves.forEach(c => {
            const intersects = alg.X.curve2ds(curve, c)
            intersects.forEach(p => {
                res.push({
                    pt: p.point,
                    c,
                })
            })
        })
        return res
    }
}
