
import { Box2 } from '../base/box2';
import { Coord2 } from '../base/coord2';
import { Interval } from '../base/interval';
import { Matrix3 } from '../base/matrix3';
import { Vec2 } from '../base/vec2';
import { Arc2 } from '../geometry/arc2d';
import { Curve2 } from '../geometry/curve2';
import { Ln2 } from '../geometry/ln2';
import { NurbsCurve2 } from '../geometry/nurbs_curve2';
import { PolyCurve } from '../topology/polycurve';
import { CONST } from '../type_define/const';
import { Util } from '../util/util';

interface IIDPath {
    id: string;
    path: string;
}

interface ISVGCommand {
    cmd: string;
    data: number[];
}

export interface ISVGData {
    innerFaces: IIDPath[];
    outterFaces: IIDPath[];
}

export class SVGParser {
    // 将SVG的数据转为polycurve(一个SVG的String可能有多条polycurve)：传入参数为（svg的）string
    public static stringToPolyCurves(svfPathString: string, _trimFloat = true): PolyCurve[] {
        const polyCurves: PolyCurve[] = [];
        const commands = SVGParser._SVGStringToCommands(svfPathString);

        const getReflectionValue = (a: number, b: number) => {
            return a - (b - a);
        };
        const trimFloat = (val: number) => {
            if (!_trimFloat) {
                return val;
            }

            return Math.round(val * 100) / 100.0;
        };

        let lastPoint = Vec2.O();
        let controlPoint = Vec2.O();
        let curves: Curve2[] = [];
        for (const command of commands) {
            const cmd = command.cmd;
            const data = command.data;

            const curPoint = Vec2.O();
            let bezier;
            switch (cmd) {
                case 'M':
                    // 如果发生了move，polycurve就会断开，需要构造一条新的polycurve
                    if (curves.length > 0) {
                        polyCurves.push(new PolyCurve(curves));
                    }

                    curves = [];
                    curPoint.x = trimFloat(data[0]);
                    curPoint.y = trimFloat(data[1]);
                    break;
                case 'L':
                    curPoint.x = trimFloat(data[0]);
                    curPoint.y = trimFloat(data[1]);
                    controlPoint.x = curPoint.x;
                    controlPoint.y = curPoint.y;
                    if (!curPoint.equals(lastPoint)) {
                        curves.push(new Ln2(lastPoint, curPoint));
                    }
                    break;
                case 'H':
                    curPoint.x = trimFloat(data[0]);
                    controlPoint = curPoint.clone();
                    if (!curPoint.equals(lastPoint)) {
                        curves.push(new Ln2(lastPoint, curPoint));
                    }
                    break;
                case 'V':
                    curPoint.y = trimFloat(data[0]);
                    controlPoint = curPoint.clone();
                    if (!curPoint.equals(lastPoint)) {
                        curves.push(new Ln2(lastPoint, curPoint));
                    }
                    break;
                case 'C':
                    curPoint.x = trimFloat(data[4]);
                    curPoint.y = trimFloat(data[5]);
                    controlPoint.x = trimFloat(data[2]);
                    controlPoint.y = trimFloat(data[3]);
                    bezier = this._createBezierCurve(
                        [lastPoint, new Vec2(trimFloat(data[0]), trimFloat(data[1])), controlPoint, curPoint],
                        lastPoint,
                    );
                    if (!bezier) {
                        continue;
                    }
                    curves.push(bezier);
                    break;
                case 'Q':
                    curPoint.x = trimFloat(data[2]);
                    curPoint.y = trimFloat(data[3]);
                    controlPoint.x = trimFloat(data[0]);
                    controlPoint.y = trimFloat(data[1]);
                    bezier = this._createBezierCurve([lastPoint, controlPoint, curPoint], lastPoint);
                    if (!bezier) {
                        continue;
                    }
                    curves.push(bezier);
                    break;
                case 'S':
                    curPoint.x = trimFloat(data[2]);
                    curPoint.y = trimFloat(data[3]);
                    bezier = this._createBezierCurve(
                        [
                            lastPoint,
                            new Vec2(
                                getReflectionValue(lastPoint.x, controlPoint.x),
                                getReflectionValue(lastPoint.y, controlPoint.y),
                            ),
                            new Vec2(trimFloat(data[0]), trimFloat(data[1])),
                            curPoint,
                        ],
                        lastPoint,
                    );
                    controlPoint.x = trimFloat(data[0]);
                    controlPoint.y = trimFloat(data[1]);
                    if (!bezier) {
                        continue;
                    }
                    curves.push(bezier);
                    break;
                case 'T':
                    curPoint.x = trimFloat(data[0]);
                    curPoint.y = trimFloat(data[1]);
                    bezier = this._createBezierCurve(
                        [
                            lastPoint,
                            new Vec2(
                                getReflectionValue(lastPoint.x, controlPoint.x),
                                getReflectionValue(lastPoint.y, controlPoint.y),
                            ),
                            curPoint,
                        ],
                        lastPoint,
                    );
                    controlPoint.x = getReflectionValue(lastPoint.x, controlPoint.x);
                    controlPoint.y = getReflectionValue(lastPoint.y, controlPoint.y);
                    if (!bezier) {
                        continue;
                    }
                    curves.push(bezier);
                    break;
                case 'A':
                    // (rx ry x-axis-rotation large-arc-flag sweep-flag x y)
                    // rx ry 是椭圆的两个半轴的长度。
                    // x-axis-rotation 是椭圆的坐标系相对于XOY坐标系的旋转角度，角度数而非弧度数。
                    // large-arc-flag 是标记绘制大弧(1)还是小弧(0)部分。
                    // sweep-flag 是标记向顺时针(1)还是逆时针(0)方向绘制。
                    // x y 是圆弧终点的坐标
                    curPoint.x = data[5];
                    curPoint.y = data[6];
                    if (Util.isNearlyEqual(data[0], data[1])) {
                        // 计算圆的方法，精度更高
                        const arcInfo = this._computeArcInfo(data[0], lastPoint, curPoint, !data[3], !!data[4]); // 小弧: true; 顺时针: true
                        const arcCenter = arcInfo.center;
                        const isCCW = !!data[4]; // true：顺时针，false：逆时针// 因为svg的坐标系是y轴向下的，所以在svg中的顺时针，我们需要变成逆时针
                        const arc2 = Arc2.makeArcByStartEndPoints(arcCenter, lastPoint, curPoint, isCCW);
                        curves.push(arc2);
                    } else {
                        const rotation = (data[2] * Math.PI) / 180;
                        const arcInfo = this._computeEllipseInfo(
                            data[0],
                            data[1],
                            rotation,
                            lastPoint,
                            curPoint,
                            !!data[3],
                            !!data[4],
                        );
                        const arcCenter = arcInfo.center;
                        const isCCW = !!data[4]; // true：顺时针，false：逆时针
                        const xAxis = new Vec2(1, 0).rotate(Vec2.O(), rotation);
                        const coord = new Coord2(arcCenter, xAxis);
                        let range: [number, number] = [arcInfo.startAngle, arcInfo.endAngle];
                        if (!isCCW) {
                            range = [-arcInfo.startAngle, -arcInfo.endAngle]; // 逆时针
                        }
                        const arc2 = new Arc2(coord, data[0], data[1], isCCW, range);
                        curves.push(arc2);
                    }
                    break;
                case 'Z':
                    if (curves.length && !curves[0].getStartPt().equals(lastPoint)) {
                        curves.push(new Ln2(lastPoint, curves[0].getStartPt()));
                    }
                    break;
                default:
                    break;
            }
            lastPoint = curPoint;
        }

        polyCurves.push(new PolyCurve(curves));
        return polyCurves;
    }

    // 将SVG的数据转为polycurve：传入参数为ISVGData结构的数据
    public static svgDataToPolyCurves(svgData: ISVGData, trimFloat = true): PolyCurve[] {
        const polyCurves: PolyCurve[] = [];
        svgData.outterFaces.forEach((outterFace: { id: string; path: string }) => {
            const outPolyCurvs: PolyCurve[] = SVGParser.stringToPolyCurves(outterFace.path, trimFloat);
            // 此情况下，理论上只有一条outPolyCurv。如果有多个外环，说明给的数据有问题，外环只能有一个。
            for (const polyCurv of outPolyCurvs) {
                if (polyCurv.getAllCurves().length === 0) {
                    continue;
                }
                polyCurves.push(polyCurv);
            }
        });

        // Compute for bounding box2：计算外环的box。
        const bounding = new Box2();
        polyCurves[0].getAllCurves().forEach(curve => {
            bounding.union(curve.getBBox());
        });

        svgData.innerFaces.forEach((innerFace: { id: string; path: string }) => {
            const innerPolyCurvs: PolyCurve[] = SVGParser.stringToPolyCurves(innerFace.path, trimFloat);
            for (const polyCurv of innerPolyCurvs) {
                if (polyCurv.getAllCurves().length === 0) {
                    continue;
                }
                polyCurves.push(polyCurv);
            }
        });

        // Need do scale and translate ??? 将图形中心往原点移动并放大10倍
        const bbCenter = bounding.getCenter();
        const boundingSize = bounding.getSize();
        const matrix = Matrix3.makeTranslate(bbCenter.multiplied(-1));
        matrix.applyScale(Vec2.O(), 10);
        const matrixToMinPt = Matrix3.makeTranslate({
            x: (boundingSize.x * 10) / 2,
            y: (boundingSize.y * 10) / 2,
        });
        polyCurves.forEach(p => {
            p.transform(matrix).transform(matrixToMinPt);
        });

        return polyCurves;
    }

    // // 将SVG的数据转为polycurve，其中封闭能成环的，转为loop：传入参数为ISVGData结构的数据
    // public static parseSVGToLoops(svgData: ISVGData): Loop[] {
    //     const loops: Loop[] = [];
    //     const polyCurves = SVGParser.svgDataToPolyCurves(svgData);
    //     polyCurves.forEach(p => {
    //         const curves = p.getAllCurves();
    //         const firstCurve = curves[0];
    //         const lastCurve = curves[curves.length - 1];
    //         if (firstCurve.getStartPt().equals(lastCurve.getEndPt())) {
    //             const loop = new Loop(curves);
    //             // if (loop.isValid()) {
    //             //     loops.push(loop);
    //             // }
    //             loops.push(loop);
    //         }
    //     });

    //     return loops;
    // }

    // 将string转成一串SVG的Commands
    private static _SVGStringToCommands(inputSVGString: string): ISVGCommand[] {
        const cmdExtractorReg = /[a-df-z][^a-df-z]*/gi;
        const parseFloats = (input: string) => {
            const array = input.split(/[\s,]+/);
            const output: number[] = [];
            for (let i = 0; i < array.length; i++) {
                const number = array[i];
                if (number.indexOf('.') !== number.lastIndexOf('.')) {
                    const split = number.split('.');
                    for (let s = 2; s < split.length; s++) {
                        array.splice(i + s - 1, 0, `0.${split[s]}`);
                    }
                }

                output.push(parseFloat(number));
            }
            return output;
        };

        const commands = inputSVGString.match(cmdExtractorReg);
        const result: ISVGCommand[] = [];
        if (commands) {
            for (let i = 0; i < commands.length; i++) {
                const command = commands[i];
                const type = command.charAt(0);
                const data = command.substr(1).trim();
                result.push({
                    cmd: type,
                    data: parseFloats(data),
                });
            }
        }

        return result;
    }

    // （这个函数写的不好。。。，返回值不一致。暂时用着）
    private static _createBezierCurve(controlPts: Vec2[], lastPt: Vec2) {
        const removeDuplicatePts = (pts: Vec2[]) => {
            const newPts: Vec2[] = [];
            for (const pt of pts) {
                if (newPts.every(it => !it.equals(pt))) {
                    newPts.push(pt);
                }
            }
            return newPts;
        };

        const ctPts = removeDuplicatePts(controlPts);
        if (ctPts.length <= 1) {
            return;
        }
        if (ctPts.length === 2) {
            if (!lastPt.equals(controlPts[controlPts.length - 1])) {
                return new Ln2(lastPt, controlPts[controlPts.length - 1]);
            }
        }
        return NurbsCurve2.makeBezier(ctPts);
    }

    /**
     * https://www.w3.org/TR/SVG/implnote.html#ArcImplementationNotes
     * https://mortoray.com/2017/02/16/rendering-an-svg-elliptical-arc-as-bezier-curves/ Appendix: Endpoint to center arc conversion
     */
    private static _computeEllipseInfo(
        xRadius: number,
        yRadius: number,
        rotation: number,
        start: Vec2,
        end: Vec2,
        isLargeArc: boolean,
        isCCW: boolean,
    ) {
        // Compute (x1′, y1′)
        const dx2 = (start.x - end.x) / 2.0;
        const dy2 = (start.y - end.y) / 2.0;
        const x1p = Math.cos(rotation) * dx2 + Math.sin(rotation) * dy2;
        const y1p = -Math.sin(rotation) * dx2 + Math.cos(rotation) * dy2;

        // Compute (cx′, cy′)
        let rx = Math.abs(xRadius);
        let ry = Math.abs(yRadius);
        let rxs = rx * rx;
        let rys = ry * ry;
        const x1ps = x1p * x1p;
        const y1ps = y1p * y1p;

        // Ensure radii are large enough
        const cr = x1ps / rxs + y1ps / rys;
        if (cr > 1) {
            // scale up rx,ry equally so cr == 1
            const s = Math.sqrt(cr);
            rx *= s;
            ry *= s;
            rxs = rx * rx;
            rys = ry * ry;
        }

        const dq = rxs * y1ps + rys * x1ps;
        const pq = (rxs * rys - dq) / dq;
        let q = Math.sqrt(Math.max(0, pq));
        if (isLargeArc === isCCW) q = -q;
        const cxp = (q * rx * y1p) / ry;
        const cyp = (-q * ry * x1p) / rx;

        // Step 3: Compute (cx, cy) from (cx′, cy′)
        const cx = Math.cos(rotation) * cxp - Math.sin(rotation) * cyp + (start.x + end.x) / 2;
        const cy = Math.sin(rotation) * cxp + Math.cos(rotation) * cyp + (start.y + end.y) / 2;
        const svgAngle = (ux: number, uy: number, vx: number, vy: number) => {
            const dot = ux * vx + uy * vy;
            const len = Math.sqrt(ux * ux + uy * uy) * Math.sqrt(vx * vx + vy * vy);
            let ang = Math.acos(Math.max(-1, Math.min(1, dot / len))); // floating point precision, slightly over values appear
            if (ux * vy - uy * vx < 0) ang = -ang;
            return ang;
        };

        const theta = svgAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
        const delta =
            svgAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry) % (Math.PI * 2);
        return {
            center: new Vec2(cx, cy),
            startAngle: theta,
            endAngle: theta + delta,
        };
    }

    // 计算圆弧，方法简单且正确
    private static _computeArcInfo(radius: number, start: Vec2, end: Vec2, isSmallArc: boolean, isCCW: boolean) {
        const midPt = start.midTo(end);
        const hdx = (end.x - start.x) / 2.0;
        const hdy = (end.y - start.y) / 2.0;
        const dir = new Vec2(-hdy, hdx); // 小弧且逆时针，或者大弧且顺时针
        if (isSmallArc !== isCCW) {
            dir.reverse(); // 小弧且顺时针，或者大弧且逆时针
        }
        const halfSqrLen = hdx * hdx + hdy * hdy;
        const t = Math.sqrt(radius * radius - halfSqrLen);
        const line = new Ln2(midPt, dir, Interval.infinitArray());
        const c = line.getPtAt(t);

        let delta = 2 * Math.asin(Math.sqrt(halfSqrLen) / radius);
        if (!isSmallArc) {
            delta = CONST.PI2 - delta;
        }
        return { center: c, angle: delta };
    }
}
