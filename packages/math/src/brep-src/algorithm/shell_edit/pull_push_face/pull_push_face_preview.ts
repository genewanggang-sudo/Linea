import { Vec3 } from '../../../..';
import ShellModelingBase from '../shell_modeling_base';
import { IShellModelingResult } from '../shell_modeling_result';
import { Face } from '../../../brep/face';
import { pullPushFacePreviewCore } from './pull_push_face_preview_core';



/**
 *
 * 推拉面算法
 */
export default class PullPushFacePreview extends ShellModelingBase {
    // 被推拉的面.
    private _face: Face;

    // 推拉方向.
    private _pullPushVec: Vec3;

    // 是否使用extrude行为
    private _bExtrudeBehavior: boolean;

    constructor(face: Face, vec: Vec3, extrudeBehavior: boolean) {
        super([]);
        this._face = face;
        this._pullPushVec = vec;
        this._bExtrudeBehavior = extrudeBehavior;
    }

    protected _executeImpl(): IShellModelingResult {
        let result: IShellModelingResult = {};
        try {
            result = pullPushFacePreviewCore(this._face, this._pullPushVec, this._bExtrudeBehavior);
        } catch (e) {
            if (e instanceof Error) {
                result.errorStr = e.message;
            }
            return result;
        }
        return result;
    }

    protected _validateResult() {
        return false;
    }
}