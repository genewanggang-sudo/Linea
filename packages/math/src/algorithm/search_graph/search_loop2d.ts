import { Curve2 } from '../../geometry/curve2';
import { Loop } from '../../topology/loop';
import { Vec2 } from '../../base/vec2';
import { CurvesOverlapJudge } from '../pj/curves_oj';
import { CurvesPJType } from '../pj/pj_type';
import { Util } from '../../util/util';
import { Ln2 } from '../../geometry/ln2';
import { Arc2 } from '../../geometry/arc2d';
import { Tol } from '../../base/tol';



/**
 *
 * 搜索环
 */
export class SearchLoop2D {
    /**
     * 从输入的有向曲线中找到所有的最小环
     * 条件：曲线已经求交打断过的，且没有同向完全重叠的曲线
     * @param curve2ds 输入的有向曲线
     * @param bMin true -> 找最小环, false -> 找最大环
     * @param distTol 距离容差
     */
    public static execute(curve2ds: Curve2[], bMin: boolean, distTol = Tol.LENGTH): Loop[] {
        // 建立Map, 点 -> 以该点为起点的曲线
        const startPtBcMap = new Map<Vec2, Curve2[]>();
        for (const bc of curve2ds) {
            const startPt = bc.getStartPt();
            let bcArray: Curve2[] | undefined;
            for (const [pt, curves] of startPtBcMap) {
                if (pt.equals(startPt, distTol)) {
                    bcArray = curves;
                    break;
                }
            }
            if (!bcArray) {
                bcArray = [];
                startPtBcMap.set(startPt, bcArray);
            }
            bcArray.push(bc);
        }

        const loops: Curve2[][] = [];
        const used = new Set<Curve2>();
        const todoCurves: Curve2[] = curve2ds.slice();
        for (const curve of todoCurves) {
            if (!curve || used.has(curve)) {
                continue;
            }

            const loop: Curve2[] = [];
            const visited = new Set<Curve2>();
            let curCurve = curve;
            while (curCurve) {
                visited.add(curCurve);
                // 去除反向完全重叠的情况
                const size = loop.length;
                const prevCurve = size > 0 ? loop[size - 1] : null;
                if (
                    prevCurve &&
                    CurvesOverlapJudge.execute(prevCurve, curCurve, distTol) ===
                    CurvesPJType.TOTALLY_OVERLAP
                ) {
                    // 自己成环
                    const selfClosed = curCurve.getStartPt().equals(curCurve.getEndPt(), distTol);
                    if (selfClosed && Util.isNearlyBigger(curCurve.getLength(), distTol)) {
                        loops.push([prevCurve]);
                        loops.push([curCurve]);
                        used.add(prevCurve);
                        used.add(curCurve);
                    }
                    loop.pop();
                } else {
                    loop.push(curCurve);
                }

                // 找到下一个
                const endPt = curCurve.getEndPt();
                let candidates: Curve2[] = [];
                for (const [pt, curves] of startPtBcMap) {
                    if (pt.equals(endPt, distTol)) {
                        candidates = curves;
                        break;
                    }
                }
                const newCurve = this._findMaxTurning2D(curCurve, candidates, bMin, distTol);
                if (!newCurve || used.has(newCurve) || visited.has(newCurve)) {
                    break;
                }
                curCurve = newCurve;
            }

            while (loop.length >= 1) {
                const firstPt = loop[0].getStartPt();
                const lastPt = loop[loop.length - 1].getEndPt();
                if (firstPt.equals(lastPt, distTol)) {
                    while (
                        loop.length >= 2 &&
                        CurvesOverlapJudge.execute(loop[0], loop[loop.length - 1], distTol) ===
                        CurvesPJType.TOTALLY_OVERLAP
                    ) {
                        loop.shift();
                        loop.pop();
                    }
                    if (loop.length) {
                        loops.push(loop);
                        loop.forEach(c => used.add(c));
                    }
                    break;
                }
                loop.shift();
            }
        }

        return loops.map(curves => new Loop(curves));
    }

    // 计算旋转角度，最大左转或最大右转搜索
    private static _findMaxTurning2D(
        curCurve: Curve2,
        candidates: Curve2[],
        bMin: boolean,
        distTol: number,
    ): Curve2 | undefined {
        // It's enough if it < -Math.PI
        let maxTurningAngle = -10;
        let choosed: Curve2 | undefined;
        let choosedOverlapped = false;
        // The max forward/backward steps
        const maxRound = 100;

        const curDir = curCurve.getEndTangent();
        for (const nextCurve of candidates) {
            const nextDir = nextCurve.getStartTangent();
            let turningAngle = 0.0;
            let nextBcOverlapped = false;
            // 反向完全重叠，优先级最低
            if (CurvesOverlapJudge.execute(curCurve, nextCurve, distTol) === CurvesPJType.TOTALLY_OVERLAP) {
                turningAngle = -Math.PI;
                nextBcOverlapped = true;
            } else {
                // 计算角度
                turningAngle = bMin ? curDir.angleTo(nextDir) : nextDir.angleTo(curDir);

                if (turningAngle >= Math.PI) {
                    turningAngle -= Math.PI * 2;
                }
                // 角度是 0, PI, -PI, 取一个小步长
                if (!(nextCurve instanceof Ln2) || !(curCurve instanceof Ln2)) {
                    let round = 1;
                    const unitLen = this._getAppropriateUnitStepLength([nextCurve, curCurve]);

                    while (
                        round < maxRound &&
                        (Util.isNearlyEqual(turningAngle, Math.PI, 0.01) ||
                            Util.isNearlyEqual(turningAngle, -Math.PI, 0.01))
                    ) {
                        turningAngle = this._calcStepAngle(curCurve, nextCurve, curDir, nextDir, unitLen * round, bMin);
                        round++;
                    }
                }
            }

            // 比较结果
            if (Util.isNearlyBigger(turningAngle, maxTurningAngle)) {
                choosed = nextCurve;
                choosedOverlapped = nextBcOverlapped;
                maxTurningAngle = turningAngle;
                continue;
            }
            // 多个备选都是相切的情况
            let turningConditate = turningAngle;
            let turningChoosed = maxTurningAngle;
            if (!(nextCurve instanceof Ln2) || !(curCurve instanceof Ln2) || !(choosed instanceof Ln2)) {
                const unitLen = this._getAppropriateUnitStepLength([nextCurve!, curCurve!, choosed!]);

                let round = 1;
                while (Util.isNearlyEqual(turningConditate, turningChoosed, distTol) && round <= maxRound) {
                    if (!(nextCurve instanceof Ln2) || !(curCurve instanceof Ln2)) {
                        turningConditate = this._calcStepAngle(
                            curCurve,
                            nextCurve,
                            curDir,
                            nextDir,
                            unitLen * round,
                            bMin,
                        );
                    }
                    if (!(choosed instanceof Ln2) || !(curCurve instanceof Ln2)) {
                        turningChoosed = this._calcStepAngle(
                            curCurve,
                            choosed!,
                            curDir,
                            nextDir,
                            unitLen * round,
                            bMin,
                        );
                    }
                    round++;
                }
            }

            // force to choose bigger
            if (turningConditate > turningChoosed || (turningConditate === turningChoosed && choosedOverlapped)) {
                // NOTE: overlapped curve has the lowest priority.
                choosed = nextCurve;
                choosedOverlapped = nextBcOverlapped;
            }
        }
        return choosed;
    }

    private static _getAppropriateUnitStepLength(bcs: Curve2[]): number {
        let maxUnitLen = Number.MIN_VALUE;
        for (const bc of bcs) {
            let unitLen = maxUnitLen;
            if (bc instanceof Arc2) {
                // 小步长 = 1% * arc radius
                unitLen = bc.getRadius() * 0.01;
            } else {
                unitLen = 0.1;
            }
            maxUnitLen = Math.max(maxUnitLen, unitLen);
        }
        return maxUnitLen;
    }

    private static _calcStepAngle(
        curCurve: Curve2,
        nextCurve: Curve2,
        curDir: Vec2,
        nextDir: Vec2,
        stepLen: number,
        bMin: boolean = true,
    ) {
        // Make a step forward for nextBC.
        let nextBcDirNew = nextDir;
        if (!(nextCurve instanceof Ln2)) {
            const step = this._getAppropriateParamStep(nextCurve, stepLen);
            const param = nextCurve.getRange().min + step;
            nextBcDirNew = nextCurve.getTangentAt(param);
        }

        // Make a step back for bc.
        let bcDirNew = curDir;
        if (!(curCurve instanceof Ln2)) {
            const stepBc = this._getAppropriateParamStep(curCurve, stepLen);
            const paramBc = curCurve.getRange().max - stepBc;
            bcDirNew = nextCurve.getTangentAt(paramBc);
        }

        let turningAngleTest = 0;
        turningAngleTest = bMin ? bcDirNew.angleTo(nextBcDirNew) : nextBcDirNew.angleTo(bcDirNew);

        if (turningAngleTest >= Math.PI) {
            turningAngleTest -= 2.0 * Math.PI;
        }
        return turningAngleTest;
    }

    private static _getAppropriateParamStep(bc: Curve2, stepLen: number) {
        const paramRatio = stepLen / bc.getLength();
        const domainLen = bc.getRange().getLength();
        let paramStep = domainLen * paramRatio;
        if (paramStep > domainLen) {
            paramStep = domainLen * 0.5;
        }
        return paramStep;
    }
}