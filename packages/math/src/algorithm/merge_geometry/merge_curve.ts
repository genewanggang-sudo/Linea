import { Vec2 } from '../../base/vec2';
import { Curve2 } from '../../geometry/curve2';
import { Tol } from '../../base/tol';
import { Ln2 } from '../../geometry/ln2';
import { EN_GEO_TYPE } from '../../type_define/i_element_type';
import { Arc2 } from '../../geometry/arc2d';
import { Interval } from '../../base/interval';
import { PeriodInterval } from '../../base/period_inverval';
import { CONST } from '../../type_define/const';
import { Coord2 } from '../../base/coord2';
import { HalfPlane } from './halfplane';
import { MergePoint } from './merge_point';
import { IMergeCurveInfo } from '../geometry_merge';
import { CurvesColinear } from '../overlap/curves_colinear';
import { CurvesMerge } from '../overlap/curves_merge';
import { MathError } from '../../util/math_error';



interface IArcInfo {
    pos: Vec2;

    radius: number;
}

function isEqualArcs(arc1: IArcInfo, arc2: IArcInfo, eps = Tol.LENGTH) {
    if (arc1.pos.equals(arc2.pos, eps) && Math.abs(arc1.radius - arc2.radius) < eps) {
        return true;
    }
    return false;
}

export class MergeCurve {
    /**
     * 仅支持 arc 和 line
     * 默认容差为1e-6
     */
    public static mergeCurve2d(curves: Curve2[], distol = Tol.LENGTH) {
        const arcs: Arc2[] = [];
        const lines: Ln2[] = [];
        const others: Curve2[] = [];
        for (const cv of curves) {
            if (cv.isLine2d()) {
                lines.push(cv);
            } else if (cv.isArc2d() && cv.isEqualAB()) {
                arcs.push(cv);
            } else {
                others.push(cv);
            }
        }

        const mergedArcs = MergeCurve.mergeArc2d(arcs, distol).result;
        const mergedLines = MergeCurve.mergeCurveLine2d(lines, distol);
        const result: Curve2[] = mergedArcs.concat(mergedLines);
        return result.concat(others);
    }

    public static mergeCurve2dEx(curves: Curve2[], distol = Tol.LENGTH): IMergeCurveInfo {
        const arcs: Arc2[] = [];
        const lines: Ln2[] = [];
        const others: Curve2[] = [];
        for (const cv of curves) {
            if (cv.isLine2d()) {
                lines.push(cv);
            } else if (cv.isArc2d() && cv.isEqualAB()) {
                arcs.push(cv);
            } else {
                others.push(cv);
            }
        }

        const mergedArcs = MergeCurve.mergeArc2d(arcs, distol);
        const mergedLines = MergeCurve.mergeCurveLine2dEx(lines, distol);
        const result: Curve2[] = mergedArcs.result.concat(mergedLines.result);
        result.push(...others);
        const mapper = mergedArcs.mapper;
        for (const mgline of mergedLines.mapper) {
            mapper.set(mgline[0], mgline[1]);
        }
        for (const cv of others) {
            mapper.set(cv, [cv]);
        }
        return { result, mapper };
    }

    public static mergeCurveLine2d(curves: Curve2[], distol: number) {
        const result: Curve2[] = [];
        const lines: Ln2[] = [];

        for (let i = 0; i < curves.length; ++i) {
            if (curves[i].getType() !== EN_GEO_TYPE.LN_2) continue;
            lines.push(curves[i] as Ln2);
        }

        const pos: [number, number, number][] = [];

        for (let i = 0; i < lines.length; ++i) {
            const dir = lines[i].getDirection();
            const h = new HalfPlane(lines[i].getStartPt(), lines[i].getEndPt());
            if (Math.abs(dir.x) > distol) {
                if (dir.x > 0) {
                    pos.push([h.w.x, h.w.y, h.b]);
                } else {
                    pos.push([-h.w.x, -h.w.y, -h.b]);
                }
            } else {

                if (dir.y > 0) {
                    pos.push([h.w.x, h.w.y, h.b]);
                } else {
                    pos.push([-h.w.x, -h.w.y, -h.b]);
                }
            }
        }

        const merge = new MergePoint(); // 隐方程浮动可能比较大。
        const res = merge.merge(pos, distol * 50) as { index: number[]; points: [number, number, number][] };
        const allHalfPlane: HalfPlane[] = [];

        for (let k = 0; k < res.points.length; ++k) {
            allHalfPlane.push(new HalfPlane({ x: res.points[k][0], y: res.points[k][1] }, res.points[k][2]));
        }

        const scaleTol = distol * 30;

        for (let k = 0; k < allHalfPlane.length; ++k) {
            let isPostive = true;
            const h = allHalfPlane[k];
            const tagline = h.toLine2d();
            const numbers: { t: number; wind: number }[] = [];
            for (const line of lines) {
                if (
                    Math.abs(h.distance(line.getStartPt())) > scaleTol ||
                    Math.abs(h.distance(line.getEndPt())) > scaleTol
                ) {
                    continue;
                }

                if (tagline.getDirection().dot(line.getDirection()) > 0) {
                    numbers.push({ t: tagline.getParamAt(line.getStartPt()), wind: 1 });
                    numbers.push({ t: tagline.getParamAt(line.getEndPt()), wind: -1 });
                    isPostive = true;
                } else {
                    numbers.push({ t: tagline.getParamAt(line.getStartPt()), wind: -1 });
                    numbers.push({ t: tagline.getParamAt(line.getEndPt()), wind: 1 });
                    isPostive = false;
                }
            }
            numbers.sort((a, b) => a.t - b.t);
            let inside = false;
            let prevInside = false;
            let wind = 0;
            let prevt = Infinity;
            for (let i = 0; i < numbers.length;) {
                const currt = numbers[i].t;
                while (i < numbers.length && Math.abs(numbers[i].t - currt) < distol) {
                    wind += numbers[i++].wind;
                }
                inside = wind > 0;
                if (prevInside !== inside) {
                    const resultLine = new Ln2(tagline.getPtAt(prevt), tagline.getPtAt(currt));
                    if (!inside) {
                        result.push(isPostive ? resultLine : resultLine.reverse());
                    }
                    prevt = currt;
                }
                prevInside = inside;
            }
        }

        return result;
    }

    public static mergeCurveLine2dEx(lines: Ln2[], distol: number): IMergeCurveInfo {
        const lineInfos: { line: Ln2; angle: number }[] = [];
        for (const l of lines) {
            let angle = Vec2.X().angleTo(l.getDirection());
            angle = angle >= CONST.PI ? angle - CONST.PI : angle;
            lineInfos.push({ line: l, angle });
        }
        const compareLine = (aline: { line: Ln2; angle: number }, bline: { line: Ln2; angle: number }) => {
            if (Math.abs(aline.angle - bline.angle) < distol) {
                // 平行的话，比较x轴上的截距，区分重合与平行
                const dir1 = aline.line.getDirection();
                const dir2 = bline.line.getDirection();
                const pos1 = aline.line.getOrigin();
                const pos2 = bline.line.getOrigin();
                if (Math.abs(dir1.y) < distol || Math.abs(dir2.y) < distol) {
                    return pos1.y - pos2.y;
                }
                const ax0 = pos1.x - (dir1.x * pos1.y) / dir1.y;
                const bx0 = pos2.x - (dir2.x * pos2.y) / dir2.y;
                return ax0 - bx0;
            }

            // 不平行的话，随便排都不重要
            return aline.angle - bline.angle;
        };
        lineInfos.sort((a, b) => compareLine(a, b));

        const mapper: Map<Curve2, Curve2[]> = new Map();
        const result: Curve2[] = [];

        const overlapLines: Ln2[][] = [];
        for (let i = 0; i < lineInfos.length;) {
            let j = i + 1;
            for (; j < lineInfos.length; j++) {
                const isColinear = CurvesColinear.lines(lineInfos[i].line, lineInfos[j].line);
                if (!isColinear) {
                    break;
                }
            }

            const oLines: Ln2[] = [];
            for (let k = i; k < j; k++) {
                oLines.push(lineInfos[k].line);
            }
            overlapLines.push(oLines);
            i += oLines.length;
        }

        for (const olines of overlapLines) {
            const mergeLines = CurvesMerge.mergeCurves2ds(olines);
            if (mergeLines.length > 1) {
                MathError.warn(true, 'overlap但不重合');
            }
            result.push(...mergeLines);
            for (const line of mergeLines) {
                mapper.set(line, olines);
            }
        }

        return { result, mapper };
    }

    public static mergeArc2d(curves: Curve2[], eps = Tol.LENGTH): IMergeCurveInfo {
        const mapper: Map<Curve2, Curve2[]> = new Map();
        const result: Curve2[] = [];
        const arcs: Arc2[] = [];

        for (let i = 0; i < curves.length; ++i) {
            if (curves[i].getType() !== EN_GEO_TYPE.ARC_2) continue;
            arcs.push(curves[i] as Arc2);
        }

        const pos: IArcInfo[] = [];
        for (const arc of arcs) {
            const center = arc.getCenter();
            pos.push({ pos: center, radius: arc.getRadius() });
        }

        const arcsSet: { arcInfo: IArcInfo; indexs: number[] }[] = [];
        for (let k = 0; k < pos.length; k++) {
            const inSet = arcsSet.find(_a => isEqualArcs(_a.arcInfo, pos[k], eps));
            if (inSet) {
                inSet.indexs.push(k);
            } else {
                arcsSet.push({ arcInfo: pos[k], indexs: [k] });
            }
        }

        for (const iterInfo of arcsSet) {
            const arc = iterInfo.arcInfo;
            const ranges: Interval[] = [];
            const arcsIndexs = iterInfo.indexs;

            const origArcs: Arc2[] = [];
            arcsIndexs.map(_i => origArcs.push(arcs[_i]));

            for (const i of arcsIndexs) {
                const st = arcs[i].getStartPt();
                const end = arcs[i].getEndPt();
                const rangeLength = arcs[i].getRange().getLength();
                const stAngle = arcs[i].isCCW()
                    ? Vec2.X().angleTo(st.subtracted(arc.pos))
                    : Vec2.X().angleTo(end.subtracted(arc.pos));
                const range = new PeriodInterval(stAngle, stAngle + rangeLength, CONST.PI2);
                ranges.push(range);
            }

            const mergedRanges = Interval.merge(ranges);
            for (const range of mergedRanges) {
                const coord = new Coord2(arc.pos, Vec2.X());
                const mergedArc = new Arc2(coord, arc.radius, arc.radius, true, range.toArray());
                result.push(mergedArc);
                mapper.set(mergedArc, origArcs);
            }
        }

        return { result, mapper };
    }
}
// /**
//  * 详细计算逻辑参见文档: https://yuque.antfin-inc.com/fdiilm/wbwecs/evd486
//  * makeArcCurvePairByCDwh 用于鼠标拖拽事实生产墙体轮廓的方法。
//  * center 旋转中心 对应 C
//  * mouse 鼠标点 对应 D
//  * w 半墙宽
//  * h 弦高
//  * prev: 上一次arc的圆心位置。 返回距离prev最近的arc
//  */
// function makeArcCurveByCDwh(
//     center: Vec2,
//     mouse: Vec2,
//     w: number,
//     h: number,
//     isccw: boolean,
//     tol: number = 1e-6,
//     _prev: Vec2 | undefined,
// ): Curve2 {
//     const prev: Vec2 = _prev || Vec2.O();
//     const d = center.distanceTo(mouse);
//     const getLine = () => {
//         const b = Math.sqrt(d * d - w * w);
//         const c = d * w / b;
//         const dir = center.subtracted(mouse);
//         if (!dir.equals(Vec2.O())) {
//             dir.normalize();
//         }
//         const dir2 = (new Vec2(-dir.y, dir.x)).multiply(c).add(mouse).subtract(center).normalize();
//         return new Ln2(center, center.added(dir2.multiply(b)));
//     };

//     const cenDismou = center.distanceTo(mouse);
//     if (Math.abs(h) < tol || (cenDismou !== 0 && center.distanceTo(mouse) < Math.abs(w))) {
//         return getLine();
//     }
//     const A = 8 * w * h - 4 * h * h;
//     const B = A + w * w - d * d;
//     const a = 8 * h;
//     const b = B;
//     const c = w * (B - A); //公式推导详见雨雀
//     const delta2 = b * b - 4 * a * c;
//     const makeCircle = () => {
//         const r = (h - w) * 0.5;
//         const dir = center.subtracted(mouse).normalized();
//         if (w < 0) dir.reverse();
//         const c = center.added(dir.multiplied(r));
//         const alpha = Math.atan2(-dir.y, -dir.x);
//         return Arc2.makeArcByStartEndAngles(c, r, alpha, alpha + Math.PI * 2, isccw);
//     };

//     if (delta2 < 0) {
//         //此时认为是整圆
//         return makeCircle();
//     }
//     const delta = Math.sqrt(delta2);
//     let x1, x2;
//     if (b > 0) {
//         x1 = -(b + delta) / (2 * a);
//         x2 = -(2 * c) / (b + delta);
//     } else {
//         x1 = (-b + delta) / (2 * a);
//         x2 = (2 * c) / (-b + delta);
//     }
//     const getCenter = (r: number) => {
//         if (r <= 0 || (Number.isNaN(r) || !Number.isFinite(r))) return [];
//         const x = (d * d - 2 * r * w - w * w) / (2 * d);
//         if (r * r - x * x < 0) return []; // r < x  是因为ED可能增根。详见公式
//         const y = Math.sqrt(r * r - x * x);
//         const dirx = mouse.subtracted(center).normalize();
//         const diry = new Vec2(-dirx.y, dirx.x);
//         return [center.added(dirx.multiplied(x)).add(diry.multiplied(y)), center.added(dirx.multiplied(x)).add(diry.multiplied(-y))];
//     }
//     const check = (tc: Vec2) => {
//         const r = tc.distanceTo(center);
//         const end = mouse.subtracted(tc).multiplied(r / (r + w)).add(tc);
//         const tmparc = TgWallUtil.makeByOffset(Arc2.makeArcByStartEndPoints(tc, center, end, isccw), isccw ? w : -w);
//         const dir = tmparc.getEndPt().subtracted(tmparc.getStartPt()).normalize();
//         const dir2 = new Vec2(-dir.y, dir.x);
//         const tmph = Math.abs(tmparc.getMidPt().subtracted(tmparc.getStartPt()).dot(dir2));
//         if (Math.abs(tmph - h) > 1e-4) {
//             return false;
//         }
//         return true;
//     }
//     const allCenter: Vec2[] = [];
//     getCenter(x1).forEach(o => allCenter.push(o));
//     getCenter(x2).forEach(o => allCenter.push(o));
//     let tc: Vec2 | undefined = undefined;
//     for (let i = 0, dis = Infinity; i < allCenter.length; ++i) {
//         const tmp = allCenter[i].distanceTo(prev);
//         if (dis < tmp || !check(allCenter[i])) continue;
//         tc = allCenter[i];
//         dis = tmp;
//     }
//     if (!tc) return makeCircle();
//     const r = tc.distanceTo(center);
//     const end = mouse.subtracted(tc).multiplied(r / (r + w)).add(tc);
//     return Arc2.makeArcByStartEndPoints(tc, center, end, isccw);
// }