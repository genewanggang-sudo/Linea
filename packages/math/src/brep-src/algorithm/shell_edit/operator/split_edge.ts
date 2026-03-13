import { Edge } from '../../../brep/edge';
import { Vertex } from '../../../brep/vertex';
import { Coedge3d } from '../../../brep/coedge3d';
import { Shell } from '../../../brep/shell';



export function splitEdgeByVertex(edge: Edge, vertex: Vertex): Edge[] {
    const createCoedges = (origHalfEdge: Coedge3d, firstEdge: Edge, secondEdge: Edge) => {
        const h1 = new Coedge3d(firstEdge, origHalfEdge.getSameDirWithEdge());
        const h2 = new Coedge3d(secondEdge, origHalfEdge.getSameDirWithEdge());

        const wire = origHalfEdge.getWire()!;
        const halfEdges = wire.getCoedge3ds();
        const index = halfEdges.indexOf(origHalfEdge);
        if (index !== -1) {
            if (!origHalfEdge.getSameDirWithEdge()) {
                wire.replaceCoedge3d(index, [h2, h1]);
            } else {
                wire.replaceCoedge3d(index, [h1, h2]);
            }
        }
    };
    // ----------------------------------------------------
    // o --- edge1     --- o --- edge2     --- o
    // o VA -------------- o V -------------VB o
    // o --- halfEdge1 --- o --- halfEdge2 --- o -->
    // o --- halfEdge4 --- o --- halfEdge3 --- o <--
    // -----------------------------------------------------
    if (edge.getStartVertex() === vertex || edge.getEndVertex() === vertex) {
        return [];
    }

    const curve = edge.getCurve();
    const splitCurves = curve.split([curve.getParamAt(vertex.getPoint())]);
    if (splitCurves.length !== 2) {
        return [];
    }
    const edge1 = new Edge(splitCurves[0], edge.getStartVertex(), vertex);
    const edge2 = new Edge(splitCurves[1], vertex, edge.getEndVertex());

    // new edges should copy the continuous data from old edge
    edge1.setData(edge.getData());
    edge2.setData(edge.getData());
    edge1.setFlags(edge.getFlags());
    edge2.setFlags(edge.getFlags());

    // create new halfedges [halfedge -> he1,he2]
    const halfEdges = edge.getCoedge3ds();
    halfEdges.forEach(he => createCoedges(he, edge1, edge2));

    const parent = edge.getParent() as Shell;
    if (parent) {
        parent.deleteEdge(edge);
        parent.addEdge(edge1);
        parent.addEdge(edge2);
        parent.addVertex(vertex);
    }
    edge.dispose();
    return [edge1, edge2];
}

// 使用顶点来分割边，返回分割后的边数组；如果没有发生分割，则返回空的数组。
export function splitEdgeByVertices(edge: Edge, vertices: Vertex[]): Edge[] {
    const edgeCurve = edge.getCurve();
    vertices.sort((v1: Vertex, v2: Vertex) => {
        const param1 = edgeCurve.getParamAt(v1.getPoint());
        const param2 = edgeCurve.getParamAt(v2.getPoint());
        return param1 - param2;
    });

    const newEdges: Edge[] = [edge];
    for (const intersectVertex of vertices) {
        const lastEdge = newEdges[newEdges.length - 1];
        if (!lastEdge) {
            continue;
        }
        const interPt = intersectVertex.getPoint();
        if (
            !interPt.equals(lastEdge.getStartVertex().getPoint()) &&
            !interPt.equals(lastEdge.getEndVertex().getPoint())
        ) {
            const tmpEdges = splitEdgeByVertex(lastEdge, intersectVertex);

            if (tmpEdges && tmpEdges.length > 0) {
                newEdges.splice(newEdges.length - 1, 1, ...tmpEdges);
            }
        }
    }

    return newEdges.length > 1 ? newEdges : [];
}