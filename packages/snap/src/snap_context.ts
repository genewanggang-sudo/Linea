import type { GNode } from '@ccpc/core'
import type { Curve2, Vec2 } from '@ccpc/math'

import type { SnapResult } from './snap_result'

/**
 * 吸附辅助对象类型
 */
export enum EN_SNAP_HELP_OBJ {
    POINT = 'point',
    CURVE = 'curve',
    DIR = 'dir',
}

/**
 * 吸附计算的输入信息，snap引擎根据这些输入信息，计算得到吸附结果
 */
export class SnapContext {
    /**
     * pick得到的GNode
     */
    private _snappableGNodes!: GNode[]

    /**
     * 当前光标在工作平面上的二维坐标
     */
    private _cursorWorld!: Vec2

    /**
     * pickPoint中上一个获取的点，需要吸附平行/延长等方式时，需要设置此项
     */
    private _previousPoint: Vec2 | undefined

    /**
     * 画线操作中，上一条线的方向
     */
    private _previousLineDir: Vec2 | undefined

    /**
     * 连续取点中，获取的第一个点
     */
    private _firstPoint: Vec2 | undefined

    private _snapHelpers: Map<EN_SNAP_HELP_OBJ, (Vec2 | Curve2[])[]> = new Map()

    /**
     * 自定义吸附结果排序规则
     */
    private _snapSort: ((a: SnapResult, b: SnapResult) => number) | undefined

    constructor()

    constructor(snappableGNodes: GNode[], cursorWorld: Vec2)

    constructor(snappableGNodes?: GNode[], cursorWorld?: Vec2) {
        if (snappableGNodes && cursorWorld) {
            this._snappableGNodes = snappableGNodes
            this._cursorWorld = cursorWorld
        }
    }

    public get snappableGNodes() {
        return this._snappableGNodes
    }

    public set snappableGNodes(gnodes: GNode[]) {
        this._snappableGNodes = gnodes
    }

    public get cursorWorld() {
        return this._cursorWorld
    }

    public set cursorWorld(cursorWorld: Vec2) {
        this._cursorWorld = cursorWorld
    }

    public get previousPoint() {
        return this._previousPoint
    }

    public set previousPoint(pt: Vec2 | undefined) {
        this._previousPoint = pt
    }

    public get previousLineDir() {
        return this._previousLineDir
    }

    public set previousLineDir(dir: Vec2 | undefined) {
        this._previousLineDir = dir
    }

    public get firstPoint() {
        return this._firstPoint
    }

    public set firstPoint(pt: Vec2 | undefined) {
        this._firstPoint = pt
    }

    public get snapSort() {
        return this._snapSort
    }

    /**
     * Function used to determine the order of the elements.It is expected to return a negative
     * value if first argument is less than second argument, zero if they're equal and a positive value otherwise.
     */
    public set snapSort(snapSort: ((a: SnapResult, b: SnapResult) => number) | undefined) {
        this._snapSort = snapSort
    }

    /**
     * 获取某类吸附辅助对象
     */
    public getSnapHelpers(type: EN_SNAP_HELP_OBJ) {
        return this._snapHelpers.get(type)
    }

    /**
     * 设置某类吸附辅助对象
     */
    public setSnapHelpers(type: EN_SNAP_HELP_OBJ, snapHelper: (Vec2 | Curve2[])[]) {
        this._snapHelpers.set(type, snapHelper)
    }

    /**
     * 添加吸附辅助对象
     */
    public addSnapHelpers(type: EN_SNAP_HELP_OBJ, snapHelper: Vec2[] | Curve2[]) {
        if (!snapHelper.length) {
            return
        }

        if (this._snapHelpers.get(type)) {
            if (snapHelper[0].isVector2()) {
                this._snapHelpers.get(type)!.push(...(snapHelper as Vec2[]))
            } else {
                this._snapHelpers.get(type)!.push(snapHelper as Curve2[])
            }
            return
        }

        if (snapHelper[0].isVector2()) {
            this.setSnapHelpers(type, snapHelper as Vec2[])
        } else {
            this.setSnapHelpers(type, [snapHelper as Curve2[]])
        }
    }
}
