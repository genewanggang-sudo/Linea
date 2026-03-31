import {
    Curve2,
    Curve3,
    Cylinder,
    Ln3,
    Loop,
    alg,
    Util,
    Plane,
    Surface,
    Tol,
    Vec3,
} from '../../../..';
import { Edge } from '../../../brep/edge';
import { addEvolutionInfo, addShellModifyInfo, IShellModelingResult } from '../shell_modeling_result';
import { Face } from '../../../brep/face';
import { Coedge3d } from '../../../brep/coedge3d';
import { Wire } from '../../../brep/wire';
import { VirtualFace, VirtualLoop } from '../smooth/detect_loop_util';
import { disposeFace } from '../operator/dispose_topo';

interface IEdgeObj {
    edge: Edge;
    bSameDir: boolean;
}
class DeleteEdgeVirtualFace extends VirtualFace {
    public sourceFace!: Face;
}
export default class DeleteEdges {
    public static execute(deleteEdges: Edge[]): IShellModelingResult {
        const result: IShellModelingResult = { modifiedShellsMap: new Map(), evolutionMap: new Map() };
        const deleteEdgeSet = new Set<Edge>(deleteEdges);

        // 0.找到所有影响的面, 边
        const affectFaces = new Set<Face>();
        deleteEdgeSet.forEach(e => {
            const fs = e.getFaces();
            fs.forEach(f => affectFaces.add(f));
        });
        const oldEdgeFacesMap = new Map<Edge, Face[]>();
        affectFaces.forEach(f =>
            f.getEdges().forEach(e => {
                let fs = oldEdgeFacesMap.get(e);
                if (!fs) {
                    fs = [];
                    oldEdgeFacesMap.set(e, fs);
                }
                fs.push(f);
            }),
        );

        // 1.按照surface分组
        const calConstant = (surface: Surface) => {
            let d!: number;
            if (surface.isPlane()) {
                const p = surface;
                d = p.getOrigin().dot(p.getNorm());
            }
            if (surface.isCylinder()) {
                const c = surface;
                d = c.getA() * c.getCoord().getOrigin().dot(c.getCoord().getDz());
            }
            return `${Math.round(Math.abs(d) * 1e5)}`;
        };
        const groupMap = new Map<string, Face[][]>();
        for (const tmpFacei of affectFaces) {
            const surface = tmpFacei.getSurface();
            if (!surface.isPlane() && !surface.isCylinder()) {
                continue;
            }
            const constant = calConstant(surface);
            let coplanarFaceGroups = groupMap.get(constant);
            if (!coplanarFaceGroups) {
                coplanarFaceGroups = [];
                groupMap.set(constant, coplanarFaceGroups);
            }

            const canFindGroup = this._findFaceGroup(tmpFacei, coplanarFaceGroups);
            if (!canFindGroup) {
                const aFaceGroup: Face[] = [];
                aFaceGroup.push(tmpFacei);
                coplanarFaceGroups.push(aFaceGroup);
            }
        }

        const groups = Array.from(groupMap.values()).flat();

        // 2.surface上不同方向的面，进行翻转
        groups.forEach(g => this._reverseFaces(g));

        // 3.使用剩余的coedge搜环, 在不同的平面上
        const unvalidCoedge = (coedge: Coedge3d) => {
            const tmpEdge = coedge.getEdge()!;
            const tmpFaces = tmpEdge.getFaces().filter(f => affectFaces.has(f));
            return deleteEdgeSet.has(tmpEdge) && tmpFaces.length === 1;
        };
        const virtualFaces: DeleteEdgeVirtualFace[] = [];
        const modifyFaces: Face[] = [];
        for (const group of groups) {
            const surface = group[0].getSurface();
            const curveEdgeMap = new Map<Curve2, IEdgeObj>();
            const candidateLoops: Loop[] = [];
            const candidateCurves: Curve2[] = [];
            if (surface.isCylinder() && (surface).isEqualAB()) {
                this._processCylinder(group, surface, deleteEdgeSet, modifyFaces, affectFaces);
            }
            for (const face of group) {
                let validCoedges: Coedge3d[] = [];
                let validWires: Wire[] = [];
                const wires = face.getWires();
                const mapCoEdgeCurve2d: Map<Coedge3d, Curve2> = new Map();
                for (let index = 0; index < wires.length; index++) {
                    const mapCoEdgeCurve: Map<Coedge3d, Curve3> = new Map();
                    const res = surface.wireToUV(
                        wires[index].getCoedge3ds().map(_ => {
                            const curve = _.getCurve();
                            mapCoEdgeCurve.set(_, curve);
                            return curve;
                        }),
                    );
                    wires[index].getCoedge3ds().forEach(co => {
                        const curve3d = mapCoEdgeCurve.get(co);
                        const curve2d = res.mapping.get(curve3d!);
                        if (curve2d) mapCoEdgeCurve2d.set(co, curve2d);
                    });
                    const tmpCoedges = wires[index].getCoedge3ds().filter(co => !deleteEdgeSet.has(co.getEdge()!));
                    const allSize = wires[index].getCoedge3ds().length;
                    if (tmpCoedges.length === allSize) {
                        validWires.push(wires[index]);
                    } else {
                        // 如果group只有一个面，且当前环内coedge不存在重叠的情况，则理论上形成不了新环，不需要使用这些coedge
                        const tmpEdgeSet = new Set();
                        wires[index].getCoedge3ds().forEach(co => tmpEdgeSet.add(co.getEdge()));
                        if (!(group.length === 1 && tmpEdgeSet.size === allSize)) {
                            validCoedges.push(...tmpCoedges);
                        }
                    }

                    if (index > 0 && wires[index].getCoedge3ds().filter(co => unvalidCoedge(co)).length) {
                        validCoedges = [];
                        validWires = [];
                        break;
                    }
                }

                validWires.forEach(w => {
                    const tmpCs = w.getCoedge3ds().map(it => {
                        if (mapCoEdgeCurve2d.has(it)) {
                            const bc = mapCoEdgeCurve2d.get(it)!;
                            curveEdgeMap.set(bc, { edge: it.getEdge()!, bSameDir: it.getSameDirWithEdge() });
                            return bc;
                        }
                        const bc = surface.getCurve2d(it.getCurve());
                        curveEdgeMap.set(bc, { edge: it.getEdge()!, bSameDir: it.getSameDirWithEdge() });
                        return bc;
                    });
                    candidateLoops.push(new Loop(tmpCs));
                });
                validCoedges.forEach(co => {
                    if (mapCoEdgeCurve2d.has(co)) {
                        const bc = mapCoEdgeCurve2d.get(co)!;
                        curveEdgeMap.set(bc, { edge: co.getEdge()!, bSameDir: co.getSameDirWithEdge() });
                        candidateCurves.push(bc);
                    } else {
                        const bc = surface.getCurve2d(co.getCurve());
                        curveEdgeMap.set(bc, { edge: co.getEdge()!, bSameDir: co.getSameDirWithEdge() });
                        candidateCurves.push(bc);
                    }
                });
            }

            // 搜环
            const newLoops = alg.SearchGraph.searchLoop2D(candidateCurves, true);

            // 创建新的虚拟面
            const nestedLoops = alg.ILoopsToPolygonExes.getNestedLoops(
                candidateLoops.concat(newLoops),
                (t: any) => t,
            );
            for (let index = nestedLoops.length - 1; index >= 0; index--) {
                if (!nestedLoops[index].isCCW) {
                    const childs = nestedLoops[index].nesting;
                    nestedLoops.splice(index, 1, ...childs);
                }
            }
            const tmpNewFaces: any[] = [];
            const usedLoopMap = new Map<any, boolean>();
            nestedLoops.forEach(nestedLoop =>
                alg.ILoopsToPolygonExes.createFaces(nestedLoop, true, usedLoopMap, tmpNewFaces),
            );
            tmpNewFaces.forEach(tmpf => {
                const vLoops = tmpf.map((l: any) => {
                    const edgeObjs = l.loop.getAllCurves().map((it: any) => curveEdgeMap.get(it));
                    const vLoop = new VirtualLoop();
                    vLoop.edges.push(...edgeObjs);
                    return vLoop;
                }) as VirtualLoop[];
                const sourceFace = this._getSourceFace(vLoops[0], oldEdgeFacesMap);
                let sourcePlane = sourceFace.getSurface();
                if (!sourcePlane.isCoplanar(surface, Tol.DEFAULT)) {
                    sourcePlane = surface;
                }
                const virtualFace = new DeleteEdgeVirtualFace(vLoops, sourcePlane.clone() as Plane);
                virtualFace.sourceFace = sourceFace;
                virtualFaces.push(virtualFace);
            });
        }

        // 4.1创建新的拓扑面
        for (const vFace of virtualFaces) {
            const newWires = vFace.loops.map(l => {
                const coedges = l.edges.map(e => new Coedge3d(e.edge, e.bSameDir));
                return new Wire(coedges);
            });

            const newFace = new Face(vFace.plane, true, newWires);
            const shell = vFace.sourceFace.getShell()!;
            shell.addFace(newFace);

            addShellModifyInfo(result.modifiedShellsMap!, shell, [newFace]);
            addEvolutionInfo(result, vFace.sourceFace, newFace);
        }
        // 4.2删除所有影响的面
        affectFaces.forEach(f => {
            const shell = f.getShell()!;
            disposeFace(f);
            addShellModifyInfo(result.modifiedShellsMap!, shell, undefined, [f]);
        });

        modifyFaces.forEach(f => {
            const shell = f.getShell()!;
            addShellModifyInfo(result.modifiedShellsMap!, shell, undefined, undefined, [f]);
        });

        return result;
    }

    private static _findFaceGroup(theFace: Face, faceGroups: Face[][]): boolean {
        if (faceGroups.length === 0) {
            return false;
        }

        const theSurf = theFace.getSurface();
        for (const tmpFaceGroup of faceGroups) {
            const groupSurf = tmpFaceGroup[0].getSurface();
            if (theSurf.isCoplanar(groupSurf, Tol.DEFAULT)) {
                tmpFaceGroup.push(theFace);
                return true;
            }
        }

        return false;
    }

    private static _reverseFaces(faces: Face[]) {
        if (!faces.length) {
            return;
        }
        if (faces[0].getSurface().isPlane()) {
            const planeNorm = (faces[0].getSurface() as Plane).getNorm();
            const flags = faces.map(f => ((f.getSurface() as Plane).getNorm().isSameDirection(planeNorm) ? 1 : 0));
            const reverseFlag = flags.filter(it => !!it).length >= flags.length / 2 ? 0 : 1;
            for (let index = 0; index < flags.length; index++) {
                if (flags[index] === reverseFlag) {
                    // 环反向，平面反向， flag取反
                    (faces[index].getSurface() as Plane).reverse();
                    faces[index].getWires().forEach(w => w.reverse());
                    faces[index].reverse();
                }
            }
        } else if (faces[0].getSurface().isCylinder()) {
            const surZNorm = (faces[0].getSurface() as Cylinder).getCenterAxis();
            const flags = faces.map(f =>
                (f.getSurface() as Cylinder).getCenterAxis().isSameDirection(surZNorm) ? 1 : 0,
            );
            const reverseFlag = flags.filter(it => !!it).length >= flags.length / 2 ? 0 : 1;
            for (let index = 0; index < flags.length; index++) {
                if (flags[index] === reverseFlag) {
                    // 环反向，平面反向， flag取反
                    (faces[index].getSurface() as Cylinder).getCoord().reverseZDir();
                    faces[index].getWires().forEach(w => w.reverse());
                    faces[index].reverse();
                }
            }
        }
    }

    // 获取演化关系
    private static _getSourceFace(vLoop: VirtualLoop, oldEdgeFacesMap: Map<Edge, Face[]>): Face {
        const tmpFaceMap = new Map<Face, number>();
        vLoop.edges.forEach(obj => {
            const items = oldEdgeFacesMap.get(obj.edge);
            if (items) {
                items.forEach(it => {
                    let value = tmpFaceMap.get(it) || 0;
                    tmpFaceMap.set(it, ++value);
                });
            }
        });
        return Array.from(tmpFaceMap).sort((a, b) => b[1] - a[1])[0][0];
    }

    // 处理跨周期问题，当删除边为起始边时，将cylinder旋转，避免存在跨周期曲面
    private static _processCylinder(
        group: Face[],
        surface: Cylinder,
        deleteEdgeSet: Set<Edge>,
        modifyFaces: Face[],
        affectFaces: Set<Face>,
    ) {
        let deleteEdge!: Edge;
        for (const dEdge of deleteEdgeSet) {
            const curve2d = surface.getCurve2d(dEdge.getCurve());
            if (
                Util.isNearlyEqual(curve2d.getStartPt().x, curve2d.getEndPt().x) &&
                (Util.isNearlyEqual(curve2d.getStartPt().x, 0) ||
                    Util.isNearlyEqual(curve2d.getStartPt().x, Math.PI * 2))
            ) {
                deleteEdge = dEdge;
                break;
            }
        }
        if (deleteEdge) {
            let face = deleteEdge.getFaces()[0];
            let index = 0;
            while (index < group.length) {
                index++;
                const wire = face.getWires()[0];
                let flag = false;
                for (const coEdge of wire.getCoedge3ds()) {
                    if (deleteEdge === coEdge.getEdge()) continue;
                    const curve2d = surface.getCurve2d(coEdge.getCurve());
                    if (Util.isNearlyEqual(curve2d.getStartPt().x, curve2d.getEndPt().x)) {
                        if (deleteEdgeSet.has(coEdge.getEdge()!)) {
                            deleteEdge = coEdge.getEdge()!;
                            for (const f of deleteEdge.getFaces()) {
                                if (f === face) continue;
                                if (group.findIndex(_ => _ === f) > -1) {
                                    face = f;
                                    flag = true;
                                    break;
                                }
                            }
                        } else {
                            deleteEdge
                                .getShell()
                                ?.getFaces()
                                .forEach(f => {
                                    if (surface.isCoplanar(f.getSurface())) {
                                        const coord = (f.getSurface() as Cylinder).getCoord();
                                        const origin = coord.getOrigin();
                                        const zDir = coord.getDz();
                                        const lineX = new Ln3(origin, coord.getWorldPtAt(new Vec3(1, 0, 0)));
                                        lineX.rotate(curve2d.getStartPt().x, origin, zDir);
                                        const lineY = new Ln3(origin, coord.getWorldPtAt(new Vec3(0, 1, 0)));
                                        lineY.rotate(curve2d.getStartPt().x, origin, zDir);
                                        coord.setXYDirs(lineX.getDirection(), lineY.getDirection());
                                        if (!affectFaces.has(f)) modifyFaces.push(f);
                                    }
                                });
                            return;
                        }
                    }
                    if (flag) break;
                }
            }
        }
    }
}
