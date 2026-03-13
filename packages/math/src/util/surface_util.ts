import { Curve3 } from '../geometry/curve3d';
import { Surface } from '../geometry/surface';
import { Curve2 } from '../geometry/curve2';
import { Tol } from '../base/tol';
import { PeriodInterval } from '../base/period_inverval';
import { Util } from './util';
import { Vec2 } from '../base/vec2';



export class SurfaceUtil {
    /**
     * 调整curve2d的uv使得wire的uv连续封闭
     * @param loop3d
     * @param surface
     * @param discreteCurveLoops
     */
    public static unifyCurve2dUVBetweenCurves(
        loop3d: Curve3[],
        surface: Surface,
        loop2d: Curve2[],
        tol = Tol.DEFAULT,
    ) {
        if (loop3d.length < 1) {
            return;
        }

        const edgeEps = tol.edgeLengthEps;
        if (!loop3d[0].getStartPt().equals(loop3d[loop3d.length - 1].getEndPt(), edgeEps)) {
            return; // loop3d不封闭，也就不可能处理loop2d封闭了
        }
        for (let i = 1; i < loop3d.length; i++) {
            if (!loop3d[i].getStartPt().equals(loop3d[i - 1].getEndPt(), edgeEps)) {
                return; // loop3d不封闭，也就不可能处理loop2d封闭了
            }
        }

        const domainU = surface.getDomainU();
        const domainV = surface.getDomainV();
        if (!(domainU instanceof PeriodInterval) && !(domainV instanceof PeriodInterval)) {
            return;
        }

        // 处理周期性情况, 可能会跨周期
        // 平移让每一段都首尾相连, 处理周期性曲面反求参数loop不封闭问题
        for (let i = 1; i < loop2d.length; i++) {
            const preEndPt = loop2d[i - 1].getEndPt();
            const curStartPt = loop2d[i].getStartPt();
            const offsetVec = preEndPt.subtracted(curStartPt);
            const vectSqrLength = offsetVec.getSqLength();
            if (vectSqrLength < tol.edgeLengthEps2) {
                continue;
            }
            if (
                (loop2d[i - 1].isNurbsCurve2d() || loop2d[i].isNurbsCurve2d()) &&
                vectSqrLength < tol.edgeLengthEps2 * 10000
            ) {
                continue; // nurbs计算存在差别很正常，不用平移
            }
            loop2d[i].translate(offsetVec);
        }

        // 可能不在整个曲面的周期内，整体再调整到接近曲面的uv范围
        let uOffset = 0;
        let vOffset = 0;
        const pts = loop2d.map(_ => _.getStartPt());
        const calOffset = (period: number, ns: number[]) => {
            const max = Math.max(...ns);
            const min = Math.min(...ns);
            if (Util.isNearlyBiggerOrEqual(min, period)) {
                return -Math.round(min / period) * period;
            }
            if (Util.isNearlySmallerOrEqual(max, 0)) {
                return Math.round((period - max) / period) * period;
            }
            return 0;
        };
        if (domainU instanceof PeriodInterval) {
            const us = pts.map(_ => _.x);
            uOffset = calOffset(domainU.period, us);
        }
        if (domainV instanceof PeriodInterval) {
            const vs = pts.map(_ => _.y);
            vOffset = calOffset(domainV.period, vs);
        }
        if (uOffset || vOffset) {
            const offsetVec = new Vec2(uOffset, vOffset);
            loop2d.forEach(_ => _.translate(offsetVec));
        }
    }
}