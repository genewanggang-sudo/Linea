
import { SearchSimpleLoop } from '../search_graph/search_polyline';
import { PolyCurve } from '../../topology/polycurve';
import { Loop } from '../../topology/loop';
import { Polygon } from '../../topology/polygon';
import { Curve2 } from '../../geometry/curve2';
import { Vec2 } from '../../base/vec2';
import { CurvesX } from '../intersect/curves_x';
import { PtPolygonPJ } from '../pj/pt_polygon_pj';
import { PtLoopPJType } from '../pj/pj_type';
import { PtLoopPJ } from '../pj/pt_loop_pj';

export class PolycurvePolygonBool {
    /**
     * 布尔运算， 区域裁剪线段, 支持曲线
     * @param polyline
     * @param polygon
     * @param isIntersect 内部还是外部
     * @param isTangentKeep 保留边界重叠部分
     */
    public static execute(
        polyline: PolyCurve,
        loopOrPolygons: (Loop | Polygon)[],
        isIntersect: boolean,
        isTangentKeep: boolean,
        _torlerance: number,
    ): PolyCurve[] {
        const tolerance = _torlerance;

        const innerValid = isTangentKeep
            ? [PtLoopPJType.IN, PtLoopPJType.ONEDGE, PtLoopPJType.ONVERTEX]
            : [PtLoopPJType.IN];
        const outerUnvalid = isTangentKeep
            ? [PtLoopPJType.IN]
            : [PtLoopPJType.IN, PtLoopPJType.ONEDGE, PtLoopPJType.ONVERTEX];

        const subject = polyline.copyAllCurves();
        const subjectBoxs = subject.map(_ => _.getBBox());
        const polyBoxs = loopOrPolygons.map(_ => _.getBBox());
        const result: Curve2[] = [];
        subject.forEach((curve, i) => {
            const intersectPts: Vec2[] = [];
            const addIntersect = (pt: Vec2, ins: Vec2[]) => {
                if (ins.some(tt => tt.equals(pt, tolerance))) {
                    return;
                }
                ins.push(pt);
            };
            const intersectLoops: (Loop | Polygon)[] = [];
            loopOrPolygons.forEach((loopOrPoly, j) => {
                if (!subjectBoxs[i].intersectsBox(polyBoxs[j])) {
                    return;
                }
                intersectLoops.push(loopOrPoly);
                for (const tmpCurve of loopOrPoly.getAllCurves()) {
                    const infos = CurvesX.curve2ds(curve, tmpCurve);
                    infos.forEach(_ => {
                        if (_.isOverlap) {
                            addIntersect(curve.getPtAt(_.overlap1!.min), intersectPts);
                            addIntersect(curve.getPtAt(_.overlap1!.max), intersectPts);
                        } else {
                            addIntersect(_.point, intersectPts);
                        }
                    });
                }
            });
            let splitCurves = curve.split(intersectPts.map(pt => curve.getParamAt(pt)));
            if (!splitCurves.length) {
                splitCurves = [curve];
            }
            for (const splitCurve of splitCurves) {
                let find = false;
                if (isIntersect) {
                    find = intersectLoops.some(p => {
                        let pos: any;
                        if (p instanceof Polygon) {
                            pos = PtPolygonPJ.execute(splitCurve.getMidPt(), p, tolerance);
                        } else {
                            pos = PtLoopPJ.execute(splitCurve.getMidPt(), p, tolerance).type;
                        }
                        return innerValid.some(_ => _ === pos);
                    });
                } else {
                    find = intersectLoops.every(p => {
                        let pos: any;
                        if (p instanceof Polygon) {
                            pos = PtPolygonPJ.execute(splitCurve.getMidPt(), p, tolerance);
                        } else {
                            pos = PtLoopPJ.execute(splitCurve.getMidPt(), p, tolerance).type;
                        }
                        return outerUnvalid.every(_ => _ !== pos);
                    });
                }
                if (find) {
                    result.push(splitCurve);
                }
            }
        });

        // 搜环
        return SearchSimpleLoop.execute(result, tolerance);
    }
}
