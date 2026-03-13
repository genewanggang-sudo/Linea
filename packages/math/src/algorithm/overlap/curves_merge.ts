import { PeriodInterval } from '../../base/period_inverval';
import { Tol } from '../../base/tol';
import { Vec } from '../../base/vec';
import { Vec2 } from '../../base/vec2';
import { Vec3 } from '../../base/vec3';
import { Curve } from '../../geometry/curve';
import { Arc2 } from '../../geometry/arc2d';
import { Arc3 } from '../../geometry/arc3d';
import { Curve2 } from '../../geometry/curve2';
import { Curve3 } from '../../geometry/curve3d';
import { Ln2 } from '../../geometry/ln2';
import { Ln3 } from '../../geometry/ln3';
import { OffsetCurve2 } from '../../geometry/offset_curve2';
import { OffsetCurve3 } from '../../geometry/offset_curve3';
import { EvolutionMap } from '../../topology/evolution_map';
import { IArc, ILine, INurbsCurve, IOffsetCurve } from '../../type_define/i_geometry';
import { CurvesColinear } from './curves_colinear';
import { MathError, MathErrorType } from '../../util/math_error';
import { NurbsCurve2 } from '../../geometry/nurbs_curve2';
import { NurbsCurve3 } from '../../geometry/nurbs_curve3';
import { CalcOverlap } from '../calc_overlap';



export enum MergeReverseMode {
    merge = 0,
    remove = 1,
}

/**
 * 尝试将两曲线的合并，并返回合并后的曲线
 */
export class CurvesMerge {
    /**
     * 将loop简化：合并相邻的共线的curve
     * @param curves
     * @param tol
     */
    public static mergeLoopCurve3ds(curves: Curve3[], tol = Tol.DEFAULT) {
        const newCrvs: Curve3[] = [];

        const mergeConnectCurve = (curve1: Curve3, curve2: Curve3) => {
            if (curve1.isLine3d() && curve2.isLine3d()) {
                if (CalcOverlap.curve3dsColinear(curve1, curve2, tol)) {
                    const newLine = new Ln3(curve1.getStartPt(), curve2.getEndPt()); // 利用loop首尾相接的性质
                    return [newLine];
                }
                return undefined;
            }

            // 其他类型曲线也可以考虑做类似优化
            const res = this.curve3ds(curve1, curve2, MergeReverseMode.merge, tol);
            return res;
        };

        newCrvs.push(curves[0]);
        for (let i = 1; i < curves.length; ++i) {
            const curve1 = newCrvs[newCrvs.length - 1];
            const curve2 = curves[i];
            const res = mergeConnectCurve(curve1, curve2);
            if (!res) {
                newCrvs.push(curves[i]);
                continue;
            }

            newCrvs.pop();
            newCrvs.push(...res);
        }

        if (newCrvs.length > 3 && newCrvs[0].getStartPt().equals(newCrvs[newCrvs.length - 1].getEndPt())) {
            const res = mergeConnectCurve(newCrvs[newCrvs.length - 1], newCrvs[0]);
            if (res) {
                newCrvs.pop();
                newCrvs.splice(0, 1, ...res);
            }
        }

        return newCrvs;
    }

    public static mergeCurves3ds(curves: Curve3[], tol = Tol.DEFAULT) {
        const newCrvs: Curve3[] = [];

        newCrvs.push(curves[0]);
        for (let i = 1; i < curves.length; ++i) {
            const curve1 = newCrvs[newCrvs.length - 1];
            const curve2 = curves[i];
            const res = this.curve3ds(curve1, curve2, MergeReverseMode.merge, tol);
            if (!res) {
                newCrvs.push(curves[i]);
                continue;
            }

            newCrvs.pop();
            newCrvs.push(...res);
        }

        if (newCrvs.length > 3 && newCrvs[0].getStartPt().equals(newCrvs[newCrvs.length - 1].getEndPt())) {
            const res = this.curve3ds(newCrvs[0], newCrvs[newCrvs.length - 1], MergeReverseMode.merge, tol);
            if (res) {
                newCrvs.pop();
                newCrvs.shift();
                newCrvs.push(...res);
            }
        }

        return newCrvs;
    }

    public static mergeCurves2ds(curves: Curve2[], tol = Tol.DEFAULT) {
        const newCrvs: Curve2[] = [];

        newCrvs.push(curves[0]);
        for (let i = 1; i < curves.length; ++i) {
            const curve1 = newCrvs[newCrvs.length - 1];
            const curve2 = curves[i];
            const res = this.curve2ds(curve1, curve2, MergeReverseMode.merge, tol);
            if (!res) {
                newCrvs.push(curves[i]);
                continue;
            }

            newCrvs.pop();
            newCrvs.push(...res);
        }

        if (newCrvs.length > 3 && newCrvs[0].getStartPt().equals(newCrvs[newCrvs.length - 1].getEndPt())) {
            const res = this.curve2ds(newCrvs[0], newCrvs[newCrvs.length - 1], MergeReverseMode.merge, tol);
            if (res) {
                newCrvs.pop();
                newCrvs.shift();
                newCrvs.push(...res);
            }
        }

        return newCrvs;
    }

    /**
     * 尝试合并曲线，返回合并后的结果。若无法合并，则返回 undefined
     * @param curve1
     * @param curve2
     * @param mode merge：无论曲线方向，一律合并；remove：当曲线反向时，会将反向部分从合并结果中去除
     * @param tol
     */
    public static curve2ds(
        curve1: Curve2,
        curve2: Curve2,
        mode = MergeReverseMode.merge,
        tol = Tol.DEFAULT,
    ): Curve2[] | undefined {
        const evo = CurvesMerge.curve2dsEvolution(curve1, curve2, mode, tol);
        return evo ? Array.from(evo.keys()) : undefined;
    }

    /**
     * 尝试合并曲线，返回合并后的结果。若无法合并，则返回 undefined
     * @param curve1
     * @param curve2
     * @param mode merge：无论曲线方向，一律合并；remove：当曲线反向时，会将反向部分从合并结果中去除
     * @param tol
     * @returns 演化关系，从新曲线映射到旧曲线
     */
    public static curve2dsEvolution(
        curve1: Curve2,
        curve2: Curve2,
        mode = MergeReverseMode.merge,
        tol = Tol.DEFAULT,
    ): EvolutionMap<Curve2> | undefined {
        type retType = EvolutionMap<Curve2> | undefined;
        if (curve1 instanceof Ln2) {
            if (curve2 instanceof Ln2) {
                return CurvesMerge.linesEvolution<Vec2>(curve1, curve2, mode, tol) as retType;
            }
        } else if (curve1 instanceof Arc2) {
            if (curve2 instanceof Arc2) {
                return CurvesMerge.arcsEvolution<Vec2>(curve1, curve2, mode, tol) as retType;
            }
        } else if (curve1 instanceof NurbsCurve2) {
            if (curve2 instanceof NurbsCurve2) {
                return CurvesMerge.nurbsEvolution<Vec2>(curve1, curve2, mode, tol) as retType;
            }
        } else if (curve1 instanceof OffsetCurve2) {
            if (curve2 instanceof OffsetCurve2) {
                return CurvesMerge.offsetCurvesEvolution<Vec2>(curve1, curve2, mode, tol) as retType;
            }
        }
        return undefined;
    }

    /**
     * 尝试合并曲线，返回合并后的结果。若无法合并，则返回 undefined
     * @param curve1
     * @param curve2
     * @param mode merge：无论曲线方向，一律合并；remove：当曲线反向时，会将反向部分从合并结果中去除
     * @param tol
     */
    public static curve3ds(
        curve1: Curve3,
        curve2: Curve3,
        mode = MergeReverseMode.merge,
        tol = Tol.DEFAULT,
    ): Curve3[] | undefined {
        const evo = CurvesMerge.curve3dsEvolution(curve1, curve2, mode, tol);
        return evo ? Array.from(evo.keys()) : undefined;
    }

    /**
     * 尝试合并曲线，返回合并后的结果。若无法合并，则返回 undefined
     * @param curve1
     * @param curve2
     * @param mode merge：无论曲线方向，一律合并；remove：当曲线反向时，会将反向部分从合并结果中去除
     * @param tol
     * @returns 演化关系，从新曲线映射到旧曲线
     */
    public static curve3dsEvolution(
        curve1: Curve3,
        curve2: Curve3,
        mode = MergeReverseMode.merge,
        tol = Tol.DEFAULT,
    ): EvolutionMap<Curve3> | undefined {
        type retType = EvolutionMap<Curve3> | undefined;
        if (curve1 instanceof Ln3) {
            if (curve2 instanceof Ln3) {
                return CurvesMerge.linesEvolution<Vec3>(curve1, curve2, mode, tol) as retType;
            }
        } else if (curve1 instanceof Arc3) {
            if (curve2 instanceof Arc3) {
                return CurvesMerge.arcsEvolution<Vec3>(curve1, curve2, mode, tol) as retType;
            }
        } else if (curve1 instanceof NurbsCurve3) {
            if (curve2 instanceof NurbsCurve3) {
                return CurvesMerge.nurbsEvolution<Vec3>(curve1, curve2, mode, tol) as retType;
            }
        } else if (curve1 instanceof OffsetCurve3) {
            if (curve2 instanceof OffsetCurve3) {
                return CurvesMerge.offsetCurvesEvolution<Vec3>(curve1, curve2, mode, tol) as retType;
            }
        }
        return undefined;
    }

    public static lines(line1: Ln2, line2: Ln2, mode?: MergeReverseMode, tol?: Tol): Ln2[] | undefined;

    public static lines(line1: Ln3, line2: Ln3, mode?: MergeReverseMode, tol?: Tol): Ln3[] | undefined;

    public static lines<VectorType extends Vec>(
        line1: ILine<VectorType>,
        line2: ILine<VectorType>,
        mode?: MergeReverseMode,
        tol?: Tol,
    ): ILine<VectorType>[] | undefined;

    public static lines<VectorType extends Vec>(
        line1: ILine<VectorType>,
        line2: ILine<VectorType>,
        mode = MergeReverseMode.merge,
        tol = Tol.DEFAULT,
    ): ILine<VectorType>[] | undefined {
        const evo = CurvesMerge.linesEvolution(line1, line2, mode, tol);
        return evo ? Array.from(evo.keys()) : undefined;
    }

    public static linesEvolution<VectorType extends Vec>(
        line1: ILine<VectorType>,
        line2: ILine<VectorType>,
        mode = MergeReverseMode.merge,
        tol = Tol.DEFAULT,
    ): EvolutionMap<ILine<VectorType>> | undefined {
        if (!CurvesColinear.lines(line1, line2, tol)) return undefined;
        return CurvesMerge._simpleCurves(line1, line2, mode, tol);
    }

    public static arcs(arc1: Arc2, arc2: Arc2, mode?: MergeReverseMode, tol?: Tol): Arc2[] | undefined;

    public static arcs(arc1: Arc3, arc2: Arc3, mode?: MergeReverseMode, tol?: Tol): Arc3[] | undefined;

    public static arcs<VectorType extends Vec>(
        arc1: IArc<VectorType>,
        arc2: IArc<VectorType>,
        mode?: MergeReverseMode,
        tol?: Tol,
    ): IArc<VectorType>[] | undefined;

    public static arcs<VectorType extends Vec>(
        arc1: IArc<VectorType>,
        arc2: IArc<VectorType>,
        mode = MergeReverseMode.merge,
        tol = Tol.DEFAULT,
    ): IArc<VectorType>[] | undefined {
        const evo = CurvesMerge.arcsEvolution(arc1, arc2, mode, tol);
        return evo ? Array.from(evo.keys()) : undefined;
    }

    public static arcsEvolution<VectorType extends Vec>(
        arc1: IArc<VectorType>,
        arc2: IArc<VectorType>,
        mode = MergeReverseMode.merge,
        tol = Tol.DEFAULT,
    ): EvolutionMap<IArc<VectorType>> | undefined {
        if (!CurvesColinear.arcs(arc1, arc2, tol)) return undefined;
        const sameDir = CurvesColinear.areArcsSameDirection(arc1, arc2);
        return CurvesMerge._periodCurves(arc1, arc2, sameDir, mode, tol);
    }

    public static nurbsEvolution<VectorType extends Vec>(
        nurbs1: INurbsCurve<VectorType>,
        nurbs2: INurbsCurve<VectorType>,
        mode = MergeReverseMode.merge,
        tol = Tol.DEFAULT,
    ): EvolutionMap<INurbsCurve<VectorType>> | undefined {
        if (!CurvesColinear.nurbsCurves(nurbs1, nurbs2, tol)) return undefined;
        return CurvesMerge._nurbsRange(nurbs1, nurbs2, mode, tol);
    }

    public static offsetCurvesEvolution<VectorType extends Vec>(
        crv1: IOffsetCurve<VectorType>,
        crv2: IOffsetCurve<VectorType>,
        mode = MergeReverseMode.merge,
        tol = Tol.DEFAULT,
    ): EvolutionMap<IOffsetCurve<VectorType>> | undefined {
        if (!CurvesColinear.offsetCurves(crv1, crv2, tol)) return undefined;

        const range1 = crv1.getRange();
        const range2 = crv2.getRange();
        const period1 = range1 instanceof PeriodInterval;
        const period2 = range2 instanceof PeriodInterval;
        if (period1 && period2) {
            return CurvesMerge._periodCurves(crv1, crv2, undefined, mode, tol);
        }
        if (!period1 && !period2) {
            return CurvesMerge._simpleCurves(crv1, crv2, mode, tol);
        }
        MathError.warn(
            false,
            'period offsetCrv merge with non-period offsetCrv not supported',
            MathErrorType.Unimplemented,
            crv1,
            crv2,
        );
        return CurvesMerge._simpleCurves(crv1, crv2, mode, tol);
    }

    private static _simpleCurves<VectorType extends Vec, CurveType extends Curve<VectorType>>(
        crv1: CurveType,
        crv2: CurveType,
        mode: MergeReverseMode,
        tol: Tol,
    ): EvolutionMap<CurveType> | undefined {
        const r1 = crv1.getRange();
        const r2stOn1 = crv1.getParamAt(crv2.getStartPt());
        const r2edOn1 = crv1.getParamAt(crv2.getEndPt());
        const [r2min, r2max] = r2stOn1 < r2edOn1 ? [r2stOn1, r2edOn1] : [r2edOn1, r2stOn1];
        const evo = new EvolutionMap<CurveType>();

        function addLine(p1: number, p2: number): void {
            if (p1 < p2) {
                const line = crv1.clone().setRange(p1, p2);
                evo.set(line as CurveType, [crv1]);
            } else {
                const line = crv1.clone().setRange(p2, p1).reverse();
                evo.set(line as CurveType, [crv2]);
            }
        }

        // trim
        if (r2stOn1 > r2edOn1 && mode === MergeReverseMode.remove) {
            if (r2min > r1.max - tol.lengthEps || r2max < r1.min + tol.lengthEps) {
                return undefined;
            }
            if (Math.abs(r1.min - r2min) > tol.lengthEps) {
                addLine(r1.min, r2min);
            }
            if (Math.abs(r1.max - r2max) > tol.lengthEps) {
                addLine(r2max, r1.max);
            }
            return evo;
        }

        // union
        {
            if (r1.max < r2min - tol.lengthEps || r2max < r1.min - tol.lengthEps) {
                return undefined;
            }

            const min = Math.min(r1.min, r2min);
            const max = Math.max(r1.max, r2max);
            const line = crv1.clone().setRange(min, max);
            evo.set(line as CurveType, [crv1, crv2]);
            return evo;
        }
    }

    private static _nurbsRange<VectorType extends Vec>(
        nurbs1: INurbsCurve<VectorType>,
        nurbs2: INurbsCurve<VectorType>,
        mode: MergeReverseMode,
        _tol: Tol,
    ): EvolutionMap<INurbsCurve<VectorType>> | undefined {
        const evo = new EvolutionMap<INurbsCurve<VectorType>>();
        let isSameDir = false;
        if (
            nurbs1.getControlPoints()[0].equals(nurbs2.getControlPoints()[0]) &&
            nurbs1.getControlPoints()[1].equals(nurbs2.getControlPoints()[1])
        ) {
            isSameDir = true;
        }
        const nbs2 = isSameDir ? nurbs2 : nurbs2.clone().reverse();

        const eps = _tol.numberEps;
        const range1 = nurbs1.getRange();
        const range2 = nbs2.getRange();
        if (mode === MergeReverseMode.remove && !isSameDir) {
            if (range1.min - eps > range2.min && range1.min + eps < range2.max && range1.max - eps > range2.max) {
                nbs2.setRange(range2.max, range1.max);
                evo.set(nbs2, [nurbs1, nurbs2]);
            } else if (range1.min + eps < range2.min && range2.max - eps > range2.max) {
                const nueCrv1 = nurbs1.clone().setRange(range1.min, range2.min);
                nbs2.setRange(range2.max, range1.max);
                evo.set(nueCrv1, [nurbs1, nurbs2]);
                evo.set(nbs2, [nurbs1, nurbs2]);
            } else if (range1.min + eps < range2.min && range1.max - eps > range2.min) {
                nbs2.setRange(range1.min, range2.min);
                evo.set(nbs2, [nurbs1, nurbs2]);
            }
            return evo.size > 0 ? evo : undefined;
        }

        const min = range1.min < range2.min ? range1.min : range2.min;
        const max = range1.max > range2.max ? range1.max : range2.max;
        if (range1.getLength() + range2.getLength() < max - min + eps) {
            nbs2.setRange(min, max);
            evo.set(nbs2, [nurbs1, nurbs2]);
        }

        return evo.size > 0 ? evo : undefined;
    }

    private static _periodCurves<VectorType extends Vec, CurveType extends Curve<VectorType>>(
        crv1: CurveType,
        crv2: CurveType,
        isSameDir: boolean | undefined,
        mode: MergeReverseMode,
        _tol: Tol,
    ): EvolutionMap<CurveType> | undefined {
        const r1 = crv1.getRange() as PeriodInterval;
        const period = r1.period;
        const period2 = (crv2.getRange() as PeriodInterval).period;
        if (Math.abs(period - period2) > _tol.numberEps) {
            return undefined;
        }

        const r2stOn1 = crv1.getParamAt(crv2.getStartPt());
        const r2edOn1 = crv1.getParamAt(crv2.getEndPt());
        let sameDir: boolean;

        if (isSameDir === undefined) {
            const mid1 = crv1.getRange().getMid();
            const tan1 = crv1.getTangentAt(mid1);
            const pt = crv1.getPtAt(mid1);
            const mid2 = crv2.getParamAt(pt);
            const tan2 = crv2.getTangentAt(mid2);
            sameDir = tan1.dot(tan2) > 0;
        } else {
            sameDir = isSameDir;
        }

        const r2 = sameDir
            ? new PeriodInterval(r2stOn1, r2edOn1, period)
            : new PeriodInterval(r2edOn1, r2stOn1, period);

        const evo = new EvolutionMap<CurveType>();

        const addCrv = (ranges: PeriodInterval[], oldCrvs: CurveType[], reverseCurve = false) => {
            for (const r of ranges) {
                const crv = crv1.clone().setRange(r.min, r.max);
                if (reverseCurve) crv.reverse();
                evo.set(crv as CurveType, oldCrvs.slice());
            }
        };

        if (!sameDir && mode === MergeReverseMode.remove) {
            const ret1 = r1.subtracted(r2);
            const ret2 = r2.subtracted(r1);
            let changed = false;
            if (ret1.length !== 1 || Math.abs(ret1[0].getLength() - r1.getLength()) > Tol.DEFAULT.numberEps) {
                addCrv(ret1, [crv1]);
                changed = true;
            }

            if (ret2.length !== 1 || Math.abs(ret2[0].getLength() - r2.getLength()) > Tol.DEFAULT.numberEps) {
                addCrv(ret2, [crv2], true);
                changed = true;
            }
            return changed ? evo : undefined;
        }

        {
            const rets = PeriodInterval.merge([r1, r2]);
            if (rets.length === 2) return undefined;

            addCrv(rets, [crv1, crv2]);
            return evo;
        }
    }
}