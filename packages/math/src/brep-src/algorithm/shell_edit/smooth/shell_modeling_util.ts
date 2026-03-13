import { Plane, Tol, Vec3, alg, Loop, Curve3, Arc3, OffsetCurve3 } from '../../../..';
import { Edge } from '../../../brep/edge';
import { Face } from '../../../brep/face';
import { detectLoopFromEdges, VirtualLoop } from './detect_loop_util';



export class ShellModelingUtil {
    /**
     * 将一些面按照共surface进行分组
     * @param faces 待分组的面
     * @param facesCenter 面的大致中心点，减少误差
     */
    public static divideFacesIntoCoplanarGroups(faces: Iterable<Face>, facesCenter: Vec3 = new Vec3()): Face[][] {
        const findFaceGroup = (theFace: Face, faceGroups: Face[][]) => {
            if (faceGroups.length === 0) {
                return false;
            }

            const theSurf = theFace.getSurface();
            for (const tmpFaceGroup of faceGroups) {
                const groupSurf = tmpFaceGroup[0].getSurface();
                if (alg.CalcOverlap.isSurfacesCoplaner(theSurf, groupSurf, Tol.DEFAULT)) {
                    tmpFaceGroup.push(theFace);
                    return true;
                }
            }

            return false;
        };

        const calPlaneConstant = (p: Plane) => {
            const d = facesCenter.subtracted(p.getOrigin()).dot(p.getNorm());
            return `${Math.round(Math.abs(d) * 1e5)}`;
        };
        const coplanarFaceGroups: Face[][] = [];
        const planeConstantMap = new Map<string, Face[][]>();
        for (const tmpFacei of faces) {
            let tmpGroups: Face[][] | undefined = coplanarFaceGroups;

            const surface = tmpFacei.getSurface();
            if (surface.isPlane()) {
                const constant = calPlaneConstant(surface as Plane);
                tmpGroups = planeConstantMap.get(constant);
                if (!tmpGroups) {
                    tmpGroups = [];
                    planeConstantMap.set(constant, tmpGroups);
                }
            }
            const canFindGroup = findFaceGroup(tmpFacei, tmpGroups);
            if (!canFindGroup) {
                tmpGroups.push([tmpFacei]);
            }
        }

        coplanarFaceGroups.push(...Array.from(planeConstantMap.values()).flat());
        return coplanarFaceGroups;
    }

    /**
     * 将一些面按照拓扑连接关系进行分组
     * @param faces 待分组的面
     * @param vertexConnect 考虑共点的连接，默认为true
     */
    public static divideFacesIntoConnectGroups(faces: Iterable<Face>, vertexConnect: boolean = true): Face[][] {
        let getNeighborFaces: (f: Face) => Face[];
        if (vertexConnect) {
            getNeighborFaces = (f: Face) => {
                const fSet = new Set<Face>();
                f.getVertexes().forEach(v => v.getFaces().forEach(it => fSet.add(it)));
                return Array.from(fSet);
            };
        } else {
            getNeighborFaces = (f: Face) => {
                const fSet = new Set<Face>();
                for (const w of f.getWires()) {
                    w.getCoedge3ds().forEach(co => co.getTwins().forEach(it => fSet.add(it.getFace()!)));
                }
                return Array.from(fSet);
            };
        }

        const allFacesSet = new Set(faces);
        const faceGroups: Face[][] = [];
        const recordFaces = new Set<Face>();
        for (const face of faces) {
            if (recordFaces.has(face)) {
                continue;
            }
            const tempFaces: Set<Face> = this._getFaceGroup(face, getNeighborFaces, allFacesSet);
            tempFaces.forEach(f => recordFaces.add(f));
            faceGroups.push(Array.from(tempFaces));
        }

        return faceGroups;
    }

    // 从一堆共面的edge中，搜索面
    public static detectFacesFromEdges(edges: Edge[], plane: Plane) {
        const validEdgeSet = new Set<Edge>(edges);
        const boundaryLoops: VirtualLoop[] = [];

        const edgeValidMap: Map<Edge, boolean> = new Map();
        validEdgeSet.forEach(e => edgeValidMap.set(e, true));
        for (const [edge, flag] of edgeValidMap) {
            if (flag) {
                const virLoop = detectLoopFromEdges(edge, true, plane, true, validEdgeSet);
                if (virLoop && virLoop.edges.every(e => edgeValidMap.get(e.edge))) {
                    // update result and map.
                    boundaryLoops.push(virLoop);
                    for (const ve of virLoop.edges) {
                        if (edgeValidMap.get(ve.edge)) {
                            edgeValidMap.set(ve.edge, false);
                        }
                        validEdgeSet.delete(ve.edge);
                    }
                }
            }
        }

        const toLoop = (vLoop: VirtualLoop) => {
            const bc2ds = vLoop.bc3ds.map(b3 => plane.getCurve2d(b3)!);
            return new Loop(bc2ds);
        };

        // 组成新的面
        const resultFaces = alg.ILoopsToPolygonExes.execute<VirtualLoop>(boundaryLoops, true, false, toLoop);
        return resultFaces;
    }

    // 依据一些curve， 如果都共面，找到平面；否则返回undefined
    public static getCoplanarPlane(curves: Curve3[]): { plane: Plane | undefined; state: number } {
        let resultPlane: Plane | undefined;
        const planeArray: Plane[] = [];
        for (const curve of curves) {
            if (curve instanceof Arc3) {
                const arc = curve as Arc3;
                planeArray.push(new Plane(arc.getCoord()));
            } else if (curve instanceof OffsetCurve3 && curve.getBaseCurve() instanceof Arc3) {
                planeArray.push(new Plane((curve.getBaseCurve() as Arc3).getCoord()));
            }
        }
        if (planeArray.length) {
            resultPlane = planeArray[0];
            for (let index = 1; index < planeArray.length; index++) {
                const curPlane = planeArray[index];
                if (!curPlane.isCoplanar(resultPlane)) {
                    return { plane: undefined, state: -1 };
                }
            }
        }

        const points: Vec3[] = [];
        for (const curve of curves) {
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
        if (!resultPlane) {
            resultPlane = Plane.makeByPoints(points);
        }

        if (resultPlane) {
            const bCoplanar = points.every(pt => resultPlane!.containsPt(pt));
            if (bCoplanar) {
                return { plane: resultPlane, state: 1 };
            }
            // 有些点并不在计算出来的平面上，误差原因等
            return { plane: undefined, state: -1 };
        }
        return { plane: undefined, state: 0 };
    }

    private static _getFaceGroup(face: Face, getNeighborFaces: (f: Face) => Face[], allFaces: Set<Face>): Set<Face> {
        const tempfaces: Face[] = [];
        const resultfaces = new Set<Face>();
        let head: number = 0;
        tempfaces.push(face);
        resultfaces.add(face);
        while (head < tempfaces.length) {
            const curface: Face = tempfaces[head];
            for (const itemface of getNeighborFaces(curface)) {
                if (resultfaces.has(itemface) || !allFaces.has(itemface)) {
                    continue;
                }
                tempfaces.push(itemface);
                resultfaces.add(itemface);
            }
            head++;
        }

        return resultfaces;
    }
}