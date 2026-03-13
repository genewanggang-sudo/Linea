import {
    Coord3, Plane, Polygon, Tol, Vec3, alg,
    Ln3, Vec2, Ln2, Interval, Curve2, Box2,
    DiscreteParam, Loop, Coord2, Arc2, types
} from '../../..';
import { BrepBodyPJ, BrepBodyPositionType } from './body_pj';
import { ExtrudeBody } from '../body_builder/extrude_body';



// 拉伸体信息
export interface ExtrudeInfo {
    coordinate: Coord3,
    polygon: Polygon,
    dir: Vec3,
    startHeight: number,
    endHeight: number
}

// 矩形结构体
interface OBB {
    center: Vec2;    // 矩形中心
    xVt: Vec2;       // 平行于矩形的 x 边，长度为 x 的一半
    yVt: Vec2;       // 平行于矩形的 y 边，长度为 y 的一半
}

// 立方体结构体
interface OBB3 {
    center: Vec3;    // 矩形中心
    xVt: Vec3;       // 平行于矩形的 x 边，长度为 x 的一半
    yVt: Vec3;       // 平行于矩形的 y 边，长度为 y 的一半
    zVt: Vec3;       // 平行于矩形的 z 边，长度为 z 的一半
}

// AABB box to Oriented Bounding Box
function getOBBFromBox(box: Box2) {
    const size = box.getSize();
    return {
        center: box.getCenter(),
        xVt: Vec2.X(size.x / 2),
        yVt: Vec2.Y(size.y / 2)
    };
}

/**
 * @param points 点集
 * @param vector obb任一轴向
 * @returns obb
 */
function getOBBFromPoints(points: Vec2[], vector: Vec2 = Vec2.rX()): OBB {
    const angle = vector.angleTo(Vec2.rX());
    const box = new Box2(points.map(pt => pt.vecRotated(angle)));
    const obb = getOBBFromBox(box);
    const [center, xVt, yVt] = [obb.center, obb.xVt, obb.yVt].map(pt => pt.vecRotate(-angle));
    return { center, xVt, yVt };
}

/** 判断两矩形是否相离*/
function isOBBSeparate(boxA: OBB, boxB: OBB, lengthEps: number) {
    const vectorAB = boxB.center.subtracted(boxA.center);      // 矩形中心连线
    const vectors = [boxA.xVt, boxA.yVt, boxB.xVt, boxB.yVt];   // 矩形四个方向向量
    const project = (base: Vec2, vector: Vec2) => { return Math.abs(vector.dot(base)) / base.getLength(); };

    // 只要存在 d > 0，便说明两矩形相离。此处得到的 d 便是相离之远，相交之深
    return vectors.some(v => {
        const d = project(v, vectorAB)                      // AB 的投影
            - project(v, boxA.xVt) - project(v, boxA.yVt)   // boxA 的投影
            - project(v, boxB.xVt) - project(v, boxB.yVt);  // boxB 的投影
        return d > lengthEps;   // d > 0，则在该方向上，矩形的投影是相离的
    });
}

/** 判断两立方体是否相离*/
function isOBB3Separate(boxA: OBB3, boxB: OBB3, lengthEps: number) {
    const vectorAB = boxB.center.subtracted(boxA.center);      // 矩形中心连线
    const vectorsA = [boxA.xVt, boxA.yVt, boxA.zVt];   // 矩形四个方向向量
    const vectorsB = [boxA.xVt, boxA.yVt, boxA.zVt];   // 矩形四个方向向量
    const vectorsCross = vectorsA.reduce((result: Vec3[], va, ia) => {
        vectorsB.forEach((vb, ib) => {
            if (ia !== ib) {
                result.push(va.cross(vb));
            }
        });
        return result;
    }, []);
    const project = (base: Vec3, vector: Vec3) => { return Math.abs(vector.dot(base)) / base.getLength(); };

    // 只要存在 d > 0，便说明两矩形相离。此处得到的 d 便是相离之远，相交之深
    return [...vectorsA, ...vectorsB, ...vectorsCross].some(v => {
        const d = project(v, vectorAB)  // AB 的投影
            - project(v, boxA.xVt) - project(v, boxA.yVt) - project(v, boxA.zVt)    // boxA 的投影
            - project(v, boxB.xVt) - project(v, boxB.yVt) - project(v, boxB.zVt);   // boxB 的投影
        return d > lengthEps;   // d > 0，则在该方向上，矩形的投影是相离的
    });
}

// 判断是否为凸多边形
function isConvexPolygon(polygon: Polygon) {
    if (polygon.getLoops().length > 1) {
        return false;
    }
    const points = polygon.getLoops()[0]?.getAllCurves().flatMap(curve => {
        // 离散线段，注意不需要 end，因为与下一条边的 start 重复
        if (curve.isLine()) {
            return [curve.getStartPt()];
        } else if (curve.isArc()) {
            // 圆弧取临近端点的两个离散点便足够
            const range = curve.getRange();
            const splitLength = range.getLength() / 10;
            return [range.min, range.min + splitLength, range.max - splitLength].map(param => curve.getPtAt(param));
        }
        const discretePts = curve.discrete(DiscreteParam.LOW);
        return discretePts.slice(0, discretePts.length - 1);
    });
    if (!points || points.length <= 3) {
        throw new Error('invalid loop!');
    }
    for (let i = 0; i < points.length; i++) {
        const [pt1, pt2, pt3] = [0, 1, 2].map(j => points[i + j] || points[i + j - points.length]);
        if (pt2.subtracted(pt1).cross(pt3.subtracted(pt2)) < 0) {
            return false;
        }
    }
    return true;
}

/**
    * 获取线上切向量为t的点
    */
function getArcPtByTangent(arc: Arc2, t: types.IXY): Vec2 | undefined {
    /**
     * 过椭圆 x^2/a^2+y^2/b^2=1 上一点P(x0,y0)的切线方程为 x0*x/a^2+y0*y/b^2=1
     * 记切线方程斜率为 k=-b^2*x0/a^2*y0，已知k求P(x0,y0)
     * 联立方程得 P(-k*a^2*y0/b^2,b/√ (k^2*a^2+b^2))
     */
    const [a, b] = [arc.getA(), arc.getB()]
    let pt = new Vec2();
    if (t.x === 0) {
        pt = new Vec2(a, 0);
    } else if (t.y === 0) {
        pt = new Vec2(0, b);
    } else {
        const a2 = a * a;
        const b2 = b * b;
        const k = t.y / t.x;
        const y0 = b2 / Math.sqrt(k * k * a2 + b2);
        const x0 = -k * a2 * y0 / b2;
        pt = new Vec2(x0, y0);
    }
    let sign = arc.isCCW() ? 1 : -1;
    if (t.x === 0) {
        sign *= t.y > 0 ? 1 : -1;
    } else {
        sign *= t.x < 0 ? 1 : -1; // 逆时针的情况下，t.x < 0时，pt.y > 0
    }
    pt.multiply(sign);
    const worldPt = arc.getCoord().getWorldPtAt(pt);
    if (arc.getRange().containsPt(arc.getParamAt(worldPt))) {
        return worldPt;
    }
    return undefined;
}

/**
 * 获取vector方向上最左和最右的点
 * @param curves
 * @param vector
 */
function getLeftRightInVector(curves: Curve2[], vector: Vec2) {
    if (vector.getLength() === 0) {
        throw new Error('getLeftRightInVector: input invalid!');
    }
    const line = new Ln2(Vec2.rO(), { x: vector.y, y: -vector.x });
    let min = Infinity, max = -Infinity, left: Vec2 | undefined, right: Vec2 | undefined;
    const updateByPoint = (pt: Vec2) => {
        const param = line.getParamAt(pt);
        if (param > max) {
            max = param;
            right = pt;
        }
        if (param < min) {
            min = param;
            left = pt;
        }
    };
    curves.forEach(curve => {
        if (curve.isArc2d()) {
            updateByPoint(curve.getStartPt());
            [vector, vector.reversed()].forEach(v => {
                const pt = getArcPtByTangent(curve, v);
                if (pt) {
                    updateByPoint(pt);
                }
            });
        } else {
            curve.discrete().map(updateByPoint); // todo nurbs
        }
    });
    if (!right || !left) {
        throw new Error('invalid input!');
    }
    return { left, right };
}

/**
 * 判断两拉伸体在 plane3 上投影的位置关系
 * plane3 为以两拉伸方向的公垂线为 dir 的平面，即同时平行于两拉伸方向的平面
 */
function judgeByCrossDir(body1: ExtrudeInfo, body2: ExtrudeInfo, info: { tol: Tol }): BrepBodyPositionType {
    const crossDirection = body1.dir.cross(body2.dir);
    const plane3 = new Plane(Vec3.rO(), crossDirection);
    const getOBBInfo = (body: ExtrudeInfo) => {
        // body.polygon 在 plane3 的投影必然是一条直线段，因此获取 polygon 在 cross 上的左右点，并投影到 plane3，即为该直线段的端点
        const { x, y } = body.coordinate.getLocalVectorAt(crossDirection);
        const { left, right } = getLeftRightInVector(body.polygon.getAllCurves(), new Vec2(x, y));
        const leftRight3 = [left, right].map(pt => body.coordinate.getWorldPtAt(pt)); // 左右点的世界坐标
        const dir = body.dir.normalized();
        const [
            [leftStart, leftEnd],
            [rightStart, rightEnd]
        ] = leftRight3.map(pt => [body.startHeight, body.endHeight].map(height => {
            const pt3d = pt.added(dir.multiplied(height)); // 左右点应用了高度的世界坐标
            return plane3.getUVAt(pt3d); // 转为在 plane3 的局部坐标
        }));
        return {
            obb: {
                center: leftStart.midTo(rightEnd),
                xVt: rightStart.subtracted(leftStart).multiply(0.5),
                yVt: leftEnd.subtracted(leftStart).multiply(0.5),
            },
            points: [leftStart, leftEnd, rightStart, rightEnd],
        }
    }
    const [obbInfo1, obbInfo2] = [body1, body2].map(getOBBInfo);
    if (isOBBSeparate(obbInfo1.obb, obbInfo2.obb, info.tol.lengthEps)) {
        BrepBodyPositionType.OUTSIDE
        return BrepBodyPositionType.OUTSIDE;
    }
    const coord2 = new Coord2(obbInfo2.obb.center, obbInfo2.obb.xVt);
    const box1 = new Box2(obbInfo1.points.map(pt => coord2.getLocalPtAt(pt)));
    const box2 = new Box2(obbInfo2.points);

    if (box1.containsBox(box2)) {
        return BrepBodyPositionType.CONTAIN;
    }
    if (box2.containsBox(box1)) {
        BrepBodyPositionType.INSIDE;
    }
    return BrepBodyPositionType.INTERSECT;
}

/**获取 body1 在 body2 拉伸方向的2d投影，并验证是否相交 */
function judgeByBody2Dir(body1: ExtrudeInfo, body2: ExtrudeInfo, info: { tol: Tol }) {
    // 获取 body1.polygon 在 body2 坐标系 XOY 平面的投影
    const loops1InPlane2 = getLoops1InPlane2(body1, body2);
    const outer1 = loops1InPlane2[0];

    // 获取2d投影在拉伸方向的边界值
    const dir = body2.coordinate.getLocalVectorAt(body1.dir.normalized());
    const [startVector, endVector] = [body1.startHeight, body1.endHeight].map(height => dir.multiplied(height));
    const vector2d = new Vec2(body2.coordinate.getLocalVectorAt(body1.dir));
    let { left, right } = getLeftRightInVector(outer1, vector2d);
    let { left: top, right: bottom } = getLeftRightInVector(outer1, new Vec2(vector2d.y, -vector2d.x));

    // 检查 obb 是否相交
    const points = [left, right, top, bottom].flatMap(pt => [startVector, endVector].map(vector => pt.added(vector)));
    const obb1 = getOBBFromPoints(points, vector2d);
    const { lengthEps } = info.tol;
    if (isOBBSeparate(obb1, getOBBFromBox(body2.polygon.getBBox()), lengthEps)) {
        return BrepBodyPositionType.OUTSIDE;
    }

    // 绘制投影的外轮廓
    const projectPoly = new Polygon();
    const [leftStart, leftEnd, rightStart, rightEnd] = points;
    if (body1.dir.isPerpendicular(body2.dir)) {
        // 若两者拉伸方向垂直，则 polygon1 在 plane2 投影为一条直线段 left-right
        projectPoly.addLoop(new Loop([leftStart, rightStart, rightEnd, leftEnd]));
    } else {
        // 先将原始投影的外轮廓依左右边界点一分为二，分别以 start/end offset 偏移后，连接左右边线
        [left, right].forEach(pt => {
            const splitIndex = outer1.findIndex(curve => curve.containsPt(pt, lengthEps) && !curve.isStartPt(pt, lengthEps) && !curve.isEndPt(pt, lengthEps));
            if (splitIndex > 0) {
                const curve = outer1[splitIndex];
                const newCurves = curve.split([curve.getParamAt(pt)]);
                outer1.splice(splitIndex, 1, ...newCurves);
            }
        });
        const [leftIndex, rightIndex] = [left, right].map(pt => outer1.findIndex(curve => curve.isStartPt(pt)));
        if (leftIndex < 0 || rightIndex < 0) {
            throw new Error('split loop error!');
        }
        // todo: 待验证 投影后的路径方向影响
        const [bottomCurves, topCurves] = [leftIndex, rightIndex].map((index, isRight) => {
            const anotherIndex = isRight ? leftIndex : rightIndex;
            if (index < anotherIndex) {
                return outer1.slice(index, anotherIndex);
            } else {
                return outer1.slice(index, outer1.length - 1).concat(outer1.slice(0, index - 1));
            }
        });
        projectPoly.addLoop(new Loop([...bottomCurves, new Ln2(rightStart, rightEnd), ...topCurves, new Ln2(leftEnd, leftStart)]));

        // 计算投影的洞，原始洞的投影的交集是投影的洞
        if (loops1InPlane2.length > 1) {
            const holeLoops = loops1InPlane2.slice(1);
            const [startHoles, endHoles] = [startVector, endVector].map(offset => holeLoops.map(loop => new Loop(loop).translate(offset)));
            const projectHoles = alg.Bool2d.boolOperate(startHoles, endHoles, alg.Bool2dType.intersect, lengthEps, info.tol.angleEps);
            projectHoles.forEach(polygon => projectPoly.addLoop(polygon.loops[0]));
        }
    }
    return polygonPositionJudge(projectPoly, body2.polygon, info);
}

function polygonPositionJudge(polygon1: Polygon, polygon2: Polygon, info: { tol: Tol }): BrepBodyPositionType {
    // 判断线段相交
    const [curves1, curves2] = [polygon1, polygon2].map(polygon => polygon.getAllCurves());
    const hasIntersect = curves1.some(curve1 => {
        return curves2.some(curve2 => {
            const curvePositionType = alg.PJ.curveToCurve(curve1, curve2, info.tol.lengthEps, info.tol.angleEps);
            return curvePositionType !== alg.CurvesPJType.NOT_INTERSECT;
        });
    });
    if (hasIntersect) {
        return BrepBodyPositionType.INTERSECT;
    }
    // 判读位置关系
    const [positionType1, positionType2] = [polygon1, polygon2].map((polygon, isPoly2) => {
        const pt = polygon.getLoops()[0]?.getAllPoints()[0]; // 取外轮廓一点
        if (!pt.isVector2()) {
            throw new Error('invalid polygon!');
        }
        const anotherPolygon = isPoly2 ? polygon1 : polygon2;
        return alg.PJ.ptToPolygon(pt, anotherPolygon);
    });
    // polygon out
    if (positionType1 === alg.PtLoopPJType.OUT && positionType2 === alg.PtLoopPJType.OUT) {
        return BrepBodyPositionType.OUTSIDE;
    }
    // polygon1 contain polygon2
    if (positionType1 === alg.PtLoopPJType.OUT && positionType2 === alg.PtLoopPJType.IN) {
        return BrepBodyPositionType.CONTAIN;
    }
    // polygon1 in polygon2
    if (positionType1 === alg.PtLoopPJType.IN && positionType2 === alg.PtLoopPJType.OUT) {
        return BrepBodyPositionType.INSIDE;
    }
    throw new Error('polygon position judge error!');
}

// 获取 body1.polygon 在以 body2.coordinate 为坐标系的平面的投影
function getLoops1InPlane2(body1: ExtrudeInfo, body2: ExtrudeInfo) {
    const [plane1, plane2] = [body1, body2].map((body) => new Plane(body.coordinate));
    if (body1.dir.isPerpendicular(body2.dir)) {
        // 若拉伸方向垂直，投影结果为一条直线段，且直线段的端点 body1.polygon 在 body2.dir 上最左和最右的点在 plane2 上的投影
        const dir = body1.coordinate.getLocalVectorAt(body2.dir);
        let { left, right } = getLeftRightInVector(body1.polygon.loops[0].getAllCurves(), new Vec2(dir));
        const [projLeft, projRight] = [left, right].map(pt => body2.coordinate.getLocalPtAt(body1.coordinate.getWorldPtAt(pt)));
        return [[new Ln2(projLeft, projRight)]];
    }
    return body1.polygon.loops.map(loop => {
        const curves3d1 = loop.getAllCurves().map(curve1 => plane1.getCurve3d(curve1));
        const curves1InPlane2 = curves3d1.map(curve3d1 => {
            const curve1InPlane2 = alg.Project.curveToPlane(curve3d1, plane2);
            if (!curve1InPlane2) {
                throw new Error('project curve to plane error!')
            }
            return curve1InPlane2;
        });
        return curves1InPlane2;
    });
}

/**
 * @author jinxin
 *  拉伸体位置关系判断
 */
export class ExtrudeBodyPJ {
    /**
     * 处理brepbody间的位置关系
     * body1和body2的关系可能为相交，相离，被包含，包含
     */
    public static PJ(
        body1: ExtrudeInfo,
        body2: ExtrudeInfo,
        info: {
            tol?: Tol,
            ignoreOBBJudge?: boolean,
        } = {}
    ): BrepBodyPositionType {
        // 预处理
        const tol = info.tol || Tol.DEFAULT;
        const newInfo = { tol };
        const idDirEqualDz = [body1, body2].every(body => body.coordinate.getDz().isSameDirection(body.dir, tol.angleEps));
        if (!idDirEqualDz) {
            throw new Error('invalid input: dir is not equal with dz!');
        }

        // same direction
        if (body1.dir.isSameDirection(body2.dir, tol.angleEps)) {
            return ExtrudeBodyPJ._sameDirectionJudeg(body1, body2, newInfo);
        }

        // 3d obb intersect judge
        if (!info.ignoreOBBJudge) {
            const [obb1, obb2] = [body1, body2].map(body => {
                const box = body.polygon.getBBox();
                const obb2d = getOBBFromBox(box);
                const dir = body.dir.normalized();
                const zLength = (body.endHeight - body.startHeight) / 2;
                return {
                    center: body.coordinate.getWorldPtAt(obb2d.center).add(dir.multiplied(body.startHeight + zLength)),
                    xVt: body.coordinate.getWorldVectorAt(obb2d.xVt),
                    yVt: body.coordinate.getWorldVectorAt(obb2d.yVt),
                    zVt: dir.multiplied(zLength),
                }
            });
            if (isOBB3Separate(obb1, obb2, tol.lengthEps)) {
                return BrepBodyPositionType.OUTSIDE;
            }
        }

        // make projection
        const positionType = ExtrudeBodyPJ._projectionJudge(body1, body2, newInfo);
        if (positionType === BrepBodyPositionType.OUTSIDE) {
            return BrepBodyPositionType.OUTSIDE;
        }

        // 若两者延伸方向垂直或都为凸体，做三次常规投影即可判断
        if (body1.dir.isPerpendicular(body2.dir, tol.angleEps) || (isConvexPolygon(body1.polygon) && isConvexPolygon(body2.polygon))) {
            return positionType;
        }

        // 否则做通用几何体的位置关系判断
        // todo 可优化，分割polygon为多个凸多边形，需要与通用方案比较
        const bodys = [body1, body2].map(body => ExtrudeBody.execute(body.coordinate, body.polygon, body.dir, body.startHeight, body.endHeight));
        return BrepBodyPJ.PJ(bodys[0], bodys[1], tol.lengthEps);
    }

    private static _sameDirectionJudeg(body1: ExtrudeInfo, body2: ExtrudeInfo, info: { tol: Tol }) {
        // 1.判断高度是否重叠
        const line1 = new Ln3(body1.coordinate.getOrigin(), body1.dir, [0, 1]);
        const param2 = line1.getParamAt(body2.coordinate.getOrigin());
        const range1 = new Interval(body1.startHeight, body1.endHeight);
        const range2 = new Interval(body2.startHeight + param2, body2.endHeight + param2); // range 2 in 1
        const { lengthEps } = info.tol;
        if (range1.intersected(range2, lengthEps).length === 0) {
            return BrepBodyPositionType.OUTSIDE;
        }
        if (range1.equals(range2, lengthEps)) {
            // todo: equals
            // return BrepBodyPositionType.EQUAL;
        }
        // 2.高度重叠的前提下，判断轮廓是否相交或相离
        const polygon1InPlane2 = new Polygon(getLoops1InPlane2(body1, body2).map(curves => new Loop(curves)));
        const polygonPositionType = polygonPositionJudge(polygon1InPlane2, body2.polygon, info);
        if (polygonPositionType === BrepBodyPositionType.INTERSECT || polygonPositionType === BrepBodyPositionType.OUTSIDE) {
            return polygonPositionType;
        }

        // 3.高度重叠、轮廓不相交且不相离的前提下，判断位置关系
        // body1 contain body2
        if (range1.containsInterval(range2) && polygonPositionType === BrepBodyPositionType.CONTAIN) {
            return BrepBodyPositionType.CONTAIN;
        }
        // body1 in body2
        if (range2.containsInterval(range1) && polygonPositionType === BrepBodyPositionType.INSIDE) {
            return BrepBodyPositionType.INSIDE;
        }
        // body intersect
        return BrepBodyPositionType.INTERSECT;
    }

    /**
     * 通过三次投影判断两拉伸体的位置关系，三次投影的方向分别为 dir1、dir2、cross(dir1, dir2)
     */
    private static _projectionJudge(body1: ExtrudeInfo, body2: ExtrudeInfo, info: { tol: Tol }) {
        // body2 拉伸方向的投影
        const type1 = judgeByBody2Dir(body1, body2, info);
        if (type1 === BrepBodyPositionType.OUTSIDE) {
            return BrepBodyPositionType.OUTSIDE;
        }

        // body1 拉伸方向的投影
        const type2 = judgeByBody2Dir(body2, body1, info);
        if (type2 === BrepBodyPositionType.OUTSIDE) {
            return BrepBodyPositionType.OUTSIDE;
        }

        // 两者在拉伸方向的叉乘方向上的投影
        const crossType = judgeByCrossDir(body1, body2, info);
        if (crossType === BrepBodyPositionType.OUTSIDE) {
            return BrepBodyPositionType.OUTSIDE;
        }

        const types = [type1, type2, crossType];
        if (types.every(type => type === BrepBodyPositionType.CONTAIN)) {
            BrepBodyPositionType.CONTAIN;
        }

        if (types.every(type => type === BrepBodyPositionType.INSIDE)) {
            BrepBodyPositionType.INSIDE;
        }

        return BrepBodyPositionType.INTERSECT;
    }
}