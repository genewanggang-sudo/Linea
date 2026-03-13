import { Curve3, Surface, Vec3, alg, Ln3, Tol } from '../../..';
import { Vertex } from '../../brep/vertex';
import { Coedge3d } from '../../brep/coedge3d';
import { Wire } from '../../brep/wire';
import { Edge } from '../../brep/edge';
import { Face } from '../../brep/face';
import { Shell } from '../../brep/shell';
import { mergeShells } from '../shell_edit/operator/merge_shell';
import { ContinuousUtil } from '../../continuous';
// import { BrepAssert } from '../../util/brep_assert';x



/**
 * 构造face组成的壳：目前只支持surface为平面、且只有一个外环多个内环的face的壳
 */
export class createShellFromCurve3ds {
    /**
     * @author
     * function 输入一个组curve3d和一个surface，构造有一个face的shell。//会检查curve3ds是否首尾相接。不检查逆时针、自交等，所以调用接口时需保证逆时针成环。
     * @param surf 输入curve3d所在的surface曲面
     * @param curve3ds 输入一组curve3d，要求：1.curve3ds必须都在的surf曲面上，2.curve3ds必须首尾相接，封闭成一个环，3.curve3d环逆时针，且不自交
     */
    public static createSingWireShell(surf: Surface, curve3ds: Curve3[], tolerance?: Tol): Shell {
        const tol = tolerance || Tol.DEFAULT;
        const newShell: Shell = new Shell();
        if (!this._checkCurve3dsStrictValid(curve3ds, tol.lengthEps)) {
            // BrepAssert.assert(false, `createShell：输入curve3ds不合法！`);
            return newShell;
        }

        const newFace: Face = new Face(surf, true);
        const newWire: Wire = this._createWireFromCurve3ds(newShell, curve3ds);

        newFace.addWire(newWire);
        newShell.addFace(newFace);

        return newShell;
    }

    /**
     * @author  //当前只支持一个外环多个内环的情况，后续有需求再修改支持多外环。
     * function 输入一个curve3d二维数组和一个surface，构造有一个外环多个内环的face的shell。会检查curve3ds是否首尾相接。不检查逆时针、自交等。
     * @param surf 输入curve3d所在的surface曲面
     * @param curve3ds curve3d的二维数组。每个一维数组为一个环，规定第一个curve3d数组为外环，其余都为内环
     */
    public static createShell(surf: Surface, curve3dss: Curve3[][], tolerance?: Tol): Shell {
        const tol = tolerance || Tol.DEFAULT;
        const newShell: Shell = new Shell();
        for (const curve3ds of curve3dss) {
            if (!this._checkCurve3dsStrictValid(curve3ds, tol.lengthEps)) {
                // BrepAssert.assert(false, `createShell：输入curve3ds不合法！`);
                return newShell;
            }
        }

        const newFace: Face = new Face(surf, true);
        for (const curve3ds of curve3dss) {
            const newWire: Wire = this._createWireFromCurve3ds(newShell, curve3ds);
            newFace.addWire(newWire);
        }

        newShell.addFace(newFace);
        return newShell;
    }

    public static createShells(
        surf: Surface,
        faceObjs: Curve3[][][],
        option?: { checkOverlap?: boolean; smoothTess?: boolean; ratio?: number },
        tolerance?: Tol,
    ): Shell[] {
        const tol = tolerance || Tol.DEFAULT;
        const newShells: Shell[] = [];
        if (option && option.checkOverlap) {
            const cache = {
                pointVertexMap: new Map(),
                curveEdgesMap: new Map(),
            };

            const allFaces: Face[] = [];
            for (const faceObj of faceObjs) {
                const shell: Shell = new Shell();
                const newFace: Face = new Face(surf.clone(), true);
                for (const curve3ds of faceObj) {
                    const newWire: Wire = this._createWireFromCurve3dsWithCache(shell, curve3ds, cache, tol, option);
                    newFace.addWire(newWire);
                }
                shell.addFace(newFace);

                allFaces.push(newFace);
            }

            // merge shells
            mergeShells(allFaces, undefined, true);
            let tmpShells = allFaces.map(f => f.getShell()!);
            tmpShells = Array.from(new Set(tmpShells));
            newShells.push(...tmpShells);
        } else {
            // TODO... 支持smoothTess
            faceObjs.forEach(obj => newShells.push(this.createShell(surf, obj, tol)));
        }

        return newShells;
    }

    /**
     * @author
     *  检查输入的curve3ds是否合法：检查是否首尾相接，是否封闭。不检查是否自交。
     * @param curve3ds 输入一个组curve3d
     */
    private static _checkCurve3dsStrictValid(curve3ds: Curve3[], disTol: number): boolean {
        const curvesCount = curve3ds.length;
        const lastEndPt = curve3ds[curvesCount - 1].getEndPt();
        for (let i = 0; i < curve3ds.length; i++) {
            if (i === 0) {
                if (!curve3ds[i].getStartPt().equals(lastEndPt, disTol)) {
                    return false;
                }
            } else {

                if (!curve3ds[i].getStartPt().equals(curve3ds[i - 1].getEndPt(), disTol)) {
                    return false;
                }
            }
        }
        return true;
    }

    // /**
    //  * @author
    //  *  检查输入的curve3ds是否合法：检查是否连接封闭。不检查是否自交。
    //  * @param curve3ds 输入一个组curve3d
    //  */
    // function checkCurve3dsValid(curve3ds: Curve3[]): boolean {
    //     const curvesCount = curve3ds.length;
    //     const lastStPt = curve3ds[curvesCount - 1].getStartPt();
    //     const lastEndPt = curve3ds[curvesCount - 1].getEndPt();

    //     let freePt1: Vec3 = new Vec3();
    //     let freePt2: Vec3 = new Vec3();
    //     // 因为第一条曲线和最后一条曲线首尾不想接可能性比较大，所以先检查。并确定"空闲点".
    //     let isTwoCurveConnect = false;
    //     const firstStPt = curve3ds[0].getStartPt();
    //     const firstEndPt = curve3ds[0].getEndPt();
    //     if (firstStPt.equals(lastEndPt)) {
    //         isTwoCurveConnect = true;
    //         freePt1 = firstEndPt;
    //         freePt2 = lastStPt;
    //     } else if (firstStPt.equals(lastStPt)) {
    //         isTwoCurveConnect = true;
    //         freePt1 = firstEndPt;
    //         freePt2 = lastEndPt;
    //     } else if (firstEndPt.equals(lastEndPt)) {
    //         isTwoCurveConnect = true;
    //         freePt1 = firstStPt;
    //         freePt2 = lastStPt;
    //     } else if (firstEndPt.equals(lastStPt)) {
    //         isTwoCurveConnect = true;
    //         freePt1 = firstStPt;
    //         freePt2 = lastEndPt;
    //     }
    //     if (!isTwoCurveConnect) {
    //         return false;
    //     }

    //     for (let i = 1; i < curve3ds.length; i++) {
    //         if (i === curve3ds.length - 1) {
    //             if (!freePt1.equals(freePt2)) {
    //                 return false;
    //             }
    //         } else {
    //            
    //             if (freePt1.equals(curve3ds[i].getStartPt())) {
    //                 freePt1 = curve3ds[i].getEndPt();
    //             } else if (freePt1.equals(curve3ds[i].getEndPt())) {
    //                 freePt1 = curve3ds[i].getStartPt();
    //             } else {
    //                 return false;
    //             }
    //         }
    //     }
    //     return true;
    // }

    /**
     * @author
     *  传入一组curve3d生成shell的wire
     */
    private static _createWireFromCurve3ds(shell: Shell, curve3ds: Curve3[]): Wire {
        const newWire: Wire = new Wire();
        const stVertex: Vertex = new Vertex(curve3ds[0].getStartPt());
        let tmpStVertex: Vertex = stVertex;
        shell.addVertex(stVertex);
        for (let i = 0; i < curve3ds.length; i++) {
            let newEdge: Edge;
            if (i === curve3ds.length - 1) {
                newEdge = new Edge(curve3ds[i], tmpStVertex, stVertex);
            } else {
                const endVertex: Vertex = new Vertex(curve3ds[i].getEndPt());
                shell.addVertex(endVertex);
                newEdge = new Edge(curve3ds[i], tmpStVertex, endVertex);
                tmpStVertex = endVertex;
            }

            shell.addEdge(newEdge);
            const coedge = new Coedge3d(newEdge, true);
            newWire.addCoedge3d(coedge);
        }

        return newWire;
    }

    private static _createWireFromCurve3dsWithCache(
        shell: Shell,
        curve3ds: Curve3[],
        cache: { pointVertexMap: Map<Vec3, Vertex>; curveEdgesMap: Map<Curve3, Edge[]> },
        tolerance: Tol,
        option?: { smoothTess?: boolean; ratio?: number },
    ): Wire {
        const getCachedVertex = (point: Vec3, pointVertexMap: Map<Vec3, Vertex>) => {
            let vertex: Vertex | undefined;
            for (const [key, val] of pointVertexMap) {
                if (key.equals(point, tolerance.lengthEps)) {
                    vertex = val;
                    break;
                }
            }
            if (!vertex) {
                vertex = new Vertex(point);
                shell.addVertex(vertex);
                pointVertexMap.set(point, vertex);
            }
            return vertex;
        };

        const coedges: Coedge3d[] = [];
        for (const curve of curve3ds) {
            let edges: Edge[] | undefined;
            let sameDir: boolean = true;
            for (const [key, val] of cache.curveEdgesMap) {
                if (
                    alg.PJ.curvesOverlap(key, curve, tolerance.lengthEps, tolerance.angleEps) ===
                    alg.CurvesPJType.TOTALLY_OVERLAP
                ) {
                    edges = val.slice();
                    sameDir =
                        key.getStartPt().equals(curve.getStartPt(), tolerance.lengthEps) &&
                        key.getStartTangent().equals(curve.getStartTangent(), tolerance.lengthEps);
                    if (!sameDir) {
                        edges.reverse();
                    }
                    break;
                }
            }

            if (!edges) {
                // 正常情况下，一条曲线对应一条边；smoothTess时，一条曲线对应多条边
                edges = [];
                if (option && option.smoothTess) {
                    const tessPts = curve.discrete();
                    for (let j = 0; j < tessPts.length - 1; j++) {
                        const vertexA = getCachedVertex(tessPts[j], cache.pointVertexMap);
                        const vertexB = getCachedVertex(tessPts[j + 1], cache.pointVertexMap);
                        if (j + 1 !== tessPts.length - 1) {
                            vertexB.setSmooth(true);
                        }
                        const tmpEdge = new Edge(new Ln3(vertexA.getPoint(), vertexB.getPoint()), vertexA, vertexB);
                        edges.push(tmpEdge);
                    }
                } else {
                    const vertexA = getCachedVertex(curve.getStartPt(), cache.pointVertexMap);
                    const vertexB = getCachedVertex(curve.getEndPt(), cache.pointVertexMap);
                    edges.push(new Edge(curve, vertexA, vertexB));
                }
                edges.forEach(e => shell.addEdge(e));
                cache.curveEdgesMap.set(curve, edges);
                // 添加连续边信息
                ContinuousUtil.addContinuousEdgeInfo(edges, () => curve);
            }

            for (const edge of edges) {
                const coedge = new Coedge3d(edge, sameDir);
                coedges.push(coedge);
            }
        }

        return new Wire(coedges);
    }
}