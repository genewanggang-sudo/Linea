import { Vec } from '../../base/vec';
import { Vec2 } from '../../base/vec2';
import { Vec3 } from '../../base/vec3';



export interface IPtCvDistanceInfo<VectorType extends Vec> {
    foot: VectorType;
    param: number;
    distance: number;
}

export interface IPtCvDistanceInfo2 extends IPtCvDistanceInfo<Vec2> {}

export interface IPtCvDistanceInfo3 extends IPtCvDistanceInfo<Vec3> {}