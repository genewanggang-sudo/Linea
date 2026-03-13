import { Box3, Curve3, Ln3, alg, Tol, Vec3 } from '../../../..';
import { Face } from '../../../brep/face';
import { IShellModelingResult, IShellModifyInfo, mergeShellModelingResult } from '../shell_modeling_result';
import { addOverlapInfo, addToSetInMap, facesBooleanCore } from './faces_boolean';
import { Shell } from '../../../brep/shell';
import { Edge } from '../../../brep/edge';
import { Vertex } from '../../../brep/vertex';
import { Octree } from './octree';
import { mergeVertices } from '../operator/merge_vertex';
import { splitEdgeByVertices } from '../operator/split_edge';
import { mergeOverlapEdges } from '../operator/merge_overlap_edge';
import ShellModelingBase from '../shell_modeling_base';
import { ShellModelingUtil } from '../smooth/shell_modeling_util';



function _calEdgeBox(edge: Edge) {
    if (edge.getCurve() instanceof Ln3) {
        const box = new Box3();
        box.expandByPoint(edge.getStartVertex().getPoint());
        box.expandByPoint(edge.getEndVertex().getPoint());
        return box;
    }
    return edge.getBBox();
}

function addModifyShell(e: Edge, map: Map<Shell, IShellModifyInfo>) {
    const parent = e.getParent() as Shell;
    if (parent && !map.get(parent)) {
        map.set(parent, { addFaces: [], deleteFaces: [], modifiedFaces: [] });
    }
}

function edgeIntersection(
    edgeSet1: Set<Edge>,
    edgeSet2: Set<Edge>,
    checkOverlap1: boolean,
    getEdgeBox: (e: Edge) => Box3,
    tree: Octree<Face | Edge | Vertex>,
    result: IShellModelingResult,
    tol: Tol,
) {
    if (!edgeSet1.size || (!edgeSet2.size && !checkOverlap1)) {
        return;
    }

    const eFilter = (it: Edge) => {
        return edgeSet2.has(it) || (checkOverlap1 && edgeSet1.has(it));
    };
    const candOverlapEdges: Set<Edge>[] = [];
    const overlapInfos: Set<Edge>[] = [];
    const intersectionMap: Map<Edge, Set<Vertex>> = new Map();
    const edgeCurveMap = new Map<Edge, Curve3>();
    const getEdgeCurve = (e: Edge) => {
        let curve = edgeCurveMap.get(e);
        if (!curve) {
            curve = e.getCurve();
            edgeCurveMap.set(e, curve);
        }
        return curve;
    };
    const newVertices = new Set<Vertex>();
    // 求交点
    for (const edge of Array.from(edgeSet1)) {
        const edgeBox = getEdgeBox(edge);
        const overlapEs = tree
            .getCandidateOverlaps(edge, [edgeBox.min, edgeBox.max])
            .filter(
                it =>
                    it instanceof Edge &&
                    eFilter(it) &&
                    it !== edge &&
                    edgeBox.intersectsBox(getEdgeBox(it), tol.lengthEps),
            ) as Edge[];
        const edgeCurve = getEdgeCurve(edge);
        for (const otherEdge of overlapEs) {
            const intersectResults = alg.X.curve3ds(edgeCurve, getEdgeCurve(otherEdge), tol);
            const interPts: Vec3[] = [];
            let overlap = false;
            intersectResults.forEach(it => {
                if (it.isOverlap) {
                    interPts.push(edgeCurve.getPtAt(it.overlap1!.min));
                    interPts.push(edgeCurve.getPtAt(it.overlap1!.max));
                    overlap = true;
                } else {
                    interPts.push(it.point);
                }
            });
            if (!interPts.length) {
                continue;
            }

            if (overlap) {
                addOverlapInfo(overlapInfos, edge, otherEdge);
            }
            addModifyShell(edge, result.modifiedShellsMap!);
            addModifyShell(otherEdge, result.modifiedShellsMap!);

            for (const interPt of interPts) {
                // 找到一个已经存在的vertex
                let intersectVertex: Vertex | undefined;
                const overlapVs = tree
                    .getCandidateOverlaps(interPt as any, [interPt])
                    .filter(it => it instanceof Vertex && it.getPoint().equals(interPt, tol.lengthEps)) as Vertex[];
                if (overlapVs.length) {
                    overlapVs.sort((a, b) => interPt.sqDistanceTo(a.getPoint()) - interPt.sqDistanceTo(b.getPoint()));
                    intersectVertex = overlapVs[0];
                }

                // 创建新的vertex
                if (!intersectVertex) {
                    intersectVertex = (edge.getParent() as Shell).createVertex(interPt);
                    newVertices.add(intersectVertex);
                    // if two edges are isSoft, the intersect vertex will be isSoft
                    // intersectVertex.isSoft = edges[i].isSoft && edges[j].isSoft;

                    tree.add(intersectVertex);
                }

                if (intersectVertex !== edge.getStartVertex() && intersectVertex !== edge.getEndVertex()) {
                    addToSetInMap(intersectionMap, edge, intersectVertex);
                }
                if (intersectVertex !== otherEdge.getStartVertex() && intersectVertex !== otherEdge.getEndVertex()) {
                    addToSetInMap(intersectionMap, otherEdge, intersectVertex);
                }
            }
        }
        edgeSet1.delete(edge);
    }

    // 分割边
    const edgeSplitMap = new Map<Edge, Edge[]>();
    for (const [key, value] of intersectionMap) {
        if (value) {
            const newEdges = splitEdgeByVertices(key, Array.from(value));
            if (newEdges.length) {
                edgeSplitMap.set(key, newEdges);
                continue;
            }
        }
        edgeSplitMap.set(key, [key]);
    }

    for (const overlapInfo of overlapInfos) {
        const overlap = new Set<Edge>();
        candOverlapEdges.push(overlap);
        overlapInfo.forEach(n => {
            const es = edgeSplitMap.get(n);
            if (es) {
                es.forEach(e => overlap.add(e));
            } else {
                overlap.add(n);
            }
        });
    }

    // 合并完全重叠的边
    candOverlapEdges.forEach(candOverlapEdge => mergeOverlapEdges(Array.from(candOverlapEdge), tol));

    // 删除不用的分割点
    newVertices.forEach(v => {
        if (!v.getEdges().length) {
            (v.getParent() as any)?.deleteVertex(v);
        }
    });
}

// 先处理相交、重叠的vertex, edge，进行打断合并
// 再按照不同的surface, 进行布尔运算-分割
function facesShellsMerge(
    faces: Face[],
    contextShells: Shell[],
    checkOverlap1: boolean = false,
    updateSmooth: boolean = true,
    tol: Tol,
): IShellModelingResult {
    const result: IShellModelingResult = { deleteShells: [], modifiedShellsMap: new Map() };
    if (!faces.length) {
        return result;
    }

    // 0.计算包围盒，构建tree
    const faceSet1 = new Set(faces);
    const edgeSet1 = new Set<Edge>();
    const vertex1Map = new Map<Vertex, boolean>();
    const objectBoxMap = new Map<Edge | Face, Box3>();
    const faceBox1Sum = new Box3();
    for (const face of faces) {
        const edges = face.getEdges();
        edges.forEach(e => {
            let ebox = objectBoxMap.get(e);
            if (!ebox) {
                ebox = _calEdgeBox(e);
                objectBoxMap.set(e, ebox);
                edgeSet1.add(e);
                faceBox1Sum.union(ebox);
            }

            vertex1Map.set(e.getStartVertex(), false);
            vertex1Map.set(e.getEndVertex(), false);
        });
    }
    const faceBox2Sum = new Box3();
    const vertexSet2 = new Set<Vertex>();
    const edgeSet2 = new Set<Edge>();
    for (const s of contextShells) {
        for (const f of s.getFaces()) {
            if (faceSet1.has(f)) {
                continue;
            }
            const fbox = new Box3();
            const edges = f.getEdges();
            edges.forEach(e => {
                let ebox = objectBoxMap.get(e);
                if (!ebox) {
                    ebox = _calEdgeBox(e);
                    objectBoxMap.set(e, ebox);
                    edgeSet2.add(e);
                }
                fbox.union(ebox);

                vertexSet2.add(e.getStartVertex());
                vertexSet2.add(e.getEndVertex());
            });
            faceBox2Sum.union(fbox);
            objectBoxMap.set(f, fbox);
        }
    }

    if (!checkOverlap1 && !faceBox2Sum.isValid()) {
        return result;
    }

    const getBounds = (obj: Vertex | Edge | Face) => {
        if (obj instanceof Vertex) {
            return [obj.getPoint()];
        }
        const box = objectBoxMap.get(obj)!;
        return [box.min, box.max];
    };
    const objs: Array<Vertex | Edge | Face> = Array.from(vertex1Map.keys());
    vertexSet2.forEach(it => {
        if (!vertex1Map.has(it)) {
            objs.push(it);
        }
    });
    for (const key of objectBoxMap.keys()) {
        objs.push(key);
    }
    const totalBox = faceBox1Sum.clone().union(faceBox2Sum);
    const sizes = totalBox
        .getSize()
        .toArray3()
        .sort((a, b) => a - b);
    const treeCenter = totalBox.getCenter().subtracted(new Vec3(0, 0, totalBox.getSize().z / 2));
    const tree = new Octree(objs, getBounds, treeCenter, sizes[2] + 100, tol.lengthEps);
    vertexSet2.clear();

    // 找到可能相交的面
    const candOverlapFaces = tree
        .getCandidateOverlaps(undefined as any, [faceBox1Sum.min, faceBox1Sum.max])
        .filter(it => it instanceof Face && faceBox1Sum.intersectsBox(objectBoxMap.get(it)!, tol.lengthEps)) as Face[];
    if (!checkOverlap1 && !candOverlapFaces.length) {
        return result;
    }

    // 1.合并vertex
    const vFilter = (v1: Vertex, v2: Vertex) => {
        return !(!checkOverlap1 && v1 !== v2 && vertex1Map.has(v2));
    };
    for (const [key, value] of vertex1Map) {
        if (value) {
            continue;
        }
        const pt = key.getPoint();
        const overlapVs = tree
            .getCandidateOverlaps(key, [pt])
            .filter(
                it => it instanceof Vertex && vFilter(key, it) && it.getPoint().equals(pt, tol.lengthEps),
            ) as Vertex[];
        mergeVertices(overlapVs);

        overlapVs.forEach(v => {
            if (vertex1Map.has(v)) {
                vertex1Map.set(v, true);
            }
        });
        overlapVs.shift();
        tree.remove(overlapVs);
    }
    vertex1Map.clear();

    // 2.边求交打断, 合并重叠边
    const getEdgeBox = (e: Edge) => objectBoxMap.get(e)!;
    edgeIntersection(edgeSet1, edgeSet2, checkOverlap1, getEdgeBox, tree, result, tol);
    edgeSet1.clear();
    edgeSet2.clear();

    // 3.按照不同的surface进行合并
    const mergeMap = new Map<Face[], Face[]>();
    const faceGroups = ShellModelingUtil.divideFacesIntoCoplanarGroups(faces, faceBox1Sum.getCenter());
    for (const coplanarFaceGroup of faceGroups) {
        const overlapFaces = candOverlapFaces.filter(f =>
            alg.CalcOverlap.isSurfacesCoplaner(
                f.getSurface(),
                coplanarFaceGroup[0].getSurface(),
                Tol.DEFAULT,
            ),
        );
        mergeMap.set(coplanarFaceGroup, overlapFaces);
    }
    for (const [key, value] of mergeMap) {
        const tmpRes = facesBooleanCore(value, key, 4, updateSmooth, undefined, undefined, tol);
        mergeShellModelingResult(result, tmpRes);
    }

    return result;
}

export default class FacesShellsMerge extends ShellModelingBase {
    private _faces: Face[];

    private _checkOverlap: boolean;

    private _updateSmooth: boolean;

    private _tolerance: Tol;

    constructor(
        faces: Face[],
        context: Shell[],
        checkFacesOverlap: boolean = false,
        updateSmooth: boolean = true,
        tolerance?: Tol,
    ) {
        super(context);
        this._faces = faces;
        this._checkOverlap = checkFacesOverlap;
        this._updateSmooth = updateSmooth;
        this._tolerance = tolerance || Tol.DEFAULT;
    }

    protected _executeImpl(): IShellModelingResult {
        return facesShellsMerge(
            this._faces,
            this._contextShells,
            this._checkOverlap,
            this._updateSmooth,
            this._tolerance,
        );
    }
}