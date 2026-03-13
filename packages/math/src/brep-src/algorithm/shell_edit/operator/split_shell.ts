import { Edge } from '../../../brep/edge';
import { Shell } from '../../../brep/shell';
import { Vertex } from '../../../brep/vertex';
import { ContinuousUtil } from '../../../continuous/continuous_util';
import { ShellModelingUtil } from '../smooth/shell_modeling_util';



/**
 * 依据面的连接关系，分割shell
 * @param originShell 待分割的shell
 */
export function splitShell(originShell: Shell): Shell[] {
    // 使用广度优先搜索，依据面的连接关系
    const splitFaces = ShellModelingUtil.divideFacesIntoConnectGroups(originShell.getFaces(), true);
    const resultShells: Shell[] = [originShell];

    for (let index = 1; index < splitFaces.length; index++) {
        // transfer face, edge, vertex to new shell.
        const targetShell = new Shell();
        resultShells.push(targetShell);

        const transFaces = splitFaces[index];
        const transEdges = new Set<Edge>();
        const transVertexs = new Set<Vertex>();
        transFaces.forEach(f => {
            f.getEdges().forEach(e => transEdges.add(e));
            f.getVertexes().forEach(v => transVertexs.add(v));
        });

        for (const face of transFaces) {
            originShell.deleteFace(face);
            targetShell.addFace(face);
        }
        for (const edge of transEdges) {
            originShell.deleteEdge(edge);
            targetShell.addEdge(edge);
        }
        for (const vertex of transVertexs) {
            originShell.deleteVertex(vertex);
            targetShell.addVertex(vertex);
        }

        // 更新连续边的信息
        ContinuousUtil.transferContinuousEdgeInfo(Array.from(transEdges), originShell, targetShell);
    }

    return resultShells;
}

