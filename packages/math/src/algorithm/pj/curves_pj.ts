import { CurvesPJType } from './pj_type';
import { Vec } from '../../base/vec';
import { CurvesX } from '../intersect/curves_x';
import { Tol } from '../../base/tol';
import { Curve2 } from '../../geometry/curve2';
import { ISimpleXInfo } from './curves_oj';
import { Curve3 } from '../../geometry/curve3d';
import { Curve } from '../../geometry/curve';



/**
 * #### 2.两曲线间的位置关系`curveToCurve`：重叠，相交，不相交
 */
class CurvesPJ {
    /**
     * 曲线与曲线的位置关系判断:相交，重叠，不相交
     *
     * 支持 Ln2 Arc2
     * @param curve1
     * @param curve2
     * @param tolerance
     * @returns `CurvesPJType`
     */
    public static execute<PointType extends Vec>(
        curve1: Curve<PointType>,
        curve2: Curve<PointType>,
        distanceTol = Tol.LENGTH,
        angleTol = Tol.ANGLE,
    ): CurvesPJType {
        // 暂时不支持nurbs二维求交
        if (curve1.isNurbsCurve() || curve2.isNurbsCurve()) {
            return CurvesPJType.NOT_INTERSECT;
        }
        function validCurveType(c: Curve<PointType>): boolean {
            if (!c.isArc() && !c.isLine() && !c.isOffsetCurve()) {
                return false;
            }
            return true;
        }

        if (!validCurveType(curve1) || !validCurveType(curve2)) {
            //
            console.error('曲线位置关系判断暂时返回-1，请添加该方法');
            return -1 as any;
        }

        const tol = new Tol(distanceTol, angleTol);
        let infos: ISimpleXInfo[];
        if (curve1 instanceof Curve2 && curve2 instanceof Curve2) {
            infos = CurvesX.curve2ds(curve1, curve2, tol);
        } else if (curve1 instanceof Curve3 && curve2 instanceof Curve3) {
            infos = CurvesX.curve3ds(curve1, curve2, tol);
        } else {
            throw new Error('unknown curve type');
        }

        if (infos.length < 1) {
            return CurvesPJType.NOT_INTERSECT;
        }

        if (infos.some(info => info.isOverlap)) {
            if (
                infos.length === 1 &&
                infos[0].overlap1?.equals(curve1.getRange()) &&
                infos[0].overlap2?.equals(curve2.getRange())
            ) {
                return CurvesPJType.TOTALLY_OVERLAP;
            }
            return CurvesPJType.OVERLAP;
        }

        if (
            infos.some(
                info =>
                    !curve1.getRange().containsPtAtStartOrEnd(info.param1, distanceTol) ||
                    !curve2.getRange().containsPtAtStartOrEnd(info.param2, distanceTol),
            )
        ) {
            return CurvesPJType.INTERSECT_IN;
        }

        return CurvesPJType.INTERSECT_ON;
    }
}

export { CurvesPJ };