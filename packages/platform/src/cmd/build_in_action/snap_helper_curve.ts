import { GCurve2d, GPoint2d, GRep, GNODE_TYPE, GPolygon, GPolycurve } from '@ccpc/core'
import { Arc2, CONST, Ln2, Vec2, alg } from '@ccpc/math'
import { EN_SNAP_TYPE, PtSnap, SnapSetting } from '@ccpc/snap'
import { Plane } from '@ccpc/math'

import { EN_SNAP_HELPER_TYPE, SnapHelpMgr } from '../../model/snap_helper_manager'
import { EN_SNAP_PT_COLOR, type IPickedResult } from './i_picked_result'

const HOVER_TIME = 200

/**
 * 吸附结果上悬停一段时间后，生成平行坐标系的辅助线
 */
export function createReferenceCurves(lastPickedResult: IPickedResult | undefined, lastTime: number) {
    if (!SnapSetting.instance().canSnapHelperObject || !lastPickedResult?.pickedGNodes?.length) {
        return
    }

    const nowTime = new Date().getTime()
    if (
        lastPickedResult &&
        (lastPickedResult.snapType === EN_SNAP_TYPE.MiddlePoint ||
            lastPickedResult.snapType === EN_SNAP_TYPE.EndPoint) &&
        nowTime - lastTime > HOVER_TIME &&
        lastPickedResult.pickedPlane
    ) {
        const localPt = lastPickedResult.pickedPlane.getUVAt(lastPickedResult.point)
        const curveX = new Ln2(localPt, Vec2.X(), [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH])
        curveX.userData = { snapType: EN_SNAP_TYPE.ReferCurve, lastPickedPt: localPt.clone() }

        const curveY = new Ln2(localPt, Vec2.Y(), [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH])
        curveY.userData = { snapType: EN_SNAP_TYPE.ReferCurve, lastPickedPt: localPt.clone() }

        SnapHelpMgr.instance().addSnapHelperCurves(EN_SNAP_HELPER_TYPE.BRIEF, [curveX, curveY])
    }
}

/**
 * 生成参考方向
 */
export function createReferenceDirs(
    lastPickedResult: IPickedResult | undefined,
    lastTime: number,
    previousSnapPt?: Vec2,
) {
    if (!SnapSetting.instance().canSnapHelperDir) {
        return
    }

    const nowTime = new Date().getTime()
    if (!(lastPickedResult && nowTime - lastTime > HOVER_TIME && lastPickedResult.pickedGNodes?.length === 1)) {
        return
    }

    const gnode = lastPickedResult.pickedGNodes[0]
    let line2d: Ln2 | undefined
    if (gnode.getType() === GNODE_TYPE.GCurve2d && (gnode as GCurve2d).geo instanceof Ln2) {
        line2d = (gnode as GCurve2d).geo as Ln2
    } else if (gnode.getType() === GNODE_TYPE.GPolycurve) {
        const curves = (gnode as GPolycurve).geo.getAllCurves()
        if (curves.length === 1 && curves[0] instanceof Ln2) {
            line2d = curves[0]
        }
    }
    if (!line2d) {
        return
    }

    const dir = line2d.getDirection().clone()
    dir.userData = { refCurve: line2d }
    SnapHelpMgr.instance().addSnapHelperDirs(EN_SNAP_HELPER_TYPE.BRIEF, dir)

    if (!previousSnapPt) {
        return
    }

    const closestPt = new Vec2()
    alg.D.ptToCurve2d(previousSnapPt, line2d, closestPt)
    if (closestPt.equals(previousSnapPt)) {
        return
    }

    const perpendicularDir = closestPt.subtracted(previousSnapPt).normalize()
    if (!perpendicularDir.isPerpendicular(line2d.getDirection())) {
        return
    }
    perpendicularDir.userData = { refCurve: line2d, snapType: EN_SNAP_TYPE.VerticalToCurve }
    SnapHelpMgr.instance().addSnapHelperDirs(EN_SNAP_HELPER_TYPE.BRIEF, perpendicularDir)
}

/**
 * 生成参考点
 */
export function createReferencePoint(lastPickedResult: IPickedResult | undefined, lastTime: number) {
    const nowTime = new Date().getTime()
    if (!(lastPickedResult && nowTime - lastTime > HOVER_TIME && lastPickedResult.pickedGNodes?.length === 1)) {
        return lastTime
    }

    const gnode = lastPickedResult.pickedGNodes[0]
    if (gnode.getType() === GNODE_TYPE.GPolygon) {
        const center = (gnode as GPolygon).geo.getCentroidPoint()
        center.userData = { snapType: EN_SNAP_TYPE.Center }
        SnapHelpMgr.instance().addSnapHelperPoints(EN_SNAP_HELPER_TYPE.BRIEF, center)
        return nowTime
    }

    if (gnode.getType() === GNODE_TYPE.GCurve2d && (gnode as GCurve2d).geo instanceof Arc2) {
        const arc = (gnode as GCurve2d).geo as Arc2
        const poles = getArc2Poles(arc)
        poles.forEach(it => {
            it.userData = { snapType: EN_SNAP_TYPE.Pole }
            SnapHelpMgr.instance().addSnapHelperPoints(EN_SNAP_HELPER_TYPE.BRIEF, it)
        })
        return nowTime
    }

    return lastTime
}

function getArc2Poles(arc: Arc2) {
    const center = arc.getCenter()
    const coord = arc.getCoord()
    const candidatePts = [
        center.added(coord.getDx().multiplied(arc.getA())),
        center.added(coord.getDx().multiplied(-arc.getA())),
        center.added(coord.getDy().multiplied(arc.getB())),
        center.added(coord.getDy().multiplied(-arc.getB())),
    ]

    const poles: Vec2[] = []
    candidatePts.forEach(pt => {
        const param = arc.getParamAt(pt)
        const onArcPt = arc.getPtAt(param)
        if (onArcPt.equals(pt) && poles.findIndex(_ => _.equals(pt)) < 0) {
            poles.push(pt)
        }
    })
    return poles
}

/**
 * 绘制捕捉辅助对象
 */
export function drawSnapHelperPrompt(ptSnap: PtSnap, grep: GRep) {
    if (!ptSnap.getSnappedObjects().length) {
        return
    }

    const plane = Plane.XOY()
    for (const snappedObj of ptSnap.getSnappedObjects()) {
        if (snappedObj instanceof Ln2 && snappedObj.userData?.snapType === EN_SNAP_TYPE.ReferCurve && snappedObj.userData?.lastPickedPt) {
            const lastPickedPt = snappedObj.userData.lastPickedPt as Vec2
            const line = new Ln2(lastPickedPt, ptSnap.snappedPt)
            let color: number = EN_SNAP_PT_COLOR.PARALLEL_TO_AXIS
            const lineDir = line.getDirection()
            if (lineDir.isParallel(Vec2.X())) {
                color = 0xff0000
            } else if (lineDir.isParallel(Vec2.Y())) {
                color = 0x00ff00
            }
            const gline = new GCurve2d(plane, line)
            gline.setStyle({
                line: {
                    color,
                    width: 2,
                },
            })
            grep.addNode(gline)

            const gpoint = new GPoint2d(plane, lastPickedPt.clone())
            gpoint.setStyle({
                point: {
                    color: EN_SNAP_PT_COLOR.PARALLEL_TO_AXIS,
                    size: 6,
                },
            })
            grep.addNode(gpoint)
        } else if ((snappedObj as Vec2).isVector2?.() && (snappedObj as Vec2).userData?.refCurve) {
            const refCurve = (snappedObj as Vec2).userData.refCurve as Ln2
            const gcurve = new GCurve2d(plane, refCurve)
            gcurve.setStyle({
                line: {
                    color: EN_SNAP_PT_COLOR.VERTICAL_PARALLEL,
                },
            })
            grep.addNode(gcurve)
        }
    }
}
