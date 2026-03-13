import { types } from '../..';



export interface IPoint extends types.IXY {
    id: number;
}

export interface IEdge {
    pt1: IPoint;
    pt2: IPoint;
}

/**
 * 仅供网格离散的三角形数据结构
 *
 *                0
 *               / \
 *              /   \
 *             /     \
 *      n2    /       \  n1
 *           /         \
 *          /           \
 *         1-------------2
 *           neighbors0
 *
 * neighbors和constrainedEdge以及delaunayEdge序号一致
 */
export class Triangle {
    public pts: IPoint[];

    public neighbors: (Triangle | undefined)[];

    public constrainedEdge: boolean[];

    public delaunayEdge: boolean[];

    public visit: boolean = false;

    constructor(p1: IPoint, p2: IPoint, p3: IPoint) {
        this.pts = [p1, p2, p3];
        this.neighbors = [undefined, undefined, undefined];
        this.constrainedEdge = [false, false, false];
        this.delaunayEdge = [false, false, false];
    }

    public containsPt(point: IPoint) {
        const points = this.pts;
        return point === points[0] || point === points[1] || point === points[2];
    }

    public containsEdge(edge: IEdge) {
        return this.containsPt(edge.pt1) && this.containsPt(edge.pt2);
    }

    public containsPts(p1: IPoint, p2: IPoint) {
        return this.containsPt(p1) && this.containsPt(p2);
    }

    public markNeighborPointers(p1: IPoint, p2: IPoint, t: Triangle) {
        const points = this.pts;
        if ((p1 === points[2] && p2 === points[1]) || (p1 === points[1] && p2 === points[2])) {
            this.neighbors[0] = t;
        } else if ((p1 === points[0] && p2 === points[2]) || (p1 === points[2] && p2 === points[0])) {
            this.neighbors[1] = t;
        } else if ((p1 === points[0] && p2 === points[1]) || (p1 === points[1] && p2 === points[0])) {
            this.neighbors[2] = t;
        } else {
            throw new Error('Invalid Triangle.markNeighborPointers() call');
        }
    }

    public markNeighbor(t: Triangle) {
        const points = this.pts;
        if (t.containsPts(points[1], points[2])) {
            this.neighbors[0] = t;
            t.markNeighborPointers(points[1], points[2], this);
        } else if (t.containsPts(points[0], points[2])) {
            this.neighbors[1] = t;
            t.markNeighborPointers(points[0], points[2], this);
        } else if (t.containsPts(points[0], points[1])) {
            this.neighbors[2] = t;
            t.markNeighborPointers(points[0], points[1], this);
        }
    }

    public clearNeighbors() {
        this.neighbors[0] = undefined;
        this.neighbors[1] = undefined;
        this.neighbors[2] = undefined;
    }

    public clearDelaunayEdges() {
        this.delaunayEdge[0] = false;
        this.delaunayEdge[1] = false;
        this.delaunayEdge[2] = false;
    }

    public pointCW(p: IPoint) {
        const points = this.pts;
        if (p === points[0]) {
            return points[2];
        }
        if (p === points[1]) {
            return points[0];
        }
        if (p === points[2]) {
            return points[1];
        }
        return null;
    }

    public pointCCW(p: IPoint) {
        const points = this.pts;
        if (p === points[0]) {
            return points[1];
        }
        if (p === points[1]) {
            return points[2];
        }
        if (p === points[2]) {
            return points[0];
        }
        return undefined;
    }

    public neighborCW(p: IPoint) {
        if (p === this.pts[0]) {
            return this.neighbors[1];
        }
        if (p === this.pts[1]) {
            return this.neighbors[2];
        }
        return this.neighbors[0];
    }

    public neighborCCW(p: IPoint) {
        if (p === this.pts[0]) {
            return this.neighbors[2];
        }
        if (p === this.pts[1]) {
            return this.neighbors[0];
        }
        return this.neighbors[1];
    }

    public getConstrainedEdgeCW(p: IPoint) {
        if (p === this.pts[0]) {
            return this.constrainedEdge[1];
        }
        if (p === this.pts[1]) {
            return this.constrainedEdge[2];
        }
        return this.constrainedEdge[0];
    }

    public getConstrainedEdgeCCW(p: IPoint) {
        if (p === this.pts[0]) {
            return this.constrainedEdge[2];
        }
        if (p === this.pts[1]) {
            return this.constrainedEdge[0];
        }
        return this.constrainedEdge[1];
    }

    public getConstrainedEdgeAcross(p: IPoint) {
        if (p === this.pts[0]) {
            return this.constrainedEdge[0];
        }
        if (p === this.pts[1]) {
            return this.constrainedEdge[1];
        }
        return this.constrainedEdge[2];
    }

    public setConstrainedEdgeCW(p: IPoint, ce: boolean) {
        if (p === this.pts[0]) {
            this.constrainedEdge[1] = ce;
        } else if (p === this.pts[1]) {
            this.constrainedEdge[2] = ce;
        } else {
            this.constrainedEdge[0] = ce;
        }
    }

    public setConstrainedEdgeCCW(p: IPoint, ce: boolean) {
        if (p === this.pts[0]) {
            this.constrainedEdge[2] = ce;
        } else if (p === this.pts[1]) {
            this.constrainedEdge[0] = ce;
        } else {
            this.constrainedEdge[1] = ce;
        }
    }

    public getDelaunayEdgeCW(p: IPoint) {
        if (p === this.pts[0]) {
            return this.delaunayEdge[1];
        }
        if (p === this.pts[1]) {
            return this.delaunayEdge[2];
        }
        return this.delaunayEdge[0];
    }

    public getDelaunayEdgeCCW(p: IPoint) {
        if (p === this.pts[0]) {
            return this.delaunayEdge[2];
        }
        if (p === this.pts[1]) {
            return this.delaunayEdge[0];
        }
        return this.delaunayEdge[1];
    }

    public setDelaunayEdgeCW(p: IPoint, e: boolean) {
        if (p === this.pts[0]) {
            this.delaunayEdge[1] = e;
        } else if (p === this.pts[1]) {
            this.delaunayEdge[2] = e;
        } else {
            this.delaunayEdge[0] = e;
        }
    }

    public setDelaunayEdgeCCW(p: IPoint, e: boolean) {
        if (p === this.pts[0]) {
            this.delaunayEdge[2] = e;
        } else if (p === this.pts[1]) {
            this.delaunayEdge[0] = e;
        } else {
            this.delaunayEdge[1] = e;
        }
    }

    public neighborAcross(p: IPoint) {
        if (p === this.pts[0]) {
            return this.neighbors[0];
        }
        if (p === this.pts[1]) {
            return this.neighbors[1];
        }
        return this.neighbors[2];
    }

    public oppositePoint(t: Triangle, p: IPoint) {
        const cw = t.pointCW(p);
        return this.pointCW(cw!);
    }

    public legalize(opoint: IPoint, npoint: IPoint) {
        const points = this.pts;
        if (opoint === points[0]) {
            points[1] = points[0];
            points[0] = points[2];
            points[2] = npoint;
        } else if (opoint === points[1]) {
            points[2] = points[1];
            points[1] = points[0];
            points[0] = npoint;
        } else if (opoint === points[2]) {
            points[0] = points[2];
            points[2] = points[1];
            points[1] = npoint;
        } else {
            throw new Error('Invalid Triangle.legalize() call');
        }
    }

    public index(p: IPoint) {
        const points = this.pts;
        if (p === points[0]) {
            return 0;
        }
        if (p === points[1]) {
            return 1;
        }
        if (p === points[2]) {
            return 2;
        }
        throw new Error('Invalid Triangle.index() call');
    }

    public edgeIndex(p1: IPoint, p2: IPoint) {
        const points = this.pts;
        if (p1 === points[0]) {
            if (p2 === points[1]) {
                return 2;
            }
            if (p2 === points[2]) {
                return 1;
            }
        } else if (p1 === points[1]) {
            if (p2 === points[2]) {
                return 0;
            }
            if (p2 === points[0]) {
                return 2;
            }
        } else if (p1 === points[2]) {
            if (p2 === points[0]) {
                return 1;
            }
            if (p2 === points[1]) {
                return 0;
            }
        }
        return -1;
    }

    public markConstrainedEdgeByEdge(edge: IEdge) {
        this.markConstrainedEdgeByPoints(edge.pt1, edge.pt2);
    }

    public markConstrainedEdgeByPoints(p: IPoint, q: IPoint) {
        const points = this.pts;
        if ((q === points[0] && p === points[1]) || (q === points[1] && p === points[0])) {
            this.constrainedEdge[2] = true;
        } else if ((q === points[0] && p === points[2]) || (q === points[2] && p === points[0])) {
            this.constrainedEdge[1] = true;
        } else if ((q === points[1] && p === points[2]) || (q === points[2] && p === points[1])) {
            this.constrainedEdge[0] = true;
        }
    }
}