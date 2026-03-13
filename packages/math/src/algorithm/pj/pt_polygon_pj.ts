import { PtLoopPJType } from './pj_type';
import { PtLoopPJ } from './pt_loop_pj';
import { Vec2 } from '../../base/vec2';
import { Polygon } from '../../topology/polygon';
import { Tol } from '../../base/tol';



/**
 *
 * 点和PolygonEx的位置关系判断
 */
export class PtPolygonPJ {
    /**
     * 点与Polygon的位置关系判断
     *
     * @param point
     * @param polygon
     * @param tolerance
     * @returns `CurvesPJType`
     */
    public static execute(pt: Vec2, polygon: Polygon, tolerance: number = Tol.LENGTH): PtLoopPJType {
        // DebugWarn.assert(polygon.isValid(), 'Loop is invalid,error');

        // 包围盒粗判
        const box2d = polygon.getBBox();
        // 同时进行包围盒合法性判断
        if (!box2d.isValid() || !box2d.containsPt(pt, tolerance)) {
            return PtLoopPJType.OUT;
        }

        const ptInOutLoopRet = PtLoopPJ.execute(pt, polygon.getLoops()[0], tolerance);
        if (ptInOutLoopRet.type === PtLoopPJType.ONEDGE || ptInOutLoopRet.type === PtLoopPJType.ONVERTEX) {
            return ptInOutLoopRet.type;
        }

        const loops = polygon.getLoops();
        for (let i = 1; i < loops.length; i++) {
            const result = PtLoopPJ.execute(pt, loops[i], tolerance);
            if (result.type === PtLoopPJType.ONEDGE || result.type === PtLoopPJType.ONVERTEX) {
                return result.type;
            }
            if (result.type === PtLoopPJType.IN) {
                return PtLoopPJType.OUT;
            }
        }

        return ptInOutLoopRet.type;
    }
}