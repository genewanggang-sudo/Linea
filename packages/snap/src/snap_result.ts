import type { GGroup, GNode } from '@ccpc/core'
import type { Curve2, Vec2 } from '@ccpc/math'

import type { ISnapResult } from './i_snap_result'
import type { EN_SNAP_TYPE } from './snap_type'

/**
 * 吸附结果基类
 */
export class SnapResult implements ISnapResult {
    private _snapType: EN_SNAP_TYPE

    private _snappedGNodes: GNode[]

    private _snappedObjects: (Curve2 | Vec2)[]

    constructor(snapType: EN_SNAP_TYPE) {
        this._snapType = snapType
        this._snappedGNodes = []
        this._snappedObjects = []
    }

    public getSnapType(): EN_SNAP_TYPE {
        return this._snapType
    }

    public setSnapType(type: EN_SNAP_TYPE) {
        this._snapType = type
    }

    public getSnappedGNodes(): GNode[] {
        return this._snappedGNodes
    }

    public setSnappedGNodes(gnodes: GNode[]) {
        this._snappedGNodes = gnodes
    }

    public addSnappedGNode(snappedGNode: GNode) {
        this._snappedGNodes.push(snappedGNode)
    }

    public addSnappedGNodes(snappedGNodes: GNode[]) {
        this._snappedGNodes.push(...snappedGNodes)
    }

    public getSnappedObjects(): (Curve2 | Vec2)[] {
        return this._snappedObjects
    }

    public setSnappedObjects(objects: (Curve2 | Vec2)[]) {
        this._snappedObjects = objects
    }

    public addSnappedObject(object: Curve2 | Vec2) {
        this._snappedObjects.push(object)
    }

    public addSnappedObjects(objects: (Curve2 | Vec2)[]) {
        this._snappedObjects.push(...objects)
    }

    public getSnapPrompt(): GGroup {
        throw new Error('method not implement')
    }
}
