import { Vec2, Vec3 } from '@ccpc/math';
import { EN_SNAP_HELP_OBJ, SnapContext } from '@ccpc/snap';
import { Action } from '../action';
import { FnKey, IMouseEvent } from '@ccpc/canvas';
import type { PickFilter } from './pick_filter';
import type { IPickedResult } from './i_picked_result';
import { createReferenceCurves, createReferenceDirs, createReferencePoint } from './snap_helper_curve';
import { RunSnapUtil } from './run_snap_util';
import { HighLight } from '../../selection/high_light';
import { EN_SNAP_HELPER_TYPE, SnapHelpMgr } from '../../model/snap_helper_manager';

export type IPickContextParam = {
    movingCallBack?: (pos: IPickedResult, fnKey: FnKey) => void
    clickCallBack?: (pos: IPickedResult, fnKey: FnKey) => void
    pickFilter?: PickFilter
    snapContext?: SnapContext
}

/**
 * 取点的Action
 */
export class PickPointAction extends Action<IPickedResult> {
    private _context: PickPointContext

    private _currentPickResult?: IPickedResult

    private _currentMousePos = Vec2.O()

    private _hoverSnappedPtTime = Date.now()

    private _hoverPickedGNodeTime = Date.now()

    private _lastPickedResult?: IPickedResult

    constructor(context = new PickPointContext()) {
        super()
        this._context = context
        if (context.snapContext) {
            context.snapContext.addSnapHelpers(
                EN_SNAP_HELP_OBJ.POINT,
                SnapHelpMgr.instance().getAllSnapHelperPoints(),
            )
        }
    }

    public getSnapContext(): SnapContext {
        return this._context.snapContext!
    }

    public setSnapContext(snapContext: SnapContext) {
        this._context.snapContext = snapContext
    }

    public getCurrentResult() {
        return this._currentPickResult
    }

    public getCurrentMousePos() {
        return this._currentMousePos
    }

    public getPickContext() {
        return this._context
    }

    public onDestroy(): void {
        super.onDestroy()
        SnapHelpMgr.instance().clearSnapHelperObjects(EN_SNAP_HELPER_TYPE.BRIEF)
        HighLight.instance().clear()
        this.getBuildInTmpElementPainter()?.clearTmp()
    }

    public onClick(evt: IMouseEvent) {
        this._currentMousePos = evt.pos
        if (this._context.getClickCallback() && this._currentPickResult) {
            this._context.getClickCallback()?.(this._currentPickResult, evt.fnKey)
        }
        if (this._currentPickResult) {
            this._markSuccess(this._currentPickResult)
        } else {
            const p = this._getPickPointResult(this._currentMousePos)
            this._markSuccess(p)
        }
        return true
    }

    public onMouseMove(evt: IMouseEvent): boolean {
        this._currentMousePos = evt.pos
        if (this.getBuildInTmpElementPainter()) {
            HighLight.instance().clear()
            this.getBuildInTmpElementPainter()?.clearTmp()
        }
        const res = this._getPickPointResult(evt.pos)
        this._context.movePoint(res, evt.fnKey)
        this._currentPickResult = res
        return true
    }

    protected _getPickPointResult(screenPos: Vec2) {
        createReferenceCurves(this._lastPickedResult, this._hoverSnappedPtTime)
        createReferenceDirs(
            this._lastPickedResult,
            this._hoverSnappedPtTime,
            this._context.snapContext?.previousPoint,
        )
        createReferencePoint(this._lastPickedResult, this._hoverPickedGNodeTime)

        const canvas = this.getCanvas()
        if (!this._context.snapContext) {
            this._context.snapContext = new SnapContext()
        }
        const res = RunSnapUtil.snapPoint(screenPos, this._context.snapContext, canvas, this._context)

        this._hoverSnappedPtTime = Date.now()
        if (
            !this._lastPickedResult?.pickedGNodes?.length ||
            !res.pickedGNodes?.length ||
            this._lastPickedResult.pickedGNodes.length !== res.pickedGNodes.length
        ) {
            this._hoverPickedGNodeTime = Date.now()
        } else if (res.pickedGNodes.some((v, idx) => v !== this._lastPickedResult!.pickedGNodes![idx])) {
            this._hoverPickedGNodeTime = Date.now()
        }
        this._lastPickedResult = {
            ...res,
            point: res.point.clone(),
        }
        return res
    }
}

/**
 * 取点上下文
 */
// TODO 补充PickFilter等逻辑
export class PickPointContext {
    public snapContext?: SnapContext

    protected _currentPos: Vec3

    protected _movingCallBack?: (pos: IPickedResult, fnKey: FnKey) => void

    protected _clickCallBack?: (pos: IPickedResult, fnKey: FnKey) => void

    protected _pickFilter?: PickFilter

    private _highlightPickedGNodes?: boolean

    constructor(param?: IPickContextParam) {
        this._movingCallBack = param?.movingCallBack
        this._clickCallBack = param?.clickCallBack
        this._pickFilter = param?.pickFilter
        this.snapContext = param?.snapContext
        this._currentPos = Vec3.O()
    }

    public movePoint(p: IPickedResult, fnKey: FnKey) {
        if (this._movingCallBack) {
            this._movingCallBack(p, fnKey)
        }
        this._currentPos = p.point
    }

    public setClickCallBack(clickCallBack: (pos: IPickedResult, fnKey: FnKey) => void) {
        this._clickCallBack = clickCallBack
    }

    public getClickCallback() {
        return this._clickCallBack
    }

    public getPickFilter() {
        return this._pickFilter
    }

    public setPickFilter(filter?: PickFilter) {
        this._pickFilter = filter
        return this
    }

    public get highlightPickedGNodes(): boolean | undefined {
        return this._highlightPickedGNodes
    }

    public set highlightPickedGNodes(val: boolean | undefined) {
        this._highlightPickedGNodes = val
    }
}
