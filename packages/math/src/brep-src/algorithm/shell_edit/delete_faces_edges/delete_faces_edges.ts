import { Edge } from '../../../brep/edge';
import { Face } from '../../../brep/face';
import { Shell } from '../../../brep/shell';
import { Vertex } from '../../../brep/vertex';
import { ContinuousUtil } from '../../../continuous';
import { disposeFace } from '../operator/dispose_topo';
import { mergeConnectedEdge } from '../operator/merge_connect_edge';
import { splitShell } from '../operator/split_shell';
import ShellModelingBase from '../shell_modeling_base';
import { addShellModifyInfo, IShellModelingResult, mergeShellModelingResult } from '../shell_modeling_result';
import DeleteEdges from './delete_edge';



/**
 * 删除多个面、边；
 * 如果边是曲面的边，则直接将该曲面删除；
 * 如果边是平面的边，则在平面上重新搜环（DeleteEdges）；
 */
export default class DeleteFacesEdges extends ShellModelingBase {
    // 需要删除的面
    private _faces: Set<Face>;

    // 需要删除的边
    private _edges: Edge[];

    // 合并相邻的断边
    private _mergeEdge: boolean;

    constructor(faces: Face[], edges: Edge[], mergeEdge = false, context: Shell[] = []) {
        super(context);
        this._faces = new Set(faces);
        this._edges = edges;
        this._mergeEdge = mergeEdge;
    }

    protected _executeImpl(): IShellModelingResult {
        // 找到影响的shell, 如果需要删除的边是连续面的边，则删除连续面
        const shells = new Set<Shell>();
        this._faces.forEach(f => shells.add(f.getShell()!));
        this._edges.forEach(e => shells.add(e.getShell()!));
        const interactFaces = Array.from(shells).map(s => ContinuousUtil.getAllInteractiveFaces(s));
        const faceFacesMap = new Map<Face, ReadonlyArray<Face>>();
        interactFaces.forEach(it => {
            it.contFaces.forEach(cf => {
                cf.getFaces().forEach(f => faceFacesMap.set(f, cf.getFaces()));
            });
        });
        this._edges.forEach(e => {
            e.getFaces().forEach(f => {
                const fs = faceFacesMap.get(f);
                if (fs) {
                    fs.forEach(it => this._faces.add(it));
                }
            });
        });

        // 1.删除面
        const result1: IShellModelingResult = { addShells: [], deleteShells: [], modifiedShellsMap: new Map() };
        for (const face of this._faces) {
            addShellModifyInfo(result1.modifiedShellsMap!, face.getShell()!, undefined, [face]);
            disposeFace(face);
        }

        // 2.删除边
        const allEdges: Edge[] = [];
        shells.forEach(s => allEdges.push(...s.getEdges()));
        const deleteEdges = this._edges.filter(e => e.getCoedge3ds().length);
        const result2 = DeleteEdges.execute(deleteEdges);

        // 合并删除面和删除边的结果
        mergeShellModelingResult(result1, result2);
        for (const key of result1.modifiedShellsMap!.keys()) {
            if (!key.getFaces().length) {
                result1.deleteShells!.push(key);
            }
        }
        result1.deleteShells?.forEach(s => result1.modifiedShellsMap!.delete(s));
        for (const s of result1.modifiedShellsMap!.keys()) {
            ContinuousUtil.removeUnusedContinuousEdgeInfo(s);
        }

        // 3.按照连接关系，分割shell
        const result3: IShellModelingResult = { modifiedShellsMap: new Map() };
        for (const s of result1.modifiedShellsMap!.keys()) {
            const splitShells = splitShell(s);

            for (let index = 1; index < splitShells.length; index++) {
                addShellModifyInfo(result3.modifiedShellsMap!, s, undefined, splitShells[index].getFaces().slice());
                result1.addShells?.push(splitShells[index]);
            }
        }
        mergeShellModelingResult(result1, result3);

        // 4.合并相邻的断边
        if (this._mergeEdge) {
            const allDeleteEdges = allEdges.filter(e => !e.getCoedge3ds().length);
            const vertexSet = new Set<Vertex>();
            allDeleteEdges.forEach(e => {
                const sv = e.getStartVertex();
                const ev = e.getEndVertex();
                if (sv) {
                    vertexSet.add(sv);
                }
                if (ev) {
                    vertexSet.add(ev);
                }
            });
            const allShells = new Set(result1.modifiedShellsMap!.keys());
            if (result1.addShells) {
                result1.addShells.forEach(s => allShells.add(s));
            }
            // 找到剩余的有效断点
            const mergeVertices = new Set<Vertex>();
            for (const ss of allShells) {
                ss.getVertexs().forEach(v => {
                    if (vertexSet.has(v)) {
                        mergeVertices.add(v);
                    }
                });
            }
            for (const vertex of mergeVertices) {
                const es = vertex.getEdges();
                if (es.length !== 2 || es.some(_ => !_)) {
                    continue;
                }
                mergeConnectedEdge(es[0], es[1], vertex);
            }
        }

        return result1;
    }
}