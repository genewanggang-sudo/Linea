import { MergeCurve } from './merge_geometry/merge_curve';
import { Curve2 } from '../geometry/curve2';
import { Tol } from '../base/tol';
import { MergePoint } from './merge_geometry/merge_point';
import { Curve3 } from '../geometry/curve3d';
import { CurvesMerge, MergeReverseMode } from './overlap/curves_merge';



export interface IMergeCurveInfo {
    result: Curve2[];

    mapper: Map<Curve2, Curve2[]>;
}

export class GeometryMerge {
    /**
     * 仅支持 arc 和 line
     * 默认容差为1e-6
     */
    public static mergeCurve2ds(curves: Curve2[], eps = Tol.LENGTH): Curve2[] {
        return MergeCurve.mergeCurve2d(curves, eps);
    }

    public static mergeCurve2dsEx(curves: Curve2[], eps = Tol.LENGTH): IMergeCurveInfo {
        return MergeCurve.mergeCurve2dEx(curves, eps);
    }

    public static mergePoints(points: ([number, number] | [number, number, number])[], eps = Tol.LENGTH) {
        return new MergePoint().merge(points, eps);
    }

    public static mergeTwoCurve2ds(
        curve1: Curve2,
        curve2: Curve2,
        mode = MergeReverseMode.merge,
        tol = Tol.DEFAULT,
    ) {
        return CurvesMerge.curve2ds(curve1, curve2, mode, tol);
    }

    public static mergeTwoCurve3ds(
        curve1: Curve3,
        curve2: Curve3,
        mode = MergeReverseMode.merge,
        tol = Tol.DEFAULT,
    ) {
        return CurvesMerge.curve3ds(curve1, curve2, mode, tol);
    }
}