import { Curve3 } from '../geometry/curve3d';
import { Vec3 } from '../base/vec3';
import { OffsetCurve3 } from '../geometry/offset_curve3';
import { X } from './calc_x';
import { Tol } from '../base/tol';
import { Interval } from '../base/interval';
import { Ln3 } from '../geometry/ln3';
import { CONST } from '../type_define/const';
import { LinesX } from './intersect/curves_x/lines_x';
import { CurvesMerge, MergeReverseMode } from './overlap/curves_merge';
import { types } from '../type_define/i_types';
import { PtToCurve3Distance } from './distance/pt_to_curve3_distance';
import { ParamType } from '../geometry/offset_parameter_mapper';
import { CurvesX } from './intersect/curves_x';
import { MathError } from '../util/math_error';
import { PeriodInterval } from '../base/period_inverval';
import { CurveUtil } from '../util/curve_util';
import { EvolutionMap } from '../topology/evolution_map';
import { Curve2 } from '../geometry/curve2';
import { Loop2dOffset } from './offset/loop2d_offset';



interface IJointId {
    curveId: number;
    jointId: number;
}

interface IJoint extends IJointId {
    done: boolean;
    point: Vec3;
    param: number;
    overlap?: Interval;
    thats: IJoint[];
}

interface ISegment {
    joint: IJoint;
    direction: boolean;
}
interface IAngledSegment extends ISegment {
    angle: number;
}

export class Offset {
    /**
     * 偏置平面曲线闭环，使其过 point 点。得到的结果可能为多个 Loop
     * @param curves 闭合曲线组
     * @param point 目标点
     */
    public static curve3dsByPoint(
        curves: Curve3[],
        point: types.IXYZ,
        tol: Tol = Tol.DEFAULT,
    ): { loops: Curve3[][]; evolution: EvolutionMap<Curve3> } {
        // get min dist
        const n = curves.length;
        const dz = CurveUtil.getDzByCurves(curves);
        const dists = curves.map(crv => PtToCurve3Distance.execute(point, crv));
        let minI = 0;
        for (let i = 1; i < n; i++) {
            if (dists[i].distance < dists[minI].distance) minI = i;
        }

        // determine if at corner
        const minDist = dists[minI];
        const crv = curves[minI];
        const range = crv.getRange();

        let corner: number = -1;
        if (minDist.param === range.min) {
            corner = minI;
        } else if (minDist.param === range.max) {
            corner = (minI + 1) % n;
        }

        // calculate ofs
        const dp = new Vec3(point).subtract(minDist.foot);
        const ofsZ = dp.dot(dz);
        let ofsXY: number;

        if (corner < 0) {
            // on edge
            const dir = crv.getTangentAt(minDist.param);
            const dirOut = dir.cross(dz);
            ofsXY = dp.dot(dirOut);
        } else {
            // at corner
            const preCrv = curves[(corner + n - 1) % n];
            const curCrv = curves[corner];

            const preDir = preCrv.getEndTangent();
            const curDir = curCrv.getStartTangent();
            const preDist = preDir.cross(dz).dot(dp);
            const curDist = curDir.cross(dz).dot(dp);
            ofsXY = Math.max(preDist, curDist);
        }
        return Offset.curve3dsByOffsets(curves, ofsXY, ofsZ, dz, tol);
    }

    /**
     * 根据给定偏移量，偏置平面曲线闭环
     * @param curves 待偏置的曲线组
     * @param offsetXY 平面方向偏移量
     * @param offsetZ 法向偏移量
     * @param directionZ 偏置 z 方向
     */
    public static curve3dsByOffsets(
        curves: Curve3[],
        offsetXY: number,
        offsetZ: number,
        directionZ?: Vec3,
        tol: Tol = Tol.DEFAULT,
    ): { loops: Curve3[][]; evolution: EvolutionMap<Curve3> } {
        const dz = directionZ || CurveUtil.getDzByCurves(curves);
        const opt = { smoothPolyToNurbs: true };
        const { curves: simplifiedCurves, evolution: splitEvo } = CurveUtil.simplifyCurves3d(curves, opt);
        const ofsCrvs = simplifiedCurves.map(crv => OffsetCurve3.makeByOffset(crv, dz, offsetXY, offsetZ));
        const ofsCrvMap = new Map<Curve3, Curve3>();
        for (let i = 0; i < ofsCrvs.length; i++) {
            // 处理退化，删掉退化的curve的map
            if (this._isDegeneratedCurve(ofsCrvs[i])) {
                ofsCrvs.splice(i, 1);
                i--;
                continue;
            }
            ofsCrvMap.set(ofsCrvs[i], simplifiedCurves[i]);
        }

        let extCrvEvo: EvolutionMap<Curve3, Curve3>;
        try {
            extCrvEvo = Offset._connectCurves(ofsCrvs, dz, offsetXY, true, tol);
        } catch (e) {
            return { loops: [], evolution: new EvolutionMap<Curve3>() };
        }

        const extCrvs = Array.from(extCrvEvo.keys());

        const jointLists: IJoint[][] = Offset._makeJoints(extCrvs, tol);

        const loops: IJoint[][] = Offset._findLoops(extCrvs, jointLists, dz, offsetXY > 0);

        const retEvo = new EvolutionMap<Curve3>();

        const retLoops = loops.map(joints => {
            const crvs: Curve3[] = [];
            for (let i = 0; i < joints.length; i++) {
                const joint = joints[i];
                while (i + 1 < joints.length && joints[i + 1].curveId === joint.curveId) i++;
                const p2 = jointLists[joint.curveId][joints[i].jointId + 1].param;
                const extCrv = extCrvs[joint.curveId];
                const crv = extCrv.clone().setRange(joint.param, p2);
                crvs.push(crv);
                retEvo.set(crv, [extCrv]);
            }
            return crvs;
        });

        const resEvolution = retEvo.connectValueMap(extCrvEvo);
        for (const crvs of resEvolution.values()) {
            for (let i = 0; i < crvs.length; i++) {
                crvs[i] = splitEvo.get(ofsCrvMap.get(crvs[i])!)![0];
            }
        }
        return { loops: retLoops, evolution: resEvolution };
    }

    /**
     * 根据给定偏移量，偏置平面曲线，传入曲线请保证首尾相接
     * @param curves 待偏置的曲线组
     * @param offsetDist 平面方向偏移量。关于偏移方向：从directionZ方向看过去，曲线的左边的offset为负；右边offset为正
     */
    public static offsetCurve3dList(
        curves: Curve3[],
        offsetDist: number,
        directionZ: Vec3,
    ): { curveList: Curve3[]; evolution: EvolutionMap<Curve3> } {
        const dz = directionZ;
        const isClosed = curves[0].getStartPt().equals(curves[curves.length - 1].getEndPt());
        if (isClosed) {
            const res = Offset.curve3dsByOffsets(curves, offsetDist, 0, directionZ);
            const curveList: Curve3[] = [];
            res.loops.map(_l => curveList.push(..._l));
            return { curveList, evolution: res.evolution };
        }

        const opt = { smoothPolyToNurbs: true };
        const { curves: simplifiedCurves } = CurveUtil.simplifyCurves3d(curves, opt);
        const ofsCrvs = simplifiedCurves.map(crv => OffsetCurve3.makeByOffset(crv, dz, offsetDist));
        const ofsCrvMap = new Map<Curve3, Curve3>();
        for (let i = 0; i < ofsCrvs.length; i++) {
            // 处理退化，删掉退化的curve的map
            if (this._isDegeneratedCurve(ofsCrvs[i])) {
                ofsCrvs.splice(i, 1);
                i--;
                continue;
            }
            ofsCrvMap.set(ofsCrvs[i], simplifiedCurves[i]);
        }

        let extCrvEvo: EvolutionMap<Curve3, Curve3>;
        try {
            extCrvEvo = Offset._connectCurves(ofsCrvs, dz, offsetDist, false, Tol.DEFAULT);
        } catch (e) {
            return { curveList: [], evolution: new EvolutionMap<Curve3>() };
        }

        const extCrvs = Array.from(extCrvEvo.keys());
        return { curveList: extCrvs, evolution: extCrvEvo };
    }

    /**
     * 根据给定偏移量，偏置平面曲线闭环
     * @param curves 待偏置的曲线组
     * @param offsetDist 偏移量
     * @param tol 容差
     * @param imMerge 路径是否闭合
     * @param offsetIndexes 偏移边index（如果不传，则所有边都偏移）
     */
    public static offsetLoop2d(
        curves: Curve2[],
        offsetDist: number,
        tol: Tol = Tol.DEFAULT,
        isMerge: boolean = true,
        offsetIndexes?: number[],
    ): { loops: Curve2[][]; evolution: EvolutionMap<Curve2> } {
        return Loop2dOffset.execute(curves, offsetDist, tol, isMerge, offsetIndexes);
    }

    /**
     * 根据给定偏移量，偏置平面曲线，保证曲线首尾相接
     * @param curves 待偏置的曲线组
     * @param offsetDist 平面方向偏移量。关于偏移方向：以第一条curve为准，正值的offset就是第一条curve的右边；负值的offset就是第一条curve的左边
     */
    public static offsetCurve2dList(
        curves: Curve2[],
        offsetDist: number,
    ): { curveList: Curve2[]; evolution: EvolutionMap<Curve2> } {
        return Loop2dOffset.offsetCurve2dList(curves, offsetDist);
    }

    private static _isDegeneratedCurve(curve: Curve3) {
        if (curve.getRange().getLength() < Tol.NUMBER) {
            return true;
        }

        if (curve.isArc3d()) {
            return curve.getA() < Tol.LENGTH && curve.getB() < Tol.LENGTH;
        }

        if (curve.isNurbsCurve3d()) {
            const ctrlPts = curve.getControlPoints();
            let sumSqrLength = 0;
            for (let i = 1; i < ctrlPts.length; i++) {
                const sqrLength = ctrlPts[i].sqDistanceTo(ctrlPts[i - 1]);
                sumSqrLength += sqrLength;
            }

            return sumSqrLength < Tol.LENGTH_2;
        }

        return false;
    }

    /**
     * 通过延长线连接相邻曲线
     * @param curves
     * @param dz
     * @param offsetXY
     * @param tol
     * @returns 从新曲线映射到原曲线的映射集
     */
    private static _connectCurves(
        curves: Curve3[],
        dz: Vec3,
        offsetXY: number,
        isClosed: boolean,
        tol: Tol,
    ): EvolutionMap<Curve3> {
        const evo = new EvolutionMap<Curve3>();

        // extend curve by lines
        for (let cur = 0; cur < curves.length; cur++) {
            if (!isClosed && cur === 0) {
                evo.set(curves[0], [curves[0]]);
                continue; // 如果原来的curves闭合成环，则offset之后第一条和最后一条curve要处理连接；否则从第一条和第二条开始处理连接关系
            }

            const pre = (cur + curves.length - 1) % curves.length;
            const preCrv = curves[pre];
            const curCrv = curves[cur];
            const preBaseDir =
                preCrv instanceof OffsetCurve3 ? preCrv.getBaseCurve().getEndTangent() : preCrv.getEndTangent();
            const curBaseDir =
                curCrv instanceof OffsetCurve3 ? curCrv.getBaseCurve().getStartTangent() : curCrv.getStartTangent();
            const dot = preBaseDir.cross(curBaseDir).dot(dz);
            const dist = preCrv.getEndPt().sqDistanceTo(curCrv.getStartPt());

            if (dist > Tol.LENGTH_2) {
                if (offsetXY > 0 ? dot > tol.angleEps : dot < -tol.angleEps) {
                    let preLine: Ln3;
                    let curLine: Ln3;

                    // extend preTail
                    if (preCrv instanceof Ln3) {
                        preLine = preCrv;
                        preLine.getRange().max = CONST.MODEL_MAX_LENGTH;
                    } else {
                        const paramType =
                            preCrv instanceof OffsetCurve3
                                ? preCrv.getParamMapper().getParamInfo(preCrv.getBaseCurve().getEndParam(), true).type
                                : ParamType.Normal;

                        if (paramType === ParamType.Normal) {
                            preLine = new Ln3(preCrv.getEndPt(), preBaseDir, [0, CONST.MODEL_MAX_LENGTH]);
                        } else {
                            // trim end
                            const ofsOutDir = preBaseDir.cross(dz);
                            const baseCrv = (preCrv as OffsetCurve3).getBaseCurve();
                            const ofsPt = baseCrv.getEndPt().add(ofsOutDir.multiply(offsetXY));
                            preLine = new Ln3(ofsPt, preBaseDir, [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH]);

                            if (paramType === ParamType.EndGap || paramType === ParamType.Reversed) {
                                const xRets = CurvesX.curve3ds(preCrv, preLine);
                                MathError.assert(xRets.length > 0, 'No Intersect when tirm OffsetCurve end');

                                let maxRet = xRets[0];
                                for (let i = 1; i < xRets.length; i++) {
                                    if (xRets[i].param2 > maxRet.param2) maxRet = xRets[i];
                                }
                                preLine.getRange().min = maxRet.param2;
                                preCrv.getRange().max = maxRet.param1;
                            } else {
                                preLine.getRange().min = 0;
                            }
                        } // if paramType
                        evo.set(preLine, [curves[pre]]);
                    } // extend

                    // extend curHead
                    if (curCrv instanceof Ln3) {
                        curLine = curCrv;
                        curLine.getRange().min = -CONST.MODEL_MAX_LENGTH;
                    } else {
                        const paramType =
                            curCrv instanceof OffsetCurve3
                                ? curCrv.getParamMapper().getParamInfo(curCrv.getBaseCurve().getStartParam(), false)
                                    .type
                                : ParamType.Normal;

                        if (paramType === ParamType.Normal) {
                            curLine = new Ln3(curCrv.getStartPt(), curBaseDir, [-CONST.MODEL_MAX_LENGTH, 0]);
                        } else {
                            // trim head
                            const ofsOutdir = curBaseDir.cross(dz);
                            const baseCrv = (curCrv as OffsetCurve3).getBaseCurve();
                            const ofsPt = baseCrv.getStartPt().add(ofsOutdir.multiply(offsetXY));
                            curLine = new Ln3(ofsPt, curBaseDir, [-CONST.MODEL_MAX_LENGTH, CONST.MODEL_MAX_LENGTH]);

                            if (paramType === ParamType.StartGap || paramType === ParamType.Reversed) {
                                const xRets = CurvesX.curve3ds(curCrv, curLine);
                                MathError.assert(xRets.length > 0, 'No Intersect when trim OffsetCurve start');

                                let minRet = xRets[0];
                                for (let i = 1; i < xRets.length; i++) {
                                    if (xRets[i].param2 < minRet.param2) minRet = xRets[i];
                                }
                                curLine.getRange().max = minRet.param2;
                                curCrv.getRange().min = minRet.param1;
                            } else {
                                curLine.getRange().max = 0;
                            }
                        } // if paramType
                        evo.set(curLine, [curves[cur]]);
                    } // extend head

                    const xPoints = LinesX.line3ds(preLine, curLine);

                    MathError.assert(xPoints.length > 0, 'No Intersection found between preline & curline');

                    const xPoint = xPoints[0];
                    preLine.getRange().max = xPoint.param1;
                    curLine.getRange().min = xPoint.param2;
                } else {
                    const isOffsetCurveCutRange = (curv: Curve3) => {
                        // 如果是周期nurbs的offset，并且在起点位置或者在终点位置，周期nurbs的offset做了自交裁剪，前后少了一小段，需要特殊处理，判断有没有交点
                        if (curv instanceof OffsetCurve3 && curv.isPeriodic()) {
                            const baseCurv = curv.getBaseCurve();
                            const domainCutLength = baseCurv.getDomain().getLength() - curv.getDomain().getLength();
                            if (
                                baseCurv.isNurbsCurve3d() &&
                                curv.getRange().max - curv.getDomain().max < domainCutLength
                            ) {
                                return true;
                            }
                        }
                        return false;
                    };

                    const xPt = X.curve3dsNearParams(
                        preCrv,
                        curCrv,
                        preCrv.getEndParam(),
                        curCrv.getStartParam(),
                    );

                    if (xPt) {
                        preCrv.getRange().max = xPt.param1;
                        curCrv.getRange().min = xPt.param2;
                    } else {
                        let preLine: Ln3 | undefined;
                        let curLine: Ln3 | undefined;
                        if (isOffsetCurveCutRange(preCrv)) {
                            const prevEndPt = preCrv.getEndPt();
                            const ofsOutDir = preBaseDir.cross(dz);
                            const baseCrv = (preCrv as OffsetCurve3).getBaseCurve();
                            const ofsPt = baseCrv.getEndPt().add(ofsOutDir.multiply(offsetXY));
                            preLine = new Ln3(prevEndPt, ofsPt);
                            evo.set(preLine, [curves[pre]]);
                        }
                        if (isOffsetCurveCutRange(curCrv)) {
                            const ofsOutdir = curBaseDir.cross(dz);
                            const baseCrv = (curCrv as OffsetCurve3).getBaseCurve();
                            const ofsPt = baseCrv.getStartPt().add(ofsOutdir.multiply(offsetXY));
                            const curStPt = curCrv.getStartPt();
                            curLine = new Ln3(ofsPt, curStPt);
                            evo.set(curLine, [curves[cur]]);
                        }

                        if (preLine && curLine) {
                            const xPoints = LinesX.line3ds(preLine, curLine);
                            MathError.assert(xPoints.length > 0, 'No Intersection found between preline & curline');
                            const xPoint = xPoints[0];
                            preLine.getRange().max = xPoint.param1;
                            curLine.getRange().min = xPoint.param2;
                        } else if (preLine) {
                            const xPoint = X.curve3dsNearParams(
                                preLine,
                                curCrv,
                                preLine.getStartParam(),
                                curCrv.getStartParam(),
                            );

                            if (xPoint) {
                                preLine.getRange().max = xPoint.param1;
                                curCrv.getRange().min = xPoint.param2;
                            } else {
                                MathError.assert(xPoint, 'No Intersection found between preline & curline');
                            }
                        } else if (curLine) {
                            const xPoint = X.curve3dsNearParams(
                                preCrv,
                                curLine,
                                preCrv.getEndParam(),
                                curLine.getEndParam(),
                            );

                            if (xPoint) {
                                preCrv.getRange().max = xPoint.param1;
                                curLine.getRange().min = xPoint.param2;
                            } else {
                                MathError.assert(xPoint, 'No Intersection found between preline & curline');
                            }
                        }
                    }
                }
            }

            evo.set(curCrv, [curves[cur]]);
        }

        // merge curves
        const extCrvs = Array.from(evo.keys());

        // eslint-disable-next-line no-labels
        MERGE_I: for (let i = 0; i < extCrvs.length;) {
            for (let j = i + 1; j < extCrvs.length; j++) {
                const mergeEvo = CurvesMerge.curve3dsEvolution(
                    extCrvs[i],
                    extCrvs[j],
                    MergeReverseMode.remove,
                    tol,
                );
                if (!mergeEvo) continue;

                evo.appendKey(mergeEvo, [extCrvs[i], extCrvs[j]]);
                extCrvs.splice(j, 1);
                extCrvs.splice(i, 1);
                extCrvs.push(...mergeEvo.keys());

                // eslint-disable-next-line no-labels
                continue MERGE_I;
            }
            i++;
        }

        return evo;
    }

    private static _makeJoints(extCrvs: Curve3[], tol: Tol): IJoint[][] {
        const jointLists = extCrvs.map(() => [] as IJoint[]);
        const n = extCrvs.length;

        function addJoint(crvI: number, crvJ: number, point: Vec3, param1: number, param2: number) {
            const stJoint: IJoint = {
                curveId: crvI,
                jointId: -1,
                done: false,
                point,
                param: param1,
                thats: [],
            };
            const edJoint: IJoint = {
                curveId: crvJ,
                jointId: -1,
                done: false,
                point,
                param: param2,
                thats: [stJoint],
            };
            stJoint.thats.push(edJoint);

            jointLists[crvI].push(stJoint);
            jointLists[crvJ].push(edJoint);
        }

        // self intersection
        for (let i = 0; i < n; i++) {
            // curve 相背 && offset 相向
            const extCrv = extCrvs[i];
            if (extCrv.getRange() instanceof PeriodInterval) {
                const stExtPt = extCrv.getStartPt();
                const edExtPt = extCrv.getEndPt();
                if (stExtPt.equals(edExtPt, tol.lengthEps)) {
                    addJoint(i, i, extCrv.getStartPt(), extCrv.getStartParam(), extCrv.getEndParam());
                }
            } else if (extCrv instanceof OffsetCurve3) {
                const baseCrv = extCrv.getBaseCurve();
                if (baseCrv.getRange() instanceof PeriodInterval) {
                    const stExtPt = extCrv.getStartPt();
                    const edExtPt = extCrv.getEndPt();
                    if (stExtPt.equals(edExtPt, tol.lengthEps)) {
                        addJoint(i, i, extCrv.getStartPt(), extCrv.getStartParam(), extCrv.getEndParam());
                    }
                } else {
                    const crv = extCrv.getBaseCurve();
                    const mapper = extCrv.getParamMapper();
                    const stDir = extCrv.getStartTangent();
                    const edDir = extCrv.getEndTangent();

                    const stPt = crv.getPtAt(mapper.getBaseParam(extCrv.getStartParam(), true));
                    const edPt = crv.getPtAt(mapper.getBaseParam(extCrv.getEndParam(), false));
                    const dp = edPt.subtracted(stPt);
                    if (dp.dot(stDir) > 0 && dp.dot(edDir) > 0) continue;

                    const exDp = extCrv.getEndPt().subtract(extCrv.getStartPt());
                    if (!(exDp.dot(stDir) > 0 && exDp.dot(edDir) > 0)) continue;

                    const xPoint = X.curve3dsNearParams(
                        extCrv,
                        extCrv,
                        extCrv.getStartParam(),
                        extCrv.getEndParam(),
                    );

                    if (!xPoint) continue;

                    addJoint(i, i, xPoint.point, xPoint.param1, xPoint.param2);
                }
            }
        }

        // normal intersectipm
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const xPoints = X.curve3ds(extCrvs[i], extCrvs[j]);
                for (const xPoint of xPoints) {
                    if (!xPoint.isOverlap) {
                        extCrvs[i].containsPt(xPoint.point) &&
                            extCrvs[j].containsPt(xPoint.point) &&
                            addJoint(i, j, xPoint.point, xPoint.param1, xPoint.param2);
                    }
                }
            }
        }

        // sort & merge intersects
        for (const joints of jointLists) {
            if (joints.length === 0) continue;

            {
                // regularize params
                const crv = extCrvs[joints[0].curveId];
                const range = crv.getRange();
                if (range instanceof PeriodInterval) {
                    const hasSt = joints.some(_ => Math.abs(_.param - range.min) < Tol.NUMBER);
                    for (const joint of joints) {
                        const isEd = Math.abs(joint.param - range.max) < Tol.NUMBER;
                        joint.param = hasSt && isEd ? joint.param : range.getRegularParam(joint.param, Tol.NUMBER);
                    }
                }
            }

            // sort
            joints.sort((a, b) => {
                const pa = a.overlap ? a.overlap.getMid() : a.param;
                const pb = b.overlap ? b.overlap.getMid() : b.param;
                return pa === pb ? a.jointId - b.jointId : pa - pb;
            });

            // merge nears
            for (let st = 0; st < joints.length; st++) {
                const joint = joints[st];
                joint.jointId = st;
                let ed = st + 1;
                for (; ed < joints.length; ed++) {
                    if (Math.abs(joint.param - joints[ed].param) > tol.numberEps) break;
                }
                if (ed > st + 1) {
                    const point = joint.point;
                    let param = joint.param;
                    for (let i = st + 1; i < ed; i++) {
                        const nbr = joints[i];
                        point.add(nbr.point);
                        param += nbr.param;
                        joint.thats.push(...nbr.thats);

                        for (const nbrThat of nbr.thats) {
                            const idx = nbrThat.thats.findIndex(cur => cur === nbr);
                            nbrThat.thats[idx] = joint;
                        }
                    }
                    joint.point = point.multiply(1 / (ed - st));
                    joint.param = param / (ed - st);
                    joints.splice(st + 1, ed - st - 1);
                }
            }

            // merge head & tail
            if (joints.length < 2) continue;

            const stJoint = joints[0];
            const edJoint = joints[joints.length - 1];

            if (stJoint.point.equals(edJoint.point)) {
                for (const that of stJoint.thats) {
                    if (that !== edJoint && !edJoint.thats.includes(that)) {
                        edJoint.thats.push(that);
                        that.thats.push(edJoint);
                    }
                }
                for (const that of edJoint.thats) {
                    if (that !== stJoint && !stJoint.thats.includes(that)) {
                        stJoint.thats.push(that);
                        that.thats.push(stJoint);
                    }
                }
            }
        }
        return jointLists;
    }

    private static _findLoops(extCrvs: Curve3[], jointLists: IJoint[][], dz: Vec3, isOuter: boolean): IJoint[][] {
        const loops: IJoint[][] = [];
        const n = extCrvs.length;

        for (let crvI = 0; crvI < n; crvI++) {
            const joints = jointLists[crvI];

            for (let segI = 0; segI < joints.length - 1; segI++) {
                const stJoint = joints[segI];
                if (stJoint.done) continue;

                let curSeg: ISegment = {
                    joint: stJoint,
                    direction: true,
                };
                const loop: IJoint[] = [];
                let isLoopGood = true;
                // eslint-disable-next-line no-constant-condition
                do {
                    if (curSeg.direction) {
                        curSeg.joint.done = true;
                    } else {
                        isLoopGood = false;
                    }

                    const cur = curSeg.joint;
                    loop.push(cur);
                    if (loop.length > 2 * n) {
                        break; // 防止死循环
                    }

                    const curJoints = jointLists[cur.curveId];
                    const nbr = curJoints[cur.jointId + (curSeg.direction ? 1 : -1)];
                    const nbrDir = extCrvs[cur.curveId].getTangentAt(nbr.param);
                    if (curSeg.direction) nbrDir.reverse();

                    let nextSeg: undefined | IAngledSegment;
                    const setNextSegment = (seg: IAngledSegment) => {
                        if (!nextSeg || nextSeg.angle > seg.angle === isOuter) {
                            nextSeg = seg;
                        }
                    };

                    if (curSeg.direction) {
                        if (nbr.jointId + 1 < curJoints.length) {
                            setNextSegment({ joint: nbr, angle: Math.PI, direction: true });
                        }
                    } else if (nbr.jointId > 0) {
                        setNextSegment({ joint: nbr, angle: Math.PI, direction: false });
                    }

                    for (const that of nbr.thats) {
                        const thatDir = extCrvs[that.curveId].getTangentAt(that.param);
                        if (that.jointId < jointLists[that.curveId].length - 1) {
                            const angle = nbrDir.angleTo(thatDir, dz);
                            setNextSegment({ angle, joint: that, direction: true });
                        }
                        if (that.jointId > 0) {
                            const angle = nbrDir.angleTo(thatDir.reverse(), dz);
                            setNextSegment({ angle, joint: that, direction: false });
                        }
                    }

                    if (!nextSeg) {
                        isLoopGood = false;
                        break;
                    }

                    curSeg = nextSeg;
                } while (curSeg.joint !== stJoint);

                if (isLoopGood) {
                    loops.push(loop);
                }
            } // for segments
        } // for curves

        return loops;
    }
}