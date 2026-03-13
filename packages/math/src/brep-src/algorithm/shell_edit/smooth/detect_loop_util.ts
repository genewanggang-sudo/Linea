import {
    Plane,
    alg,
    Vec3,
    Tol,
    Util,
    Curve3,
    Box3,
    Curve2,
    Vec2,
    Loop,
} from '../../../..';
import { Edge } from '../../../brep/edge';
import { Vertex } from '../../../brep/vertex';



function getHalfEdgeVertex(hf: IHalfEdgeObj, end: boolean = true) {
    return hf.sameDir === end ? hf.edge.getEndVertex() : hf.edge.getStartVertex();
}

function isRoundTripHEdges(curHalfEdge: IHalfEdgeObj | undefined, nextHalfEdge: IHalfEdgeObj | undefined): boolean {
    if (!curHalfEdge || !nextHalfEdge) {
        return false;
    }

    if (
        getHalfEdgeVertex(nextHalfEdge, false) === getHalfEdgeVertex(curHalfEdge) &&
        getHalfEdgeVertex(nextHalfEdge) === getHalfEdgeVertex(curHalfEdge, false)
    ) {
        const overlap = alg.PJ.curvesOverlap(
            curHalfEdge.edge.getCurve(),
            nextHalfEdge.edge.getCurve(),
        );
        if (overlap === alg.CurvesPJType.TOTALLY_OVERLAP) {
            return true;
        }
    }

    return false;
}

interface IHalfEdgeObj {
    edge: Edge;
    sameDir: boolean;
}

function getTangentOfHalfEdge(hf: IHalfEdgeObj, start: boolean, step?: number): Vec3 {
    let hfDir: Vec3;
    let stepPoint: Vec3;
    const crv = hf.edge.getCurve();
    const crvInterval = crv.getRange();
    if (!step || step < Tol.LENGTH) {
        const param = hf.sameDir === start ? crvInterval.min : crvInterval.max;
        if (hf.sameDir === true) {
            hfDir = crv.getTangentAt(param);
        } else {
            hfDir = crv.getTangentAt(param).reversed();
        }
    } else {
        const vertex = hf.sameDir === start ? hf.edge.getStartVertex().getPoint() : hf.edge.getEndVertex().getPoint();
        const stepParam = hf.sameDir === start ? crvInterval.min + step! : crvInterval.max - step!;
        stepPoint = crv.getPtAt(stepParam)!;
        if (start === true) {
            hfDir = stepPoint.subtracted(vertex);
        } else {
            hfDir = vertex.subtracted(stepPoint);
        }
    }
    return hfDir;
}

function findMaxTurning(hf: IHalfEdgeObj, candidates: Edge[], srf: Plane, isLeft?: boolean): IHalfEdgeObj | undefined {
    if (!candidates.length) {
        return undefined;
    }
    const vertex = getHalfEdgeVertex(hf);
    const halfEdgeSet: IHalfEdgeObj[] = [];
    for (const e of candidates) {
        if (e.getStartVertex() === vertex) {
            halfEdgeSet.push({ edge: e, sameDir: true });
        }
        if (e.getEndVertex() === vertex) {
            halfEdgeSet.push({ edge: e, sameDir: false });
        }
    }

    let maxTurningAngle: number = -10; // a number small than -2pi
    let choosed: IHalfEdgeObj | undefined;
    const hfDir = getTangentOfHalfEdge(hf, false, 0.0).reversed();
    const refUpper = srf.getNormAtPoint(vertex.getPoint());
    const factor = isLeft ? 1.0 : -1.0;
    for (const he of halfEdgeSet) {
        let turningAngle = factor * hfDir.angleTo(getTangentOfHalfEdge(he, true, 0.0), refUpper);

        // verify turningAngle is 0 or +-2pi
        if (
            Util.isNearly0(turningAngle) ||
            Util.isNearlyEqual(turningAngle, 2 * Math.PI) ||
            Util.isNearlyEqual(turningAngle, -2 * Math.PI)
        ) {
            if (he.edge === hf.edge) {
                turningAngle = isLeft ? 0.0 : -2 * Math.PI; // coincidence set minmum
            } else {
                const dt = 0.1; // make a step
                const stepCondidateDir = getTangentOfHalfEdge(he, true, dt);
                const stepHfDir = getTangentOfHalfEdge(hf, false, dt).reversed();

                const turningAngleTest = stepHfDir.angleTo(stepCondidateDir, refUpper);
                if (turningAngleTest > Math.PI) {
                    turningAngle = 2 * Math.PI * factor;
                } else {
                    turningAngle = 0.0;
                }
            }
        }

        // do compare max left turning
        if (Util.isNearlyBigger(turningAngle, maxTurningAngle)) {
            choosed = he;
            maxTurningAngle = turningAngle;
            continue;
        }
        if (Util.isNearlyEqual(turningAngle, maxTurningAngle)) {
            const dt = 0.1; // make a step
            const stepCondidateDir = getTangentOfHalfEdge(he, true, dt);
            const stepChoosedDir = getTangentOfHalfEdge(choosed!, true, dt);
            const stepHfDir = getTangentOfHalfEdge(hf!, false, dt).reversed();

            const turningConditate = stepHfDir.angleTo(stepCondidateDir, refUpper);
            const turningChoosed = stepHfDir.angleTo(stepChoosedDir, refUpper);

            if (factor * turningConditate > factor * turningChoosed) {
                choosed = he;
            }
        }
    }

    return choosed;
}

function detectLoop(
    startEdge: Edge,
    sameDir: boolean,
    plane: Plane,
    isLeft: boolean,
    getNxtEdges: (v: Vertex) => Edge[],
): IHalfEdgeObj[] | undefined {
    let curHalfEdge = { edge: startEdge, sameDir };
    const list: IHalfEdgeObj[] = [];
    const visited: IHalfEdgeObj[] = [];
    while (curHalfEdge) {
        visited.push(curHalfEdge);
        // 删除往返的情况
        if (isRoundTripHEdges(list.length ? list[list.length - 1] : undefined, curHalfEdge)) {
            list.pop();
        } else {
            list.push(curHalfEdge);
        }

        // 找下一条边
        const candidates = getNxtEdges(getHalfEdgeVertex(curHalfEdge));
        if (!candidates) {
            break;
        }
        curHalfEdge = findMaxTurning(curHalfEdge, candidates, plane, isLeft)!;
        if (!curHalfEdge) {
            break;
        }
        // 检查是否已经找过了.
        // eslint-disable-next-line no-loop-func
        if (visited.some(he => he.edge === curHalfEdge.edge && he.sameDir === curHalfEdge.sameDir)) {
            break;
        }
    }

    // 删除往返的情况，从头和尾.
    let loop: IHalfEdgeObj[] | undefined = [];
    while (list.length >= 1) {
        if (getHalfEdgeVertex(list[0], false) === getHalfEdgeVertex(list[list.length - 1])) {
            while (list.length >= 2 && isRoundTripHEdges(list[0], list[list.length - 1])) {
                list.splice(0, 1);
                list.pop();
            }
            loop = list.slice();
            break;
        }
        list.shift();
    }

    // 如果结果中不包含输入边，则返回结果为空.
    if (loop.every(he => he.edge !== startEdge)) {
        return undefined;
    }

    return loop;
}

export class VirtualLoop {
    public edges: Array<{ edge: Edge; bSameDir: boolean }>;

    public bc3ds: Curve3[];

    public box: Box3;

    public bc2ds: Curve2[];

    public approxPts: Vec2[];

    private _area?: number;

    constructor() {
        this.edges = [];
        this.bc3ds = [];
    }

    public add(e: Edge, dir: boolean) {
        this.edges.push({ edge: e, bSameDir: dir });
        const bc = e.getCurve()!.clone();
        if (!dir) {
            bc.reverse();
        }
        this.bc3ds.push(bc);
    }

    public getArea(plane: Plane): number {
        if (this._area === undefined) {
            this.bc2ds = [];
            for (const bc of this.bc3ds) {
                this.bc2ds.push(plane.getCurve2d(bc)!);
            }
            this._area = alg.LoopArea.areaOfLoop(this.bc2ds);
        }
        return this._area;
    }

    public prepareData(plane: Plane) {
        this.bc2ds = [];
        this.box = new Box3();
        this.approxPts = [];
        for (const bc of this.bc3ds) {
            this.bc2ds.push(plane.getCurve2d(bc)!);
            this.approxPts.push(plane.getUVAt(bc.getStartPt()));
            this.approxPts.push(plane.getUVAt(bc.getEndPt()));
            this.box.union(bc.getBBox());
        }
    }

    public reverse() {
        this.edges.forEach(e => {
            e.bSameDir = !e.bSameDir;
        });
        this.edges.reverse();
        this.bc3ds.forEach(b => {
            b.reverse();
        });
        this.bc3ds.reverse();
    }
}

export class VirtualFace {
    public loops: VirtualLoop[];

    public plane: Plane;

    constructor(loops: VirtualLoop[], plane: Plane) {
        this.loops = loops;
        this.plane = plane;
    }

    public outerLoop(): VirtualLoop {
        return this.loops[0];
    }

    public addInnerLoop(inner: VirtualLoop) {
        this.loops.push(inner);
    }
}

function toVirtualLoop(detectLoopResults: IHalfEdgeObj[]): VirtualLoop {
    const vLoop = new VirtualLoop();
    for (const heObj of detectLoopResults) {
        vLoop.add(heObj.edge, heObj.sameDir);
    }
    return vLoop;
}

export function detectLoopFromEdges(
    startEdge: Edge,
    sameDir: boolean,
    piPlane: Plane,
    bLeft: boolean,
    allEdgeSet?: Set<Edge>,
): VirtualLoop | undefined {
    const getNextEdges = (v: Vertex) => {
        return v.getEdges().filter(e => {
            if (allEdgeSet) {
                return allEdgeSet.has(e) && piPlane.containsCurve(e.getCurve());
            }
            return piPlane.containsCurve(e.getCurve());
        });
    };

    const results = detectLoop(startEdge, sameDir, piPlane, bLeft, getNextEdges);
    if (results && results.length) {
        return toVirtualLoop(results);
    }
    return undefined;
}

export function virtualLoopsToFaces(loops: VirtualLoop[], origin: Plane, removeFirstNegativeLoop = false): VirtualFace[] {
    const originSurface = origin;
    const resultVirtualFaces: VirtualFace[] = [];

    class NestedLoop {
        public loop: VirtualLoop;

        public nesting: NestedLoop[];

        public level: number;

        constructor(loop: VirtualLoop) {
            this.loop = loop;
            this.nesting = [];
            this.level = 0;
        }
    }

    function invertSurface(surface: Plane): Plane {
        return surface.clone().reverse();
    }

    function createFaces(nestedLoop: NestedLoop, surface: Plane, usedLoopsMap: Map<VirtualLoop, boolean>) {
        const bPositive = nestedLoop.loop.getArea(surface) > 0;
        const newPlane = bPositive ? surface : invertSurface(surface);

        const loop = nestedLoop.loop;
        const newFace = new VirtualFace([loop], newPlane);
        resultVirtualFaces.push(newFace);
        usedLoopsMap.set(loop, true);
        let preLevel = -1;
        let relativeLevel = 0;

        for (const child of nestedLoop.nesting) {
            if (child.level > preLevel) {
                preLevel = child.level;
                relativeLevel++;
            }
            if (usedLoopsMap.get(child.loop)) {
                continue;
            }
            if (relativeLevel === 2) {
                createFaces(child, surface, usedLoopsMap);
            } else if (relativeLevel === 1) {
                const childPositive = child.loop.getArea(surface) > 0;
                if (childPositive !== bPositive) {
                    newFace.addInnerLoop(child.loop);
                    usedLoopsMap.set(child.loop, true);
                } else {
                    createFaces(child, surface, usedLoopsMap);
                }
            }
        }
    }

    function getNestedLoops(surface: Plane, brepLoops: VirtualLoop[]): NestedLoop[] {
        loops.forEach(l => l.prepareData(surface));

        const nestLoops: NestedLoop[] = brepLoops.map(loop => new NestedLoop(loop));
        function contains(loop: VirtualLoop, other: VirtualLoop) {
            for (const pt2d of other.approxPts) {
                if (alg.PJ.ptToLoop(pt2d, new Loop(loop.bc2ds)).type !== alg.PtLoopPJType.IN) {
                    return false;
                }
            }
            return true;
        }

        for (let i = 0; i < nestLoops.length; ++i) {
            const theNestLoop = nestLoops[i];
            for (let j = 0; j < nestLoops.length; ++j) {
                if (i === j) {
                    continue;
                }
                const otherNestLoop = nestLoops[j];
                if (contains(theNestLoop.loop, otherNestLoop.loop)) {
                    theNestLoop.nesting.push(otherNestLoop);
                    otherNestLoop.level++;
                }
            }
        }

        for (const nestloop of nestLoops) {
            nestloop.nesting.sort((nestLoop1: NestedLoop, nestLoop2: NestedLoop) => nestLoop1.level - nestLoop2.level);
        }

        return nestLoops.filter(l => l.level === 0);
    }

    let rootNestedLoops: NestedLoop[] = getNestedLoops(origin, loops);
    if (removeFirstNegativeLoop) {
        const newRoots: NestedLoop[] = [];
        rootNestedLoops.forEach(ll => {
            const bPositive = ll.loop.getArea(originSurface) > 0;
            if (bPositive) {
                newRoots.push(ll);
            } else {
                ll.nesting.forEach(tmpL => {
                    tmpL.level--;
                    newRoots.push(tmpL);
                });
            }
        });
        rootNestedLoops = newRoots.filter(l => l.level === 0);
    }
    const usedLoopMap = new Map<VirtualLoop, boolean>();
    loops.forEach(loop => usedLoopMap.set(loop, false));
    for (const nestedLoop of rootNestedLoops) {
        if (nestedLoop.level === 0) {
            createFaces(nestedLoop, originSurface, usedLoopMap);
        }
    }
    return resultVirtualFaces;
}