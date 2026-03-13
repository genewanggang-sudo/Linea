import { Edge } from '../../brep/edge';
import ShellModelingBase from './shell_modeling_base';
import { IShellModelingResult } from './shell_modeling_result';
import { Shell } from '../../brep/shell';
import { Vertex } from '../../brep/vertex';
import { mergeConnectedEdge } from './operator/merge_connect_edge';



export default class MergeEdges extends ShellModelingBase {
    private _edges: Edge[];

    constructor(edges: Edge[]) {
        super([]);
        this._edges = edges;
    }

    protected _executeImpl(): IShellModelingResult {
        const shellEdgesMap = new Map<Shell, Edge[]>();
        for (const edge of this._edges) {
            const s = edge.getShell()!;
            let es = shellEdgesMap.get(s);
            if (!es) {
                es = [];
                shellEdgesMap.set(s, es);
            }
            es.push(edge);
        }
        let errorStr: string | undefined;
        const modifiedShellsMap = new Map();
        for (const [shell, edges] of shellEdgesMap) {
            if (edges.length <= 1) {
                continue;
            }
            const allEdgeLength = shell.getEdges().length;
            const tmpEdgeSet = new Set(edges);
            const mergeVertices = new Set<Vertex>();
            for (const tmpE of tmpEdgeSet) {
                const sv = tmpE.getStartVertex();
                const ev = tmpE.getEndVertex();
                if (!mergeVertices.has(sv)) {
                    const eeees = sv.getEdges();
                    if (eeees.filter(_ => tmpEdgeSet.has(_)).length > 1) {
                        mergeVertices.add(sv);
                    }
                }
                if (!mergeVertices.has(ev)) {
                    const eeees = ev.getEdges();
                    if (eeees.filter(_ => tmpEdgeSet.has(_)).length > 1) {
                        mergeVertices.add(ev);
                    }
                }
            }
            for (const vertex of mergeVertices) {
                const es = vertex.getEdges();
                if (es.length !== 2 || es.some(_ => !_)) {
                    errorStr = 'patial fail';
                    continue;
                }
                mergeConnectedEdge(es[0], es[1], vertex);
            }
            if (allEdgeLength !== shell.getEdges().length) {
                modifiedShellsMap.set(shell, {});
            }
        }
        const unmergeEdges = this._edges.filter(_ => _.getCoedge3ds().length > 0);
        if (unmergeEdges.length) {
            errorStr = unmergeEdges.length === this._edges.length ? 'all fail' : 'patial fail';
        }

        return { errorStr, modifiedShellsMap };
    }
}