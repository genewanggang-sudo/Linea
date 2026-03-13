import { Edge } from '../../brep/edge';
import { Coedge3d } from '../../brep/coedge3d';



// 找到edge的左边的edge和右边的edge。
// 适用于body的edge，因为shell的edge可能不是两条。或者face没有统一朝内朝外的方向
export function getLeftAndRightCoedge(edge: Edge): Coedge3d[] {
    const coedges = edge.getCoedge3ds();
    let coedge0SamerDir = coedges[0].getSameDirWithEdge();
    let coedge1SamerDir = coedges[1].getSameDirWithEdge();

    const faces = edge.getFaces();
    const face0SameDir = faces[0].getSameDirWithSurface();
    const face1SameDir = faces[1].getSameDirWithSurface();
    if (!face0SameDir) {
        coedge0SamerDir = !coedge0SamerDir;
    }
    if (!face1SameDir) {
        coedge1SamerDir = !coedge1SamerDir;
    }

    let leftCoedge: Coedge3d;
    let rightCoedge: Coedge3d;
    if (coedge0SamerDir) {
        leftCoedge = coedges[0];
        rightCoedge = coedges[1]; // 跟edge同向的定义为左边，反向的定义为右边
    } else if (coedge1SamerDir) {
        leftCoedge = coedges[1];
        rightCoedge = coedges[0];
    } else {
        throw new Error('getLeftAndRightCoedge：体的数据存在拓扑错误！');
    }

    return [leftCoedge, rightCoedge];
}

// 对于非流形体处理: 第一个数组是左边的coedges，第二个数组是右边的coedges
export function getLeftAndRightCoedgeEx(edge: Edge): Coedge3d[][] {
    const coedges = edge.getCoedge3ds();
    const coedgeSameDirs: boolean[] = [];
    for (const ice of coedges) {
        coedgeSameDirs.push(ice.getSameDirWithEdge());
    }

    const faces = edge.getFaces();
    const faceSameDirs: boolean[] = [];
    for (const ifc of faces) {
        faceSameDirs.push(ifc.getSameDirWithSurface());
    }

    for (let i = 0; i < coedges.length; i++) {
        if (!faceSameDirs[i]) {
            coedgeSameDirs[i] = !coedgeSameDirs[i];
        }
    }

    const leftCoedges: Coedge3d[] = [];
    const rightCoedges: Coedge3d[] = [];
    for (let i = 0; i < coedges.length; i++) {
        if (coedgeSameDirs[i]) {
            leftCoedges.push(coedges[i]); // 跟edge同向的定义为左边，反向的定义为右边
        } else {
            rightCoedges.push(coedges[i]);
        }
    }

    return [leftCoedges, rightCoedges];
}