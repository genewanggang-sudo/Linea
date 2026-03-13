import { DiscreteUtil } from '../algorithm';
import { DiscreteParam } from '../base/discrete_param';
import { Interval } from '../base/interval';
import { PeriodInterval } from '../base/period_inverval';
import { Tol } from '../base/tol';
import { Vec } from '../base/vec';
import { Vec2 } from '../base/vec2';
import { Curve } from '../geometry/curve';
import { PolylineFunction } from '../geometry/polyline';
import { Surface } from '../geometry/surface';
import { CONST } from '../type_define/const';
import { types } from '../type_define/i_types';



export class UvUtil {
    private static _TEST_OUTPUT = false;

    public static logCurveLoops(discreteCurveLoops: types.IXY[][][], tag?: string) {
        //
        if (tag) console.log(`${tag}:`);

        discreteCurveLoops.forEach(pCurves => {
            //
            console.log('crvs: ');
            pCurves.forEach(crv =>
                //
                console.log(''.concat(...crv.map(p => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]\t`))),
            );
        });
    }

    public static logConnectedLoops(p2Loops: types.IXY[][], tag?: string) {
        //
        if (tag) console.log(`${tag}:`);

        for (const loop of p2Loops) {
            //
            console.log(''.concat(...loop.map(p => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}] `)));
        }
    }

    /**
     * 处理一条curve离散后的3d点反求参数得到的uv点的位置问题：跨越曲面周期位置的参数问题
     * @param surface 曲面
     * @param discreteUVs 曲线离散后计算的uv点
     * @param uvEps
     */
    public static unifyUvForCurvePts(surface: Surface, discreteUVs: types.IXY[], uvEps?: types.IXY) {
        // 处理Curve3d跨周期时uv位置不对的问题
        const domainU = surface.getDomainU();
        if (domainU instanceof PeriodInterval) {
            const period = domainU.period;
            // 离散之后，二维参数点的距离差不可能特别大
            if (discreteUVs.length > 2) {
                let hasBigDist = true; // 对于在周期线上的curve，反求参数结果在周期线上跳来跳去，需要while循环处理
                while (hasBigDist) {
                    // ----0----1----|2---3----4-------
                    // ---5.8--6.0---|0--0.2--0.4------- => ---5.8--6.0---|6.28--6.48--6.68-------（case1）
                    // ---0.4--0.2--0|---6.0--5.8------- => ---6.68--6.48--6.28|---6.0--5.8-------（case2）
                    let i = 0; // 周期断开位置的索引
                    let sign = 0;
                    for (; i < discreteUVs.length - 2; i++) {
                        const iDist = discreteUVs[i + 1].x - discreteUVs[i].x;
                        const jDist = Math.abs(discreteUVs[i + 2].x - discreteUVs[i + 1].x);
                        if (Math.abs(iDist) > period / 2 && Math.abs(iDist) > jDist * 2) {
                            sign = iDist < 0 ? 1 : -1; // 如果iDist < 0是曲线与surf参数域方向同向，case1的情况；>0是反向，case2的情况
                            break;
                        }
                    }

                    // 没找到断开位置，判断最后一个是否断开（--------7----8---9----|10-------）
                    if (sign === 0) {
                        const iDist = discreteUVs[i + 1].x - discreteUVs[i].x;
                        const jDist = Math.abs(discreteUVs[i].x - discreteUVs[i - 1].x);
                        if (Math.abs(iDist) > period / 2 && Math.abs(iDist) > jDist * 2) {
                            sign = iDist < 0 ? 1 : -1;
                        } else {
                            i++;
                        }
                    }

                    hasBigDist = sign !== 0;
                    if (sign !== 0) {
                        if (sign > 0) i++; // 如果sign > 0调整后面的参数+period，从后一个开始调整；如果sign < 0,调整前面的参数+period，从当前的开始调整
                        while (i >= 0 && i < discreteUVs.length) {
                            discreteUVs[i].x += period;
                            i += sign!;
                        }
                    }
                }
            }

            // curve2d的点整体出了周期域，移动到周期内
            if (Math.min(discreteUVs[0].x, discreteUVs[discreteUVs.length - 1].x) > period - Tol.NUMBER) {
                for (const pt2d of discreteUVs) {
                    pt2d.x -= period;
                }
            } else if (Math.max(discreteUVs[0].x, discreteUVs[discreteUVs.length - 1].x) < Tol.NUMBER) {
                for (const pt2d of discreteUVs) {
                    pt2d.x += period;
                }
            }
        }
        const domainV = surface.getDomainV();
        if (domainV instanceof PeriodInterval) {
            const period = domainV.period;
            if (discreteUVs.length > 2) {
                let hasBigDist = true;
                while (hasBigDist) {
                    let i = 0; // 周期断开位置的索引
                    let sign = 0;
                    for (; i < discreteUVs.length - 2; i++) {
                        const iDist = discreteUVs[i + 1].y - discreteUVs[i].y;
                        const jDist = Math.abs(discreteUVs[i + 2].y - discreteUVs[i + 1].y);
                        if (Math.abs(iDist) > period / 2 && Math.abs(iDist) > jDist * 2) {
                            sign = iDist < 0 ? 1 : -1; // 如果iDist < 0是曲线与surf参数域方向同向，case1的情况；>0是反向，case2的情况
                            break;
                        }
                    }

                    // 没找到断开位置，判断最后一个是否断开（--------7----8---9----|10-------）
                    if (sign === 0) {
                        const iDist = discreteUVs[i + 1].y - discreteUVs[i].y;
                        const jDist = Math.abs(discreteUVs[i].y - discreteUVs[i - 1].y);
                        if (Math.abs(iDist) > period / 2 && Math.abs(iDist) > jDist * 2) {
                            sign = iDist < 0 ? 1 : -1;
                        } else {
                            i++;
                        }
                    }

                    hasBigDist = sign !== 0;
                    if (sign !== 0) {
                        if (sign > 0) i++; // 如果sign > 0调整后面的参数+period，从后一个开始调整；如果sign < 0,调整前面的参数+period，从当前的开始调整
                        while (i >= 0 && i < discreteUVs.length) {
                            discreteUVs[i].y += period;
                            i += sign;
                        }
                    }
                }
            }

            // curve2d的点整体出了周期域，移动到周期内
            if (Math.min(discreteUVs[0].y, discreteUVs[discreteUVs.length - 1].y) > period - Tol.NUMBER) {
                for (const pt2d of discreteUVs) {
                    pt2d.y -= period;
                }
            } else if (Math.max(discreteUVs[0].y, discreteUVs[discreteUVs.length - 1].y) < Tol.NUMBER) {
                for (const pt2d of discreteUVs) {
                    pt2d.y += period;
                }
            }
        }
    }

    /**
     * 调整 uv 使得各环上 uv 连续
     * @param surface
     * @param discreteCurveLoops
     * @param uvEps
     * @param getPoleDiscreteUvs 获取极点的离散差值点的回调函数
     */
    public static unifyUvBetweenCurves(
        surface: Surface,
        discreteCurveLoops: types.IXY[][][],
        uvEps: types.IXY,
        getPoleDiscreteUvs?: (pt1: types.IXY, pt2: types.IXY) => types.IXY[],
    ) {
        const poleVs = UvUtil.getPoleVs(surface);
        const { y: vEps } = uvEps;

        const uPeriod = UvUtil._getUPeriod(surface);

        if (uPeriod > 0) {
            if (UvUtil._TEST_OUTPUT) UvUtil.logCurveLoops(discreteCurveLoops, 'P0 PCurveLoops');
            const period = uPeriod;
            const halfPeriod = period / 2;

            discreteCurveLoops.forEach(crvLoop => {
                let preU0 = crvLoop[0][0].x;
                let uBase = 0;
                crvLoop.forEach(crv => {
                    // test curve is pole curve
                    let isPoleCrv = false;
                    if (crv.length === 2) {
                        const pi1 = UvUtil._getPoleIndex(crv[0].y, poleVs, vEps);
                        const pi2 = UvUtil._getPoleIndex(crv[1].y, poleVs, vEps);
                        if (pi1 >= 0 && pi1 === pi2) {
                            isPoleCrv = true;
                            if (getPoleDiscreteUvs) {
                                const pts = getPoleDiscreteUvs(crv[0], crv[1]);
                                crv.splice(1, 0, ...pts);
                            }
                        }

                        // // interpolate to guarantee |dx| < Math.PI
                        // const n = Math.floor(Math.abs(((crv[0].x - crv[1].x) / Math.PI) * 1.1));
                        // const newPs: Vec2[] = [];
                        // for (let i = 0; i < n; i++) {
                        //     newPs.push(crv[0].interpolated(crv[1], (i + 1) / (n + 1)));
                        // }
                        // crv.splice(1, 0, ...newPs);
                    }

                    // make uv continuous
                    for (let pi = 0; pi < crv.length; pi++) {
                        const p = crv[pi];
                        let du = p.x - preU0;
                        if (isPoleCrv && pi > 0) {
                            //
                        } else if (du > halfPeriod) {
                            while (du > halfPeriod) {
                                du -= period;
                                uBase -= period;
                            }
                        } else if (du < -halfPeriod) {
                            while (du < -halfPeriod) {
                                du += period;
                                uBase += period;
                            }
                        }
                        preU0 = p.x;
                        p.x += uBase;
                    }
                });
            });

            if (UvUtil._TEST_OUTPUT) UvUtil.logCurveLoops(discreteCurveLoops, 'P1 PCurveLoops');
        } // if u period

        const vPeriod = UvUtil._getVPeriod(surface);

        if (vPeriod > 0) {
            const period = vPeriod;
            const halfPeriod = period / 2;

            discreteCurveLoops.forEach(crvLoop => {
                let preV0 = crvLoop[0][0].y;
                let vBase = 0;
                crvLoop.forEach(crv => {
                    // make uv continuous
                    for (const p of crv) {
                        let dv = p.y - preV0;
                        if (dv > halfPeriod) {
                            while (dv > halfPeriod) {
                                dv -= period;
                                vBase -= period;
                            }
                        } else if (dv < -halfPeriod) {
                            while (dv < -halfPeriod) {
                                dv += period;
                                vBase += period;
                            }
                        }
                        preV0 = p.y;
                        p.y += vBase;
                    }
                });
            });
        }
    }

    /**
     * 各内环根据外环调整 uv 周期
     * @param surface
     * @param p2Loops
     * @param uvEps
     */
    public static unifyUvBetweenLoops(surface: Surface, p2Loops: types.IXY[][], uvEps: types.IXY) {
        const poleVs = UvUtil.getPoleVs(surface);
        const { x: uEps, y: vEps } = uvEps;

        const uPeriod = UvUtil._getUPeriod(surface);

        if (uPeriod > 0) {
            if (UvUtil._TEST_OUTPUT) UvUtil.logConnectedLoops(p2Loops, 'P2 Combined');

            const loop0 = p2Loops[0];
            const period = uPeriod;

            for (let li = 1; li < p2Loops.length; li++) {
                // 起始点所在v向垂线与外环求交，计算得 ubase
                const loop = p2Loops[li];

                // 从一个非极点开始
                const testP = loop.find(p => UvUtil._getPoleIndex(p.y, poleVs, vEps) < 0);
                if (!testP) continue;

                const x = testP.x;
                const xRegSt = x - period / 2;
                const crosses: types.IXY[] = [];

                // 以v向轴线求交
                let p0 = loop0[loop0.length - 1];
                let dx0 = PeriodInterval.RegularizeParam(p0.x - xRegSt) - period / 2;
                loop0.forEach(p1 => {
                    const dx1 = PeriodInterval.RegularizeParam(p1.x - xRegSt) - period / 2;
                    if (dx0 > uEps && Math.abs(dx1) < uEps) {
                        crosses.push(p1);
                    } else if (dx0 > uEps && dx1 < 0 && dx0 - dx1 < period / 2) {
                        const ratio = 1 / (1 + Math.abs(dx1 / dx0));
                        crosses.push(UvUtil._interpolated(p0, p1, ratio));
                    }
                    p0 = p1;
                    dx0 = dx1;
                });

                // get min dt larger
                const y0 = testP.y;
                const miLarger = crosses.reduce((pre, cur) => {
                    return cur.y > y0 && cur.y < pre.y ? cur : pre;
                }, new Vec2(0, CONST.MODEL_MAX_LENGTH));

                const du = Math.round((miLarger.x - x) / period) * period;

                loop.forEach(p => {
                    p.x += du;
                });
            }

            if (UvUtil._TEST_OUTPUT) UvUtil.logConnectedLoops(p2Loops, 'P3 Adjusted');
        } // if u period

        const vPeriod = UvUtil._getVPeriod(surface);

        if (vPeriod > 0) {
            const loop0 = p2Loops[0];
            const period = vPeriod;

            for (let li = 1; li < p2Loops.length; li++) {
                // 起始点所在v向垂线与外环求交，计算得 ubase
                const loop = p2Loops[li];

                const y = loop[0].y;
                const yRegSt = y - period / 2;
                const crosses: types.IXY[] = [];

                // 以v向轴线求交
                let p0 = loop0[loop0.length - 1];
                let dy0 = PeriodInterval.RegularizeParam(p0.y - yRegSt) - period / 2;
                loop0.forEach(p1 => {
                    const dy1 = PeriodInterval.RegularizeParam(p1.y - yRegSt) - period / 2;
                    if (dy0 > vEps && Math.abs(dy1) < vEps) {
                        crosses.push(p1);
                    } else if (dy0 > vEps && dy1 < 0 && dy0 - dy1 < period / 2) {
                        const ratio = 1 / (1 + Math.abs(dy1 / dy0));
                        crosses.push(UvUtil._interpolated(p0, p1, ratio));
                    }
                    p0 = p1;
                    dy0 = dy1;
                });

                // get min dt larger
                const x0 = loop[0].x;
                const miLarger = crosses.reduce((pre, cur) => {
                    return cur.x > x0 && cur.x < pre.x ? pre : cur;
                }, new Vec2(CONST.MODEL_MAX_LENGTH, 0));

                const dv = Math.round((miLarger.y - y) / period) * period;

                loop.forEach(p => {
                    p.y += dv;
                });
            }
        }
    }

    /**
     * 合并各离散曲线为离散环
     * @param discreteCurveLoops
     * @param uvEps
     */
    public static connectUvCurves(discreteCurveLoops: types.IXY[][][], uvEps: types.IXY): types.IXY[][] {
        return discreteCurveLoops.map(discreteCurves => {
            for (let i = 0; i < discreteCurves.length; i++) {
                const curPoints = discreteCurves[i];
                const nextPoints = discreteCurves[(i + 1) % discreteCurves.length];
                const nextEndP = nextPoints[nextPoints.length - 1];
                const nextStartP = nextPoints[0];
                const stP = curPoints[curPoints.length - 1];
                if (new Vec2(nextEndP).distanceTo(stP) < new Vec2(nextStartP).distanceTo(stP)) {
                    nextPoints.reverse();
                }
            }

            for (let i = 0; i < discreteCurves.length; i++) {
                const curPoints = discreteCurves[i];
                const nextPoints = discreteCurves[(i + 1) % discreteCurves.length];
                const edP = curPoints[curPoints.length - 1];
                const stP = nextPoints[0];
                if (UvUtil.areEqual(edP, stP, uvEps)) {
                    UvUtil._interpolate(nextPoints[0], edP, 0.5);
                    curPoints.pop();
                }
            }
            const pLoop: types.IXY[] = [];
            const lastCrv = discreteCurves[discreteCurves.length - 1];
            let lastPt = lastCrv[lastCrv.length - 1];
            for (const crv of discreteCurves) {
                if (crv.length === 0) continue;

                for (let st = 0; st < crv.length; st++) {
                    if (!UvUtil.areEqual(lastPt, crv[st], uvEps)) {
                        for (let i = st; i < crv.length; i++) {
                            pLoop.push(crv[i]);
                        }
                        break;
                    }
                }
                lastPt = crv[crv.length - 1];
            }
            return pLoop;
        });
    }

    public static areEqual(point1: types.IXY, point2: types.IXY, eps: types.IXY) {
        const px = (point1.x - point2.x) / eps.x;
        const py = (point1.y - point2.y) / eps.y;
        return px * px + py * py < 1;
    }

    /**
     * 获取曲面极点 v 值
     * @param surface
     */
    public static getPoleVs(surface: Surface): number[] {
        return [];
    }

    /**
     * 推导曲面 uv 容差
     * @param surface
     * @param tol
     */
    public static getSurfaceUvEps(surface: Surface, tol: Tol): types.IXY {
        let uEps = tol.lengthEps;
        let vEps = tol.lengthEps;
        if (surface.isCylinder()) {
            uEps = tol.angleEps;
        }
        return { x: uEps, y: vEps };
    }

    /**
     * 推导曲线 uv 容差
     * @param curve
     * @param tol
     */
    public static getCurveEps<PointType extends Vec>(curve: Curve<PointType>, tol: Tol): number {
        const crv0 = curve;
        if (crv0.isArc()) return tol.angleEps;
        if (crv0.isNurbsCurve()) return tol.numberEps;
        return tol.lengthEps;
    }

    /**
     * 将原始 uv 转换为弧长参数化的 uv，以便于贴图
     * @param uvs
     * @param surface
     * @param clone 为 true 时，返回新数组对象；为 false 时，直接修改输入数组，并返回该数组
     */
    public static parseUvInArcLength(uvs: types.numberArr2[], surface: Surface, clone = true): types.numberArr2[] {
        const ret = clone ? uvs.map(uv => uv.slice() as types.numberArr2) : uvs;
        if (surface.isPlane()) {
            return ret;
        }

        const uRange0 = new Interval(0, 0);
        const vRange0 = new Interval(0, 0);

        for (const [u, v] of uvs) {
            uRange0.expandByPt(u);
            vRange0.expandByPt(v);
        }

        const domainU = surface.getDomainU();
        const domainV = surface.getDomainV();

        const uRange =
            domainU instanceof PeriodInterval ? ([domainU.min, domainU.max] as types.numberArr2) : uRange0.toArray();
        const vRange =
            domainV instanceof PeriodInterval ? ([domainV.min, domainV.max] as types.numberArr2) : vRange0.toArray();

        const getUPt = (x: number) => surface.getPtAt({ x, y: 0 });
        const getUTangent = (x: number) => surface.getIsoCurve(0, true).getTangentAt(x);
        const getVPt = (y: number) => surface.getPtAt({ x: 0, y });
        const getVTangent = (y: number) => surface.getIsoCurve(0, false).getTangentAt(y);
        const uPts = DiscreteUtil.discreteGeneralCurve(getUPt, getUTangent, uRange, [], DiscreteParam.NORMAL);
        const vPts = DiscreteUtil.discreteGeneralCurve(getVPt, getVTangent, vRange, [], DiscreteParam.NORMAL);

        const uXs = uPts.map(_ => _.param);
        const vXs = vPts.map(_ => _.param);
        const uYs: number[] = [0];
        const vYs: number[] = [0];

        for (let i = 1; i < uPts.length; i++) {
            uYs.push(uYs[i - 1] + uPts[i - 1].point.distanceTo(uPts[i].point));
        }
        for (let i = 1; i < vPts.length; i++) {
            vYs.push(vYs[i - 1] + vPts[i - 1].point.distanceTo(vPts[i].point));
        }

        const uPoly = new PolylineFunction(uYs, uXs);
        const vPoly = new PolylineFunction(vYs, vXs);

        const ofsU = -uPoly.getPtAt(0);
        const ofsV = -vPoly.getPtAt(0);

        for (const uv of ret) {
            uv[0] = uPoly.getPtAt(uv[0]) + ofsU;
            uv[1] = vPoly.getPtAt(uv[1]) + ofsV;
        }
        return ret;
    }

    private static _getPoleIndex(v: number, poleVs: number[], eps: number): number {
        for (let i = 0; i < poleVs.length; i++) {
            if (Math.abs(v - poleVs[i]) < eps) return i;
        }
        return -1;
    }

    private static _interpolated(p1: types.IXY, p2: types.IXY, ratio: number = 0.5): types.IXY {
        return this._interpolate({ x: p1.x, y: p1.y }, p2, ratio);
    }

    private static _interpolate(p1: types.IXY, p2: types.IXY, ratio: number = 0.5): types.IXY {
        p1.x += (p2.x - p1.x) * ratio;
        p1.y += (p2.y - p2.y) * ratio;
        return p1;
    }

    private static _getUPeriod(surface: Surface): number {
        if (surface.isUPeriodic()) {
            return (surface.getDomainU() as PeriodInterval).period;
        }
        return 0;
    }

    private static _getVPeriod(surface: Surface): number {
        if (surface.isVPeriodic()) {
            return (surface.getDomainV() as PeriodInterval).period;
        }
        return 0;
    }
}