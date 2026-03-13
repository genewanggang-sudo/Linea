import { Face } from '../../../brep/face';
import { Shell } from '../../../brep/shell';



// 删除拓扑的一些操作

// 从shell中删除面，删除拓扑关系
export function disposeFace(face: Face): void {
    if (!face || !face.getShell()) {
        return;
    }

    let shell = face.getShell();
    if (shell) {
        shell.deleteFace(face);
    }

    for (const coedge of face.getCoedge3ds()) {
        const edge = coedge.getEdge();
        if (edge) {
            const vA = edge.getStartVertex();
            const vB = edge.getEndVertex();

            edge.deleteCoedge3d(coedge);
            if (edge.getCoedge3ds().length <= 0) {
                edge.dispose();
                shell = (edge.getParent() as Shell) || shell;
                shell?.deleteEdge(edge);
            }
            if (vA.getEdges().length <= 0) {
                shell = (vA.getParent() as Shell) || shell;
                shell?.deleteVertex(vA);
            }
            if (vB.getEdges().length <= 0) {
                shell = (vB.getParent() as Shell) || shell;
                shell?.deleteVertex(vB);
            }
        }
    }
}