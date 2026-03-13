import {
    Vec3,
    Plane,
    Tol,
    CONST,
    Curve3,
    Matrix4,
    Surface,
    Cylinder,
    Ln3,
    Box3,
    Arc3,
    alg,
} from '../../../..';
import {
    IShellModelingResult,
    addShellModifyInfo,
    IShellModifyInfo,
    mergeShellModelingResult,
} from '../shell_modeling_result';
import { Face } from '../../../brep/face';
import { Shell } from '../../../brep/shell';
import { Coedge3d } from '../../../brep/coedge3d';
import { Wire } from '../../../brep/wire';
import { Vertex } from '../../../brep/vertex';
import { Edge } from '../../../brep/edge';
import { disposeFace } from '../operator/dispose_topo';
import { mergeConnectedEdge } from '../operator/merge_connect_edge';
import { facesBooleanCore, facesSplit } from '../faces_boolean/faces_boolean';
import { SmoothUtil } from '../smooth/smooth_util';
import { ContinuousUtil } from '../../../continuous';
import FacesShellsMerge from '../faces_boolean/faces_shells_boolean';



const errorPullingFace = '推拉面不合法';
const errorPullingFaceType = '推拉面类型不支持';
const errorPullingDirection = '推拉面方向不垂直';
const errorPullingDistanceIsSmall = '推拉距离为零';
const errorPullingDistanceExceedMax = '推拉距离超过最大值';

export function checkPullPushCondition(face: Face, pullPushVec: Vec3): void {
    if (!face || !face.getShell()) {
        throw new Error(errorPullingFace);
    }

    const surface = face.getSurface();
    if (!surface.isPlane()) {
        throw new Error(errorPullingFaceType);
    }

    if (!(surface as Plane).getNorm().isParallel(pullPushVec)) {
        throw new Error(errorPullingDirection);
    }

    const distance = pullPushVec.getLength();
    if (distance < Tol.LENGTH) {
        throw new Error(errorPullingDistanceIsSmall);
    }
    if (distance > CONST.MODEL_MAX_LENGTH) {
        throw new Error(errorPullingDistanceExceedMax);
    }
}

/**
 * copy face at origin position. copy face and base face will share edge and vertex.
 * @param baseFace the base face to be copy.
 * @param coedgesMap collect coedge info. map<copy face's coedge, base face's coedge>
 */
function copyFaceAtOriginPosition(baseFace: Face, coedgesMap: Map<Coedge3d, Coedge3d>): Face {
    function copyCoedge(coedge: Coedge3d): Coedge3d {
        const newHEdge = new Coedge3d(coedge.getEdge()!, coedge.getSameDirWithEdge());

        coedgesMap.set(newHEdge, coedge);
        return newHEdge;
    }

    function copyLoop(loop: Wire): Wire {
        const newHEdges: Coedge3d[] = [];
        for (const he of loop.getCoedge3ds()) {
            const newHEdge = copyCoedge(he);
            newHEdges.push(newHEdge);
        }
        const newLoop = new Wire(newHEdges);
        return newLoop;
    }

    const newWires = baseFace.getWires().map(w => copyLoop(w));
    const newFace = new Face(baseFace.getSurface().clone(), baseFace.getSameDirWithSurface(), newWires);
    baseFace.getShell()!.addFace(newFace);
    return newFace;
}

function transformEdgeCurve(oldEdgeCurve: Curve3, dir: Vec3): Curve3 {
    const matrix = Matrix4.makeTranslate(dir);
    return oldEdgeCurve.clone().transform(matrix) as Curve3;
}

/**
 * move face with the move vector. will create new edge and vertex for the moved face.
 * @param face face need to move
 * @param moveVec move vector
 */
function moveFace(face: Face, moveVec: Vec3): void {
    const shell = face.getShell()!;

    // 创建新的顶点
    const vertexMap = new Map<Vertex, Vertex>();
    const faceCoedges = face.getCoedge3ds();
    for (const coedge of faceCoedges) {
        const oldVertex = coedge.getStartVertex();
        let newVertex: Vertex | undefined;
        if (!vertexMap.has(oldVertex)) {
            newVertex = new Vertex(oldVertex.getPoint().added(moveVec));
            if (oldVertex.getSmooth()) {
                newVertex.setSmooth(true);
            }
            vertexMap.set(oldVertex, newVertex);

            shell!.addVertex(newVertex);
        }
    }

    // 创建新的边
    const edgeMap = new Map<Edge, Edge>();
    for (const coedge of faceCoedges) {
        let newEdge = edgeMap.get(coedge.getEdge()!);
        if (!newEdge) {
            const oldVertexA = coedge.getEdge()!.getStartVertex();
            const oldVertexB = coedge.getEdge()!.getEndVertex();
            const newVertexA = vertexMap.get(oldVertexA)!;
            const newVertexB = vertexMap.get(oldVertexB)!;

            const newEdgeCurve = transformEdgeCurve(coedge.getEdge()!.getCurve(), moveVec);
            newEdge = new Edge(newEdgeCurve, newVertexA, newVertexB);
            shell!.addEdge(newEdge);
            // newEdge.flags = halfEdge.edge!.flags;

            edgeMap.set(coedge.getEdge()!, newEdge);
        }
        coedge.setEdge(newEdge);
    }

    // 添加连续边信息
    ContinuousUtil.cloneContinuousEdgeInfo(edgeMap.keys(), (e: Edge) => edgeMap.get(e), Matrix4.makeTranslate(moveVec));

    // 更新平面
    if (faceCoedges.length) {
        const facePlane = face.getSurface() as Plane;
        facePlane.translate(moveVec);
    }
}

interface INewSideFaceInfo {
    // Bool flag marking whether need add new side face or not
    bNeedCreation: boolean;
    // the new create side face
    newSideFace?: Face;
}

function isSurfacePerpendicularPlane(surf: Surface, plane: Plane) {
    const norm = plane.getNorm();
    if (surf instanceof Plane) {
        return surf.getNorm().isPerpendicular(norm);
    }

    if (surf instanceof Cylinder) {
        return surf.getCenterAxis().isParallel(norm);
    }

    const surfDir = surf.getNormAt({ x: 0, y: 0 });
    return surfDir.isPerpendicular(norm);
}

function getNewSideFaceInfoFromWire(face: Face, loop: Wire, newSideFaceInfoMap: Map<Coedge3d, INewSideFaceInfo>): void {
    for (const halfEdge of loop.getCoedge3ds()) {
        const twins = halfEdge.getTwins().filter(he => he);
        const validAdjacentFaces = twins.map(he => he.getWire()!.getParent()! as Face).filter(f => f !== face);
        const bAllVertical = validAdjacentFaces.every(f =>
            isSurfacePerpendicularPlane(f.getSurface(), face.getSurface() as Plane),
        );
        const bNeedCreation = validAdjacentFaces.length === 0 || !bAllVertical;

        const newSideFaceInfo = { bNeedCreation };
        if (!newSideFaceInfoMap.has(halfEdge)) {
            newSideFaceInfoMap.set(halfEdge, newSideFaceInfo);
        }
    }
}

/**
 * collect side face information into newSideFaceInfoMap<face's half edge, INewSideFaceInfo>
 * @param face
 * @param newSideFaceInfoMap
 */
function getNewSideFaceInfo(face: Face, newSideFaceInfoMap: Map<Coedge3d, INewSideFaceInfo>): void {
    for (const loop of face.getWires()) {
        getNewSideFaceInfoFromWire(face, loop, newSideFaceInfoMap);
    }
}

/**
 * build side faces between base face and copy face.
 * @param shell the owning shell
 * @param baseFace base face
 * @param copyBaseFace copy face
 * @param bExtrudeReversed
 * @param coedgesMap map<copy face's half edge, base face's half edge>
 * @param newSideFaceInfoMap collect new side face info
 *   3------>------2
 *   |             |
 *   |             |
 *   |             |
 *  0|------>------|1
 *       coedge
 */
function buildNewSideFaces(
    shell: Shell,
    copyBaseFace: Face,
    bExtrudeReversed: boolean,
    pullPushVec: Vec3,
    coedgesMap: Map<Coedge3d, Coedge3d>,
    newSideFaceInfoMap: Map<Coedge3d, INewSideFaceInfo>,
): void {
    // get need create new side face flag from the copy base face and it's adjacent.
    getNewSideFaceInfo(copyBaseFace, newSideFaceInfoMap);

    // create new side face for each loop's coedge
    // adjcent side faces will share same edge
    const face = copyBaseFace;
    for (const loop of face.getWires()) {
        const vertexNewEdgeMap: Map<Vertex, Edge> = new Map();
        for (const coedge of loop.getCoedge3ds()) {
            const baseCoedge = coedgesMap.get(coedge)!;

            // create edges.
            const edge01 = coedge.getEdge()!;
            const flag01 = coedge.getSameDirWithEdge();

            const v1 = coedge.getEndVertex();
            const v2 = baseCoedge.getEndVertex();
            let edge12: Edge | undefined = vertexNewEdgeMap.get(v1);
            if (!edge12) {
                const line = new Ln3(v1.getPoint(), v2.getPoint());
                edge12 = new Edge(line, v1, v2);
                shell.addEdge(edge12);
                vertexNewEdgeMap.set(v1, edge12);
            }
            if (v1.getSmooth()) {
                edge12!.setSmooth(true);
            }
            const flag12 = true;

            const edge23 = baseCoedge.getEdge()!;
            const flag23 = !baseCoedge.getSameDirWithEdge();

            const v0 = coedge.getStartVertex();
            const v3 = baseCoedge.getStartVertex();
            let edge30: Edge | undefined = vertexNewEdgeMap.get(v0);
            if (!edge30) {
                const line = new Ln3(v0.getPoint(), v3.getPoint());
                edge30 = new Edge(line, v0, v3);
                shell.addEdge(edge30);
                vertexNewEdgeMap.set(v0, edge30);
            }
            if (v0.getSmooth()) {
                edge30!.setSmooth(true);
            }
            const flag30 = false;

            // create surface
            let surface: Surface | undefined;
            let bSameDir: boolean;
            const edge01Curve = edge01.getCurve();
            if (edge01Curve.isLine3d()) {
                surface = Plane.makeByPoints(
                    [v0.getPoint(), v1.getPoint(), v2.getPoint(), v3.getPoint()],
                    (edge01Curve as Ln3).getDirection(),
                );
                bSameDir = true; // 使用的coedge而不是edge，所以能保证wire在surface上始终是逆时针
            } else if (edge01Curve.isArc3d()) {
                const cyl = Cylinder.makeCylinderByArc3d(edge01Curve as Arc3);
                const tmpFlag = pullPushVec.isSameDirection(cyl.getCenterAxis());
                bSameDir = tmpFlag === flag01; // 使用的edge，并且surface构造没有使用pullPushVec，而是用了arc的z向，所以此处与两者有关
                surface = cyl;
            } else {
                throw new Error('not supported');
            }

            if (!surface) {
                continue;
            }

            // create face
            const wire = new Wire([
                new Coedge3d(edge01, flag01),
                new Coedge3d(edge12, flag12),
                new Coedge3d(edge23, flag23),
                new Coedge3d(edge30, flag30),
            ]);

            // 确保wire方向和surface方向相同
            let sideFace: Face | undefined;
            if (bSameDir) {
                sideFace = new Face(surface, true, [wire]);
            } else {
                wire.reverse();
                sideFace = new Face(surface, false, [wire]);
            }
            // 特殊情况，调整侧面face方向
            if (copyBaseFace.getSameDirWithSurface() === bExtrudeReversed) {
                sideFace.reverse();
            }

            newSideFaceInfoMap.get(coedge)!.newSideFace = sideFace;
        }
    }

    // add new side faces to owning shell
    for (const sideFaceInfo of newSideFaceInfoMap.values()) {
        if (sideFaceInfo.newSideFace) {
            shell.addFace(sideFaceInfo.newSideFace);
        }
    }
}

/**
 * record no need create side face labels(start vertex, end Vertex)
 * NOTE: no need to create side face for half edges between labels(start vertex,end Vertex)
 * @param loop
 * @param newSideFaceInfoMap
 */
function getNoNeedCreateLables(loop: Wire, newSideFaceInfoMap: Map<Coedge3d, INewSideFaceInfo>): any[] {
    const noNeedCreateLables: Array<{ startV: Vertex; endV: Vertex }> = [];

    let vertices: Vertex[] = [];
    for (const he of loop.getCoedge3ds()) {
        const newSideFaceInfo = newSideFaceInfoMap.get(he)!;
        if (newSideFaceInfo.bNeedCreation) {
            if (vertices.length) {
                noNeedCreateLables.push({ startV: vertices[0], endV: vertices[vertices.length - 1] });
                vertices.splice(0, vertices.length);
            }
            continue;
        }

        if (vertices.length === 0) {
            vertices = [he.getStartVertex(), he.getEndVertex()];
        } else {
            vertices[vertices.length - 1] = he.getEndVertex();
        }
    }
    if (vertices.length) {
        noNeedCreateLables.push({ startV: vertices[0], endV: vertices[vertices.length - 1] });
    }

    return noNeedCreateLables;
}

/**
 * find faces which are on the same surface and overlap with check faces in shells.
 * caller need to make sure check faces are on the same surface.
 * @param shells find faces in those shells
 * @param checkFaces the input check faces
 */
function findOverlapFacesOnSameSurface(shells: Shell[], checkFaces: Face[], faceBoxMap: Map<Face, Box3>): Set<Face> {
    const overlapFaces = new Set<Face>();

    const checkFaceBoxs: Box3[] = [];
    checkFaces.forEach(face => {
        let box = faceBoxMap.get(face);
        if (!box) {
            box = face.getBBox();
            faceBoxMap.set(face, box);
        }
        checkFaceBoxs.push(box);
    });
    if (!checkFaces.length || checkFaceBoxs.every(box => !box.isValid())) {
        return overlapFaces;
    }

    for (const shell of shells) {
        if (!shell) {
            continue;
        }

        for (const face of shell.getFaces()) {
            if (checkFaces.indexOf(face) !== -1) {
                continue;
            }

            if (
                !face.getSurface() ||
                !alg.CalcOverlap.isSurfacesCoplaner(face.getSurface() as any, checkFaces[0].getSurface())
            ) {
                continue;
            }

            let faceBox = faceBoxMap.get(face);
            if (!faceBox) {
                faceBox = face.getBBox();
                faceBoxMap.set(face, faceBox);
            }
            if (!faceBox || !faceBox.isValid() || checkFaceBoxs.every(box => !box.intersectsBox(faceBox!))) {
                continue;
            }

            overlapFaces.add(face);
        }
    }

    return overlapFaces;
}

/**
 * find orderd half edges which start vertex is 'startV' and end vertex is 'endV' from candidates.
 * @param candidates candidate half edges
 * @param startV start vertex
 * @param endV end vertex
 * @param startSearchIndex start search index from candidates
 */
function findHalfEdgesWithStartEndVertex(
    candidates: ReadonlyArray<Coedge3d>,
    startV: Vertex,
    endV: Vertex,
    startSearchIndex: number = 0,
): Coedge3d[] {
    let result: Coedge3d[] = [];
    let startIndex = -1;
    let endIndex = -1;
    for (let index = startSearchIndex; index < candidates.length; index++) {
        if (candidates[index].getStartVertex()!.getPoint().equals(startV.getPoint())) {
            startIndex = index;
            break;
        }
    }
    if (startIndex !== -1) {
        for (let index = startIndex; index < candidates.length; index++) {
            if (candidates[index].getEndVertex()!.getPoint().equals(endV.getPoint())) {
                endIndex = index + 1;
                break;
            }
        }
    }
    if (endIndex !== -1) {
        result = candidates.slice(startIndex, endIndex);
    }

    return result;
}

/**
 * along the half edge of copy face, analysis side faces which are need to be union or need to be delete.
 * @param copyBaseFace
 * @param loop
 * @param noNeedCreateLables
 * @param unionSideFaceGroups
 * @param deleteSideFaces
 */
function analysisNoNeedCreateSideFaces(
    copyBaseFace: Face,
    loop: Wire,
    noNeedCreateLables: any,
    unionSideFaceGroups: Array<Set<Face>>,
    deleteSideFaces: Set<Face>,
): void {
    const loopHalfEdges = loop.getCoedge3ds();
    let startSearchIndex = 0;
    let noNeedCreateHalfEdges: Coedge3d[] = [];
    for (const noNeedCreateLable of noNeedCreateLables) {
        // find half edges between noNeedCreateLable
        if (noNeedCreateHalfEdges.length) {
            startSearchIndex = loopHalfEdges.indexOf(noNeedCreateHalfEdges[noNeedCreateHalfEdges.length - 1]) + 1;
        }
        noNeedCreateHalfEdges = findHalfEdgesWithStartEndVertex(
            loopHalfEdges,
            noNeedCreateLable.startV,
            noNeedCreateLable.endV,
            startSearchIndex,
        );
        if (!noNeedCreateHalfEdges.length) {
            continue;
        }

        for (const he of noNeedCreateHalfEdges) {
            const sideFaces = he
                .getTwins()
                .filter(h1 => h1.getWire()!.getParent() !== copyBaseFace)
                .map(h2 => h2.getWire()!.getParent() as Face);
            if (sideFaces.length < 1) {
                continue;
            } else if (sideFaces.length === 1) {
                deleteSideFaces.add(sideFaces[0]);
            } else {
                // side faces are all on same surface, else do nothing.

                if (
                    sideFaces.every(
                        f =>
                            f === sideFaces[0] ||
                            alg.CalcOverlap.isSurfacesCoplaner(
                                f.getSurface() as any,
                                sideFaces[0].getSurface(),
                            ),
                    )
                ) {
                    let bFindGroup = false;
                    for (const unionSideFaceGroup of unionSideFaceGroups) {
                        if (sideFaces.some(f => unionSideFaceGroup.has(f))) {
                            sideFaces.forEach(f => unionSideFaceGroup.add(f));
                            bFindGroup = true;
                            break;
                        }
                    }
                    if (!bFindGroup) {
                        unionSideFaceGroups.push(new Set(sideFaces));
                    }
                }
            }
        }
    }
    unionSideFaceGroups.forEach(g => g.forEach(f => deleteSideFaces.delete(f)));
}

function booleanTopFaceWithContext(model: Shell[], topFace: Face, bTopFaceDeal: boolean, result: IShellModelingResult) {
    const faceBoxMap: Map<Face, Box3> = new Map();
    const overlapFaces = findOverlapFacesOnSameSurface(model, [topFace], faceBoxMap);

    // boolean split
    try {
        const topFaceEdges = topFace.getEdges();
        const splitResult = facesSplit(Array.from(overlapFaces), [topFace], false);

        // 特殊情况下，删除被推拉的面
        if (bTopFaceDeal && splitResult.resultFaces && splitResult.resultFaces.length) {
            let newFaceTags: string[] = [];
            if (splitResult.evolutionMap) {
                newFaceTags = Array.from(splitResult.evolutionMap!.values()).flat();
            }
            const getInnerNeighborFaces = (coedge: Coedge3d) => {
                const neighborFaces = coedge
                    .getTwins()
                    .filter(_ => {
                        const tmpW = _.getWire()!;
                        if (tmpW.getFace()!.getWires().indexOf(tmpW) > 0) {
                            return true;
                        }
                        return false;
                    })
                    .map(_ => _.getFace()!);
                return Array.from(new Set(neighborFaces));
            };
            for (const tmpF of splitResult.resultFaces) {
                if (newFaceTags.indexOf(tmpF.tag) < 0) {
                    continue;
                }
                const empEs = tmpF.getEdges();
                if (empEs.length !== topFaceEdges.length) {
                    continue;
                }
                if (topFaceEdges.some(it => empEs.indexOf(it) < 0)) {
                    continue;
                }
                const outCoedges = tmpF.getWires()[0].getCoedge3ds();
                if (outCoedges[0].getTwins().length <= 1) {
                    continue;
                }
                let neighborFs = getInnerNeighborFaces(outCoedges[0]);
                for (let index = 1; index < outCoedges.length; index++) {
                    const tmpNeighborFs = getInnerNeighborFaces(outCoedges[index]);
                    neighborFs = neighborFs.filter(_ => tmpNeighborFs.indexOf(_) > -1);
                    if (!neighborFs.length) {
                        break;
                    }
                }
                if (neighborFs.length === 1 && neighborFs[0] !== tmpF) {
                    const tmpMap: Map<Shell, IShellModifyInfo> = new Map();
                    tmpMap.set(tmpF.getShell()!, { deleteFaces: [tmpF] });
                    mergeShellModelingResult(splitResult, { modifiedShellsMap: tmpMap });
                    disposeFace(tmpF);
                    break;
                }
            }
        }
        mergeShellModelingResult(result, splitResult);
    } catch (e) {
        if (e instanceof Error) {
            result.errorStr = e.message;
        }
    }
}

function checkOverlap(newSideFaceInfoMap: Map<Coedge3d, INewSideFaceInfo>) {
    const sideEdge = new Set<Edge>();
    Array.from(newSideFaceInfoMap.keys()).forEach(it => sideEdge.add(it.getEdge()!));
    return sideEdge.size !== newSideFaceInfoMap.size;
}

/**
 * boolean new side faces with context(in same shell now)
 * @param shell the owning shell
 * @param copyBaseFace the copy face
 * @param newSideFaceInfoMap
 * @param bExtrudeBehavior
 */
function booleanSideFacesWithContext(
    model: Shell[],
    copyBaseFace: Face,
    newSideFaceInfoMap: Map<Coedge3d, INewSideFaceInfo>,
    bExtrudeBehavior: boolean,
    result: IShellModelingResult,
): void {
    const baseWires = copyBaseFace.getWires();
    const noNeedCreateLableArrays = baseWires.map(w => getNoNeedCreateLables(w, newSideFaceInfoMap));

    // do split for side faces
    const newSideFaces = Array.from(newSideFaceInfoMap.values())
        .map(it => it.newSideFace)
        .filter(it => !!it) as Face[];
    const checkFaceOverlap = checkOverlap(newSideFaceInfoMap);
    const splitResult = new FacesShellsMerge(newSideFaces, model, checkFaceOverlap, false).execute();
    mergeShellModelingResult(result, splitResult);

    if (bExtrudeBehavior) {
        return;
    }

    for (let index = 0; index < baseWires.length; index++) {
        // analysis no need create side faces
        const unionSideFaceGroups: Set<Face>[] = [];
        const deleteSideFaces = new Set<Face>();
        analysisNoNeedCreateSideFaces(
            copyBaseFace,
            baseWires[index],
            noNeedCreateLableArrays[index],
            unionSideFaceGroups,
            deleteSideFaces,
        );

        // union those no need create side faces. not do in extrude behavivor.
        if (!bExtrudeBehavior) {
            for (const unionSideFaceGroup of unionSideFaceGroups) {
                // boolean union
                try {
                    const unionFaces = Array.from(unionSideFaceGroup);
                    const unionResult = facesBooleanCore(
                        [unionFaces[0]],
                        unionFaces.slice(1, unionFaces.length),
                        0,
                        false,
                    );
                    mergeShellModelingResult(result, unionResult);
                } catch (e) {
                    if (e instanceof Error) {
                        result.errorStr = e.message;
                    }
                }
            }
        }

        // delete no need side faces
        deleteSideFaces.forEach(f => {
            const tmpMap: Map<Shell, IShellModifyInfo> = new Map();
            tmpMap.set(f.getShell()!, { deleteFaces: [f] });
            mergeShellModelingResult(result, { modifiedShellsMap: tmpMap });

            disposeFace(f);
        });
    }
}

/**
 * merge edges(connected by candidate vertex) along the pull push direction
 * @param candidateVertices
 * @param faceNormal
 */
function mergeEdgesAlongPullPushVec(candidateVertices: Set<Vertex>, faceNormal: Vec3): void {
    // get candidate merge edges
    const candidateMergeEdges: any[] = [];
    for (const vertex of candidateVertices) {
        const edges = vertex.getEdges().filter(e => e.getCoedge3ds().length);
        if (edges.length !== 2) {
            continue;
        }
        const curve1 = edges[0].getCurve();
        const curve2 = edges[1].getCurve();
        if (!curve1.isLine3d() || !curve2.isLine3d()) {
            continue;
        }

        const vec1 = (curve1 as Ln3).getDirection();
        const vec2 = (curve2 as Ln3).getDirection();
        if (!vec1.isParallel(faceNormal) || !vec2.isParallel(faceNormal)) {
            continue;
        }

        candidateMergeEdges.push([edges[0], edges[1], vertex]);
    }

    // 合并边
    candidateMergeEdges.forEach(edges => mergeConnectedEdge(edges[0], edges[1], edges[2]));
}

export function pullPushFaceCore(
    face: Face,
    pullPushVec: Vec3,
    model: Shell[],
    bExtrudeBehavior: boolean,
    bTopFaceDeal: boolean,
    bBoolean: boolean,
    result: IShellModelingResult,
): void {
    // 0. 检测推拉条件
    checkPullPushCondition(face, pullPushVec);
    result.deleteShells = [];
    result.modifiedShellsMap = new Map();
    result.evolutionMap = new Map();

    // 'bReversed' 推拉方向 和 面法向 相反
    const faceNormal = face.getCenterNorm();
    const bReversed = faceNormal.dot(pullPushVec) < 0;

    // 1. 在原地复制一下
    const shell = face.getShell()!;
    addShellModifyInfo(result.modifiedShellsMap!, shell);
    // half edge map<copy face's half edge(new), base face's half edge>
    const coedgesMap = new Map<Coedge3d, Coedge3d>();
    const copyFace = copyFaceAtOriginPosition(face, coedgesMap);
    addShellModifyInfo(result.modifiedShellsMap!, copyFace.getShell()!, [copyFace]);

    // 拉伸的时候，需要保持面正向都朝外
    const bExtrudeReversed = bExtrudeBehavior && bReversed;
    const baseFace = face;
    const copyBaseFace = copyFace;

    // 2. 将面移动到目标位置
    moveFace(baseFace, pullPushVec);
    addShellModifyInfo(result.modifiedShellsMap!, copyFace.getShell()!, undefined, undefined, [baseFace]);

    // 3. 依次构建侧面
    const newSideFaceInfoMap = new Map<Coedge3d, INewSideFaceInfo>();
    buildNewSideFaces(shell, copyBaseFace, bExtrudeReversed, pullPushVec, coedgesMap, newSideFaceInfoMap);
    for (const sideFaceInfo of newSideFaceInfoMap.values()) {
        if (sideFaceInfo.newSideFace) {
            addShellModifyInfo(result.modifiedShellsMap!, shell, [sideFaceInfo.newSideFace]);
        }
    }

    // 5.1 侧面进行布尔运算
    if (bBoolean) {
        booleanSideFacesWithContext(model, copyBaseFace, newSideFaceInfoMap, bExtrudeBehavior, result);
    }

    // 5.2. invert, remove base face or copy face.
    const vertices = new Set<Vertex>();
    copyBaseFace.getCoedge3ds().forEach(he => vertices.add(he.getStartVertex()));
    if (bExtrudeBehavior) {
        if (bReversed) {
            baseFace.reverse();
        } else {
            copyBaseFace.reverse();
        }
    } else {
        const tmpMap: Map<Shell, IShellModifyInfo> = new Map();
        tmpMap.set(copyBaseFace.getShell()!, { deleteFaces: [copyBaseFace] });
        mergeShellModelingResult(result, { modifiedShellsMap: tmpMap });

        disposeFace(copyBaseFace);
    }

    // 5.3 被推拉面合并到场景中
    if (bBoolean) {
        booleanTopFaceWithContext(model, baseFace, bTopFaceDeal, result);
    }

    // 6. merge edges along pull direction.
    mergeEdgesAlongPullPushVec(vertices, faceNormal);

    // 7. update smooth flags
    for (const modifyInfo of result.modifiedShellsMap.values()) {
        const tmpV: Set<Vertex> = new Set();
        if (modifyInfo.addFaces) {
            modifyInfo.addFaces.forEach(f => f.getVertexes().forEach(v => tmpV.add(v)));
        }
        if (modifyInfo.modifiedFaces) {
            modifyInfo.modifiedFaces.forEach(f => f.getVertexes().forEach(v => tmpV.add(v)));
        }
        SmoothUtil.udpateSmoothVertices(tmpV);
    }
    // updateSoftEdges(modifiedShell.getEdges());
    for (const s of result.modifiedShellsMap.keys()) {
        ContinuousUtil.removeUnusedContinuousEdgeInfo(s);
    }
}