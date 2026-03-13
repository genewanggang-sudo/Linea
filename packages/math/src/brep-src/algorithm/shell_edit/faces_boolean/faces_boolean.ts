import {
    Surface,
    Curve3,
    alg,
    Curve2,
    Tol,
    Vec3,
    Box3,
    MathAssert,
    Util,
    Vec2,
    Cylinder,
    Ln2,
    Arc3,
    Coord3,
} from '../../../..';
import { Face } from '../../../brep/face';
import { Shell } from '../../../brep/shell';
import { Vertex } from '../../../brep/vertex';
import { Edge } from '../../../brep/edge';
import { mergeShells } from '../operator/merge_shell';
import { Coedge3d } from '../../../brep/coedge3d';
import { Wire } from '../../../brep/wire';
import { disposeFace } from '../operator/dispose_topo';
import {
    IShellModelingResult,
    addShellModifyInfo,
    IShellModifyInfo,
    mergeShellModelingResult,
    addEvolutionInfo,
} from '../shell_modeling_result';
import { SmoothUtil } from '../smooth/smooth_util';
import { splitEdgeByVertices } from '../operator/split_edge';
import { mergeOverlapEdges } from '../operator/merge_overlap_edge';
import { mergeVertices } from '../operator/merge_vertex';



const errorNotSupportBooleanType = '暂不支持的布尔类型';
const errorCylinderFace = '输入的圆柱面存在跨周期问题';
// const errorPeriodSweepFace = 'Sweep存在跨周期问题';

export function addToSetInMap(map: Map<any, any>, key: any, value: any) {
    let list = map.get(key);
    if (!list) {
        list = new Set();
        map.set(key, list);
    }
    list.add(value);
}

export function addOverlapInfo<T>(infos: Set<T>[], a: T, b: T) {
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

function intersectEdges(
    edgeSet: Set<Edge>,
    overlapEdges: Set<Edge>[],
    modifiedShellsMap: Map<Shell, IShellModifyInfo>,
): void {
    // 收集被修改的shell.
    function addModifyShell(e: Edge, map: Map<Shell, IShellModifyInfo>) {
        const parent = e.getParent() as Shell;
        if (parent && !map.get(parent)) {
            map.set(parent, { addFaces: [], deleteFaces: [], modifiedFaces: [] });
        }
    }

    const edges = Array.from(edgeSet);
    const allVertices = new Set<Vertex>();
    const edgeCurves: Curve3[] = [];
    const edgeBoxs: Box3[] = [];
    edges.forEach(e => {
        const bc = e.getCurve()!;
        edgeCurves.push(bc);
        edgeBoxs.push(bc.getBBox());

        allVertices.add(e.getStartVertex());
        allVertices.add(e.getEndVertex());
    });

    const intersectionMap: Map<Edge, Set<Vertex>> = new Map();
    const overlapInfos: Set<number>[] = [];

    // 求交
    for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
            if (!edgeBoxs[i].intersectsBox(edgeBoxs[j])) {
                continue;
            }

            const intersectResults = alg.X.curve3ds(edgeCurves[i], edgeCurves[j]);
            const interPts: Vec3[] = [];
            let overlap = false;
            intersectResults.forEach(it => {
                if (it.isOverlap) {
                    interPts.push(edgeCurves[i].getPtAt(it.overlap1!.min));
                    interPts.push(edgeCurves[i].getPtAt(it.overlap1!.max));
                    overlap = true;
                } else {
                    interPts.push(it.point);
                }
            });
            if (!interPts.length) {
                continue;
            }

            if (overlap) {
                addOverlapInfo(overlapInfos, i, j);
            }
            addModifyShell(edges[i], modifiedShellsMap);
            addModifyShell(edges[j], modifiedShellsMap);

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
                    intersectVertex = (edges[i].getParent() as Shell).createVertex(interPt);
                    // if two edges are isSoft, the intersect vertex will be isSoft
                    // intersectVertex.isSoft = edges[i].isSoft && edges[j].isSoft;

                    allVertices.add(intersectVertex!);
                }

                addToSetInMap(intersectionMap, edges[i], intersectVertex);
                addToSetInMap(intersectionMap, edges[j], intersectVertex);
            }
        }
    }

    // 分割边
    const edgeSplitMap = new Map<number, Edge[]>();
    for (let index = 0; index < edges.length; index++) {
        const splitVs = intersectionMap.get(edges[index]);
        if (!splitVs) {
            edgeSplitMap.set(index, [edges[index]]);
            continue;
        }

        const newEdges = splitEdgeByVertices(edges[index], Array.from(splitVs));
        if (newEdges.length) {
            edgeSplitMap.set(index, newEdges);
        } else {
            edgeSplitMap.set(index, [edges[index]]);
        }
    }

    for (const overlapInfo of overlapInfos) {
        const overlap = new Set<Edge>();
        overlapEdges.push(overlap);
        overlapInfo.forEach(n => {
            const es = edgeSplitMap.get(n)!;
            es.forEach(e => overlap.add(e));
        });
    }
}

function getBoundedCurves2D(face: Face, surface: Surface, loops: Curve2[][], map: Map<Curve2, Coedge3d>): void {
    // 参数域考虑圆柱面半径，避免误差问题
    function reviseCurves(curves: Curve2[], s: Cylinder): Curve2[] {
        const newcs: Curve2[] = [];
        const tempDir = new Vec2(Math.PI * 2, 0);
        const radius = Math.max(s.getA(), s.getB());
        for (const curve of curves) {
            let sp = curve.getStartPt();
            let ep = curve.getEndPt();
            if (Util.isNearlySmaller(sp.x, 0) || Util.isNearlySmaller(ep.x, 0)) {
                sp.add(tempDir);
                ep.add(tempDir);
            }
            sp = new Vec2(sp.x * radius, sp.y);
            ep = new Vec2(ep.x * radius, ep.y);
            newcs.push(new Ln2(sp, ep));
        }
        return newcs;
    }

    for (const w of face.getWires()) {
        const curve3ds = w.getCoedge3ds().map(coedge => coedge.getCurve());
        const ret = surface.wireToUV(curve3ds);
        let curve2ds = ret.loop;
        if (surface instanceof Cylinder) {
            curve2ds = reviseCurves(curve2ds, surface);
        }
        loops.push(curve2ds);

        MathAssert.assert(curve3ds.length === ret.loop.length, 'getLoop2d的curve2ds数量与curve3ds不一致！');
        for (let i = 0; i < curve3ds.length; i++) {
            let c2d = ret.mapping.get(curve3ds[i]);
            const index = ret.loop.indexOf(c2d!);
            c2d = curve2ds[index];
            const coedge = w.getCoedge3ds()[i];
            map.set(c2d, coedge);
        }
    }
}

function getMatchedEdgesFromBCs(
    bcLoop: Curve2[],
    newCurvesMap: Map<Curve2, Curve2>,
    curve2dHalfEdgeMap: Map<Curve2, Coedge3d>,
    tol: Tol,
): Array<{ edge: Edge; flag: boolean }> {
    const results: { edge: Edge; flag: boolean }[] = [];
    // bcLoop = removeRoundOverlapBoundedCurveInLoop(bcLoop);
    if (!bcLoop.length) {
        return results;
    }

    if (bcLoop.some(bc => !curve2dHalfEdgeMap.get(bc) && !curve2dHalfEdgeMap.get(newCurvesMap.get(bc)!))) {
        return results;
    }

    // get matched edge from curve2dHalfEdgeMap.
    for (const bc of bcLoop) {
        let matchEdge: Edge;
        let sameDir: boolean;
        let matchHalfEdge = curve2dHalfEdgeMap.get(bc);
        if (matchHalfEdge) {
            matchEdge = matchHalfEdge.getEdge()!;
            sameDir = matchHalfEdge.getSameDirWithEdge();
        } else {
            const originBC = newCurvesMap.get(bc)!;
            matchHalfEdge = curve2dHalfEdgeMap.get(originBC)!;
            matchEdge = matchHalfEdge.getEdge()!;
            sameDir =
                bc.getStartPt().equals(originBC.getStartPt(), tol.lengthEps) &&
                    bc.getStartTangent().equals(originBC.getStartTangent(), tol.angleEps)
                    ? matchHalfEdge.getSameDirWithEdge()
                    : !matchHalfEdge.getSameDirWithEdge();
        }

        results.push({ edge: matchEdge, flag: sameDir });
    }

    return results;
}

function getFaces2D(
    faces: Face[],
    surface: Surface,
    face2ds: alg.IFace2D[],
    curveMap: Map<Curve2, Coedge3d>,
    faceMap: Map<alg.IFace2D, Face>,
): void {
    for (const face of faces) {
        const faceLoops: Curve2[][] = [];
        getBoundedCurves2D(face, surface, faceLoops, curveMap);

        const face2d = { loops: faceLoops };
        face2ds.push(face2d);
        faceMap.set(face2d, face);
    }
}

function createNewFaceFromFace2D(
    face2D: alg.IFace2D,
    newCurvesMap: Map<Curve2, Curve2>,
    curve2dHalfEdgeMap: Map<Curve2, Coedge3d>,
    face2DFaceMap: Map<alg.IFace2D, Face>,
    surface: Surface,
    bUseOriginSurface: boolean = false,
    tol: Tol,
): Face | undefined {
    if (!face2D.loops.length) {
        return undefined;
    }

    // get origin shell.
    let shell: Shell | undefined;
    let originSurface: Surface | undefined;
    let originFaceSameDir: boolean | undefined;
    const originFace2Ds = face2D.originFaces!;
    if (originFace2Ds.length) {
        const originFace = face2DFaceMap.get(originFace2Ds[0])!;
        shell = originFace.getShell()!;
        originSurface = originFace.getSurface();
        originFaceSameDir = originFace.getSameDirWithSurface();
    }
    if (!shell) {
        return undefined;
    }

    // get matched origin edges from loops.
    const edgeGroups: Edge[][] = [];
    let edgeFlags: boolean[][] = [];
    for (let index = 0; index < face2D.loops.length; index++) {
        const matchResults = getMatchedEdgesFromBCs(face2D.loops[index], newCurvesMap, curve2dHalfEdgeMap, tol);
        if (matchResults.length) {
            edgeGroups.push(matchResults.map(r => r.edge));
            edgeFlags.push(matchResults.map(r => r.flag));
        } else {

            if (index === 0) {
                return undefined;
            }
        }
    }

    // create face surface
    let faceSurface = surface;
    let faceSameDir: boolean | undefined;
    if (bUseOriginSurface && originSurface) {
        // in split mode, just use origin surface and direction
        faceSurface = originSurface!;
        faceSameDir = originFaceSameDir;
    } else {
        if (!face2D.bPositive) {
            edgeGroups.forEach(g => g.reverse());
            edgeFlags.forEach(ef => ef.reverse());
            edgeFlags = edgeFlags.map(ef => ef.map(f => !f));
        }
        faceSameDir = true;
    }

    // 创建面
    const newFace = new Face(faceSurface, faceSameDir!);
    const newWires: Wire[] = [];
    for (let i = 0; i < edgeGroups.length; i++) {
        const coedges: Coedge3d[] = [];
        for (let j = 0; j < edgeGroups[i].length; j++) {
            coedges.push(new Coedge3d(edgeGroups[i][j], edgeFlags[i][j]));
        }
        newWires.push(new Wire(coedges));
    }
    newFace.setWires(newWires);

    shell.addFace(newFace);
    return newFace;
}

function addToPointListMap(map: Map<Vec3, any>, key: Vec3, value: any): void {
    const points = map.keys();
    let list: any[] | undefined;
    for (const curPt of points) {
        if (curPt.equals(key)) {
            list = map.get(curPt);
            break;
        }
    }

    if (!list) {
        list = [];
        map.set(key, list);
    }
    list.push(value);
}

// 所有的面surface同向，face同向
function allFacesSameDirection(faces: Face[]) {
    if (!faces.length) {
        return false;
    }
    const sameDirection = (f1: Face, f2: Face) => {
        const s1 = f1.getSurface();
        const s2 = f2.getSurface();
        if (s1.isPlane() && s2.isPlane() && !s1.getNorm().isSameDirection(s2.getNorm())) {
            return false;
        }
        if (f1.getSameDirWithSurface() !== f2.getSameDirWithSurface()) {
            return false;
        }
        return true;
    };
    if (faces.every(f => sameDirection(f, faces[0]))) {
        return true;
    }
    return false;
}

function isSuitableCylinder(faceArcsMap: Map<Face, Arc3[]>, candidate: Cylinder): boolean {
    for (const arcs of faceArcsMap.values()) {
        for (const arc of arcs) {
            const curve2d = candidate.getCurve2d(arc);
            const interv = curve2d.getRange();
            // 跨越了0， 2PI
            if (
                (Util.isNearlySmaller(interv.min, 0) && Util.isNearlyBigger(interv.max, 0)) ||
                (Util.isNearlySmaller(interv.min, Math.PI * 2) && Util.isNearlyBigger(interv.max, Math.PI * 2))
            ) {
                return false;
            }
        }
    }

    return true;
}

function findSuitableCylinder(faces1: Face[], faces2: Face[]): Surface | undefined {
    const allFaces: Face[] = [...faces1, ...faces2];
    const allSurfaces = allFaces.map(f => f.getSurface());

    const faceArcsMap = new Map<Face, Arc3[]>();
    for (const face of allFaces) {
        const arcHes = face.getCoedge3ds().filter(he => he.getEdge()!.getCurve() instanceof Arc3);
        const arcs = arcHes.map(he => he.getCurve() as Arc3);
        faceArcsMap.set(face, arcs);
    }

    // 检测是否可以避免跨周期问题
    for (const surface of allSurfaces) {
        if (isSuitableCylinder(faceArcsMap, surface as Cylinder)) {
            return surface;
        }

        // 修改dx方向，避免跨周期问题
        const coord = (surface as Cylinder).getCoord();
        const a = (surface as Cylinder).getA();
        const b = (surface as Cylinder).getB();
        for (let i = 1; i <= 3; i++) {
            const newDx = coord.getDx().vecRotate(coord.getDz(), (Math.PI * i) / 2);
            const newDy = coord.getDy().vecRotate(coord.getDz(), (Math.PI * i) / 2);
            const newCoord = new Coord3(coord.getOrigin(), newDx, newDy);
            const newCylinder = new Cylinder(newCoord, i % 2 ? b : a, i % 2 ? a : b);
            if (isSuitableCylinder(faceArcsMap, newCylinder)) {
                return surface;
            }
        }
    }

    return undefined;
}

// function findSuitableSweepSurface(faces1: Face[], faces2: Face[]): Surface | undefined {
//     const allFaces: Face[] = [...faces1, ...faces2];
//     const allSurfaces = allFaces.map(f => f.getSurface());

//     const faceArcsMap = new Map<Face, Arc3[]>();
//     for (const face of allFaces) {
//         const arcHes = face.getCoedge3ds().filter(he => he.getEdge()!.getCurve() instanceof Arc3);
//         const arcs = arcHes.map(he => he.getCurve() as Arc3);
//         faceArcsMap.set(face, arcs);
//     }

//     // 检测是否可以避免跨周期问题
//     for (const surface of allSurfaces) {
//         if (isSuitableCylinder(faceArcsMap, surface as Cylinder)) {
//             return surface;
//         }

//         // 修改dx方向，避免跨周期问题
//         const coord = (surface as Cylinder).getCoord();
//         const a = (surface as Cylinder).getA();
//         const b = (surface as Cylinder).getB();
//         for (let i = 1; i <= 3; i++) {
//             const newDx = coord.getDx().vecRotate(coord.getDz(), (Math.PI * i) / 2);
//             const newDy = coord.getDy().vecRotate(coord.getDz(), (Math.PI * i) / 2);
//             const newCoord = new Coord3(coord.getOrigin(), newDx, newDy);
//             const newCylinder = new Cylinder(newCoord, i % 2 ? b : a, i % 2 ? a : b);
//             if (isSuitableCylinder(faceArcsMap, newCylinder)) {
//                 return surface;
//             }
//         }
//     }

//     return undefined;
// }

export enum BooleanType {
    kUnion = 0,
    kIntersect = 1,
    kSubtract = 2,
    kXor = 3,
    kSplit = 4,
}

export interface IFacesBooleanResult extends IShellModelingResult {
    resultFaces: Face[];
}

export function facesBooleanCore(
    fs1: Face[],
    fs2: Face[],
    type: BooleanType,
    updateSmooth: boolean = true,
    noOverlap1?: boolean,
    noOverlap2?: boolean,
    tol?: Tol,
): IFacesBooleanResult {
    const tolerance = tol || Tol.DEFAULT;
    const result: IFacesBooleanResult = {
        resultFaces: [],
        deleteShells: [],
        modifiedShellsMap: new Map(),
        evolutionMap: new Map(),
    };

    const faces1 = fs1.filter(f => f && f.getShell());
    const faces2 = fs2.filter(f => f && f.getShell());

    const allOriginFaces: Face[] = [...faces1, ...faces2];
    if (!allOriginFaces.length) {
        return { resultFaces: allOriginFaces };
    }

    if (type === BooleanType.kIntersect || type === BooleanType.kXor) {
        throw new Error(errorNotSupportBooleanType);
    }

    // 计算合适的圆柱面，避免跨周期的问题
    // TODO... 转成三维的布尔运算
    let baseSurface: Surface | undefined = allOriginFaces[0].getSurface();
    if (baseSurface instanceof Cylinder) {
        baseSurface = findSuitableCylinder(faces1, faces2);
        if (!baseSurface) {
            throw new Error(errorCylinderFace);
        }
    }
    // else if (baseSurface instanceof SweepSurface) {
    //     baseSurface = findSuitableSweepSurface(faces1, faces2);
    //     if (!baseSurface) {
    //         throw new Error(errorPeriodSweepFace);
    //     }
    // }

    const usedOriginFaces: Face[] = [];
    const newCreatedFaces: Face[] = [];

    if (allOriginFaces.length <= 1 && type === BooleanType.kSplit) {
        usedOriginFaces.push(...allOriginFaces);
    } else {
        // 4. 计算每个面在baseSurface上面的二维区域
        const face2DGroup1: alg.IFace2D[] = [];
        const face2DGroup2: alg.IFace2D[] = [];
        const curve2dHalfEdgeMap = new Map<Curve2, Coedge3d>();
        const face2DFaceMap = new Map<alg.IFace2D, Face>();
        getFaces2D(faces1, baseSurface, face2DGroup1, curve2dHalfEdgeMap, face2DFaceMap);
        getFaces2D(faces2, baseSurface, face2DGroup2, curve2dHalfEdgeMap, face2DFaceMap);

        // 5. 二维布尔运算
        const newCurvesMap: Map<Curve2, Curve2> = new Map();
        const face2DResults = alg.Bool2d.boolOperateCore(
            face2DGroup1,
            face2DGroup2,
            type as number,
            tolerance.lengthEps,
            tolerance.angleEps,
            newCurvesMap,
            noOverlap1,
            noOverlap2,
        );

        // 6. 创建新的面
        const bUseOriginSurface = type === BooleanType.kSplit || allFacesSameDirection(allOriginFaces);
        for (const face2D of face2DResults) {
            let face: Face | undefined = face2DFaceMap.get(face2D);
            if (face) {
                // 使用原有face
                usedOriginFaces.push(face);
                continue;
            }

            face = createNewFaceFromFace2D(
                face2D,
                newCurvesMap,
                curve2dHalfEdgeMap,
                face2DFaceMap,
                baseSurface,
                bUseOriginSurface,
                tolerance,
            );
            if (face) {
                newCreatedFaces.push(face);
                addShellModifyInfo(result.modifiedShellsMap!, face.getShell()!, [face]);

                if (face2D.originFaces) {
                    const originFaces: Face[] = [];
                    const originFace2Ds = face2D.originFaces as alg.IFace2D[];
                    originFace2Ds.forEach(f2D => originFaces.push(face2DFaceMap.get(f2D)!));
                    // 记录面的演化关系
                    originFaces.forEach(f => addEvolutionInfo(result, f, face!));
                }
            }
        }
    }

    const shells1: Set<Shell> = new Set();
    faces1.forEach(f => shells1.add(f.getShell()!));

    // 7. 删除无用的拓扑
    const allRemovedFaces = allOriginFaces.filter(f => usedOriginFaces.indexOf(f) === -1);
    allRemovedFaces.forEach(f => {
        addShellModifyInfo(result.modifiedShellsMap!, f.getShell()!, undefined, [f]);
        disposeFace(f);
    });

    // 8. 合并shells.
    result.resultFaces = usedOriginFaces.concat(newCreatedFaces);
    const mergeResult = mergeShells(result.resultFaces, Array.from(shells1));
    mergeResult.deleteShell.forEach(s => {
        if (result.modifiedShellsMap?.has(s)) {
            result.modifiedShellsMap.delete(s);
        }
    });
    for (const [shell, faces] of mergeResult.addFaceMap) {
        addShellModifyInfo(result.modifiedShellsMap!, shell, faces);
    }
    result.deleteShells = mergeResult.deleteShell;

    // 10. Update smooth flags
    if (updateSmooth) {
        const tmpV: Set<Vertex> = new Set();
        result.resultFaces.forEach(f => f.getVertexes().forEach(v => tmpV.add(v)));
        SmoothUtil.udpateSmoothVertices(tmpV);
        //     updateSoftEdges(shell.getEdges());
    }
    return result;
}

// 大场景下，求交性能需要优化
function facesBoolean(fs1: Face[], fs2: Face[], type: BooleanType, updateSmooth: boolean = true): IFacesBooleanResult {
    const result: IFacesBooleanResult = { resultFaces: [], deleteShells: [], modifiedShellsMap: new Map() };

    const faces1 = fs1.filter(f => f && f.getShell());
    const faces2 = fs2.filter(f => f && f.getShell());

    const allOriginFaces: Face[] = [...faces1, ...faces2];
    if (!allOriginFaces.length || (allOriginFaces.length === 1 && (type === 0 || type === 4))) {
        return { resultFaces: allOriginFaces };
    }

    if (type === 1 || type === 3) {
        throw new Error(errorNotSupportBooleanType);
    }

    // 1. 合并完全重叠的顶点.
    const allVertices: Vertex[] = [];
    allOriginFaces.forEach(f => allVertices.push(...f.getVertexes()));
    const pointVertexMap = new Map<Vec3, Vertex[]>();
    for (const vertex of Array.from(new Set<Vertex>(allVertices))) {
        addToPointListMap(pointVertexMap, vertex.getPoint(), vertex);
    }
    for (const value of pointVertexMap.values()) {
        mergeVertices(value);
    }

    // 2. 边求交，分割，得到可能重叠的边
    const allEdges = new Set<Edge>();
    const candOverlapEdges: Set<Edge>[] = [];
    allOriginFaces.forEach(f => f.getEdges().forEach(e => allEdges.add(e)));
    intersectEdges(allEdges, candOverlapEdges, result.modifiedShellsMap!);

    // 3. 合并完全重叠的边.
    candOverlapEdges.forEach(candOverlapEdge => mergeOverlapEdges(Array.from(candOverlapEdge)));

    const result1 = facesBooleanCore(faces1, faces2, type, updateSmooth);
    mergeShellModelingResult(result, result1);
    result.resultFaces = result1.resultFaces;
    return result;
}

// 同一个surface上面的face进行合并
export function facesUnion(faces1: Face[], faces2: Face[], updateSmooth: boolean = true): IFacesBooleanResult {
    return facesBoolean(faces1, faces2, BooleanType.kUnion, updateSmooth);
}

// 同一个surface上面的face进行布尔减
export function facesSubtract(faces1: Face[], faces2: Face[], updateSmooth: boolean = true): IFacesBooleanResult {
    return facesBoolean(faces1, faces2, BooleanType.kSubtract, updateSmooth);
}

// 同一个surface上面的face进行分割
export function facesSplit(faces1: Face[], faces2: Face[], updateSmooth: boolean = true): IFacesBooleanResult {
    return facesBoolean(faces1, faces2, BooleanType.kSplit, updateSmooth);
}