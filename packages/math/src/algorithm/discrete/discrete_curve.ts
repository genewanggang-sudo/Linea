import { DiscreteParam } from '../../base/discrete_param';
import { Tol } from '../../base/tol';
import { Vec } from '../../base/vec';
import { Vec2 } from '../../base/vec2';
import { Vec3 } from '../../base/vec3';
import { Curve } from '../../geometry/curve';
import { IArc, INurbsCurve } from '../../type_define/i_geometry';
import { types } from '../../type_define/i_types';
import { Util } from '../../util/util';



interface IPointNode<PointType extends Vec> {
    t: number;
    point: PointType;
    tangent: PointType;
    next: number;
}

export interface IParamedPoint<PointType extends Vec> {
    point: PointType;
    param: number;
}

export type IParamedPoint2d = IParamedPoint<Vec2>;

export type IParamedPoint3d = IParamedPoint<Vec3>;

export class DiscreteCurve {
    /**
     * 离散三维曲线
     * @param curve 曲线
     * @param params 离散参数
     */
    public static execute<PointType extends Vec>(
        curve: Curve<PointType>,
        params: DiscreteParam,
    ): { point: PointType; param: number }[] {
        const range = curve.getRange();
        if (curve.isNurbsCurve()) {
            // 获得参数域上的节点插值
            const knots = [range.min, ...curve.getKnots(), range.max].sort((a, b) => a - b);
            const steps = knots.reduce((result: number[], curr, idx) => {
                if (
                    Util.isNearlyBiggerOrEqual(curr, range.min, 0) &&
                    Util.isNearlySmallerOrEqual(curr, range.max, 0) &&
                    (result.length === 0 || !Util.isNearlyEqual(curr, knots[idx - 1]))
                ) {
                    if (result.length) {
                        result.push((result[result.length - 1] + curr) / 2);
                    }
                    result.push(curr);
                }
                return result;
            }, []);
            if (steps.length < 2) {
                // 参数域过小时插值点可能不足2个，直接返回起末点
                return [
                    { point: curve.getStartPt(), param: curve.getStartParam() },
                    { point: curve.getEndPt(), param: curve.getEndParam() },
                ];
            }
            if (steps.length && steps[steps.length - 1] !== range.max) {
                steps[steps.length - 1] = range.max; // 需要保证包含 range.max
            }
            // 根据插值点离散曲线段
            const discreteInfo = steps.reduce((result: { point: PointType; param: number }[], curr, idx) => {
                const next = steps[idx + 1];
                if (next) {
                    const temp = this.nurbsDiscrete<PointType>(curve, curr, next, params);
                    if (idx !== steps.length - 2) temp.pop();
                    result.push(...temp);
                }
                return result;
            }, []);
            return discreteInfo;
        }
        const sgls = curve.getSingularities();
        const p = DiscreteCurve.getSpecificParams(curve, params);
        return DiscreteCurve.general(
            t => curve.getPtAt(t),
            t => curve.getTangentAt(t),
            curve.getRange().toArray(),
            sgls,
            p,
        );
    }

    public static nurbsDiscrete<PointType extends Vec>(
        curve: Curve<PointType>,
        start: number,
        end: number,
        params: DiscreteParam,
    ): { point: PointType; param: number }[] {
        const startPt = curve.getPtAt(start);
        const endPt = curve.getPtAt(end);

        // const t = 0.5 + 0.2 * Math.random(); 取消随机机制，稳定后可删除该行
        const mid = start + (end - start) * 0.6;
        const midPt = curve.getPtAt(mid);

        const diff1 = startPt.subtracted(endPt);
        const diff2 = startPt.subtracted(midPt);

        const threePointAreFlat = function (
            p1: PointType,
            p2: PointType,
            p3: PointType,
            epstol: number,
            angtol: number,
        ) {
            const p2mp1 = p2.subtracted(p1);
            const p3mp2 = p3.subtracted(p2);
            let area;
            let angle;
            if (p2mp1 instanceof Vec2 && p3mp2 instanceof Vec2) {
                const norm = p2mp1.cross(p3mp2);
                angle = p2mp1.angle(p3mp2);
                area = norm * norm;
            } else if (p2mp1 instanceof Vec3 && p3mp2 instanceof Vec3) {
                const norm = p2mp1.cross(p3mp2);
                angle = p2mp1.angle(p3mp2);
                area = norm.dot(norm);
            }
            if (area !== undefined && area < epstol && angle !== undefined && angle < angtol) {
                return true;
            }
            return false;
        };

        // 这里作为nurbs离散的参数控制，为了兼容大尺度下离散数量不至于过大以及小尺度下离散过少，采取了特殊的容差控制
        // 面积叉乘以及角度容差双容差控制，同时面积叉乘控制的较大，角度容差控制的较小，兼具大小尺度下的离散效果
        if (
            (diff1.dot(diff1) < params.tolerance.lengthEps && diff2.dot(diff2) > params.tolerance.lengthEps) ||
            !threePointAreFlat(startPt, midPt, endPt, params.crossEps * 6, params.tolerance.angleEps / 2)
        ) {
            const exactMid = start + (end - start) * 0.5;

            const leftPts = this.nurbsDiscrete(curve, start, exactMid, params);
            const rightPts = this.nurbsDiscrete(curve, exactMid, end, params);

            return leftPts.slice(0, -1).concat(rightPts);
        }
        return [
            { point: startPt, param: start },
            { point: endPt, param: end },
        ];
    }

    public static general<PointType extends Vec>(
        getPoint: (t: number) => PointType,
        getTangent: (t: number) => PointType,
        range: types.IInterval,
        singularities: number[] = [],
        params: DiscreteParam,
    ): IParamedPoint<PointType>[] {
        // 以宽搜的方式对离散结果进行不断细化
        const tol = params.tolerance;
        const segLength0 = (range[1] - range[0]) / Math.ceil(params.hintSegmentCount / 2);
        const nodes: IPointNode<PointType>[] = []; // 链表，生成的点列
        const todoQueue: number[] = []; // 待扩展队列

        let st = 0;
        let ed = singularities.length;
        if (singularities.length > 0) {
            if (singularities[0] - range[0] < Tol.NUMBER) st++;
            if (range[1] - singularities[singularities.length - 1] < Tol.NUMBER) ed--;
        }
        const initParams = [range[0], ...singularities.slice(st, ed), range[1]];

        for (let pi = 1; pi < initParams.length; pi++) {
            const subRangeLength = initParams[pi] - initParams[pi - 1];
            const segCount = Math.ceil(subRangeLength / segLength0);
            const segLength = subRangeLength / segCount;

            for (let i = 0; i < segCount; i++) {
                const idx = todoQueue.length;
                todoQueue.push(idx);
                const t = segLength * i + initParams[pi - 1];
                nodes.push({ t, point: getPoint(t), tangent: getTangent(t), next: idx + 1 });
            }
        }
        nodes.push({ t: range[1], point: getPoint(range[1]), tangent: getTangent(range[1]), next: -1 });

        for (let todo = 0; todo < todoQueue.length && nodes.length < params.maxSegmentCount; todo++) {
            const idx0 = todoQueue[todo];
            const pt0 = nodes[idx0];
            const pt1 = nodes[pt0.next];
            const t = (pt0.t + pt1.t) / 2;
            const pt = getPoint(t);
            const tangt = getTangent(t);
            const newPt = {
                t,
                point: pt,
                tangent: tangt,
                next: pt0.next,
            };
            nodes.push(newPt);
            pt0.next = nodes.length - 1;

            // 这里使用距离容差
            // 相比于面积容差，速度上会慢一些，但是在尺度扩展性上会更好一些
            // 面积容差在大尺度上，会离散出过多面片
            // （若要提速，可考虑采用面积容差，并在本函数开始处计算得适应与该尺度的面积容差）
            // （但是这样会导致大物体在小尺度上的离散结果过于粗糙）
            const dpMid = pt0.point.midTo(pt1.point).subtracted(pt);
            const isCloseToTruth = tol.isSquareLengthZero(dpMid.getSqLength());
            if (isCloseToTruth) {
                let isParrellel = pt.subtracted(pt0.point).isParallel(pt1.point.subtracted(pt), tol.angleEps);
                isParrellel = isParrellel && tangt.isParallel(pt0.tangent, tol.angleEps);
                if (isParrellel) {
                    continue;
                }
            }
            todoQueue.push(idx0);
            todoQueue.push(pt0.next);
        }

        const rets: { point: PointType; param: number }[] = [];
        let next = 0;
        while (next >= 0) {
            const node = nodes[next];
            rets.push({ point: node.point, param: node.t });
            next = node.next;
        }

        // 初步插值后的结果可以进行进一步迭代优化，从而使得采样点之间的距离更加均匀化
        return rets;
    }

    public static getSpecificParams<PointType extends Vec>(
        curve: Curve<PointType>,
        params: DiscreteParam,
    ): DiscreteParam {
        let n = params.hintSegmentCount;
        if (curve.isArc()) {
            n = DiscreteCurve._getArcHintSegment(curve, params);
        } else if (curve.isNurbsCurve()) {
            n = DiscreteCurve._getNurbsHintSegment(curve, params);
        } else if (curve.isOffsetCurve()) {
            const baseCurve = curve.getBaseCurve();
            if (baseCurve.isArc()) {
                n = DiscreteCurve._getArcHintSegment(baseCurve, params);
            } else if (baseCurve.isNurbsCurve()) {
                n = DiscreteCurve._getNurbsHintSegment(baseCurve, params);
            }
        }
        return n === params.hintSegmentCount ? params : params.clone({ hintSegmentCount: n });
    }

    private static _getArcHintSegment<PointType extends Vec>(
        arc: IArc<PointType>,
        params: DiscreteParam,
    ): number {
        const range = arc.getRange();
        return Math.max(params.hintSegmentCount / 2, Math.ceil(range.getLength() / params.tolerance.angleEps / 2));
    }

    private static _getNurbsHintSegment<PointType extends Vec>(
        nurb: INurbsCurve<PointType>,
        params: DiscreteParam,
    ): number {
        const count = nurb.getControlPoints().length;
        return Math.max(params.hintSegmentCount, Math.floor(count / 2));
    }
}