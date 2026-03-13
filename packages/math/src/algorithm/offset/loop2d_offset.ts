import { Interval } from '../../base/interval';
import { PeriodInterval } from '../../base/period_inverval';
import { Tol } from '../../base/tol';
import { Vec2 } from '../../base/vec2';
import { Curve2 } from '../../geometry/curve2';
import { Ln2 } from '../../geometry/ln2';
import { OffsetCurve2 } from '../../geometry/offset_curve2';
import { OffsetCurve3 } from '../../geometry/offset_curve3';
import { ParamType } from '../../geometry/offset_parameter_mapper';
import { EvolutionMap } from '../../topology/evolution_map';
import { CONST } from '../../type_define/const';
import { CurveUtil } from '../../util/curve_util';
import { MathError } from '../../util/math_error';
import { X } from '../calc_x';
import { CurvesX } from '../intersect/curves_x';
import { LinesX } from '../intersect/curves_x/lines_x';
import { CurvesMerge, MergeReverseMode } from '../overlap/curves_merge';



interface IJointId {
    curveId: number;
    jointId: number;
}

interface ISegment {
    joint: IJoint;
    direction: boolean;
}

interface IAngledSegment extends ISegment {
    angle: number;
}

interface IJoint extends IJointId {
    done: boolean;
    point: Vec2;
    param: number;
    overlap?: Interval;
    thats: IJoint[];
}

export class Loop2dOffset {
    public static execute(
        curves: Curve2[],
        offsetDist: number,
        tol: Tol = Tol.DEFAULT,
        isMerge: boolean = true,
        offsetIndexes?: number[],
    ): { loops: Curve2[][]; evolution: EvolutionMap<Curve2> } {
        const opt = { smoothPolyToNurbs: true };
        const { curves: simplifiedCurves, evolution: splitEvo } = CurveUtil.simplifyCurves2d(curves, opt);
        const ofsCrvs = simplifiedCurves.map((crv, i) => {
            if (offsetIndexes && offsetIndexes.indexOf(i) < 0) {
                return crv;
            } else {
                return OffsetCurve2.makeByOffset(crv, offsetDist);
            }
        });
        const ofsCrvMap = new Map<Curve2, Curve2>();
        for (let i = 0; i < ofsCrvs.length; i++) {
            // 处理退化，删掉退化的curve的map
            if (this._isDegeneratedCurve2d(ofsCrvs[i])) {
                ofsCrvs.splice(i, 1);
                i--;
                continue;
            }
            ofsCrvMap.set(ofsCrvs[i], simplifiedCurves[i]);
        }

        let extCrvEvo: EvolutionMap<Curve2, Curve2>;
        try {
            extCrvEvo = Loop2dOffset._connectCurve2ds(ofsCrvs, offsetDist, true, Tol.DEFAULT, isMerge, offsetIndexes);
        } catch (e) {
            return { loops: [], evolution: new EvolutionMap<Curve2>() };
        }

        const extCrvs = Array.from(extCrvEvo.keys());

        const jointLists: IJoint[][] = Loop2dOffset._makeJoints(extCrvs, tol);

        const loops: IJoint[][] = Loop2dOffset._findLoop2ds(extCrvs, jointLists, offsetDist > 0);

        const retEvo = new EvolutionMap<Curve2>();

        const retLoops = loops.map(joints => {
            const crvs: Curve2[] = [];
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
     * 根据给定偏移量，偏置平面曲线，保证曲线首尾相接
     * @param curves 待偏置的曲线组
     * @param offsetDist 平面方向偏移量。关于偏移方向：以第一条curve为准，正值的offset就是第一条curve的右边；负值的offset就是第一条curve的左边
     */
    public static offsetCurve2dList(
        curves: Curve2[],
        offsetDist: number,
    ): { curveList: Curve2[]; evolution: EvolutionMap<Curve2> } {
        const isClosed = curves[0].getStartPt().equals(curves[curves.length - 1].getEndPt());
        const ofsCrvs = curves.map(crv => OffsetCurve2.makeByOffset(crv, offsetDist));
        const ofsCrvMap = new Map<Curve2, Curve2>();
        for (let i = 0; i < ofsCrvs.length; i++) {
            // 处理退化，删掉退化的curve的map
            if (this._isDegeneratedCurve2d(ofsCrvs[i])) {
                ofsCrvs.splice(i, 1);
                i--;
                continue;
            }
            ofsCrvMap.set(ofsCrvs[i], curves[i]);
        }

        let extCrvEvo: EvolutionMap<Curve2, Curve2>;
        try {
            extCrvEvo = Loop2dOffset._connectCurve2ds(ofsCrvs, offsetDist, isClosed, Tol.DEFAULT);
        } catch (e) {
            return { curveList: [], evolution: new EvolutionMap<Curve2>() };
        }

        const extCrvs = Array.from(extCrvEvo.keys());
        return { curveList: extCrvs, evolution: extCrvEvo };
    }

    private static _isDegeneratedCurve2d(curve: Curve2) {
        if (curve.getRange().getLength() < Tol.NUMBER) {
            return true;
        }

        if (curve.isArc2d()) {
            return curve.getA() < Tol.LENGTH && curve.getB() < Tol.LENGTH;
        }

        if (curve.isNurbsCurve2d()) {
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

    private static _connectCurve2ds(
        curves: Curve2[],
        offsetXY: number,
        isClosed: boolean,
        tol: Tol,
        isMerge: boolean = true,
        offsetIndexes: number[] = [],
    ): EvolutionMap<Curve2> {
        const evo = new EvolutionMap<Curve2>();

        // extend curve by lines
        const num = isClosed ? curves.length + 1 : curves.length;
        if (!isClosed) {
            evo.set(curves[0], [curves[0]]);
        }

        const isOffsetCurveCutRange = (curv: Curve2) => {
            // 如果是周期nurbs的offset，并且在起点位置或者在终点位置，周期nurbs的offset做了自交裁剪，前后少了一小段，需要特殊处理，判断有没有交点
            if (curv instanceof OffsetCurve2 && curv.isPeriodic()) {
                const baseCurv = curv.getBaseCurve();
                const domainCutLength =
                    baseCurv.getDomain().getLength() -
                    curv.getDomain().getLength();
                if (
                    baseCurv.isNurbsCurve2d() &&
                    curv.getRange().max - curv.getDomain().max <
                    domainCutLength
                ) {
                    return true;
                }
            }
            return false;
        };
        for (let index = 1; index < num; index++) {
            const pre = index - 1;
            const preCrv = curves[pre];
            const cur = index % curves.length;
            const curCrv = curves[cur];
            const preBaseDir =
                preCrv instanceof OffsetCurve2 ? preCrv.getBaseCurve().getEndTangent() : preCrv.getEndTangent();
            const curBaseDir =
                curCrv instanceof OffsetCurve2 ? curCrv.getBaseCurve().getStartTangent() : curCrv.getStartTangent();
            const dist = preCrv.getEndPt().sqDistanceTo(curCrv.getStartPt());
            const angle = preBaseDir.angleTo(curBaseDir);
            const isOffsetIndexes =
                (offsetIndexes.includes(index) && !offsetIndexes.includes(pre)) ||
                (offsetIndexes.includes(pre) && !offsetIndexes.includes(index));

            if (dist > Tol.LENGTH_2) {
                if (offsetXY > 0 ? angle < CONST.PI : angle > CONST.PI) {
                    let preLine: Ln2;
                    let curLine: Ln2;

                    // extend preTail
                    if (preCrv instanceof Ln2) {
                        preLine = preCrv;
                        preLine.getRange().max = CONST.MODEL_MAX_LENGTH;
                    } else {
                        const paramType =
                            preCrv instanceof OffsetCurve2
                                ? preCrv
                                    .getParamMapper()
                                    .getParamInfo(
                                        preCrv.getBaseCurve().getEndParam(),
                                        true
                                    ).type
                                : ParamType.Normal;

                        if (paramType === ParamType.Normal) {
                            preLine = new Ln2(preCrv.getEndPt(), preBaseDir, [
                                0,
                                CONST.MODEL_MAX_LENGTH,
                            ]);
                        } else {
                            // trim end
                            const ofsOutDir = new Vec2(preBaseDir.y, -preBaseDir.x);
                            const baseCrv = (preCrv as OffsetCurve2).getBaseCurve();
                            const ofsPt = baseCrv
                                .getEndPt()
                                .add(ofsOutDir.multiply(offsetXY));
                            preLine = new Ln2(ofsPt, preBaseDir, [
                                -CONST.MODEL_MAX_LENGTH,
                                CONST.MODEL_MAX_LENGTH,
                            ]);

                            if (
                                paramType === ParamType.EndGap ||
                                paramType === ParamType.Reversed
                            ) {
                                const xRets = CurvesX.curve2ds(preCrv, preLine);
                                MathError.assert(
                                    xRets.length > 0,
                                    "No Intersect when tirm OffsetCurve end"
                                );

                                let maxRet = xRets[0];
                                for (let i = 1; i < xRets.length; i++) {
                                    if (xRets[i].param2 > maxRet.param2)
                                        maxRet = xRets[i];
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
                    if (curCrv instanceof Ln2) {
                        curLine = curCrv;
                        curLine.getRange().min = -CONST.MODEL_MAX_LENGTH;
                    } else {
                        const paramType =
                            curCrv instanceof OffsetCurve3
                                ? curCrv
                                    .getParamMapper()
                                    .getParamInfo(
                                        curCrv.getBaseCurve().getStartParam(),
                                        false
                                    ).type
                                : ParamType.Normal;

                        if (paramType === ParamType.Normal) {
                            curLine = new Ln2(curCrv.getStartPt(), curBaseDir, [
                                -CONST.MODEL_MAX_LENGTH,
                                0,
                            ]);
                        } else {
                            // trim head
                            const ofsOutdir = new Vec2(curBaseDir.y, -curBaseDir.x);
                            const baseCrv = (curCrv as OffsetCurve2).getBaseCurve();
                            const ofsPt = baseCrv
                                .getStartPt()
                                .add(ofsOutdir.multiply(offsetXY));
                            curLine = new Ln2(ofsPt, curBaseDir, [
                                -CONST.MODEL_MAX_LENGTH,
                                CONST.MODEL_MAX_LENGTH,
                            ]);

                            if (
                                paramType === ParamType.StartGap ||
                                paramType === ParamType.Reversed
                            ) {
                                const xRets = CurvesX.curve2ds(curCrv, curLine);
                                MathError.assert(
                                    xRets.length > 0,
                                    "No Intersect when trim OffsetCurve start"
                                );

                                let minRet = xRets[0];
                                for (let i = 1; i < xRets.length; i++) {
                                    if (xRets[i].param2 < minRet.param2)
                                        minRet = xRets[i];
                                }
                                curLine.getRange().max = minRet.param2;
                                curCrv.getRange().min = minRet.param1;
                            } else {
                                curLine.getRange().max = 0;
                            }
                        } // if paramType
                        evo.set(curLine, [curves[cur]]);
                    } // extend head

                    const xPoints = LinesX.line2ds(preLine, curLine);

                    MathError.assert(
                        xPoints.length > 0,
                        "No Intersection found between preline & curline"
                    );

                    const xPoint = xPoints[0];
                    preLine.getRange().max = xPoint.param1;
                    curLine.getRange().min = xPoint.param2;
                } else if (isOffsetIndexes) {
                    // 单边延长
                    if (offsetIndexes.includes(index)) {
                        // 偏移当前curve
                        let cL: Ln2 = new Ln2();
                        // extend curHead
                        if (curCrv instanceof Ln2) {
                            cL = curCrv;
                            cL.getRange().min = -CONST.MODEL_MAX_LENGTH;
                        } else {
                            const paramType =
                                curCrv instanceof OffsetCurve3
                                    ? curCrv
                                        .getParamMapper()
                                        .getParamInfo(
                                            curCrv.getBaseCurve().getStartParam(),
                                            false
                                        ).type
                                    : ParamType.Normal;

                            if (paramType === ParamType.Normal) {
                                cL = new Ln2(curCrv.getStartPt(), curBaseDir, [
                                    -CONST.MODEL_MAX_LENGTH,
                                    0,
                                ]);
                            } else {
                                // trim head
                                const ofsOutdir = new Vec2(curBaseDir.y, -curBaseDir.x);
                                const baseCrv = (curCrv as OffsetCurve2).getBaseCurve();
                                const ofsPt = baseCrv
                                    .getStartPt()
                                    .add(ofsOutdir.multiply(offsetXY));
                                cL = new Ln2(ofsPt, curBaseDir, [
                                    -CONST.MODEL_MAX_LENGTH,
                                    CONST.MODEL_MAX_LENGTH,
                                ]);

                                if (
                                    paramType === ParamType.StartGap ||
                                    paramType === ParamType.Reversed
                                ) {
                                    const xRets = CurvesX.curve2ds(curCrv, cL);
                                    MathError.assert(
                                        xRets.length > 0,
                                        "No Intersect when trim OffsetCurve start"
                                    );

                                    let minRet = xRets[0];
                                    for (let i = 1; i < xRets.length; i++) {
                                        if (xRets[i].param2 < minRet.param2)
                                            minRet = xRets[i];
                                    }
                                    cL.getRange().max = minRet.param2;
                                    curCrv.getRange().min = minRet.param1;
                                } else {
                                    cL.getRange().max = 0;
                                }
                            }
                            evo.set(cL, [curves[cur]]);
                        } // extend head

                        const xPt = X.curve2dsNearPoint(preCrv, cL, preCrv.getEndPt());

                        if (xPt) {
                            preCrv.getRange().max = xPt.param1;
                            cL.getRange().min = xPt.param2;
                        } else {
                            let preLine: Ln2 | undefined;
                            let curLine: Ln2 | undefined;
                            if (isOffsetCurveCutRange(preCrv)) {
                                const prevEndPt = preCrv.getEndPt();
                                const ofsOutDir = new Vec2(preBaseDir.y, -preBaseDir.x);
                                const baseCrv = (preCrv as OffsetCurve2).getBaseCurve();
                                const ofsPt = baseCrv
                                    .getEndPt()
                                    .add(ofsOutDir.multiply(offsetXY));
                                preLine = new Ln2(prevEndPt, ofsPt);
                                evo.set(preLine, [curves[pre]]);
                            }
                            if (isOffsetCurveCutRange(cL)) {
                                const ofsOutdir = new Vec2(curBaseDir.y, -curBaseDir.x);
                                const baseCrv = (
                                    cL as unknown as OffsetCurve2
                                ).getBaseCurve();
                                const ofsPt = baseCrv
                                    .getStartPt()
                                    .add(ofsOutdir.multiply(offsetXY));
                                const curStPt = cL.getStartPt();
                                curLine = new Ln2(ofsPt, curStPt);
                                evo.delete(cL);
                                evo.set(curLine, [curves[cur]]);
                            }

                            if (preLine && curLine) {
                                const xPoints = LinesX.line2ds(preLine, curLine);
                                MathError.assert(
                                    xPoints.length > 0,
                                    "No Intersection found between preline & curline"
                                );
                                const xPoint = xPoints[0];
                                preLine.getRange().max = xPoint.param1;
                                curLine.getRange().min = xPoint.param2;
                            } else if (preLine) {
                                const xPoint = X.curve2dsNearParams(
                                    preLine,
                                    cL,
                                    preLine.getStartParam(),
                                    cL.getStartParam()
                                );

                                if (xPoint) {
                                    preLine.getRange().max = xPoint.param1;
                                    cL.getRange().min = xPoint.param2;
                                } else {
                                    MathError.assert(
                                        xPoint,
                                        "No Intersection found between preline & curline"
                                    );
                                }
                            } else if (curLine) {
                                const xPoint = X.curve2dsNearParams(
                                    preCrv,
                                    curLine,
                                    preCrv.getEndParam(),
                                    curLine.getEndParam()
                                );

                                if (xPoint) {
                                    preCrv.getRange().max = xPoint.param1;
                                    curLine.getRange().min = xPoint.param2;
                                } else {
                                    MathError.assert(
                                        xPoint,
                                        "No Intersection found between preline & curline"
                                    );
                                }
                            }
                        }
                    } else if (offsetIndexes.includes(pre)) {
                        let preL: Ln2 = new Ln2();

                        // extend preTail
                        if (preCrv instanceof Ln2) {
                            preL = preCrv;
                            preL.getRange().max = CONST.MODEL_MAX_LENGTH;
                        } else {
                            const paramType =
                                preCrv instanceof OffsetCurve2
                                    ? preCrv
                                        .getParamMapper()
                                        .getParamInfo(
                                            preCrv.getBaseCurve().getEndParam(),
                                            true
                                        ).type
                                    : ParamType.Normal;

                            if (paramType === ParamType.Normal) {
                                preL = new Ln2(preCrv.getEndPt(), preBaseDir, [
                                    0,
                                    CONST.MODEL_MAX_LENGTH,
                                ]);
                            } else {
                                // trim end
                                const ofsOutDir = new Vec2(preBaseDir.y, -preBaseDir.x);
                                const baseCrv = (preCrv as OffsetCurve2).getBaseCurve();
                                const ofsPt = baseCrv
                                    .getEndPt()
                                    .add(ofsOutDir.multiply(offsetXY));
                                preL = new Ln2(ofsPt, preBaseDir, [
                                    -CONST.MODEL_MAX_LENGTH,
                                    CONST.MODEL_MAX_LENGTH,
                                ]);

                                if (
                                    paramType === ParamType.EndGap ||
                                    paramType === ParamType.Reversed
                                ) {
                                    const xRets = CurvesX.curve2ds(preCrv, preL);
                                    MathError.assert(
                                        xRets.length > 0,
                                        "No Intersect when tirm OffsetCurve end"
                                    );

                                    let maxRet = xRets[0];
                                    for (let i = 1; i < xRets.length; i++) {
                                        if (xRets[i].param2 > maxRet.param2)
                                            maxRet = xRets[i];
                                    }
                                    preL.getRange().min = maxRet.param2;
                                    preCrv.getRange().max = maxRet.param1;
                                } else {
                                    preL.getRange().min = 0;
                                }
                            }
                            evo.set(preL, [curves[pre]]);
                        } // extend

                        const xPt = X.curve2dsNearPoint(preL, curCrv, curCrv.getStartPt());
                        if (xPt) {
                            preL.getRange().max = xPt.param1;
                            curCrv.getRange().min = xPt.param2;
                        } else {
                            let preLine: Ln2 | undefined;
                            let curLine: Ln2 | undefined;
                            if (isOffsetCurveCutRange(preL)) {
                                const prevEndPt = preL.getEndPt();
                                const ofsOutDir = new Vec2(preBaseDir.y, -preBaseDir.x);
                                const baseCrv = (preL as unknown as OffsetCurve2).getBaseCurve();
                                const ofsPt = baseCrv
                                    .getEndPt()
                                    .add(ofsOutDir.multiply(offsetXY));
                                preLine = new Ln2(prevEndPt, ofsPt);
                                evo.delete(preL);
                                evo.set(preLine, [curves[pre]]);
                            }
                            if (isOffsetCurveCutRange(curCrv)) {
                                const ofsOutdir = new Vec2(curBaseDir.y, -curBaseDir.x);
                                const baseCrv = (curCrv as OffsetCurve2).getBaseCurve();
                                const ofsPt = baseCrv
                                    .getStartPt()
                                    .add(ofsOutdir.multiply(offsetXY));
                                const curStPt = curCrv.getStartPt();
                                curLine = new Ln2(ofsPt, curStPt);
                                evo.set(curLine, [curves[cur]]);
                            }

                            if (preLine && curLine) {
                                const xPoints = LinesX.line2ds(preLine, curLine);
                                MathError.assert(
                                    xPoints.length > 0,
                                    "No Intersection found between preline & curline"
                                );
                                const xPoint = xPoints[0];
                                preLine.getRange().max = xPoint.param1;
                                curLine.getRange().min = xPoint.param2;
                            } else if (preLine) {
                                const xPoint = X.curve2dsNearParams(
                                    preLine,
                                    curCrv,
                                    preLine.getStartParam(),
                                    curCrv.getStartParam()
                                );

                                if (xPoint) {
                                    preLine.getRange().max = xPoint.param1;
                                    curCrv.getRange().min = xPoint.param2;
                                } else {
                                    MathError.assert(
                                        xPoint,
                                        "No Intersection found between preline & curline"
                                    );
                                }
                            } else if (curLine) {
                                const xPoint = X.curve2dsNearParams(
                                    preL,
                                    curLine,
                                    preL.getEndParam(),
                                    curLine.getEndParam()
                                );

                                if (xPoint) {
                                    preL.getRange().max = xPoint.param1;
                                    curLine.getRange().min = xPoint.param2;
                                } else {
                                    MathError.assert(
                                        xPoint,
                                        "No Intersection found between preline & curline"
                                    );
                                }
                            }
                        }
                    }
                } else {
                    const xPt = X.curve2dsNearParams(
                        preCrv,
                        curCrv,
                        preCrv.getEndParam(),
                        curCrv.getStartParam()
                    );

                    if (xPt) {
                        preCrv.getRange().max = xPt.param1;
                        curCrv.getRange().min = xPt.param2;
                    } else {
                        let preLine: Ln2 | undefined;
                        let curLine: Ln2 | undefined;
                        if (isOffsetCurveCutRange(preCrv)) {
                            const prevEndPt = preCrv.getEndPt();
                            const ofsOutDir = new Vec2(preBaseDir.y, -preBaseDir.x);
                            const baseCrv = (preCrv as OffsetCurve2).getBaseCurve();
                            const ofsPt = baseCrv
                                .getEndPt()
                                .add(ofsOutDir.multiply(offsetXY));
                            preLine = new Ln2(prevEndPt, ofsPt);
                            evo.set(preLine, [curves[pre]]);
                        }
                        if (isOffsetCurveCutRange(curCrv)) {
                            const ofsOutdir = new Vec2(curBaseDir.y, -curBaseDir.x);
                            const baseCrv = (curCrv as OffsetCurve2).getBaseCurve();
                            const ofsPt = baseCrv
                                .getStartPt()
                                .add(ofsOutdir.multiply(offsetXY));
                            const curStPt = curCrv.getStartPt();
                            curLine = new Ln2(ofsPt, curStPt);
                            evo.set(curLine, [curves[cur]]);
                        }

                        if (preLine && curLine) {
                            const xPoints = LinesX.line2ds(preLine, curLine);
                            MathError.assert(
                                xPoints.length > 0,
                                "No Intersection found between preline & curline"
                            );
                            const xPoint = xPoints[0];
                            preLine.getRange().max = xPoint.param1;
                            curLine.getRange().min = xPoint.param2;
                        } else if (preLine) {
                            const xPoint = X.curve2dsNearParams(
                                preLine,
                                curCrv,
                                preLine.getStartParam(),
                                curCrv.getStartParam()
                            );

                            if (xPoint) {
                                preLine.getRange().max = xPoint.param1;
                                curCrv.getRange().min = xPoint.param2;
                            } else {
                                MathError.assert(
                                    xPoint,
                                    "No Intersection found between preline & curline"
                                );
                            }
                        } else if (curLine) {
                            const xPoint = X.curve2dsNearParams(
                                preCrv,
                                curLine,
                                preCrv.getEndParam(),
                                curLine.getEndParam()
                            );

                            if (xPoint) {
                                preCrv.getRange().max = xPoint.param1;
                                curLine.getRange().min = xPoint.param2;
                            } else {
                                MathError.assert(
                                    xPoint,
                                    "No Intersection found between preline & curline"
                                );
                            }
                        }
                    }
                }
            }

            evo.set(curCrv, [curves[cur]]);
        }

        if (isMerge) {
            // merge curves
            const extCrvs = Array.from(evo.keys());

            // eslint-disable-next-line no-labels
            MERGE_I: for (let i = 0; i < extCrvs.length;) {
                for (let j = i + 1; j < extCrvs.length; j++) {
                    const mergeEvo = CurvesMerge.curve2dsEvolution(
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
        }
        return evo;
    }

    private static _makeJoints(extCrvs: Curve2[], tol: Tol): IJoint[][] {
        const jointLists = extCrvs.map(() => [] as IJoint[]);
        const n = extCrvs.length;

        function addJoint(crvI: number, crvJ: number, point: Vec2, param1: number, param2: number) {
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
            } else if (extCrv instanceof OffsetCurve2) {
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

                    const xPoint = X.curve2dsNearParams(
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
                const xPoints = X.curve2ds(extCrvs[i], extCrvs[j]);
                for (const xPoint of xPoints) {
                    if (!xPoint.isOverlap) {
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
                        joint.param = hasSt && isEd ? joint.param : range.getRegularParam(joint.param);
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

    private static _findLoop2ds(extCrvs: Curve2[], jointLists: IJoint[][], isOuter: boolean): IJoint[][] {
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
                            const angle = nbrDir.angleTo(thatDir);
                            setNextSegment({ angle, joint: that, direction: true });
                        }
                        if (that.jointId > 0) {
                            const angle = nbrDir.angleTo(thatDir.reverse());
                            setNextSegment({ angle, joint: that, direction: false });
                        }
                    }

                    if (!nextSeg) {
                        isLoopGood = false;
                        break;
                    }
                    // 多无限循环的临时处理，超出10000元素强制退出。
                    if (loop.length > 10000) {
                        console.warn("There are too many ISegments in loop! there maybe exit unlimited cricle.");
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