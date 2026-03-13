import { Curve3, Cylinder, Plane } from '../../../..';
import ShellModelingBase from '../shell_modeling_base';
import { Shell } from '../../../brep/shell';
import { IShellModelingResult } from '../shell_modeling_result';
import { addEdgesCore, IAddEdgesResult } from './add_edges_core';



/**
 *
 * 加边成面
 */
export default class AddEdges extends ShellModelingBase {
    private _curves: Curve3[];

    private _curvePlane: Plane | Cylinder | undefined;

    constructor(curves: Curve3[], plane: Plane | Cylinder | undefined, context: Shell[]) {
        super(context);
        this._curves = curves;
        this._curvePlane = plane;
    }

    protected _executeImpl(): IShellModelingResult {
        const result: IAddEdgesResult = {
            faceSplitMap: new Map(),
            newOuterFaces: [],
        };
        try {
            addEdgesCore(this._curves, this._curvePlane, this._contextShells, result);
        } catch (e) {
            if (e instanceof Error) {
                result.errorStr = e.message;
            }
            return result;
        }

        const bSuccess = result.faceSplitMap.size > 0 || result.newOuterFaces.length > 0;
        if (!bSuccess) {
            result.errorStr = '输入的几何元素不支持';
            return result;
        }
        return result;
    }
}