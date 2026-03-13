import { Curve3 } from '../../geometry/curve3d';
import { Vec3 } from '../../base/vec3';
import { Interval } from '../../base/interval';
import { Vec } from '../../base/vec';
import { Surface } from '../../geometry/surface';
import { types } from '../../type_define/i_types';
import { Vec2 } from '../../base/vec2';



/**
 * 曲线与曲线的交点信息
 */
export interface ICurvesXInfo<PointType extends Vec> {
    /** 交点 */
    point: PointType;
    /** 交点在第一条曲线上的参数 */
    param1: number;
    /** 交点在第二条曲线上的参数 */
    param2: number;

    /** 是否重合 */
    isOverlap: boolean;
    /** 若是重合，重合段在第一条曲线上的参数 */
    overlap1?: Interval;
    /** 若是重合，重合段在第二条曲线上的参数 */
    overlap2?: Interval;
    /** 若是重合，两重合段同向时为 true */
    overlapSameDirection?: boolean;
}

export interface ICurvesXInfo2d extends ICurvesXInfo<Vec2> { }

export interface ICurvesXInfo3d extends ICurvesXInfo<Vec3> { }

export interface ICurveSurfXPointInfo {
    point: Vec3;
    curveT: number;
    uvPara: types.IXY;
}

/**
 * 曲线与曲面的求交信息
 */
export interface ICvSurfXInfo {
    /** 交点 */
    point: Vec3;

    /** 交点在曲线上的参数 */
    curveT: number;

    /** 交点在曲面上的参数uv */
    surfaceUV: types.IXY;

    /** 若是重合，返回重合段的交线的参数域 */
    overlapRange?: Interval;
}

export interface ISurfaceSurfaceIntersectPointInfo {
    point: Vec3;
    uvPara1: types.IXY;
    uvPara2: types.IXY;
    isSingularity?: boolean; // 奇异点/不连续点
}

/**
 * 曲面与曲面的求交信息
 */
export interface ISurfacesXInfo {
    /** 交线 */
    curve?: Curve3;

    /** 交点（仅一点相交） */
    point?: Vec3;

    /** 交面（面面重合） */
    surface?: Surface;
}