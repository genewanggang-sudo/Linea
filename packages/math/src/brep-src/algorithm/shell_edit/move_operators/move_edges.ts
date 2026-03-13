import {
    Vec3,
    EN_GEO_TYPE,
    Curve3,
    Plane,
    Ln3,
    Arc3,
    CONST,
    Tol,
    alg,
    Interval,
    Coord3,
    Surface,
    Polygon,
    MathError,
} from '../../../..';
import { Edge } from '../../../brep/edge';
import { Vertex } from '../../../brep/vertex';
import { Face } from '../../../brep/face';
import { Shell } from '../../../brep/shell';
import {
    IShellModifyInfo,
    addShellModifyInfo,
    IShellModelingResult,
    mergeShellModelingResult,
} from '../shell_modeling_result';
import { Coedge3d } from '../../../brep/coedge3d';
import ShellModelingBase from '../shell_modeling_base';
import FacesShellsMerge from '../faces_boolean/faces_shells_boolean';
import { facesSplit } from '../faces_boolean/faces_boolean';
import { splitShell } from '../operator/split_shell';
import { Wire } from '../../..';



interface ICurveIntersectFullInfo {
    overlap: alg.ICurvesXInfo3d; // 重合信息
    curve1: Edge; // 重合的第一条边
    curve2: Edge; // 重合的第二条边
    crv1Inner: boolean; // 第一条曲线是否是内环
    crv2Inner: boolean; // 第二条曲线是否是内环
}

/**
 * 输入：要移动的edges，移动的起始点和终止点，场景内所有的shell（或者移动edges后所有可能相交的shell），如果不穿shells则不会求交分割
 * 限制：目前不允许移动edge之后face自交
 */
export class MoveEdges extends ShellModelingBase {
    private _edges: Set<Edge>;

    private _transVect: Vec3;

    private _overlapInfo: ICurveIntersectFullInfo[] = [];

    private _shell: Shell;

    constructor(edges: Edge[], moveVect: Vec3, context: Shell[] = []) {
        super(context);
        this._edges = new Set(edges);
        this._shell = edges[0].getShell() as Shell;
        this._transVect = moveVect;
    }

    public preview(): IShellModelingResult {
        const result: IShellModelingResult = {};
        try {
            this._previewCore();
        } catch (e) {
            if (e instanceof Error) {
                result.errorStr = e.message;
            }
            return result;
        }
        return result;
    }

    /**
     * move edges and connect vertices
     */
    protected _executeImpl(): IShellModelingResult {
        return this._moveEdgesCore();
    }

    private _moveEdgesCore(): IShellModelingResult {
        const moveEdgesRes: IShellModelingResult = { errorStr: 'success' };
        if (this._transVect.getSqLength() < Tol.LENGTH * Tol.LENGTH || this._edges.size < 1) {
            return moveEdgesRes;
        }

        // 1.get all direct connected edges and vertexs, (indirectly connected)adjacent edges, faces
        const connectElems = this._getAllConnectElems();
        if (connectElems.shells.size > 1) {
            moveEdgesRes.errorStr = 'edges not in one shell';
            return moveEdgesRes; // 不支持多个shell的edge一起平移
        }

        let shell: Shell;
        for (const aShell of connectElems.shells) {
            shell = aShell;
        }
        if (connectElems.vertices.size === shell!.getVertexs().length) {
            shell!.translate(this._transVect);
            const modifiedMap: Map<Shell, IShellModifyInfo> = new Map();
            addShellModifyInfo(modifiedMap, shell!, undefined, undefined, Array.from(connectElems.faces));
            moveEdgesRes.modifiedShellsMap = modifiedMap;
            return moveEdgesRes;
        }

        // 2.judge if can move: move dir constraint
        const adjacentEdges = this._getAllAdjacentEdges(connectElems.vertices);
        const adjacentFaces = this._getAllAdjacentFaces(adjacentEdges, connectElems.faces);
        const getTransStr = this._canUseTransVect(adjacentEdges, adjacentFaces, connectElems.faces);
        if (getTransStr !== '') {
            moveEdgesRes.errorStr = getTransStr;
            return moveEdgesRes;
        }

        // judge if move cause self intersect
        const isSelfIntersect = this._judgeSelfIntersect(
            this._edges,
            adjacentEdges,
            connectElems.vertices,
            connectElems.faces,
            adjacentFaces,
        );
        if (isSelfIntersect) {
            moveEdgesRes.errorStr = 'self intersect!';
            return moveEdgesRes;
        }

        // 3.move all vertices(point) and edge(curve), deal surface
        this._edges.forEach(iEdge => {
            const curve = iEdge.getCurve();
            curve.translate(this._transVect);
        });

        connectElems.vertices.forEach(iVt => {
            const pt = iVt.getPoint();
            pt.translate(this._transVect);
        });

        connectElems.faces.forEach(iFace => {
            const surf = iFace.getSurface();
            if (surf.getType() === EN_GEO_TYPE.PLANE) {
                const plane = surf as Plane;
                const normDir = plane.getNorm();
                if (this._transVect.isPerpendicular(normDir)) {
                    // move in plane, plane surface no change
                } else {
                    // new plane
                    const outWire = iFace.getWires()[0];
                    const edgesCount = outWire.getCoedge3ds().length;
                    if (edgesCount === 1 || edgesCount === 2 || edgesCount > 4) {
                        plane.translate(this._transVect);
                    } else if (edgesCount === 3) {
                        const pt1 = outWire.getCoedge3ds()[0].getStartVertex().getPoint();
                        const pt2 = outWire.getCoedge3ds()[1].getStartVertex().getPoint();
                        const pt3 = outWire.getCoedge3ds()[2].getStartVertex().getPoint();
                        const newPlane = Plane.makeBy3Pts(pt1, pt2, pt3);
                        if (!newPlane) {
                            throw new Error('unkonwn error');
                        }
                        iFace.setSurface(newPlane);
                    } else if (edgesCount === 4) {
                        const pts: Vec3[] = [];
                        for (const iCoe of outWire.getCoedge3ds()) {
                            pts.push(iCoe.getEdge()!.getStartVertex().getPoint());
                        }

                        const newPlane = Plane.makeByPoints(pts);
                        if (!newPlane) {
                            throw new Error('unkonwn error');
                        }

                        iFace.setSurface(newPlane);
                    }
                }
            } else {
                throw new Error('not support non-plane surface');
            }
        });

        // 4.deal adjacent curve (and face)
        this._dealAdjacentCurves(adjacentEdges, connectElems.vertices);
        this._dealAdjacentFaces(adjacentFaces, connectElems.vertices);

        // 5.deal with degenerated cases
        const modifyFaces: Set<Face> = new Set();
        const deleteFaces: Set<Face> = new Set();
        const addFaces: Set<Face> = new Set();
        this._dealDegeneratedCase(modifyFaces, deleteFaces);

        // 6.collect modify and delete faces
        for (const iConnectFace of connectElems.faces) {
            if (shell!.getFaces().findIndex(f => f === iConnectFace) < 0) {
                deleteFaces.add(iConnectFace);
            } else {
                modifyFaces.add(iConnectFace);
            }
        }

        for (const iAdjFace of adjacentFaces) {
            if (shell!.getFaces().findIndex(f => f === iAdjFace) < 0) {
                deleteFaces.add(iAdjFace);
            } else {
                modifyFaces.add(iAdjFace);
            }
        }

        // 7.handle inner outer wire relationship
        const deleteWireFromFace = (theFace: Face, theWire: Wire) => {
            theFace.deleteWire(theWire);
            const ishell = theFace.getShell()!;
            for (const iCoedge of theWire.getCoedge3ds()) {
                const iEdge = iCoedge.getEdge()!;
                iEdge.deleteCoedge3d(iCoedge);

                if (iEdge.getCoedge3ds().length < 1) {
                    const stVt = iEdge.getStartVertex();
                    const endVt = iEdge.getEndVertex();

                    ishell.deleteEdge(iEdge);
                    iEdge.dispose();

                    if (stVt.getEdges().length < 1) {
                        ishell.deleteVertex(stVt);
                    }
                    if (endVt.getEdges().length < 1) {
                        ishell.deleteVertex(endVt);
                    }
                }
            }
        };

        const subtractFaces = []; // 如果移动后,内环和外环相交，构造内外环的face，后续做布尔减
        for (const modifyFace of modifyFaces) {
            if (shell!.getFaces().findIndex(f => f === modifyFace) >= 0) {
                const poly2d: Polygon = modifyFace.calcPolygon();
                const outLoop = poly2d.loops[0];
                if (!outLoop.isAnticlockwise()) {
                    modifyFace.getWires()[0].reverse(); // 如果移动后，外环变成逆时针，需要reverse
                }

                for (let i = 1; i < poly2d.loops.length; i++) {
                    const iWire = modifyFace.getWires()[i];
                    const iloop = poly2d.loops[i];
                    const posJudge = alg.PJ.loopToLoop(outLoop, iloop);
                    // 如果移动后,内环还在外环内，不需要处理
                    if (posJudge === alg.LoopsPJType.OUT) {
                        // 如果移动后,内环在外环外，删除内环
                        deleteWireFromFace(modifyFace, iWire);
                    } else if (posJudge === alg.LoopsPJType.INTERSECT) {
                        // 如果移动后,内环和外环相交：有两种方案，一种是用外环减去内环，三维wire做布尔减比较麻烦；另一种方案，构造内外环的face，并将此内环从face中删除，后续做face的布尔减
                        deleteWireFromFace(modifyFace, iWire);
                        iWire.reverse();
                    }
                }
                subtractFaces.push(modifyFace);
            }
        }

        const modifiedMap: Map<Shell, IShellModifyInfo> = new Map();
        const modifyFacesArray: Face[] = [];
        const deleteFacesArray: Face[] = [];
        const addFacesArray: Face[] = [];
        modifyFaces.forEach(f => modifyFacesArray.push(f));
        deleteFaces.forEach(f => deleteFacesArray.push(f));
        addFaces.forEach(f => addFacesArray.push(f));
        addShellModifyInfo(modifiedMap, shell!, addFacesArray, deleteFacesArray, modifyFacesArray);
        moveEdgesRes.modifiedShellsMap = modifiedMap;

        // 移动后处理：1.发生改变的face要和其他没变的face做布尔运算，否则有些情况会面重叠。
        // 如下，内环内有个face(f2)，移动后f2跟f0没关系，和f1也没建立关系，需要将f2和f1做分割合并
        /*
                 _________________________           _________________________
                ｜ f0   ______   |   f1   |         ｜f0|    ______      f1   |
                ｜     |  f2  |  |        |    =>   ｜  |   |  f2  |          |
                ｜     |______|  |e       |         ｜  |e  |______|          |
                ｜_______________|________|         ｜__|_____________________|
        */
        // 先把changed face按surface分组
        const allChangedFaces: Face[] = [];
        moveEdgesRes.modifiedShellsMap.forEach(_m => {
            if (_m.modifiedFaces) allChangedFaces.push(..._m.modifiedFaces);
            if (_m.addFaces) allChangedFaces.push(..._m.addFaces);
        });
        const revFaces: { surf: Surface; faces: Face[] }[] = [];
        for (const rf of allChangedFaces) {
            const rfSurf = rf.getSurface();
            let hasInArray = false;
            for (const it of revFaces) {
                if (alg.CalcOverlap.isSurfacesCoplaner(rfSurf, it.surf)) {
                    hasInArray = true;
                    it.faces.push(rf);
                    break;
                }
            }

            if (!hasInArray) {
                revFaces.push({ surf: rfSurf, faces: [rf] });
            }
        }

        for (const rfInfos of revFaces) {
            const otherFaces: Face[] = [];
            for (const iface of shell!.getFaces()) {
                // surface相同但face不同，做面分割
                if (
                    !rfInfos.faces.find(_f => _f.tag === iface.tag) &&
                    alg.CalcOverlap.isSurfacesCoplaner(rfInfos.surf, iface.getSurface())
                ) {
                    otherFaces.push(iface);
                }
            }
            if (otherFaces.length < 1) {
                continue;
            }
            const splitFaceRes = facesSplit(rfInfos.faces, otherFaces);
            mergeShellModelingResult(moveEdgesRes, splitFaceRes);
        }

        // 移动后处理：2.如果移动后一个shell出现多个不相连的face，要分割shell
        const allShellFaces: Face[] = [];
        const splitResult: IShellModelingResult = { addShells: [], modifiedShellsMap: new Map() };
        for (const s of connectElems.shells) {
            const splitShells = splitShell(s);
            splitShells.map(split => allShellFaces.push(...split.getFaces()));

            for (let index = 1; index < splitShells.length; index++) {
                addShellModifyInfo(splitResult.modifiedShellsMap!, s, undefined, splitShells[index].getFaces().slice());
                splitResult.addShells!.push(splitShells[index]);
            }
        }
        mergeShellModelingResult(moveEdgesRes, splitResult);

        // 移动后处理：3.单个shell处理完，要和外面的_contextShells做merge
        if (this._contextShells.length > 0) {
            const mergeRes = new FacesShellsMerge(allShellFaces, this._contextShells, true).execute();
            mergeShellModelingResult(moveEdgesRes, mergeRes);
        }
        return moveEdgesRes;
    }

    private _previewCore(): IShellModelingResult {
        // 以前的实现就是和移动流程一样，修改之后反而有出路，现在先这样保持一直（目前外部统一调用movecore）
        return this._moveEdgesCore();
    }

    private _getAllConnectElems(): { vertices: Set<Vertex>; faces: Set<Face>; shells: Set<Shell> } {
        const connectVts: Set<Vertex> = new Set();
        const connectFaces: Set<Face> = new Set();
        const connectShells: Set<Shell> = new Set();
        this._edges.forEach(iEdge => {
            if (iEdge.getParent()) {
                connectShells.add(iEdge.getParent() as Shell);
            }

            for (const adjFace of iEdge.getFaces()) {
                connectFaces.add(adjFace);
            }
            connectVts.add(iEdge.getStartVertex());
            connectVts.add(iEdge.getEndVertex());
        });

        return { vertices: connectVts, faces: connectFaces, shells: connectShells };
    }

    private _getAllAdjacentEdges(vertics: Set<Vertex>): Set<Edge> {
        const adjacentEdges: Set<Edge> = new Set();
        vertics.forEach(iVt => {
            for (const adjEdge of iVt.getEdges()) {
                if (!this._edges.has(adjEdge)) {
                    adjacentEdges.add(adjEdge);
                }
            }
        });

        return adjacentEdges;
    }

    private _getAllAdjacentFaces(adjEdges: Set<Edge>, connectFaces: Set<Face>): Set<Face> {
        const adjacentFaces: Set<Face> = new Set();
        adjEdges.forEach(iEdge => {
            iEdge.getFaces().forEach(adjFace => {
                if (!connectFaces.has(adjFace)) {
                    adjacentFaces.add(adjFace);
                }
            });
        });

        return adjacentFaces;
    }

    private _canUseTransVect(adjEdges: Set<Edge>, adjFaces: Set<Face>, connectFaces: Set<Face>): string {
        for (const iAdjEdge of adjEdges) {
            const adjCurveType = iAdjEdge.getCurve().getType();
            if (adjCurveType !== EN_GEO_TYPE.LN_3 && adjCurveType !== EN_GEO_TYPE.ARC_3) {
                return 'adjacent curve is not line or arc';
            }
        }

        for (const iFace of connectFaces) {
            const surf = iFace.getSurface();
            // 暂时不支持圆柱的edge的move, 后续也许可以支持
            if (surf.getType() !== EN_GEO_TYPE.PLANE) {
                return 'surface is not plane';
            }
            // if (surf.getType() !== EN_GEO_TYPE.PLANE || surf.getType() !== EN_GEO_TYPE.CYLINDER) {
            //     return false;
            // }

            const plane = surf as Plane;
            const normDir = plane.getNorm();
            if (!this._transVect.isPerpendicular(normDir)) {
                if (iFace.getWires().length > 1) {
                    return 'face has inner wire';
                }

                const outWire = iFace.getWires()[0];

                const allFaceVts: Set<Vertex> = new Set();
                for (const iCoedge of outWire.getCoedge3ds()) {
                    allFaceVts.add(iCoedge.getStartVertex());
                }

                const faceCoedgesInMovesSet: Coedge3d[] = [];
                for (const tmpCoedge of outWire.getCoedge3ds()) {
                    const tmpEdge = tmpCoedge.getEdge()!;
                    if (this._edges.has(tmpEdge)) {
                        faceCoedgesInMovesSet.push(tmpCoedge);
                    }
                }

                const faceVtsInMovesSet: Set<Vertex> = new Set();
                for (const iCoedge of faceCoedgesInMovesSet) {
                    faceVtsInMovesSet.add(iCoedge.getStartVertex());
                    faceVtsInMovesSet.add(iCoedge.getEndVertex());
                }

                if (faceVtsInMovesSet.size === allFaceVts.size) {
                    continue; // 如果face内所有的edge都被移动
                }
                if (faceVtsInMovesSet.size > 2) {
                    return "can't move";
                }

                if (allFaceVts.size > 4) {
                    return "can't move";
                } // 对于4个顶点的plane,如果移动的edge与对边不平行，其实也不能法向移动，由于判断麻烦，在构造时判断
                if (allFaceVts.size === 4) {
                    for (const iCoedge of outWire.getCoedge3ds()) {
                        const curvei = iCoedge.getEdge()!.getCurve();
                        if (curvei.getType() !== EN_GEO_TYPE.LN_3) {
                            return "can't move";
                        }
                    }

                    // 经过前面过滤，此处faceCoedgesInMovesSet.length === 1
                    const moveCoedge = faceCoedgesInMovesSet[0];
                    const coedgeIndex = moveCoedge.getIndexInWire();
                    const coedge2 = outWire.getCoedge3dByIndex((coedgeIndex + 2) % 4)!;
                    const moveCurve = moveCoedge.getEdge()!.getCurve() as Ln3;
                    const curve2 = coedge2.getEdge()!.getCurve() as Ln3;
                    if (!moveCurve.isParallelTo(curve2)) {
                        return "can't move";
                    }
                }
                if (allFaceVts.size === 3) {
                    for (const iCoe of outWire.getCoedge3ds()) {
                        const curvei = iCoe.getEdge()!.getCurve();
                        if (curvei.getType() !== EN_GEO_TYPE.LN_3) {
                            return "can't move";
                        }
                    }
                }
            }
        }

        for (const iAdjFace of adjFaces) {
            const surf = iAdjFace.getSurface();
            if (surf.getType() !== EN_GEO_TYPE.PLANE) {
                return 'connect surface is not plane';
            }

            const plane = surf as Plane;
            const normDir = plane.getNorm();
            if (!this._transVect.isPerpendicular(normDir)) {
                if (iAdjFace.getWires().length > 1) {
                    return 'connect face has inner wire';
                }

                const outWire = iAdjFace.getWires()[0];
                const edgesCount = outWire.getCoedge3ds().length;
                if (edgesCount > 3) {
                    return "can't move"; // 对于只有三个顶点的plane,法向移动,可以重新构造相邻的plane
                }

                for (const iCoe of outWire.getCoedge3ds()) {
                    const curvei = iCoe.getEdge()!.getCurve();
                    if (curvei.getType() !== EN_GEO_TYPE.LN_3) {
                        return "can't move";
                    }
                }
            }
        }

        return '';
    }

    private _judgeSelfIntersect(
        connectEdges: Set<Edge>,
        adjacentEdges: Set<Edge>,
        connectVertices: Set<Vertex>,
        connectFaces: Set<Face>,
        adjFaces: Set<Face>,
    ): boolean {
        const edgeMoveMap: Map<Edge, Curve3> = new Map();
        const vtsMoveMap: Map<Vertex, Vec3> = new Map();

        connectEdges.forEach(iEdge => {
            const curve = iEdge.getCurve().clone();
            curve.translate(this._transVect);
            edgeMoveMap.set(iEdge, curve);
        });

        connectVertices.forEach(iVt => {
            const pt = iVt.getPoint().clone();
            pt.translate(this._transVect);
            vtsMoveMap.set(iVt, pt);
        });

        adjacentEdges.forEach(iAdjEdge => {
            const curve = iAdjEdge.getCurve().clone();
            if (connectVertices.has(iAdjEdge.getStartVertex()) && connectVertices.has(iAdjEdge.getEndVertex())) {
                // move curve
                curve.translate(this._transVect);
                edgeMoveMap.set(iAdjEdge, curve);
            } else {
                // create new curve

                if (curve.getType() === EN_GEO_TYPE.LN_3) {
                    let stPt = vtsMoveMap.get(iAdjEdge.getStartVertex());
                    stPt = stPt !== undefined ? stPt : iAdjEdge.getStartVertex().getPoint();
                    let endPt = vtsMoveMap.get(iAdjEdge.getEndVertex());
                    endPt = endPt !== undefined ? endPt : iAdjEdge.getEndVertex().getPoint();
                    let newCurve: Curve3;
                    if (stPt.equals(endPt)) {
                        newCurve = new Ln3(stPt, new Vec3(1, 0, 0), [0, 0]); // 退化情况，会构造出一条0长的line
                    } else {
                        newCurve = new Ln3(stPt, endPt);
                    }
                    edgeMoveMap.set(iAdjEdge, newCurve);
                } else if (curve.getType() === EN_GEO_TYPE.ARC_3) {
                    const arc3d = iAdjEdge.getCurve() as Arc3;
                    const angle = arc3d.getRange().getLength();
                    const sin = Math.sin(angle / 2);
                    const dz = arc3d.getNormal();

                    let stVtPt = vtsMoveMap.get(iAdjEdge.getStartVertex());
                    stVtPt = stVtPt !== undefined ? stVtPt : iAdjEdge.getStartVertex().getPoint();
                    let endVtPt = vtsMoveMap.get(iAdjEdge.getEndVertex());
                    endVtPt = endVtPt !== undefined ? endVtPt : iAdjEdge.getEndVertex().getPoint();
                    const newMidPt = stVtPt.midTo(endVtPt);
                    const tmpDir = endVtPt.subtracted(stVtPt);
                    const centerLineDir = dz.cross(tmpDir).normalize();
                    if (angle > CONST.PI) {
                        centerLineDir.reverse();
                    }
                    const tmpLine = new Ln3(newMidPt, centerLineDir, Interval.infinitArray());

                    const halhChordLength = newMidPt.distanceTo(stVtPt);
                    const newRadius = halhChordLength / sin;
                    const t = Math.sqrt(newRadius * newRadius - halhChordLength * halhChordLength);
                    const newCenter = tmpLine.getPtAt(t);

                    // 如果是椭圆，按照长短轴比例分配，但是可能存在问题
                    const rb = (newRadius * arc3d.getB()) / arc3d.getA();
                    const dx = tmpDir.reversed();
                    const dy = angle > CONST.PI ? centerLineDir : centerLineDir.reversed();
                    const newCoord = new Coord3(newCenter, dx, dy);
                    const stParam = dx.angleTo(stVtPt.subtracted(newCenter), dz);
                    const newCurve = new Arc3(newCoord, newRadius, rb, [stParam, stParam + angle]);
                    edgeMoveMap.set(iAdjEdge, newCurve);
                } else {
                    throw new Error('not support curve type');
                }
            }
        });

        for (const iConFace of connectFaces) {
            const faceCurveWithInfo: [Curve3, Edge | undefined, boolean][] = [];
            const wires = iConFace.getWires();
            for (let i = 0; i < wires.length; ++i) {
                const iWire = wires[i];
                for (const iCoedge of iWire.getCoedge3ds()) {
                    let faceCurve = edgeMoveMap.get(iCoedge.getEdge()!);
                    if (!faceCurve) {
                        faceCurve = iCoedge.getEdge()!.getCurve();
                    }
                    faceCurveWithInfo.push([faceCurve, iCoedge.getEdge(), i !== 0]);
                }
            }

            for (let i = 0; i < faceCurveWithInfo.length; i++) {
                const curvei = faceCurveWithInfo[i][0];
                for (let j = i + 1; j < faceCurveWithInfo.length; j++) {
                    const curvej = faceCurveWithInfo[j][0];
                    const interPtInfos = alg.X.curve3ds(curvei, curvej);
                    for (const inPt of interPtInfos) {
                        if (inPt.isOverlap) {
                            if (faceCurveWithInfo[i][1] && faceCurveWithInfo[j][1]) {
                                this._overlapInfo.push({
                                    overlap: inPt,
                                    curve1: faceCurveWithInfo[i][1] as Edge,
                                    curve2: faceCurveWithInfo[j][1] as Edge,
                                    crv1Inner: faceCurveWithInfo[i][2],
                                    crv2Inner: faceCurveWithInfo[j][2],
                                });
                            }
                            continue;
                        }
                        if (
                            inPt.point.equals(curvej.getStartPt()) ||
                            inPt.point.equals(curvej.getEndPt()) ||
                            inPt.point.equals(curvei.getStartPt()) ||
                            inPt.point.equals(curvei.getEndPt())
                        ) {
                            continue;
                        } else {
                            return true;
                        }
                    }
                }
            }
        }

        for (const iAdjFace of adjFaces) {
            const faceCurveWithInfo: [Curve3, Edge | undefined, boolean][] = [];
            const wires = iAdjFace.getWires();
            for (let i = 0; i < wires.length; ++i) {
                const iWire = wires[i];
                for (const iCoedge of iWire.getCoedge3ds()) {
                    let faceCurve = edgeMoveMap.get(iCoedge.getEdge()!);
                    if (!faceCurve) {
                        faceCurve = iCoedge.getEdge()!.getCurve();
                    }
                    faceCurveWithInfo.push([faceCurve, iCoedge.getEdge(), i !== 0]);
                }
            }

            for (let i = 0; i < faceCurveWithInfo.length; i++) {
                const curvei = faceCurveWithInfo[i][0];
                for (let j = i + 1; j < faceCurveWithInfo.length; j++) {
                    const curvej = faceCurveWithInfo[j][0];
                    const interPtInfos = alg.X.curve3ds(curvei, curvej);
                    for (const inPt of interPtInfos) {
                        if (inPt.point.equals(curvej.getStartPt()) || inPt.point.equals(curvej.getEndPt())) {
                            continue;
                        } else {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    }

    private _dealAdjacentCurves(adjEdges: Set<Edge>, vertices: Set<Vertex>) {
        adjEdges.forEach(iAdjEdge => {
            if (vertices.has(iAdjEdge.getStartVertex()) && vertices.has(iAdjEdge.getEndVertex())) {
                // move
                const curve = iAdjEdge.getCurve();
                curve.translate(this._transVect);
            } else {
                const curve = iAdjEdge.getCurve();
                if (curve.isLine3d()) {
                    const stPt = iAdjEdge.getStartVertex().getPoint();
                    const endPt = iAdjEdge.getEndVertex().getPoint();
                    let newCurve: Curve3;
                    if (stPt.equals(endPt)) {
                        newCurve = new Ln3(stPt, new Vec3(1, 0, 0), [0, 0]); // 退化情况，会构造出一条0长的line
                    } else {
                        newCurve = new Ln3(stPt, endPt);
                    }
                    iAdjEdge.setCurve(newCurve);
                } else if (curve.isArc3d()) {
                    const arc3d = iAdjEdge.getCurve() as Arc3;
                    const angle = arc3d.getRange().getLength();
                    const sin = Math.sin(angle / 2);
                    const dz = arc3d.getNormal();

                    const stVtPt = iAdjEdge.getStartVertex().getPoint();
                    const endVtPt = iAdjEdge.getEndVertex().getPoint();
                    const newMidPt = stVtPt.midTo(endVtPt);
                    const tmpDir = endVtPt.subtracted(stVtPt);
                    const centerLineDir = dz.cross(tmpDir).normalize();
                    if (angle > CONST.PI) {
                        centerLineDir.reverse();
                    }
                    const tmpLine = new Ln3(newMidPt, centerLineDir, Interval.infinitArray());

                    const halhChordLength = newMidPt.distanceTo(stVtPt);
                    const newRadius = halhChordLength / sin;
                    const t = Math.sqrt(newRadius * newRadius - halhChordLength * halhChordLength);
                    const newCenter = tmpLine.getPtAt(t);

                    // 如果是椭圆，按照长短轴比例分配，但是可能存在问题
                    const rb = (newRadius * arc3d.getB()) / arc3d.getA();
                    const dx = tmpDir.reversed();
                    const dy = angle > CONST.PI ? centerLineDir : centerLineDir.reversed();
                    const newCoord = new Coord3(newCenter, dx, dy);
                    const stParam = dx.angleTo(stVtPt.subtracted(newCenter), dz);
                    const newCurve = new Arc3(newCoord, newRadius, rb, [stParam, stParam + angle]);
                    iAdjEdge.setCurve(newCurve);
                } else {
                    throw new Error('not support curve type');
                }
            }
        });
    }

    // 如果face的edge的条数为3，是可以允许surface变动的
    private _dealAdjacentFaces(adjFaces: Set<Face>, vertices: Set<Vertex>) {
        for (const iAdjFace of adjFaces) {
            const surf = iAdjFace.getSurface();
            if (surf.getType() === EN_GEO_TYPE.PLANE) {
                const plane = surf as Plane;
                const normDir = plane.getNorm();
                if (this._transVect.isPerpendicular(normDir)) {
                    // move in plane, plane surface no change
                } else {
                    // new plane
                    const outWire = iAdjFace.getWires()[0];
                    const edgesCount = outWire.getCoedge3ds().length;
                    if (edgesCount === 3) {
                        const pt1 = outWire.getCoedge3ds()[0].getStartVertex().getPoint();
                        const pt2 = outWire.getCoedge3ds()[1].getStartVertex().getPoint();
                        const pt3 = outWire.getCoedge3ds()[2].getStartVertex().getPoint();
                        const newPlane = Plane.makeBy3Pts(pt1, pt2, pt3);
                        if (!newPlane) {
                            throw new Error('unkonwn error'); // 处理曲面退化情况，三点成线
                        }
                        iAdjFace.setSurface(newPlane);
                    } else {
                        throw new Error('unkonwn error');
                    }
                }
            } else {
                throw new Error('not support non-plane surface');
            }
        }
    }

    // 处理退化的edge和退化的face
    private _dealDegeneratedCase(modifyFaces: Set<Face>, deleteFaces: Set<Face>) {
        if (this._overlapInfo.length < 1) {
            return;
        }
        MathError.assert(this._edges.size === 1, '暂时不支持多条移动边重合情况');

        // 获取重合边切分点
        let movedEdge: Edge;
        this._edges.forEach(e => {
            movedEdge! = e;
        });
        const overEdges: Edge[] = [];
        const points: Vec3[] = [];
        this._overlapInfo.forEach(overlap => {
            if (overlap.curve1 === movedEdge) {
                overEdges.push(overlap.curve2);
            } else {
                overEdges.push(overlap.curve1);
            }
            points.push(overlap.curve1.getCurve().getStartPt());
            points.push(overlap.curve1.getCurve().getEndPt());
            points.push(overlap.curve2.getCurve().getStartPt());
            points.push(overlap.curve2.getCurve().getEndPt());
            const range = overlap.overlap.overlap1 as Interval;
            points.push(overlap.curve1.getCurve().getPtAt(range.min));
            points.push(overlap.curve1.getCurve().getPtAt(range.max));
        });

        const dir = (movedEdge!.getCurve() as Ln3).getDirection();
        function sortByEdgeDir(a: Vec3, b: Vec3): number {
            if (a.subtracted(b).dot(dir) > 0) return 1;
            if (a.subtracted(b).dot(dir) < 0) return -1;
            return 0;
        }
        points.sort(sortByEdgeDir);

        const newPoints = [];
        newPoints.push(points[0]);
        for (let i = 1; i < points.length; ++i) {
            if (points[i - 1].equals(points[i])) continue;
            newPoints.push(points[i]);
        }
        MathError.assert(newPoints.length > 1, '重合情况出错');

        // 获取重合边对应新的点线，重合边暂时均为直线
        const vertexs: Set<Vertex> = new Set();
        let Vertex0 = this._shell.createVertex(newPoints[0]);
        vertexs.add(Vertex0);
        const newEdges = [];
        for (let i = 1; i < newPoints.length; ++i) {
            const vertex1 = this._shell.createVertex(newPoints[i]);
            const edge = this._shell.createEdge(new Ln3(newPoints[i - 1], newPoints[i]), Vertex0, vertex1);
            Vertex0 = vertex1;
            vertexs.add(Vertex0);
            newEdges.push(edge);
        }

        const oldNewEdgeMap: Map<Edge, Edge[]> = new Map();
        overEdges.push(movedEdge!);
        for (const e of overEdges) {
            const edges: Edge[] = [];
            for (const newE of newEdges) {
                if (
                    e.getCurve().containsPt(newE.getCurve().getStartPt()) &&
                    e.getCurve().containsPt(newE.getCurve().getEndPt())
                ) {
                    edges.push(newE);
                }
            }
            oldNewEdgeMap.set(e, edges);
        }

        // 旧新edge替换，通过edge找到对应的face，再通过face找到coedge，替换coedge
        for (const ele of oldNewEdgeMap) {
            const oldEdge = ele[0];
            const newEs = ele[1];
            if (newEs.length < 1) continue;
            const isSameDir = oldEdge.getCurve().getEndTangent().isSameDirection(newEs[0].getCurve().getEndTangent());
            oldEdge.getFaces().forEach(face => {
                face.getWires().forEach(wire => {
                    const coEdges = wire.getCoedge3ds();
                    for (let i = 0; i <= coEdges.length - 1; ++i) {
                        const coEdge = coEdges[i];
                        if (oldEdge === coEdge.getEdge()) {
                            const insertCoEdges: Coedge3d[] = [];
                            const coEdgeDir = isSameDir ? coEdge.getSameDirWithEdge() : !coEdge.getSameDirWithEdge();
                            newEs.forEach(newEdge => {
                                insertCoEdges.push(new Coedge3d(newEdge, coEdgeDir));
                            });
                            if (!coEdgeDir) insertCoEdges.reverse();
                            wire.replaceCoedge3d(i, insertCoEdges);
                            modifyFaces.add(face);
                            break;
                        }
                    }
                });
            });
        }

        // 替换Vertex
        for (const ele of oldNewEdgeMap) {
            const oldEdge = ele[0];
            const newEs = ele[1];
            if (newEs.length < 1) continue;
            const isSameDir = oldEdge.getCurve().getEndTangent().isSameDirection(newEs[0].getCurve().getEndTangent());

            const stVertex = oldEdge.getStartVertex();
            const endVertex = oldEdge.getEndVertex();
            const replaceVertex = (oldVertex: Vertex, newVertex: Vertex) => {
                oldVertex.getEdges().forEach(edge => {
                    if (oldVertex.getPoint().equals(edge.getStartVertex().getPoint())) {
                        edge.setStartVertex(newVertex);
                    }
                    if (oldVertex.getPoint().equals(edge.getEndVertex().getPoint())) {
                        edge.setEndVertex(newVertex);
                    }
                });
                if (!vertexs.has(oldVertex)) this._shell.deleteVertex(oldVertex);
            };
            if (isSameDir) {
                replaceVertex(stVertex, newEs[0].getStartVertex());
                replaceVertex(endVertex, newEs[newEs.length - 1].getEndVertex());
            } else {
                replaceVertex(endVertex, newEs[0].getStartVertex());
                replaceVertex(stVertex, newEs[newEs.length - 1].getEndVertex());
            }
            oldEdge.dispose();
            this._shell.deleteEdge(oldEdge);
        }

        // 统一处理，删除无效点线
        const delEdges: Edge[] = [];
        for (const edge of this._shell.getEdges()) {
            const curve = edge.getCurve();
            if (edge.getCoedge3ds().length < 1) {
                delEdges.push(edge);
                continue;
            }
            if (curve.getLength() < Tol.LENGTH) {
                const coedges = edge.getCoedge3ds();
                for (const iCoe of coedges) {
                    const iWire = iCoe.getWire()!;
                    iWire.deleteCoedge3d(iCoe);
                }

                this._shell.deleteEdge(edge);
                edge.dispose();
            }
        }
        delEdges.forEach(e => {
            e.dispose();
            this._shell.deleteEdge(e);
        });

        // 处理同一面内coedge属于同一条边的情况，包括外环内部，内环与外环，内环内部
        for (const modifyFace of modifyFaces) {
            const wires = modifyFace.getWires();
            // 处理环与环之间coedge重合的情况
            for (let i = 0; i < wires.length; ++i) {
                for (let j = i + 1; j < wires.length; ++j) {
                    const icoEdges = wires[i].getCoedge3ds();
                    const jcoEdges = wires[j].getCoedge3ds();
                    if (icoEdges.length < 1 || jcoEdges.length < 1) continue;
                    for (let index = 0; index < icoEdges.length; ++index) {
                        const flag = jcoEdges.findIndex(coEdge => icoEdges[index].getEdge() === coEdge.getEdge());
                        if (flag > -1) {
                            const replaceCoEdges = jcoEdges.slice(flag + 1).concat(jcoEdges.slice(0, flag));
                            icoEdges[index].dispose();
                            wires[i].replaceCoedge3d(index, replaceCoEdges);
                            wires[j].dispose();
                            break;
                        }
                    }
                }
            }
            modifyFace.setWires(modifyFace.getWires().filter(_ => _.getCoedge3ds().length > 0));

            // 处理环内部的重合情况，可能会构成多个孔
            for (const wire of wires) {
                const coEdges = wire.getCoedge3ds();
                const delCoEdge: Set<Coedge3d> = new Set();
                for (let i = 0; i < coEdges.length; ++i) {
                    if (delCoEdge.has(coEdges[i])) continue;
                    for (let j = i + 1; j < coEdges.length; ++j) {
                        if (delCoEdge.has(coEdges[j])) continue;
                        if (coEdges[i].getEdge() === coEdges[j].getEdge()) {
                            delCoEdge.add(coEdges[i]);
                            delCoEdge.add(coEdges[j]);
                        }
                    }
                }
                for (const del of delCoEdge) {
                    wire.deleteCoedge3d(del);
                    del.dispose();
                }
            }

            const ws = modifyFace.getWires();
            const newWires: Wire[] = [];
            for (const w of ws) {
                if (w.getCoedge3ds().length < 3) {
                    w.dispose();
                    break;
                }
                newWires.push(w);
            }
            modifyFace.setWires(newWires);
            if (modifyFace.getWires().length < 1) {
                deleteFaces.add(modifyFace);
                modifyFaces.delete(modifyFace);
                this._shell.deleteFace(modifyFace);
            }
        }

        for (const e of this._shell.getEdges()) {
            if (e.getCoedge3ds().length < 1) {
                this._shell.deleteEdge(e);
            }
        }
        for (const v of this._shell.getVertexs()) {
            if (v.getEdges().length < 1) {
                this._shell.deleteVertex(v);
            }
        }
    }
}