import { Curve3, SmoothPoly3, Curve2, SmoothPoly2, Ln2, Ln3 } from '../../../..';
import { Vertex } from '../../../brep/vertex';
import { Edge } from '../../../brep/edge';



const SM_INFO = 'smooth_poly';
class SmoothUtil {
    // 将smooth poly分解成直线段，并在分解后的curve上面记录smooth poly的id
    public static decomposeSmoothPoly(originCurves: (Curve2 | Curve3)[]): (Curve2 | Curve3)[] {
        const newCurves: (Curve2 | Curve3)[] = [];
        for (const curve of originCurves) {
            if (curve instanceof SmoothPoly2 || curve instanceof SmoothPoly3) {
                const tmpCurves = curve.getSegments();
                tmpCurves.forEach((c: Ln2 | Ln3) => {
                    c.userData = c.userData || {};
                    c.userData[SM_INFO] = curve;
                    newCurves.push(c);
                });
                continue;
            }
            newCurves.push(curve);
        }

        return newCurves;
    }

    public static hasSmoothInfo(edge: Edge): boolean {
        if (edge.userData && edge.userData[SM_INFO] !== undefined) {
            return true;
        }
        return false;
    }

    public static getSmoothInfo(edge: Edge): SmoothPoly3 | undefined {
        if (edge.userData && edge.userData[SM_INFO] !== undefined) {
            return edge.userData[SM_INFO] as SmoothPoly3;
        }
        return undefined;
    }

    public static clearSmoothInfo(edge: Edge) {
        if (edge.userData) {
            edge.userData[SM_INFO] = undefined;
        }
    }

    public static isSameSmoothPoly(c1: Curve2 | Curve3, c2: Curve2 | Curve3): boolean {
        if (!c1.userData || c1.userData[SM_INFO] === undefined || !c2.userData || c2.userData[SM_INFO] === undefined) {
            return false;
        }
        return c1.userData[SM_INFO] === c2.userData[SM_INFO];
    }

    public static copySmoothInfo(
        source: { userData: { [key: string]: any } },
        target: { userData: { [key: string]: any } },
    ) {
        if (!source.userData || source.userData[SM_INFO] === undefined) {
            return;
        }
        target.userData = target.userData || {};
        target.userData[SM_INFO] = source.userData[SM_INFO];
    }

    public static updateSmoothVertex(vertex: Vertex): void {
        if (!vertex.getSmooth()) {
            return;
        }

        const edges = vertex.getEdges();
        let count = 0;
        for (let i = 0, iLen = edges.length; i < iLen; i++) {
            const edge = edges[i];
            if (edge.getSmooth()) {
                continue;
            }
            count += 1;
        }
        if (count !== 2 && count !== 0) {
            vertex.setSmooth(false);
        }
    }

    // 更新顶点的smooth flag
    public static udpateSmoothVertices(vertices: Set<Vertex>): void {
        for (const v of vertices) {
            this.updateSmoothVertex(v);
        }
    }
}

export { SmoothUtil };