import { Tol } from '../../../base/tol';
import { Vec2 } from '../../../base/vec2';
import { Vec3 } from '../../../base/vec3';
import { Ln2 } from '../../../geometry/ln2';
import { Ln3 } from '../../../geometry/ln3';
import { Util } from '../../../util/util';
import { CurvesOverlap } from '../../overlap/curves_overlap';
import { ICurvesXInfo2d, ICurvesXInfo3d } from '../x_info';
import { XInfoUtil } from '../intersect_info_util';
import { LinesXUtil } from './lines_x_util';



/**
 * 两直线段求交
 */
export class LinesX {
    /**
     * 求两直线段的交点,若直线重合，则返回某一个交点+重合段
     * > 此接口是求两直线段的交点，直线段是有限长的，若求无限长的直线的交点，可将直线extend至无限长
     * @param line1
     * @param line2
     */
    public static line2ds(line1: Ln2, line2: Ln2, tol = Tol.DEFAULT): ICurvesXInfo2d[] {
        const overlaps = CurvesOverlap.lines<Vec2>(line1, line2, tol);
        if (overlaps.length > 0) {
            const rets = overlaps.map(ol => XInfoUtil.curvesFromOverlap(ol, line1, line2, tol));
            return rets;
        }

        // 求交
        const x = LinesXUtil.line2dsParamed(
            line1.getOrigin(),
            line2.getOrigin(),
            line1.getDirection(),
            line2.getDirection(),
        );
        if (
            !line1.getRange().containsPt(x[0], tol.lengthEps) ||
            !line2.getRange().containsPt(x[1], tol.lengthEps)
        ) {
            return [];
        }

        const p1 = line1.getPtAt(x[0]);
        return [
            {
                point: p1,
                param1: x[0],
                param2: x[1],
                isOverlap: false,
            },
        ];
    }

    public static line3ds(line1: Ln3, line2: Ln3, tol = Tol.DEFAULT): ICurvesXInfo3d[] {
        const overlaps = CurvesOverlap.lines<Vec3>(line1, line2, tol);
        if (overlaps.length > 0) {
            const rets = overlaps.map(ol => XInfoUtil.curvesFromOverlap(ol, line1, line2, tol));
            return rets;
        }

        const lineDir1 = line1.getDirection();
        const lineDir2 = line2.getDirection();
        const crossVec = lineDir1.cross(lineDir2);
        const pointDiff = line2.getOrigin().subtracted(line1.getOrigin());
        if (!Util.isNearly0(pointDiff.dot(crossVec), tol.lengthEps)) {
            // 异面直线
            return [];
        }

        // 求交
        const denormVec = crossVec.multiplied(-1);
        const normVec = lineDir2.cross(pointDiff);
        let t1 = normVec.getLength() / denormVec.getLength();
        if (denormVec.dot(normVec) < 0) {
            t1 = -t1;
        }
        const intersectPoint = line1.getPtAt(t1);

        if (
            !line1.containsPt(intersectPoint, tol.lengthEps) ||
            !line2.containsPt(intersectPoint, tol.lengthEps)
        ) {
            return [];
        }
        return [
            {
                point: intersectPoint,
                param1: t1,
                param2: line2.getParamAt(intersectPoint),
                isOverlap: false,
            },
        ];
    }
}