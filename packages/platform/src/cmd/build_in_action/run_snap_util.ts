import { CCanvas } from '@ccpc/canvas'
import { GRep } from '@ccpc/core'
import { Vec2 } from '@ccpc/math'
import { EN_SNAP_HELP_OBJ, EN_SNAP_TYPE, PtSnap, SnapCandidates, SnapContext, SnapEngine, SnapSetting } from '@ccpc/snap'

import { EN_SNAP_PT_COLOR, type IPickedResult } from './i_picked_result'
import type { PickPointContext } from './pick_point_action'
import { PickUtil } from './pick_util'
import { SnapHelpMgr } from '../../model/snap_helper_manager'
import { HighLight } from '../../selection/high_light'
import { CmdMgr } from '../cmd_mgr'
import { drawSnapHelperPrompt } from './snap_helper_curve'

/**
 * 平台侧吸附调用入口
 */
export class RunSnapUtil {
    /**
     * 计算当前鼠标位置的吸附结果
     * @param ccanvas 画布
     * @param screenPos 鼠标屏幕坐标
     * @param pickFilter 拾取过滤器
     */
    public static snapPoint(
        screenPos: Vec2,
        snapContext: SnapContext,
        ccanvas: CCanvas,
        context: PickPointContext,
    ): IPickedResult {
        snapContext.snappableGNodes = PickUtil.pickGNodes(ccanvas, screenPos, context.getPickFilter(), true)
        snapContext.cursorWorld = ccanvas.screenToWorkPlaneLocal(screenPos)
        snapContext.setSnapHelpers(EN_SNAP_HELP_OBJ.POINT, SnapHelpMgr.instance().getAllSnapHelperPoints())
        snapContext.setSnapHelpers(EN_SNAP_HELP_OBJ.CURVE, SnapHelpMgr.instance().getAllSnapHelperCurves())
        snapContext.setSnapHelpers(EN_SNAP_HELP_OBJ.DIR, SnapHelpMgr.instance().getAllSnapHelperDirs())
        SnapSetting.instance().setPixelsPerUnit(ccanvas.pixelsPerUnit())
        let candidates = SnapEngine.snap(snapContext)
        if (!candidates.snapResults.length) {
            candidates = new SnapCandidates()
            candidates.addSnapResult(new PtSnap(EN_SNAP_TYPE.PointOnSnapPlane, snapContext.cursorWorld.clone(), 0))
        }
        const snap = candidates.snapResults[0] as PtSnap
        this._drawSnapPrompt(candidates)
        if (context.highlightPickedGNodes) {
            HighLight.instance().reset([...snap.getSnappedGNodes()])
        }
        const plane = ccanvas.getWorkPlane().plane
        return {
            point: plane.getPtAt(snap.snappedPt),
            screenPt: screenPos.clone(),
            pickedPlane: plane,
            pickedGNodes: snap.getSnappedGNodes(),
            pickedRefObject: snap.getSnappedObjects(),
            snapType: snap.getSnapType(),
        }
    }

    private static _drawSnapPrompt(candidates: SnapCandidates) {
        const firstSnap = candidates.snapResults[0]
        if (!(firstSnap instanceof PtSnap)) {
            return
        }
        const grep = new GRep()
        let color = EN_SNAP_PT_COLOR.POINT_ON_FACE
        switch (firstSnap.getSnapType()) {
            case EN_SNAP_TYPE.Pole:
            case EN_SNAP_TYPE.EndPoint:
                color = EN_SNAP_PT_COLOR.END_POINT
                break
            case EN_SNAP_TYPE.MiddlePoint:
            case EN_SNAP_TYPE.Center:
                color = EN_SNAP_PT_COLOR.MIDDLE_POINT
                break
            case EN_SNAP_TYPE.ExtensionPoint:
                color = EN_SNAP_PT_COLOR.PARALLEL_TO_AXIS
                break
            case EN_SNAP_TYPE.PointOnCurve:
                color = EN_SNAP_PT_COLOR.POINT_ON_CURVE
                break
            case EN_SNAP_TYPE.ClosedLineParallelToX:
            case EN_SNAP_TYPE.ClosedLineParallelToY:
                color = EN_SNAP_PT_COLOR.PARALLEL_TO_AXIS
                break
            case EN_SNAP_TYPE.XPt:
                color = EN_SNAP_PT_COLOR.INTERSECT_POINT
                break
            case EN_SNAP_TYPE.ReferCurve:
                drawSnapHelperPrompt(firstSnap, grep)
                color = EN_SNAP_PT_COLOR.POINT_ON_CURVE
                break
            case EN_SNAP_TYPE.PerpendicularPoint:
            case EN_SNAP_TYPE.ParallelToCurve:
            case EN_SNAP_TYPE.VerticalToCurve:
                drawSnapHelperPrompt(firstSnap, grep)
                color = EN_SNAP_PT_COLOR.VERTICAL_PARALLEL
                break
            default:
                break
        }
        if (firstSnap.anotherSnapType) {
            switch (firstSnap.anotherSnapType) {
                case EN_SNAP_TYPE.ReferCurve:
                case EN_SNAP_TYPE.ParallelToCurve:
                case EN_SNAP_TYPE.VerticalToCurve:
                    drawSnapHelperPrompt(firstSnap, grep)
                    break
                default:
                    break
            }
        }
        grep.addNode(firstSnap.getSnapPrompt())
        grep.setStyle({ point: { size: 8, color } })
        const action = CmdMgr.instance().getCurrentAction()
        action?.drawTmpGRep(grep)
        action?.getDoc().updateView()
    }
}
