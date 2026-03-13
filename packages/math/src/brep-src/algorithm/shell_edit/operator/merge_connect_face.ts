import { Plane } from '../../../..';
import { Edge } from '../../../brep/edge';
import { Coedge3d } from '../../../brep/coedge3d';
import { Face } from '../../../brep/face';
import { Wire } from '../../../brep/wire';
import { disposeFace } from './dispose_topo';
import { ShellModelingUtil } from '../smooth/shell_modeling_util';



// 将一些相邻的面进行合并（共shell, surface, 目前支持平面）
// 如果合并成功，则返回一个新的面，删除所有输入面
// 如果不满足合并的条件，则返回undefined, 不改变原有拓扑关系
export function mergeConnectedFace(faces: Face[]): Face | undefined {
    if (faces.length === 1) {
        return faces[0];
    }

    // 暂时只支持平面
    const surfaces = faces.map(f => f.getSurface());
    if (!surfaces.every(s => s.isPlane())) {
        return undefined;
    }

    // 找到剩余的有效边
    const unValidEdgeSet = new Set<Edge>();
    const validEdgeSet = new Set<Edge>();
    for (const face of faces) {
        for (const edge of face.getEdges()) {
            if (validEdgeSet.has(edge)) {
                validEdgeSet.delete(edge);
                unValidEdgeSet.add(edge);
            } else {
                validEdgeSet.add(edge);
            }
        }
    }

    // 不用做合并，没有邻接边
    if (!unValidEdgeSet.size) {
        return undefined;
    }

    // 找到新的环
    const plane = surfaces.length ? (surfaces[0] as Plane) : undefined;
    const resultFaces = ShellModelingUtil.detectFacesFromEdges(Array.from(validEdgeSet), plane!);
    if (resultFaces.length !== 1) {
        return undefined;
    }

    let newFace: Face | undefined;
    for (const resultFace of resultFaces) {
        const newWires = resultFace.map(l => {
            const coedges = l.edges.map(e => new Coedge3d(e.edge, e.bSameDir));
            return new Wire(coedges);
        });
        newFace = new Face(plane!.clone(), true, newWires);
    }

    // 删除原有的面
    const shell = faces[0].getShell()!;
    if (newFace) {
        shell.addFace(newFace);
        faces.forEach(f => disposeFace(f));
    }
    return newFace;
}