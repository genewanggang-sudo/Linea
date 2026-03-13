import {
    Coord3,
    Polygon,
    Vec3,
    Plane,
    alg,
    Curve3,
    Arc2,
    Arc3,
    Ln3,
    Cylinder,
    Tol,
    Loop,
    Curve2,
    MathAssert,
    NurbsCurve3,
    NurbsCurve2,
} from '../../..';
import { Vertex } from '../../brep/vertex';
import { Coedge3d } from '../../brep/coedge3d';
import { Wire } from '../../brep/wire';
import { Edge } from '../../brep/edge';
import { Face } from '../../brep/face';
import { BrepBody } from '../../brep/brep_body';
import { SmoothUtil } from '../shell_edit/smooth/smooth_util';
import { IExtrudeTopo } from '../alg_types';
import { BodyUtil } from '../body_util';



/**
 * @author tiansk
 *  拉伸体
 *  支持轮廓线为直线段和圆弧，暂时不支持斜拉伸（还没有斜圆柱面）
 */
export class ExtrudeBody {
    /**
     * 拉伸造体
     * @param coordinate 局部坐标系
     * @param polygon 在坐标轴下的polyogn
     * @param dir 拉伸方向
     * @param startOffset 起始偏移
     * @param endOffset 终止偏移
     * @param bCalPolygonEx 是否依据环的包含关系，将polygon分成多个区域，默认为true
     * 如果输入明确只有一个区域，可以设置成false，提高性能
     */
    public static execute(
        coordinate: Coord3,
        polygon: Polygon,
        dir: Vec3,
        startHeight: number,
        endHeight: number,
        bCalPolygonEx = true,
        useRealCurve = false,
        extrudeTopo?: IExtrudeTopo[],
    ): BrepBody {
        let newPolygon = polygon;
        if (!useRealCurve) {
            newPolygon = this._decomposeSmoothPoly(polygon);
        }

        // 合法性检查
        MathAssert.assert(
            dir.isSameDirection(coordinate.getDz()),
            '构造拉伸体：限定拉伸方向和coordinate z轴方向必须同向 \n\n',
        );
        MathAssert.assert(() => newPolygon.isValid(), `构造拉伸体：输入polygon 不合法\n\n${newPolygon}`);
        MathAssert.assert(
            endHeight > startHeight + Tol.NUMBER,
            '构造拉伸体：endHeight必须大于startHeight \n\n',
        );

        for (const l of newPolygon.getLoops()) {
            const cvs = l.getAllCurves();
            for (let i = 0; i < cvs.length; i++) {
                if (!cvs[i].getEndPt().equals(cvs[(i + 1) % cvs.length].getStartPt(), Tol.LENGTH)) {
                    MathAssert.assert(false, `构造拉伸体：Polygon本身误差过大,请处理${newPolygon}`);
                }
            }
        }

        let polygonExs: Polygon[] = [newPolygon];
        if (bCalPolygonEx) {
            polygonExs = alg.SearchGraph.polygonToPolygonExes(newPolygon);
        }
        const body = new BrepBody();

        // 如果polygon的多个loop有重合点，可以尝试在二维的时候就找出重合点跟踪
        // const commonVtIndexs: number[][][] = []; // 记录共顶点的的poly的索引
        // const getLoopsCommonPtIndex = (
        //     loop1: Loop,
        //     loop2: Loop,
        //     lIndex1: number,
        //     lIndex2: number,
        //     pIndex1: number,
        //     pIndex2: number,
        // ) => {
        //     const pts1 = loop1.getAllPoints();
        //     const pts2 = loop2.getAllPoints();
        //     for (let p = 0; p < pts1.length; p++) {
        //         for (let q = 0; q < pts2.length; q++) {
        //             if (pts1[p].equals(pts2[q])) {
        //                 commonVtIndexs.push([
        //                     [pIndex1, lIndex1, p],
        //                     [pIndex2, lIndex2, q],
        //                 ]);
        //             }
        //         }
        //     }
        // };

        // const getPolysCommonPtIndex = (index1: number, index2: number) => {
        //     const polyEx1 = polygonExs[index1];
        //     const polyEx2 = polygonExs[index2];
        //     for (let m = 0; m < polyEx1.getLoops().length; m++) {
        //         const loop1 = polyEx1.getLoops()[m];
        //         for (let n = 0; n < polyEx2.getLoops().length; n++) {
        //             const loop2 = polyEx2.getLoops()[n];
        //             getLoopsCommonPtIndex(loop1, loop2, m, n, index1, index2);
        //         }
        //     }
        // };

        // if (polygonExs.length > 1) {
        //     for (let i = 0; i < polygonExs.length; i++) {
        //         for (let j = i + 1; j < polygonExs.length; j++) {
        //             getPolysCommonPtIndex(i, j);
        //         }
        //     }
        // }

        for (let i = 0; i <= polygonExs.length - 1; i++) {
            const p = polygonExs[i];
            const extrudeTopoInfo: IExtrudeTopo = {
                topVertexs: [],
                bottomVertexs: [],
                topEdges: [],
                sideEdges: [],
                bottomEdges: [],
                topFace: new Face(Plane.XOY(), true),
                sideFaces: [],
                bottomFace: new Face(Plane.XOY(), true),
            };
            const e = this.extrudePolygonEx(coordinate, p, dir, startHeight, endHeight, extrudeTopoInfo);
            e.getEdges().forEach(eg => {
                body.addEdge(eg);
            });
            e.getFaces().forEach(fc => {
                body.addFace(fc);
            });
            e.getVertexs().forEach(vt => {
                body.addVertex(vt);
            });
            if (extrudeTopo) extrudeTopo.push(extrudeTopoInfo);
        }

        // 合并相同的vertex和edge
        BodyUtil.mergeCoincideVertexAndEdges(body);

        // DebugWarn.assert(body.isTopoValid());
        return body;
    }

    public static extrudePolygonEx(
        coordinate: Coord3,
        polygon: Polygon,
        _dir: Vec3,
        startHeight: number,
        endHeight: number,
        extrudeTopo: IExtrudeTopo,
    ): BrepBody {
        const body = new BrepBody();

        const basePlane = new Plane(coordinate);

        const dir = _dir.clone().normalize();
        const bottomPlane = basePlane.clone().translate(dir.multiplied(startHeight));
        const topPlane = basePlane.clone().translate(dir.multiplied(endHeight));

        // 找到外环
        const allLoops = polygon.getLoops().slice();
        const outerIndex = allLoops.findIndex(loop => loop.isAnticlockwise());
        if (outerIndex > 0) {
            const outLoop = allLoops[outerIndex];
            allLoops.splice(outerIndex, 1);
            allLoops.unshift(outLoop);
        }

        const bottomFace = new Face(bottomPlane, false);
        body.addFace(bottomFace);
        extrudeTopo.bottomFace = bottomFace;

        const topFace = new Face(topPlane, true);
        body.addFace(topFace);
        extrudeTopo.topFace = topFace;

        // 缓存已经添加的edge
        const sideEdges: Map<string, Edge> = new Map();

        for (const loop of allLoops) {
            const upWire = new Wire();
            topFace.addWire(upWire);

            const downWire = new Wire();
            bottomFace.addWire(downWire);

            // 1.添加顶点
            const upVertices: Vertex[] = [];
            const downVertices: Vertex[] = [];
            const curve2ds = loop.getAllCurves();
            for (let j = 0; j < curve2ds.length; j++) {
                const p = curve2ds[j].getStartPt();
                const preIndex = (j + curve2ds.length - 1) % curve2ds.length;
                const smoothFlag = SmoothUtil.isSameSmoothPoly(curve2ds[j], curve2ds[preIndex]);

                const dVertex = body.createVertex(bottomPlane.getPtAt(p));
                if (smoothFlag) {
                    dVertex.setSmooth(true);
                }
                downVertices.push(dVertex);

                const uVertex = body.createVertex(topPlane.getPtAt(p));
                if (smoothFlag) {
                    uVertex.setSmooth(true);
                }
                upVertices.push(uVertex);
            }
            extrudeTopo.topVertexs.push(upVertices);
            extrudeTopo.bottomVertexs.push(downVertices);

            // 2.添加边和侧面
            const topEdges: Edge[] = [];
            const bottomEdges: Edge[] = [];
            const sideEds: Edge[] = [];
            const sideFaces: Face[] = [];
            for (let j = 0; j < curve2ds.length; j++) {
                const curve2d = curve2ds[j];

                const up = upVertices[j];
                const upNext = upVertices[(j + 1) % upVertices.length];

                const down = downVertices[j];
                const downNext = downVertices[(j + 1) % downVertices.length];

                // 添加底面的边
                let downCurve3d: Curve3 | undefined;
                if (curve2d.isArc2d() && curve2d.isEqualAB()) {
                    const arc2d = curve2d as Arc2;
                    const center = bottomPlane.getPtAt(arc2d.getCenter());
                    const normal = arc2d.isCCW() ? dir : dir.clone().reverse();
                    const arc3d = Arc3.makeArcByStartEndPoints(
                        center,
                        arc2d.getRadius(),
                        normal,
                        down.getPoint(),
                        downNext.getPoint(),
                        true,
                    );
                    if (arc2d.getRange().getLength() < 1e-6) {
                        arc3d.setRange(arc3d.getRange().min, arc3d.getRange().min + arc2d.getRange().getLength());
                    }
                    downCurve3d = arc3d;
                } else if (curve2d.isArc2d()) {
                    const arc2d = curve2d as Arc2;
                    const center = bottomPlane.getPtAt(arc2d.getCenter());
                    const ecllips3d = Arc3.makeEllipseByFivePoints(
                        center,
                        bottomPlane.getPtAt(arc2d.getPtAt(0)),
                        bottomPlane.getPtAt(arc2d.getPtAt(Math.PI * 0.5)),
                        bottomPlane.getPtAt(arc2d.getStartPt()),
                        bottomPlane.getPtAt(arc2d.getEndPt()),
                    );
                    if (ecllips3d && arc2d.getRange().getLength() < 1e-6) {
                        ecllips3d.setRange(
                            ecllips3d.getRange().min,
                            ecllips3d.getRange().min + arc2d.getRange().getLength(),
                        );
                    }
                    downCurve3d = ecllips3d as Arc3;
                } else if (curve2d.isLine2d()) {
                    downCurve3d = new Ln3(down.getPoint(), downNext.getPoint());
                } else if (curve2d.isNurbsCurve2d()) {
                    downCurve3d = NurbsCurve3.makeByControlPoints(
                        (curve2d as NurbsCurve2).getControlPoints().map(p => bottomPlane.getPtAt(p)),
                        (curve2d as NurbsCurve2).getDegree(),
                        (curve2d as NurbsCurve2).getKnots(),
                        (curve2d as NurbsCurve2).getWeights(),
                    );
                    downCurve3d.setRange(curve2d.getRange());
                } else {
                    const pts = curve2d.discrete();
                    downCurve3d = NurbsCurve3.makeByInterpolationPts(pts.map(p => bottomPlane.getPtAt(p)));
                }
                const downEdge = body.createEdge(downCurve3d, down, downNext);
                bottomEdges.push(downEdge);

                // 添加顶面的边
                const upCurve3d = downCurve3d.clone().translate(dir.multiplied(endHeight - startHeight));
                const upEdge = body.createEdge(upCurve3d, up, upNext);
                topEdges.push(upEdge);

                // 顶面底面加环
                upWire.addCoedge3d(new Coedge3d(upEdge, true));
                downWire.addCoedge3d(new Coedge3d(downEdge, true));

                let leftEdge = sideEdges.get(down.tag + up.tag);
                if (!leftEdge) {
                    leftEdge = body.createLineEdge(down, up);
                    if (down.getSmooth()) {
                        leftEdge.setSmooth(true);
                    }
                    sideEdges.set(down.tag + up.tag, leftEdge);
                }
                sideEds.push(leftEdge);

                let rightEdge = sideEdges.get(downNext.tag + upNext.tag);
                if (!rightEdge) {
                    rightEdge = body.createLineEdge(downNext, upNext);
                    if (downNext.getSmooth()) {
                        rightEdge.setSmooth(true);
                    }
                    sideEdges.set(downNext.tag + upNext.tag, rightEdge);
                }

                // 添加侧面
                const wire = new Wire([
                    new Coedge3d(downEdge, true),
                    new Coedge3d(rightEdge, true),
                    new Coedge3d(upEdge, false),
                    new Coedge3d(leftEdge, false),
                ]);

                let sideFace: Face | undefined;
                if (curve2d.isArc2d()) {
                    // 创建圆柱面
                    const cylinder = Cylinder.makeCylinderByArc3d(downCurve3d as Arc3);
                    if ((curve2d as Arc2).isCCW()) {
                        sideFace = new Face(cylinder, true, [wire]);
                    } else {
                        wire.reverse();
                        sideFace = new Face(cylinder, false, [wire]);
                    }
                } else if (curve2d.isLine2d()) {
                    // 创建平面
                    const plane = new Plane(
                        down.getPoint(),
                        new Vec3(down.getPoint(), downNext.getPoint()),
                        new Vec3(down.getPoint(), up.getPoint()),
                    );
                    sideFace = new Face(plane, true, [wire]);
                } else {
                    throw new Error('not supported');
                }
                body.addFace(sideFace);
                sideFaces.push(sideFace);
            }
            extrudeTopo.topEdges.push(topEdges);
            extrudeTopo.bottomEdges.push(bottomEdges);
            extrudeTopo.sideEdges.push(sideEds);
            extrudeTopo.sideFaces.push(sideFaces);
        }

        // 调整底面surface、wire、face方向
        (bottomFace.getSurface() as Plane).reverse();
        bottomFace.getWires().forEach(w => w.reverse());
        bottomFace.setSameDirWithSurface(true);

        return body;
    }

    private static _decomposeSmoothPoly(polygon: Polygon): Polygon {
        const newPolygon = new Polygon();
        polygon.getLoops().forEach(l => {
            const newCurves = SmoothUtil.decomposeSmoothPoly(l.getAllCurves()) as Curve2[];
            newPolygon.addLoop(new Loop(newCurves), false);
        });
        return newPolygon;
    }
}