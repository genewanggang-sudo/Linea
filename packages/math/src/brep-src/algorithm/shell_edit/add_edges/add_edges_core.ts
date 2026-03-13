import { Face } from '../../../brep/face';
import { Shell } from '../../../brep/shell';
import { IShellModelingResult, IShellModifyInfo, addShellModifyInfo, addEvolutionInfo } from '../shell_modeling_result';
import { Edge } from '../../../brep/edge';
import { Vertex } from '../../../brep/vertex';
import { Coedge3d } from '../../../brep/coedge3d';
import { VirtualLoop, detectLoopFromEdges, VirtualFace, virtualLoopsToFaces } from '../smooth/detect_loop_util';
import { Wire } from '../../../brep/wire';
import { mergeShells } from '../operator/merge_shell';
import { disposeFace } from '../operator/dispose_topo';
import { splitEdgeByVertices } from '../operator/split_edge';
import { SmoothUtil } from '../smooth/smooth_util';
import { ContinuousUtil } from '../../../continuous/continuous_util';
import { Octree } from '../faces_boolean/octree';
import { Tol } from '../../../../base/tol';
import { Plane } from '../../../../geometry/plane';
import { Cylinder } from '../../../../geometry/cylinder';
import { Curve3 } from '../../../../geometry/curve3d';
import { Arc3 } from '../../../../geometry/arc3d';
import { OffsetCurve3 } from '../../../../geometry/offset_curve3';
import { Vec3 } from '../../../../base/vec3';
import * as alg from '../../../../algorithm'
import { Util } from '../../../../util/util';
import { Box3 } from '../../../../base/box3';
import { Ln3 } from '../../../../geometry/ln3';
import { GeomUtil } from '../../../../util/geom_util';
import { Polygon } from '../../../../topology/polygon';
import { Loop } from '../../../../topology/loop';


const errorCCCoplanar = '输入线条不是共面的.';
const errorCCValid = '输入线条无效.';
const errorNoValidPlanes = '不能找到有效的平面.';

const angleTol = new Tol(Tol.LENGTH, 2 * Tol.ANGLE);

function addCandPlane(allPlanes: Array<Plane | Cylinder>, addPlane: Plane | Cylinder) {
    if (allPlanes.some(p => p.isCoplanar(addPlane, angleTol))) {
        return;
    }
    allPlanes.push(addPlane.clone());
}

function checkConditions(originCurves: Curve3[], result: IAddEdgesResult) {
    // 计算共面
    let surArray: Array<Plane | Cylinder> = [];
    for (const curve of originCurves) {
        if (curve instanceof Arc3) {
            const arc = curve as Arc3;
            addCandPlane(surArray, new Plane(arc.getCoord()));
            if (arc.isEqualAB()) {
                addCandPlane(surArray, new Cylinder(arc.getCoord(), arc.getA(), arc.getB()));
            }
        } else if (curve instanceof OffsetCurve3 && curve.getBaseCurve() instanceof Arc3) {
            addCandPlane(surArray, new Plane((curve.getBaseCurve() as Arc3).getCoord()));
        }
    }

    const points: Vec3[] = [];
    for (const curve of originCurves) {
        let tmpPts: Vec3[] = [];
        if (curve.isNurbsCurve3d()) {
            tmpPts = curve.getControlPoints().slice();
        } else {
            tmpPts = curve.discrete();
        }
        tmpPts.forEach(_ => {
            if (points.every(it => !it.equals(_))) {
                points.push(_);
            }
        });
    }
    if (surArray.length) {
        surArray = surArray.filter(sur => points.every(pt => sur.containsPt(pt)));
        if (surArray.length) {
            return { surfs: surArray, state: true };
        }
        result.errorStr = errorCCCoplanar;
        return { surfs: [], state: false };
    }
    const tmpPlane = Plane.makeByPoints(points);
    if (tmpPlane) {
        const bCoplanar = points.every(pt => tmpPlane!.containsPt(pt));
        if (bCoplanar) {
            return { surfs: [tmpPlane], state: true };
        }
        // 有些点并不在计算出来的平面上，误差原因等
        result.errorStr = errorCCCoplanar;
        return { surfs: [], state: false };
    }
    return { surfs: [], state: true };
}

function addToListInMap(map: Map<any, any>, key: any, value: any) {
    let list = map.get(key);
    if (!list) {
        list = [];
        map.set(key, list);
    }
    list.push(value);
}

function addOverlapInfo<T>(infos: Set<T>[], a: T, b: T) {
    let info: Set<T> | undefined;
    for (const it of infos) {
        if (it.has(a) || it.has(b)) {
            info = it;
            break;
        }
    }
    if (!info) {
        info = new Set<T>();
        infos.push(info);
    }
    info.add(a);
    info.add(b);
}

function selfIntersectForCurves(
    cc: Curve3[],
    getIntersects: (c: Curve3) => Curve3[],
    overlapCurves: Set<Curve3>[],
    newCurveOldsMap: Map<Curve3 | Edge, Curve3[]>,
) {
    const intersectionMap: Map<Curve3, Vec3[]> = new Map();

    // 计算交点
    const calCurveSet = new Set<Curve3>();
    const length = cc.length;
    for (let i = 0; i < length; i++) {
        const curve = cc[i];
        calCurveSet.add(curve);
        const intersectCurves = getIntersects(curve).filter(c => !calCurveSet.has(c));
        for (const otherCurve of intersectCurves) {
            const intersectResults = alg.X.curve3ds(curve, otherCurve);
            let overlap = false;
            const interPts: Vec3[] = [];
            intersectResults.forEach(it => {
                if (it.isOverlap) {
                    interPts.push(curve.getPtAt(it.overlap1!.min));
                    interPts.push(curve.getPtAt(it.overlap1!.max));
                    overlap = true;
                } else {
                    interPts.push(it.point);
                }
            });
            if (!interPts.length) {
                continue;
            }

            if (overlap) {
                addOverlapInfo(overlapCurves, curve, otherCurve);
            }
            for (const interPt of interPts) {
                addToListInMap(intersectionMap, curve, interPt);
                addToListInMap(intersectionMap, otherCurve, interPt);
            }
        }
    }

    const resultCurves: Curve3[] = [];
    for (let i = 0; i < length; i++) {
        const curve = cc[i];
        const intersectPts = intersectionMap.get(curve);
        if (!intersectPts || intersectPts.length === 0) {
            resultCurves.push(curve);
            continue;
        }

        const splits = GeomUtil.splitCurveByPoints(curve, intersectPts) as Curve3[];
        if (!splits.length) {
            resultCurves.push(curve);
        } else {
            const olds = newCurveOldsMap.get(curve);
            for (const splitBC of splits) {
                SmoothUtil.copySmoothInfo(curve, splitBC);
                resultCurves.push(splitBC);
                if (olds) {
                    newCurveOldsMap.set(splitBC, olds);
                }
            }
            newCurveOldsMap.delete(curve);
            for (const overlapCurve of overlapCurves) {
                if (overlapCurve.has(curve)) {
                    overlapCurve.delete(curve);
                    splits.forEach(it => overlapCurve.add(it));
                    break;
                }
            }
        }
    }
    cc.splice(0, cc.length);
    cc.push(...resultCurves);
}

function removeOverlapCurves(
    cc: Curve3[],
    overlapCurves: Set<Curve3>[],
    newCurveOldsMap: Map<Curve3 | Edge, Curve3[]>,
) {
    const resultCurveSet = new Set<Curve3>(cc);
    for (const overlapCurveSet of overlapCurves) {
        const sameCurvesMap = new Map<Curve3, Curve3[]>();
        for (const curve of overlapCurveSet) {
            let bMatch = false;
            for (const [first, second] of sameCurvesMap) {
                // same curve.
                if (
                    alg.PJ.curvesOverlap(first, curve) ===
                    alg.CurvesPJType.TOTALLY_OVERLAP
                ) {
                    second.push(curve);
                    bMatch = true;
                    break;
                }
            }
            if (!bMatch) {
                sameCurvesMap.set(curve, [curve]);
            }
        }

        for (const curveArray of sameCurvesMap.values()) {
            if (curveArray.length <= 1) {
                continue;
            }
            const olds = newCurveOldsMap.get(curveArray[0]) || [];
            for (let index = 1; index < curveArray.length; index++) {
                resultCurveSet.delete(curveArray[index]);
                olds.concat(newCurveOldsMap.get(curveArray[index]) || []);
                newCurveOldsMap.delete(curveArray[index]);
            }
            newCurveOldsMap.set(curveArray[0], olds);
        }
    }

    cc.splice(0, cc.length);
    resultCurveSet.forEach(it => cc.push(it));
}

function pretreatCurves(cc: Curve3[], newCurveOldsMap: Map<Curve3 | Edge, Curve3[]>) {
    // 移除零长度的线
    const newCC = cc.filter(c => !Util.isNearly0(c.getLength()));

    // curve 变化追踪
    newCC.forEach(_ => newCurveOldsMap.set(_, [_]));

    // 构造octree
    const totalBox = new Box3();
    const objectBoxMap = new Map<Curve3, Box3>();
    newCC.forEach(c => {
        const box = c.getBBox();
        objectBoxMap.set(c, box);
        totalBox.union(box);
    });
    const treeCenter = totalBox.getCenter().subtracted(new Vec3(0, 0, totalBox.getSize().z / 2));
    const sizes = Math.max(...totalBox.getSize().toArray3());
    const getBounds = (c: Curve3) => {
        const box = objectBoxMap.get(c)!;
        return [box.min, box.max];
    };
    const tree = new Octree(newCC, getBounds, treeCenter, sizes + 100);
    const getIntersects = (c: Curve3) => {
        const cs = tree.getCandidateOverlaps(c, getBounds(c));
        return cs.filter(it => it !== c && objectBoxMap.get(c)!.intersectsBox(objectBoxMap.get(it)!));
    };

    // 线条和线条求交，打断线条, 找到可能重复的线
    const candOverlapCurves: Set<Curve3>[] = [];
    selfIntersectForCurves(newCC, getIntersects, candOverlapCurves, newCurveOldsMap);

    // 去除重复
    removeOverlapCurves(newCC, candOverlapCurves, newCurveOldsMap);
    return newCC;
}

function getCandidateSurfs(newCC: Curve3[], newNodel: Shell[], candPlanes: Array<Plane | Cylinder>): void {
    if (!candPlanes.length) {
        // 对于输入线条共线的情况，计算备选平面
        const ccBounding = new Box3();
        newCC.forEach(c => ccBounding.union(c.getBBox()));

        const faceEdges = new Set<Edge>();
        const validInvolvedEdges = new Set<Edge>();
        for (const shell of newNodel) {
            for (const face of shell.getFaces()) {
                const curSurf = face.getSurface();
                const faceBounding = face.getBBox();
                if (!faceBounding || !faceBounding.intersectsBox(ccBounding)) {
                    continue;
                }

                if (
                    (curSurf.isPlane() || curSurf.isCylinder()) &&
                    newCC.every(_ => curSurf.containsCurve(_, Tol.LENGTH))
                ) {
                    addCandPlane(candPlanes, curSurf);
                    face.getEdges().forEach(e => faceEdges.add(e));
                } else {
                    for (const edge of face.getEdges()) {
                        const edgeBounding = edge.getBBox();
                        if (!edgeBounding || !edgeBounding.intersectsBox(ccBounding)) {
                            continue;
                        }
                        validInvolvedEdges.add(edge);
                    }
                }
            }
        }

        faceEdges.forEach(e => validInvolvedEdges.delete(e));
        for (const curEdge of validInvolvedEdges) {
            const edgeSeg = curEdge.getCurve();
            for (const ccSeg of newCC) {
                const intersectResults = alg.X.curve3ds(ccSeg, edgeSeg);
                if (!intersectResults.length) {
                    continue;
                }

                let intersectPlane: Plane | undefined;
                if (edgeSeg instanceof Ln3) {
                    intersectPlane = Plane.makeByPoints([
                        ccSeg.getStartPt(),
                        ccSeg.getEndPt(),
                        edgeSeg.getStartPt(),
                        edgeSeg.getEndPt(),
                    ]);
                } else if (edgeSeg instanceof Arc3) {
                    const edgePlane = new Plane(edgeSeg.getCoord());
                    if (edgePlane.containsCurve(ccSeg)) {
                        intersectPlane = edgePlane;
                    }
                }

                if (intersectPlane) {
                    addCandPlane(candPlanes, intersectPlane);
                    break;
                }
            }
        }
    }

    // 调整平面的法向.
    // adjPiSurfs.forEach(plane => piSurs.push(adjustPiPlane(plane, curModel)));
}

function getCandidateFacesAndEdges(
    newCC: Curve3[],
    candPlane: Plane | Cylinder,
    newNodel: Shell[],
    candFaces: Set<Face>,
    candEdges: Set<Edge>,
    candVertices: Set<Vertex>,
) {
    if (!newNodel.length) {
        return;
    }
    const ccBounding = new Box3();
    newCC.forEach(c => ccBounding.union(c.getBBox()));
    if (!ccBounding.isValid()) {
        return;
    }

    // 获取有关联的面
    const involvedFaces = new Set<Face>();
    for (const shell of newNodel) {
        if (!shell || shell.getFaces().length === 0) {
            continue;
        }
        const faces = shell.getFaces();
        const facesBounding = faces.map(f => f.getBBox());

        const shellBounding = new Box3();
        facesBounding.forEach(box => shellBounding.union(box));
        if (!shellBounding.intersectsBox(ccBounding)) {
            continue;
        }

        for (let index = 0; index < faces.length; index++) {
            const faceBounding = facesBounding[index];
            if (faceBounding.intersectsBox(ccBounding)) {
                involvedFaces.add(faces[index]);
            }
        }
    }

    // 获取位于备选平面上的Face, Edge
    const partialInvovledFaces = new Set<Face>();
    for (const face of involvedFaces) {
        if (candPlane.isCoplanar(face.getSurface(), angleTol)) {
            candFaces.add(face);
        } else {
            partialInvovledFaces.add(face);
        }
    }

    for (const face of candFaces) {
        const edges = face.getEdges();
        edges.forEach(e => candEdges.add(e));
        const vertices = face.getVertexes();
        for (const vertex of vertices) {
            candVertices.add(vertex);
            for (const edge of vertex.getEdges()) {
                if (candEdges.has(edge)) {
                    continue;
                }
                const bc = edge.getCurve();
                if (bc && candPlane.containsCurve(bc)) {
                    candEdges.add(edge);
                    candVertices.add(edge.getStartVertex()!);
                    candVertices.add(edge.getEndVertex()!);
                }
            }
        }
    }

    for (const face of partialInvovledFaces) {
        for (const edge of face.getEdges()) {
            if (candEdges.has(edge)) {
                continue;
            }
            const bc = edge.getCurve()!;
            const edgeBounding = bc.getBBox();
            if (edgeBounding && edgeBounding.intersectsBox(ccBounding)) {
                candEdges.add(edge);
                candVertices.add(edge.getStartVertex());
                candVertices.add(edge.getEndVertex());
            }
        }
        for (const vertex of face.getVertexes()) {
            if (candPlane.containsPt(vertex.getPoint())) {
                candVertices.add(vertex);
            }
        }
    }
}

function addToIntersectionMap(target: Curve3 | Edge, vertex: Vertex, map: WeakMap<Curve3 | Edge, Set<Vertex>>): void {
    let ptsCollection: Set<Vertex> | undefined;
    if (!map.has(target)) {
        ptsCollection = new Set();
        map.set(target, ptsCollection);
    } else {
        ptsCollection = map.get(target);
    }

    ptsCollection!.add(vertex);
}

function intersectCurvesAndEdges(
    curves: Curve3[],
    edges: Set<Edge>,
    resultCurves: Curve3[],
    resultEdges: Set<Edge>,
    newCurveOldsMap: Map<Curve3 | Edge, Curve3[]>,
): void {
    // 收集已经存在的点.
    const allVertices: Set<Vertex> = new Set();
    for (const edge of edges) {
        allVertices.add(edge.getStartVertex());
        allVertices.add(edge.getEndVertex());
    }

    const intersectionMap: WeakMap<Curve3 | Edge, Set<Vertex>> = new WeakMap();
    for (const curve of curves) {
        for (const edge of edges) {
            const intersectResults = alg.X.curve3ds(curve, edge.getCurve());
            const interPts: Vec3[] = [];
            intersectResults.forEach(it => {
                if (it.isOverlap) {
                    interPts.push(curve.getPtAt(it.overlap1!.min));
                    interPts.push(curve.getPtAt(it.overlap1!.max));
                } else {
                    interPts.push(it.point);
                }
            });
            for (const interPt of interPts) {
                // try to find an existing vertex for the intersection point
                let intersectVertex: Vertex | undefined;
                for (const v of allVertices) {
                    if (v.getPoint().equals(interPt)) {
                        intersectVertex = v;
                        break;
                    }
                }

                // create new vertex
                if (!intersectVertex) {
                    intersectVertex = (edge.getParent() as Shell).createVertex(interPt);
                    allVertices.add(intersectVertex!);
                }

                addToIntersectionMap(curve, intersectVertex!, intersectionMap);
                addToIntersectionMap(edge, intersectVertex!, intersectionMap);
            }
        }
    }

    // 分割线条
    resultCurves.splice(0, resultCurves.length);
    for (const curve of curves) {
        if (!intersectionMap.has(curve)) {
            resultCurves.push(curve);
            continue;
        }

        const splits = GeomUtil.splitCurveByPoints(
            curve,
            Array.from(intersectionMap.get(curve)!).map(v => v.getPoint()),
        ) as Curve3[];
        if (splits.length > 0) {
            const olds = newCurveOldsMap.get(curve);
            for (const splitBC of splits) {
                SmoothUtil.copySmoothInfo(curve, splitBC);
                resultCurves.push(splitBC);
                if (olds) {
                    newCurveOldsMap.set(splitBC, olds);
                }
            }
            newCurveOldsMap.delete(curve);
        } else {
            resultCurves.push(curve);
        }
    }

    // 分割边
    resultEdges.clear();
    for (const edge of edges) {
        if (!intersectionMap.has(edge)) {
            resultEdges.add(edge);
            continue;
        }

        const splitEdges = splitEdgeByVertices(edge, Array.from(intersectionMap.get(edge)!));
        if (splitEdges.length > 1) {
            for (const e of splitEdges) {
                resultEdges.add(e);
            }
        } else {
            resultEdges.add(edge);
        }
    }
}

function createCurveEdges(
    newCC: Curve3[],
    allEdges: Set<Edge>,
    allVertices: Set<Vertex>,
    nonOverlapEdges: Set<Edge>,
    overlapEdges: Set<Edge>,
    newCurveOldsMap: Map<Curve3 | Edge, Curve3[]>,
): void {
    const existingVertexSet = new Set<Vertex>(allVertices);
    for (const edge of allEdges) {
        existingVertexSet.add(edge.getStartVertex());
        existingVertexSet.add(edge.getEndVertex());
    }

    // Create new edge for each curve.
    const tmpEdgeBCMap = new Map<Edge, Curve3>();
    allEdges.forEach(e => tmpEdgeBCMap.set(e, e.getCurve()!));
    for (const curve of newCC) {
        let curveEdge: Edge | undefined;
        // 判断是否和已有的边重叠
        for (const edge of allEdges) {
            if (
                alg.PJ.curvesOverlap(tmpEdgeBCMap.get(edge)!, curve) ===
                alg.CurvesPJType.TOTALLY_OVERLAP
            ) {
                curveEdge = edge;
                overlapEdges.add(curveEdge);
                break;
            }
        }

        // 创建新的边
        if (!curveEdge) {
            let startVertex: Vertex | undefined;
            let endVertex: Vertex | undefined;
            for (const oldV of existingVertexSet) {
                if (oldV.getPoint().equals(curve.getStartPt())) {
                    startVertex = oldV;
                    break;
                }
            }
            if (!startVertex) {
                startVertex = new Vertex(curve.getStartPt());
                existingVertexSet.add(startVertex);
            }

            // Search end vertex.
            for (const oldV of existingVertexSet) {
                if (oldV.getPoint().equals(curve.getEndPt())) {
                    endVertex = oldV;
                    break;
                }
            }
            if (!endVertex) {
                endVertex = new Vertex(curve.getEndPt());
                existingVertexSet.add(endVertex);
            }

            // Create non-overlapped edge
            const edgeCurve = curve.clone();
            curveEdge = new Edge(edgeCurve, startVertex, endVertex);
            nonOverlapEdges.add(curveEdge);
            SmoothUtil.copySmoothInfo(curve, curveEdge);
        }

        const olds = newCurveOldsMap.get(curve);
        if (olds) {
            newCurveOldsMap.set(curveEdge, olds);
            newCurveOldsMap.delete(curve);
        }
    }
}

function intersectCurvesWithCandidates(
    newCC: Curve3[],
    candEdges: Set<Edge>,
    candVertices: Set<Vertex>,
    nonOverlapEdges: Set<Edge>,
    overlapEdges: Set<Edge>,
    modifiedShellsMap: Map<Shell, IShellModifyInfo>,
    newCurveOldsMap: Map<Curve3 | Edge, Curve3[]>,
): void {
    // 收集受到影响的shell.
    for (const candEdge of candEdges) {
        const parent = candEdge.getParent() as Shell;
        if (parent) {
            addShellModifyInfo(modifiedShellsMap!, parent);
        }
    }

    let edgeSet = new Set<Edge>(candEdges);
    if (edgeSet.size) {
        const resultEdges = new Set<Edge>();
        const resultCurves: Curve3[] = [];
        intersectCurvesAndEdges(newCC, edgeSet, resultCurves, resultEdges, newCurveOldsMap);

        newCC.splice(0, newCC.length);
        newCC.push(...resultCurves);
        edgeSet = resultEdges;
    }

    createCurveEdges(newCC, edgeSet, candVertices, nonOverlapEdges, overlapEdges, newCurveOldsMap);
}

function calCurveEdgesPosition(
    candFaces: Set<Face>,
    nonOverlapEdges: Edge[],
    overlapEdges: Edge[],
    insideCurveEdgesMap: Map<Face, Edge[]>,
    outsideCurveEdges: Edge[],
): void {
    const facePolygonMap = new Map<Face, Polygon>();
    const calPosition = (curveEdges: Edge[], overlap: boolean) => {
        for (const curveEdge of curveEdges) {
            const middlePt = curveEdge.getCurve()!.getMidPt();
            let insideFace: Face | undefined;
            for (const face of candFaces) {
                let polygon = facePolygonMap.get(face);
                if (!polygon) {
                    polygon = face.calcPolygon();
                    facePolygonMap.set(face, polygon);
                }

                const surf = face.getSurface();
                if (!surf.containsPt(middlePt)) {
                    continue;
                }
                if (
                    alg.PtLoopPJType.IN === alg.PJ.ptToPolygon(surf.getUVAt(middlePt), polygon)
                ) {
                    insideFace = face;
                    break;
                }
            }
            if (insideFace) {
                addToListInMap(insideCurveEdgesMap, insideFace, curveEdge);
            } else if (!overlap) {
                outsideCurveEdges.push(curveEdge);
            }
        }
    };

    calPosition(nonOverlapEdges, false);
    calPosition(overlapEdges, true);
}

interface IEdgeValidFlag {
    // positive direction is valid flag
    validP?: boolean;
    // negative direction is valid flag
    validN?: boolean;
    // all direction is valid flag
    valid?: boolean;
}

function calSplitFaceResult(face: Face, curveEdges: Edge[], faceSplitResultMap: Map<Face, VirtualFace[]>): void {
    function updateValidInfo(vLoop: VirtualLoop, eMap: Map<Edge, IEdgeValidFlag>, edgeSet: Set<Edge>) {
        // 更新有效信息
        for (const ve of vLoop.edges) {
            edgeSet.add(ve.edge);
            const tmpFlag = eMap.get(ve.edge);
            if (tmpFlag) {
                if (ve.bSameDir) {
                    tmpFlag.validP = false;
                } else {
                    tmpFlag.validN = false;
                }
            }
        }
    }
    function detectNewSplitLoops(
        pln: Plane,
        eValidMap: Map<Edge, IEdgeValidFlag>,
        newVLoops: VirtualLoop[],
        usedEdges: Set<Edge>,
    ) {
        for (const [edge, flag] of eValidMap) {
            if (flag.validP) {
                // 正向搜环
                const virLoop = detectLoopFromEdges(edge, true, pln, true);
                if (virLoop) {
                    updateValidInfo(virLoop, eValidMap, usedEdges);
                    newVLoops.push(virLoop);
                }
            }
            if (flag.validN) {
                // 反向搜环
                const virLoop = detectLoopFromEdges(edge, false, pln, true);
                if (virLoop) {
                    updateValidInfo(virLoop, eValidMap, usedEdges);
                    newVLoops.push(virLoop);
                }
            }
        }
    }

    // 初始化有效信息
    const edgeValidMap: Map<Edge, IEdgeValidFlag> = new Map();
    curveEdges.forEach(e => edgeValidMap.set(e, { validP: true, validN: true }));

    const surf = face.getSurface();
    const newLoops: VirtualLoop[] = [];
    const usedEdgesSet = new Set<Edge>();
    if (surf.isCylinder()) {
        // 柱面分割特殊处理
        const allEdges = new Set<Edge>(curveEdges);
        face.getEdges().forEach(_ => allEdges.add(_));
        const simpleDetect = (edge: Edge, dir: boolean) => {
            const vl = new VirtualLoop();
            vl.add(edge, dir);
            let curCo: Coedge3d | undefined;
            const sv = dir ? edge.getStartVertex() : edge.getEndVertex();
            let ev = dir ? edge.getEndVertex() : edge.getStartVertex();
            while (sv !== ev) {
                const tmpCandEs = ev.getEdges().filter(_ => allEdges.has(_));
                if (!tmpCandEs.length) {
                    break;
                }
                if (curCo) {
                    const tmpEs = tmpCandEs.filter(_ => curveEdges.findIndex(e => e === _) > -1);
                    if (tmpEs.length) {
                        curCo = undefined;
                        const tmpDir = tmpEs[0].getStartVertex() === ev;
                        vl.add(tmpEs[0], tmpDir);
                        ev = tmpDir ? tmpEs[0].getEndVertex() : tmpEs[0].getStartVertex();
                    } else {
                        curCo = curCo.getNextCoedge()!;
                        vl.add(curCo.getEdge()!, curCo.getSameDirWithEdge());
                        ev = curCo.getEndVertex();
                    }
                } else {
                    const tmpEs = tmpCandEs.filter(_ => face.getEdges().findIndex(e => e === _) > -1);
                    if (tmpEs.length) {
                        for (const tmpe of tmpEs) {
                            for (const tmpCo of tmpe.getCoedge3ds()) {
                                if (tmpCo.getWire()?.getFace() === face && tmpCo.getStartVertex() === ev) {
                                    curCo = tmpCo;
                                }
                            }
                        }
                        if (!curCo) {
                            break;
                        }
                        vl.add(curCo.getEdge()!, curCo.getSameDirWithEdge());
                        ev = curCo.getEndVertex();
                    } else {
                        const ttedge = vl.edges[vl.edges.length - 1].edge;
                        tmpCandEs.sort((a, b) => (a === ttedge ? 1 : 0) - (b === ttedge ? 1 : 0));
                        const tmpDir = tmpCandEs[0].getStartVertex() === ev;
                        vl.add(tmpCandEs[0], tmpDir);
                        ev = tmpDir ? tmpCandEs[0].getEndVertex() : tmpCandEs[0].getStartVertex();
                    }
                }
            }
            updateValidInfo(vl, edgeValidMap, new Set());
            const hasLine = vl.edges.some(_ => _.edge.getCurve().isLine3d());
            const hasArc = vl.edges.some(_ => _.edge.getCurve().isArc3d());
            if (hasLine && hasArc && vl.edges.length > 1 && sv === ev) {
                const ttset = new Set();
                vl.edges.forEach(_ => ttset.add(_));
                if (ttset.size === vl.edges.length) {
                    newLoops.push(vl);
                }
            }
        };
        for (const [edge, flag] of edgeValidMap) {
            if (flag.validP) {
                // 正向搜环
                simpleDetect(edge, true);
            }
            if (flag.validN) {
                // 反向搜环
                simpleDetect(edge, false);
            }
        }

        if (newLoops.length === 2) {
            const virtualFaces = newLoops.map(vl => new VirtualFace([vl], surf as any));
            faceSplitResultMap.set(face, virtualFaces);
        }
        return;
    }

    detectNewSplitLoops(surf as Plane, edgeValidMap, newLoops, usedEdgesSet);

    // if get new loops from the inside edge group, add it to face split map.
    if (newLoops.length) {
        // check face's origin loops could be reused.
        edgeValidMap.clear();
        for (const loop of face.getWires()) {
            if (loop.getCoedge3ds().some(he => usedEdgesSet.has(he.getEdge()!))) {
                for (const he of loop.getCoedge3ds()) {
                    if (!usedEdgesSet.has(he.getEdge()!)) {
                        if (he.getSameDirWithEdge()) {
                            edgeValidMap.set(he.getEdge()!, { validP: true, validN: false });
                        } else {
                            edgeValidMap.set(he.getEdge()!, { validP: false, validN: true });
                        }
                    }
                }
            } else {
                // reuse face's origin loops if all of it edges are not used.
                const vLoop = new VirtualLoop();
                loop.getCoedge3ds().forEach(he => vLoop.add(he.getEdge()!, he.getSameDirWithEdge()));
                newLoops.push(vLoop);
            }
        }

        // 使用面中一部分没用过的边，再次搜环
        detectNewSplitLoops(surf as Plane, edgeValidMap, newLoops, usedEdgesSet);

        // 生成虚拟的面
        const virtualFaces = virtualLoopsToFaces(newLoops, surf as Plane);
        faceSplitResultMap.set(face, virtualFaces);
    }
}

function createOppositeLoop(loop: VirtualLoop) {
    const newLoop = new VirtualLoop();
    loop.edges.forEach(e => newLoop.add(e.edge, !e.bSameDir));
    newLoop.edges.reverse();
    newLoop.bc3ds.reverse();
    return newLoop;
}

function getEdgeValidInfo(e: Edge, eValidMap: Map<Edge, IEdgeValidFlag>, plane: Plane) {
    let validInfo = eValidMap.get(e);
    if (!validInfo) {
        validInfo = { validP: true, validN: true };
        eValidMap.set(e, validInfo);
        for (const he of e.getCoedge3ds()) {
            if (he) {
                const surface = (he.getWire()!.getParent() as Face).getSurface()!;
                if (surface instanceof Plane && surface.getNorm().isParallel(plane.getNorm())) {
                    if (he.getSameDirWithEdge() === surface.getNorm().isSameDirection(plane.getNorm())) {
                        validInfo.validP = false;
                    } else {
                        validInfo.validN = false;
                    }
                }
            }
        }
    }
    return validInfo;
}

function checkVirtualLoop(
    loop: VirtualLoop,
    eValidMap: Map<Edge, IEdgeValidFlag>,
    piPlane: Plane,
): VirtualLoop | undefined {
    const bPositive = loop.getArea(piPlane) > 0;
    for (const ve of loop.edges) {
        const validInfo = getEdgeValidInfo(ve.edge, eValidMap, piPlane)!;
        if ((ve.bSameDir === bPositive && !validInfo.validP) || (ve.bSameDir !== bPositive && !validInfo.validN)) {
            return undefined;
        }
    }
    return loop;
}

function updateEdgeValidInfo(
    edge: Edge,
    sameDir: boolean,
    edgeGroupValidMap: Map<Edge, IEdgeValidFlag>,
    plane: Plane,
    bValid: boolean,
): void {
    const tmpFlag = getEdgeValidInfo(edge, edgeGroupValidMap, plane);
    if (bValid) {
        if (sameDir) {
            tmpFlag.validP = false;
        } else {
            tmpFlag.validN = false;
        }
    } else {

        if (sameDir) {
            tmpFlag.validN = false;
        } else {
            tmpFlag.validP = false;
        }
    }
}

// 全部都是新加边的情况，不会使用模型中已经存在的面、边
// 适用于新加的边outsideCurveEdges，存在嵌套环的情况
function detectNewFacesPure(outsideCurveEdges: Edge[], piPlane: Plane, virtualFaces: VirtualFace[]): void {
    const edgeValidMap: Map<Edge, IEdgeValidFlag> = new Map();
    const outerEdges = outsideCurveEdges.slice();
    for (const edge of outerEdges) {
        edgeValidMap.set(edge, { validP: true, validN: true });
    }
    const newLoops: VirtualLoop[] = [];

    function addVirtualLoop(vloop: VirtualLoop, eVlid: Map<Edge, IEdgeValidFlag>) {
        let valid = true;
        for (const ve of vloop.edges) {
            const validInfo = eVlid.get(ve.edge)!;
            if ((ve.bSameDir && !validInfo.validP) || (!ve.bSameDir && !validInfo.validN)) {
                valid = false;
            }
        }
        if (valid) {
            newLoops.push(vloop);
            vloop.edges.forEach(he => {
                const validInfo = eVlid.get(he.edge)!;
                if (he.bSameDir) {
                    validInfo.validP = false;
                } else {
                    validInfo.validN = false;
                }
            });
        }
    }

    for (const edge of outerEdges) {
        const flag = edgeValidMap.get(edge)!;
        if (flag.validP && flag.validN) {
            const virLoop1 = detectLoopFromEdges(edge, true, piPlane, true);
            if (virLoop1 && virLoop1.edges.filter(re => re.edge === edge).length > 1) {
                continue;
            }
            const virLoop2 = detectLoopFromEdges(edge, false, piPlane, true);
            if (virLoop2 && virLoop2.edges.filter(re => re.edge === edge).length > 1) {
                continue;
            }

            if (virLoop1) {
                addVirtualLoop(virLoop1, edgeValidMap);
            }
            if (virLoop2) {
                addVirtualLoop(virLoop2, edgeValidMap);
            }
        } else if (flag.validP || flag.validN) {
            // 往一个方向搜索
            const startEdge = edge;
            const sameDir = !!flag.validP;
            const virLoop = detectLoopFromEdges(startEdge, sameDir, piPlane, true);
            if (!virLoop || (virLoop && virLoop.edges.filter(re => re.edge === startEdge).length > 1)) {
                continue;
            }
            addVirtualLoop(virLoop, edgeValidMap);
        }
    }
    if (newLoops.length) {
        virtualFaces.push(...virtualLoopsToFaces(newLoops, piPlane, true));
    }
}

// 适用于新加的边outsideCurveEdges，不会产生嵌套环的情况
function detectNewFaces(
    outsideCurveEdges: Edge[],
    overlapEdges: Set<Edge>,
    piPlane: Plane,
    virtualFaces: VirtualFace[],
): void {
    const edgeValidMap: Map<Edge, IEdgeValidFlag> = new Map();
    const outerEdges = outsideCurveEdges.slice();
    overlapEdges.forEach(e => outerEdges.push(e));

    for (const edge of outerEdges) {
        if (overlapEdges.has(edge)) {
            getEdgeValidInfo(edge, edgeValidMap, piPlane);
        } else {
            edgeValidMap.set(edge, { validP: true, validN: true });
        }
    }

    function addVirtualFaceFromLoop(
        p: Plane,
        dir: boolean,
        vloop: VirtualLoop,
        eVlid: Map<Edge, IEdgeValidFlag>,
        vFaces: VirtualFace[],
    ) {
        if (checkVirtualLoop(vloop, eVlid, p)) {
            vFaces.push(new VirtualFace([dir ? vloop : createOppositeLoop(vloop)], p));
            vloop.edges.forEach(he => updateEdgeValidInfo(he.edge, he.bSameDir === dir, edgeValidMap, p, true));
        }
    }

    for (const edge of outerEdges) {
        const flag = edgeValidMap.get(edge)!;
        if (flag.validP && flag.validN) {
            // 往左右两个方向搜索
            const virLoop1 = detectLoopFromEdges(edge, true, piPlane, true);
            if (virLoop1 && virLoop1.edges.filter(re => re.edge === edge).length > 1) {
                continue;
            }

            const virLoop2 = detectLoopFromEdges(edge, true, piPlane, false);
            if (virLoop2 && virLoop2.edges.filter(re => re.edge === edge).length > 1) {
                continue;
            }

            if (virLoop1 && virLoop2) {
                const bPositive1 = virLoop1.getArea(piPlane) > 0;
                const bPositive2 = virLoop2.getArea(piPlane) > 0;
                if (bPositive1 !== bPositive2) {
                    // 一正一反，两个结果都保留
                    addVirtualFaceFromLoop(piPlane, bPositive1, virLoop1, edgeValidMap, virtualFaces);
                    addVirtualFaceFromLoop(piPlane, bPositive2, virLoop2, edgeValidMap, virtualFaces);
                } else {
                    // 两个方向相同，保留小的环
                    let smallResult: VirtualLoop;
                    let bigResult: VirtualLoop;
                    if (
                        Util.isNearlyBigger(
                            Math.abs(virLoop1.getArea(piPlane)),
                            Math.abs(virLoop2.getArea(piPlane)),
                        )
                    ) {
                        smallResult = virLoop2;
                        bigResult = virLoop1;
                    } else {
                        smallResult = virLoop1;
                        bigResult = virLoop2;
                    }

                    addVirtualFaceFromLoop(piPlane, bPositive1, smallResult, edgeValidMap, virtualFaces);
                    bigResult.edges.forEach(he =>
                        updateEdgeValidInfo(he.edge, he.bSameDir === bPositive1, edgeValidMap, piPlane, false),
                    );
                }
            } else if (virLoop1 || virLoop2) {
                const virLoop = (virLoop1 || virLoop2)!;
                const bPositive = virLoop.getArea(piPlane) > 0;
                addVirtualFaceFromLoop(piPlane, bPositive, virLoop, edgeValidMap, virtualFaces);
            }
        } else if (flag.validP || flag.validN) {
            // 往一个方向搜索
            const startEdge = edge;
            const sameDir = !!flag.validP;
            const virLoop = detectLoopFromEdges(startEdge, sameDir, piPlane, true);
            if (!virLoop || (virLoop && virLoop.edges.filter(re => re.edge === startEdge).length > 1)) {
                continue;
            }

            const bPositive = virLoop.getArea(piPlane) > 0;
            addVirtualFaceFromLoop(piPlane, bPositive, virLoop, edgeValidMap, virtualFaces);
        }
    }
}

function findBoundaryEdges(candFaces: Set<Face>, piPlane: Plane): Set<Edge> {
    const edgeSet = new Set<Edge>();
    for (const face of candFaces) {
        face.getEdges().forEach(e => edgeSet.add(e));
    }

    const boundaryEdges = new Set<Edge>();
    for (const edge of edgeSet) {
        let count = 0;
        const neighborFaces = edge.getCoedge3ds().map(coeg => coeg.getWire()!.getParent() as Face);
        for (const face of neighborFaces) {
            const facePln = face.getSurface();
            if (facePln instanceof Plane && facePln.isCoplanar(piPlane, angleTol)) {
                count++;
            }
            if (count > 1) {
                break;
            }
        }
        if (count <= 1) {
            boundaryEdges.add(edge);
        }
    }

    return boundaryEdges;
}

function patchInnerLoopForNewFaces(virtualFaces: VirtualFace[], boundaryLoops: VirtualLoop[], plane: Plane): void {
    function isLoopInOtherLoop(loop: VirtualLoop, outerLoop: VirtualLoop): boolean {
        return loop.approxPts.every(
            pt2d =>
                alg.PJ.ptToLoop(pt2d, new Loop(outerLoop.bc2ds)).type === alg.PtLoopPJType.IN,
        );
    }

    virtualFaces.forEach(f => f.loops.forEach(l => l.prepareData(plane)));
    boundaryLoops.forEach(l => l.prepareData(plane));

    // 找到大的边界环（不被其他环所包含）.
    const copyBoundaryLoops = boundaryLoops.slice();
    // eslint-disable-next-line no-param-reassign
    boundaryLoops = boundaryLoops.filter(loop => {
        for (const otherLoop of copyBoundaryLoops) {
            if (otherLoop === loop) {
                continue;
            }
            if (isLoopInOtherLoop(loop, otherLoop)) {
                return false;
            }
        }
        return true;
    });

    // Check if boundaryLoops are in new faces.
    for (const face of virtualFaces) {
        const outerLoop = face.outerLoop();
        for (const loop of boundaryLoops) {
            if (!loop.box.intersectsBox(outerLoop.box)) {
                continue;
            }

            if (isLoopInOtherLoop(loop, outerLoop)) {
                const bSameDirection = outerLoop.getArea(plane) > 0 === loop.getArea(plane) > 0;
                const innerLoop = bSameDirection ? createOppositeLoop(loop) : loop;
                face.addInnerLoop(innerLoop);
            }
        }
    }
}

function calNewFacesResult(
    outsideCurveEdges: Edge[],
    overlapEdges: Set<Edge>,
    candFaces: Set<Face>,
    piPlane: Plane,
    virtualFaces: VirtualFace[],
): void {
    if (!outsideCurveEdges.length && !overlapEdges.size) {
        return;
    }

    const tmpEdges = new Set<Edge>();
    outsideCurveEdges.forEach(_ => {
        _.getStartVertex()
            .getEdges()
            .forEach(e => tmpEdges.add(e));
        _.getEndVertex()
            .getEdges()
            .forEach(e => tmpEdges.add(e));
    });
    // Detect loop from outside edge groups and create virtual faces.
    if (!overlapEdges.size && outsideCurveEdges.length === tmpEdges.size) {
        // 全部都是新加边的情况，不会使用模型中已经存在的面、边
        detectNewFacesPure(outsideCurveEdges, piPlane, virtualFaces);
    } else {
        detectNewFaces(outsideCurveEdges, overlapEdges, piPlane, virtualFaces);
    }
    if (!virtualFaces.length) {
        return;
    }

    // Get boundary edges from candidate faces.
    const boundaryEdges = findBoundaryEdges(candFaces, piPlane);
    if (!boundaryEdges.size) {
        return;
    }
    virtualFaces.forEach(vf => vf.loops.forEach(vl => vl.edges.forEach(e => boundaryEdges.delete(e.edge))));

    // Detect boundary loop from boundary edges.
    const boundaryLoops: VirtualLoop[] = [];
    const edgeValidMap: Map<Edge, IEdgeValidFlag> = new Map();
    boundaryEdges.forEach(e => edgeValidMap.set(e, { valid: true }));
    for (const [edge, flag] of edgeValidMap) {
        if (flag.valid) {
            const virLoop = detectLoopFromEdges(edge, true, piPlane, true, boundaryEdges);
            if (virLoop && virLoop.edges.every(e => !edgeValidMap.get(e.edge) || edgeValidMap.get(e.edge)?.valid)) {
                // update result and map.
                boundaryLoops.push(virLoop);
                for (const ve of virLoop.edges) {
                    const tmpFlag = edgeValidMap.get(ve.edge);
                    if (tmpFlag) {
                        tmpFlag.valid = false;
                    }
                    boundaryEdges.delete(ve.edge);
                }
            }
        }
    }

    if (!boundaryLoops.length) {
        return;
    }

    // Patch inner loops for virtual faces(the detect loop result).
    patchInnerLoopForNewFaces(virtualFaces, boundaryLoops, piPlane);
}

function addNewFace(face: Face, shell: Shell) {
    shell.addFace(face);
    face.getEdges().forEach(e => shell.addEdge(e));
    face.getVertexes().forEach(v => shell.addVertex(v));
}

function getNeighborShell(face: Face): Shell | undefined {
    for (const vertex of face.getVertexes()) {
        const shell = vertex.getParent() as Shell;
        if (shell) {
            return shell;
        }
    }
    return undefined;
}

function generateTopoFaces(
    faceSplitResultMap: Map<Face, VirtualFace[]>,
    virtualFaces: VirtualFace[],
    newNodel: Shell[],
    nonOverlapEdges: Set<Edge>,
    smoothPolyEdges: Set<Edge>,
    result: IAddEdgesResult,
): void {
    // 分割面.
    for (const [oldFace, vSplitFaces] of faceSplitResultMap) {
        const newFaces: Face[] = [];
        for (const vSplitFace of vSplitFaces) {
            const newWires = vSplitFace.loops.map(l => {
                const coedges = l.edges.map(e => new Coedge3d(e.edge, e.bSameDir));
                return new Wire(coedges);
            });
            newFaces.push(new Face(vSplitFace.plane.clone(), oldFace.getSameDirWithSurface(), newWires));
        }

        const shell = oldFace.getShell()!;
        if (newFaces.length) {
            newFaces.forEach(f => addNewFace(f, shell));

            // remove origin face
            disposeFace(oldFace);
            addShellModifyInfo(result.modifiedShellsMap!, shell, newFaces, [oldFace]);
        }
        result.faceSplitMap.set(oldFace, newFaces);
    }

    // Create new outer faces.
    for (const virtualFace of virtualFaces) {
        const newFace = new Face(virtualFace.plane.clone(), true);
        const newWires = virtualFace.loops.map(l => {
            const halfEdges = l.edges.map(e => new Coedge3d(e.edge, e.bSameDir));
            return new Wire(halfEdges);
        });
        newFace.setWires(newWires);

        // Get shell from neighbor faces.
        let shell = getNeighborShell(newFace);
        if (!shell) {
            shell = new Shell();
            newNodel.push(shell);
            result.addShells!.push(shell);
        } else {

            if (result.addShells!.indexOf(shell) < 0) {
                addShellModifyInfo(result.modifiedShellsMap!, shell, [newFace]);
            }
        }
        addNewFace(newFace, shell);

        // Adjust new face direction.
        // adjustNewFaceDirection(newFace, nonOverlapEdges);

        result.newOuterFaces.push(newFace);
    }

    // Clear those edges which are created from composite curve, and not used in the add edge process.
    for (const e of nonOverlapEdges) {
        if (!e.getCoedge3ds().length) {
            e.dispose();
            continue;
        }
        if (SmoothUtil.hasSmoothInfo(e)) {
            smoothPolyEdges.add(e);
        }
    }
}

function updateSmoothInfo(result: IAddEdgesResult, smoothPolyEdges: Set<Edge>) {
    // 更新已有的
    const affectFaces = result.newOuterFaces.slice();
    for (const value of result.faceSplitMap.values()) {
        affectFaces.push(...value);
    }
    affectFaces.forEach(f => {
        SmoothUtil.udpateSmoothVertices(new Set(f.getVertexes()));
    });

    // 更新新添加的
    if (!smoothPolyEdges.size) {
        return;
    }

    // 往shell里面添加连续边信息
    ContinuousUtil.addContinuousEdgeInfo(Array.from(smoothPolyEdges), (e: Edge) =>
        SmoothUtil.getSmoothInfo(e)?.getCurve(),
    );

    // 更新vertex标记
    for (const smoothEdge of smoothPolyEdges) {
        SmoothUtil.clearSmoothInfo(smoothEdge);

        const vA = smoothEdge.getStartVertex();
        const vB = smoothEdge.getEndVertex();
        if (!vA.getSmooth() && vA.getEdges().length === 2 && vA.getEdges().every(e => smoothPolyEdges.has(e))) {
            vA.setSmooth(true);
        }
        if (!vB.getSmooth() && vB.getEdges().length === 2 && vB.getEdges().every(e => smoothPolyEdges.has(e))) {
            vB.setSmooth(true);
        }
    }
}

export interface IAddEdgesResult extends IShellModelingResult {
    faceSplitMap: Map<Face, Face[]>;
    newOuterFaces: Face[];
}

export function addEdgesCore(
    cc: Curve3[],
    curvePlane: Plane | Cylinder | undefined,
    model: Shell[],
    result: IAddEdgesResult,
): void {
    result.addShells = [];
    result.modifiedShellsMap = new Map();

    // 0. 检测输入的线条是否满足条件（在一个surface上面）
    let newCC = SmoothUtil.decomposeSmoothPoly(cc.slice()) as Curve3[];
    let candSurfaces: Array<Plane | Cylinder> = [];
    if (curvePlane) {
        candSurfaces = [curvePlane];
    } else {
        const checkResult = checkConditions(newCC, result);
        if (!checkResult.state) {
            return;
        }
        candSurfaces = checkResult.surfs;
    }

    // 1. 求交打断原始线条
    const newCurveOldsMap = new Map<Curve3 | Edge, Curve3[]>();
    newCC = pretreatCurves(newCC, newCurveOldsMap);
    if (!newCC.length) {
        result.errorStr = errorCCValid;
        return;
    }

    // 2. 计算备选平面/圆柱面
    const newModel = model.slice();
    getCandidateSurfs(newCC, newModel, candSurfaces);
    if (!candSurfaces.length) {
        result.errorStr = errorNoValidPlanes;
        return;
    }

    const smoothPolyEdges: Set<Edge> = new Set();
    for (const piSurf of candSurfaces) {
        // 3. 找到可能发生关系的Face, Edge, Vertex
        const candFaces = new Set<Face>();
        const candEdges = new Set<Edge>();
        const candVertices = new Set<Vertex>();
        getCandidateFacesAndEdges(newCC, piSurf, newModel, candFaces, candEdges, candVertices);

        // 3.1 合并重叠的vertex, edge(针对某些有问题的模型)
        // mergeCandidates(candEdges, candVertices, modifiedShells);

        // 4. 输入线条和边求交，打断边，并将线条分组
        const overlapEdges: Set<Edge> = new Set();
        const nonOverlapEdges: Set<Edge> = new Set();
        intersectCurvesWithCandidates(
            newCC,
            candEdges,
            candVertices,
            nonOverlapEdges,
            overlapEdges,
            result.modifiedShellsMap!,
            newCurveOldsMap,
        );

        // 5. 判断线条生成的边和已有面之间的位置关系
        const insideCurveEdgesMap = new Map<Face, Edge[]>();
        const outsideCurveEdges: Edge[] = [];
        calCurveEdgesPosition(
            candFaces,
            Array.from(nonOverlapEdges),
            Array.from(overlapEdges),
            insideCurveEdgesMap,
            outsideCurveEdges,
        );

        // 6. 分割已有面
        const faceSplitResultMap = new Map<Face, VirtualFace[]>();
        for (const curFace of candFaces) {
            const insideEdges = insideCurveEdgesMap.get(curFace);
            if (insideEdges) {
                try {
                    calSplitFaceResult(curFace, insideEdges, faceSplitResultMap);
                } catch (e) {
                    if (e instanceof Error) {
                        result.errorStr = e.message;
                    }
                }
            }
        }

        // 7. 创建新的面
        const virtualFaces: VirtualFace[] = [];
        if (piSurf.isPlane()) {
            try {
                calNewFacesResult(outsideCurveEdges, overlapEdges, candFaces, piSurf, virtualFaces);
            } catch (e) {
                // consoleLogInDev(e);
                if (e instanceof Error) {
                    result.errorStr = e.message;
                }
            }
        }

        // 8. 构造真实的拓扑关系
        generateTopoFaces(faceSplitResultMap, virtualFaces, newModel, nonOverlapEdges, smoothPolyEdges, result);
    }

    // 9. 合并shell
    const tmpFaces = Array.from(result.faceSplitMap.values()).flat();
    result.newOuterFaces.forEach(it => tmpFaces.push(it));
    const mergeResult = mergeShells(tmpFaces);
    mergeResult.deleteShell.forEach(s => {
        if (result.modifiedShellsMap?.has(s)) {
            result.modifiedShellsMap.delete(s);
        }
    });
    for (const [shell, faces] of mergeResult.addFaceMap) {
        addShellModifyInfo(result.modifiedShellsMap!, shell, faces);
    }
    result.deleteShells = model.filter(s => !s.getFaces().length);
    result.addShells = result.addShells!.filter(s => s.getFaces().length);
    result.evolutionMap = new Map();
    for (const [key, values] of result.faceSplitMap) {
        values.forEach(it => addEvolutionInfo(result, key, it));
    }
    for (const [key, values] of newCurveOldsMap) {
        if (!(key instanceof Edge)) {
            continue;
        }
        values.forEach(it => addEvolutionInfo(result, it, key));
    }

    // 10. Update vertices' smooth flags
    updateSmoothInfo(result, smoothPolyEdges);
}