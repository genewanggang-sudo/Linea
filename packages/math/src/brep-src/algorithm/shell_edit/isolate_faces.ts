import { Shell } from '../../brep/shell';
import { Face } from '../../brep/face';
import { Vertex } from '../../brep/vertex';
import { Edge } from '../../brep/edge';
import { IShellModelingResult } from './shell_modeling_result';
import { BrepUtil } from '../../util/util';
import { ContinuousUtil } from '../../continuous';
import ShellModelingBase from './shell_modeling_base';



export interface IIsolateFacesResult extends IShellModelingResult {
    newShell: Shell;
    edgesDelete: string[];
}

export default class IsolateFaces extends ShellModelingBase {
    private _faces: Face[];

    private _originShell: Shell;

    constructor(faces: Face[], originShell: Shell, context: Shell[] = []) {
        super(context);
        this._faces = faces;
        this._originShell = originShell;
    }

    /**
     * @static
     * @param {Shell} this._originShell 原shell
     * @param {Face[]} this._faces 构成新组合的faces
     * @return {*}  {Shell} 新shell
     * @memberof GroupShell
     */
    protected _executeImpl(): IIsolateFacesResult {
        // old vertex to new vertex
        const verticesMap = new Map<Vertex, Vertex>();
        // old edge to new edge
        const edgesMap: Map<Edge, Edge> = new Map();

        const newShell = new Shell();

        // 复制边和点
        for (const face of this._faces) {
            const coedges = face.getCoedge3ds();
            for (const coedge of coedges) {
                const oldEdge = coedge.getEdge()!;
                if (edgesMap.has(oldEdge)) {
                    continue;
                }

                const vertexA = oldEdge.getStartVertex();
                let newVertexA = verticesMap.get(vertexA);
                if (!newVertexA) {
                    newVertexA = new Vertex(vertexA.getPoint());
                    verticesMap.set(vertexA, newVertexA!);

                    newVertexA.setFlags(vertexA.getFlags());
                    newVertexA.setData(BrepUtil.loadMapObj(BrepUtil.dumpMapObj(vertexA.getData())));

                    newShell.addVertex(newVertexA);
                }
                const vertexB = oldEdge.getEndVertex();
                let newVertexB = verticesMap.get(vertexB);
                if (!newVertexB) {
                    newVertexB = new Vertex(vertexB.getPoint());
                    verticesMap.set(vertexB, newVertexB!);

                    newVertexB.setFlags(vertexB.getFlags());
                    newVertexB.setData(BrepUtil.loadMapObj(BrepUtil.dumpMapObj(vertexB.getData())));

                    newShell.addVertex(newVertexB);
                }

                const newEdge = new Edge(oldEdge.getCurve().clone(), newVertexA!, newVertexB!);
                edgesMap.set(oldEdge, newEdge);

                newEdge.setFlags(oldEdge.getFlags());
                newEdge.setData(BrepUtil.loadMapObj(BrepUtil.dumpMapObj(oldEdge.getData())));

                newShell.addEdge(newEdge);
            }
        }

        // 添加连续边信息
        ContinuousUtil.cloneContinuousEdgeInfo(edgesMap.keys(), (e: Edge) => edgesMap.get(e));

        // 转移面
        for (const face of this._faces) {
            for (const coedge of face.getCoedge3ds()) {
                const oldEdge = coedge.getEdge()!;
                const newEdge = edgesMap.get(oldEdge)!;
                oldEdge.deleteCoedge3d(coedge);
                coedge.setEdge(newEdge);
            }

            this._originShell.deleteFace(face);
            newShell.addFace(face);
        }

        // 删除无用的拓扑
        const edgesDelete: string[] = [];
        for (const oldE of edgesMap.keys()) {
            if (oldE.getCoedge3ds().length <= 0) {
                oldE.dispose();
                edgesDelete.push(oldE.tag);

                const edgeShell = (oldE.getParent() as Shell) || this._originShell;
                edgeShell.deleteEdge(oldE);
            }
        }

        for (const oldV of verticesMap.keys()) {
            if (oldV.getEdges().length <= 0) {
                const shell = (oldV.getParent() as Shell) || this._originShell;
                shell.deleteVertex(oldV);
            }
        }

        const result: IIsolateFacesResult = { newShell, edgesDelete };
        if (!this._originShell.getFaces().length) {
            result.deleteShells = [this._originShell];
        } else {
            result.modifiedShellsMap = new Map();
            result.modifiedShellsMap.set(this._originShell, { deleteFaces: Array.from(this._faces) });

            ContinuousUtil.removeUnusedContinuousEdgeInfo(this._originShell);
        }
        result.addShells = [newShell];

        return result;
    }
}