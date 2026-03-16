import { Vec2, Vec3 } from '@ccpc/math';
import { Action } from '../action';
import { IMouseEvent } from '@ccpc/canvas';

export type IPickResult = {
    point: Vec3
}

export type IPickContextParam = {
    movingCallBack?: (pos: IPickResult) => void
}

/**
 * 取点的Action
 */
export class PickPointAction extends Action<IPickResult> {
    private _context: PickPointContext

    private _currentPickResult?: IPickResult

    private _currentMousePos = Vec2.O()

    private _lastPickedResult?: IPickResult

    constructor(context = new PickPointContext()) {
        super()
        this._context = context
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
    }

    public onClick(evt: IMouseEvent) {
        this._currentMousePos = evt.pos
        if (this._context.getClickCallback() && this._currentPickResult) {
            this._context.getClickCallback()?.(this._currentPickResult)
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
        const res = this._getPickPointResult(evt.pos)
        this._context.movePoint(res)
        this._currentPickResult = res
        return true
    }

    protected _getPickPointResult(screenPos: Vec2) {
        const canvas = this.getCanvas()
        const point = canvas.screenToWorld(screenPos)
        const res: IPickResult = {
            point,
        }
        return res
    }
}

/**
 * 取点上下文
 */
// TODO 补充PickFilter等逻辑
export class PickPointContext {

    protected _currentPos: Vec3

    protected _movingCallBack?: (pos: IPickResult) => void

    protected _clickCallBack?: (pos: IPickResult) => void

    constructor(param?: IPickContextParam) {
        this._movingCallBack = param?.movingCallBack
        this._currentPos = Vec3.O()
    }

    public movePoint(p: IPickResult) {
        if (this._movingCallBack) {
            this._movingCallBack(p)
        }
        this._currentPos = p.point
    }

    public setClickCallBack(clickCallBack: (pos: IPickResult) => void) {
        this._clickCallBack = clickCallBack
    }

    public getClickCallback() {
        return this._clickCallBack
    }
}
