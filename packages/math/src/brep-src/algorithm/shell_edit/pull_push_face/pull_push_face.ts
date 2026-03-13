import { Vec3 } from '../../../..';
import ShellModelingBase from '../shell_modeling_base';
import { IShellModelingResult } from '../shell_modeling_result';
import { Face } from '../../../brep/face';
import { Shell } from '../../../brep/shell';
import { pullPushFaceCore } from './pull_push_face_core';



/**
 *
 * 推拉面算法
 */
export default class PullPushFace extends ShellModelingBase {
    // 被推拉的面.
    private _face: Face;

    // 推拉方向.
    private _pullPushVec: Vec3;

    // 是否使用extrude行为
    private _bExtrudeBehavior: boolean;

    // 顶面合并后，成为另外一个面的内环，则进行删除
    private _bTopFaceDeal: boolean;

    // 侧面和顶面是否进行布尔运算
    private _bBoolean: boolean;

    constructor(
        face: Face,
        vec: Vec3,
        context: Shell[],
        extrudeBehavior: boolean,
        bTopFaceDeal = true,
        bBoolean = true,
    ) {
        super(context);
        this._face = face;
        this._pullPushVec = vec;
        this._bExtrudeBehavior = extrudeBehavior;
        this._bTopFaceDeal = bTopFaceDeal;
        this._bBoolean = bBoolean;
    }

    protected _executeImpl(): IShellModelingResult {
        const result: IShellModelingResult = {};
        try {
            pullPushFaceCore(
                this._face,
                this._pullPushVec,
                this._contextShells,
                this._bExtrudeBehavior,
                this._bTopFaceDeal,
                this._bBoolean,
                result,
            );
        } catch (e) {
            if (e instanceof Error) {
                result.errorStr = e.message;
            }
            return result;
        }
        return result;
    }
}

