import { Vertex } from '../../../brep/vertex';
import { Shell } from '../../../brep/shell';



// 合并重叠的顶点, 几何上是同一个点
export function mergeVertices(vs: Vertex[]) {
    if (vs.length <= 1) {
        return;
    }

    const v1 = vs[0];
    // 使用第一个点替换剩余的点
    for (let index = 1; index < vs.length; index++) {
        const v2 = vs[index];
        const shell = v2.getParent() as Shell;
        if (shell) {
            shell.deleteVertex(v2);
            // TODO... add v1 to shell?
        }
        const edges = v2.getEdges();
        for (const edge of edges) {
            if (edge.getStartVertex() === v2) {
                edge.setStartVertex(v1);
            }
            if (edge.getEndVertex() === v2) {
                edge.setEndVertex(v1);
            }
        }
    }
    if (vs.every(it => it.getSmooth())) {
        v1.setSmooth(true);
    }
}