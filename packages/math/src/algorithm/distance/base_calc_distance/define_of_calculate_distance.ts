import { Vec2 } from '../../../base/vec2';
import { Vec3 } from '../../../base/vec3';



export interface IPoint2dPair {
    point1: Vec2;
    point2: Vec2;
    sqrDistance: number;
}

export interface IPoint3dPair {
    point1: Vec3;
    point2: Vec3;
    sqrDistance: number;
}