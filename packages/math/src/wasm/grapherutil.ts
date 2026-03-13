import { IGrapher2DDualRegion, IGrapher2DInEdge, IGrapher2DCoeEdge, IGrapher2DEdge, IGrapher2DOutPoint } from "./grapher2d";
interface Inof {
    e: IGrapher2DEdge;
    t: number;
};



export class RegionUtil {
    public static traverseRegion(root: IGrapher2DDualRegion, doSomething: (v: IGrapher2DDualRegion) => void | undefined) {
        doSomething(root);
        for (let i = 0; i < root.link.length; ++i) {
            if (root.link[i].depth <= root.depth) continue;
            RegionUtil.traverseRegion(root.link[i], doSomething);
        }
    }

    public static traverseCoEdge(root: IGrapher2DDualRegion, doSomething: (v: IGrapher2DCoeEdge) => void | undefined) {
        RegionUtil.traverseRegion(root, (v) => {
            for (let i = 0; i < v.outer.length; ++i) {
                doSomething(v.outer[i]);
            }
            if (!v.holes) return;
            for (let i = 0; i < v.holes.length; ++i) {
                for (let k = 0; k < v.holes[i].length; ++k) {
                    doSomething(v.holes[i][k]);
                }
            }
        });
    }

    public static getOriginalRegion(root: IGrapher2DDualRegion): Map<number | string, IGrapher2DDualRegion[]> {
        let result: Map<number | string, IGrapher2DDualRegion[]> = new Map();
        RegionUtil.traverseRegion(root, (region: IGrapher2DDualRegion) => {
            if (!region.oldId) return;
            for (let i = 0; i < region.oldId.length; ++i) {
                let array = result.get(region.oldId[i]);
                if (!array) {
                    array = [];
                    result.set(region.oldId[i], array);
                }
                array.push(region);
            }
        });
        return result;
    }

    public static getCoEdgeOrderByOriginal(root: IGrapher2DDualRegion, ori: IGrapher2DInEdge[]): Map<IGrapher2DInEdge, IGrapher2DEdge[]> {
        let tmp: Map<IGrapher2DInEdge, Inof[]> = new Map();
        let tag: Map<number | string, IGrapher2DInEdge> = new Map();
        let allInof: Inof[][] = [];
        let allOri: IGrapher2DInEdge[] = [];
        let result: Map<IGrapher2DInEdge, IGrapher2DEdge[]> = new Map();
        for (let i = 0; i < ori.length; ++i) {
            tag.set(ori[i].id!, ori[i]);
        }
        RegionUtil.traverseCoEdge(root, (v: IGrapher2DCoeEdge) => {
            if (!v.oldId) return;
            let midP = v.edge.curve.getMidPt();
            for (let i = 0; i < v.oldId.length; ++i) {
                let original = tag.get(v.oldId[i])!;
                if (!original) continue;
                let array = tmp.get(original);
                if (!array) {
                    array = [];
                    allOri.push(original);
                    allInof.push(array);
                    tmp.set(original, array);
                }
                array.push({
                    e: v.edge,
                    t: original.curve.getParamAt(midP),
                });
            }
        });
        for (let i = 0; i < allInof.length; ++i) {
            allInof[i].sort((a: Inof, b: Inof) => {
                return a.t - b.t;
            });
            let count = 0;
            for (let k = 0; k < allInof[i].length; ++k) {
                if (count && allInof[i][k].e == allInof[i][count - 1].e) continue;
                allInof[i][count++] = allInof[i][k];
            }
            while (allInof[i].length > count) allInof[i].pop();
            result.set(allOri[i], allInof[i].map(o => o.e));
        }
        return result;
    }

    // merge a <- b
    static mergeDualRegion(a: IGrapher2DDualRegion, b: IGrapher2DDualRegion, delEdes: Set<IGrapher2DEdge>) {
        let loops = [a.outer];
        for (let k = 0; k < a.holes.length; ++k) {
            loops.push(a.holes[k]);
        }
        for (let k = 0; k < loops.length; ++k) {
            for (let i = 0; i < loops[k].length; ++i) {
                let e = loops[k][i].edge;
                if (e.coedges[0].region == a && e.coedges[1].region == b ||
                    e.coedges[0].region == b && e.coedges[1].region == a) {
                    delEdes.add(e);
                }
            }
        }
        let allEdge: IGrapher2DCoeEdge[] = [];
        const addDelEdge = (region: IGrapher2DDualRegion) => {
            for (let i = 0; i < region.outer.length; ++i) {
                if (delEdes.has(region.outer[i].edge)) continue;
                allEdge.push(region.outer[i]);
            }
            for (let i = 0; i < region.holes.length; ++i) {
                for (let k = 0; k < region.holes[i].length; ++k) {
                    if (delEdes.has(region.holes[i][k].edge)) continue;
                    allEdge.push(region.holes[i][k]);
                }
            }
        }
        addDelEdge(a);
        addDelEdge(b);
        let jump: number[][] = [];
        let map = new Map<IGrapher2DOutPoint, number[]>();
        for (let i = 0; i < allEdge.length; ++i) {
            let array = map.get(allEdge[i].isRev ? allEdge[i].edge.to : allEdge[i].edge.from);
            if (array) {
                array.push(i);
            }
            else map.set(allEdge[i].isRev ? allEdge[i].edge.to : allEdge[i].edge.from, [i]);
        }
        for (let i = 0; i < allEdge.length; ++i) {
            let to = map.get(allEdge[i].isRev ? allEdge[i].edge.from : allEdge[i].edge.to)!;
            jump.push(to);
        }
        let minDepth = Math.min(a.depth, b.depth);
        let outer: IGrapher2DCoeEdge[] = [];
        let holes: IGrapher2DCoeEdge[][] = [];
        for (let i = 0; i < allEdge.length; ++i) {
            let curr = i;
            let loop: IGrapher2DCoeEdge[] = [];
            let depth = 1e100;
            while (jump[curr].length > 0) {
                loop.push(allEdge[curr]);
                let d = Math.min(allEdge[curr].edge.coedges[0].region.depth, allEdge[curr].edge.coedges[1].region.depth);
                if (d < depth) {
                    depth = d;
                }
                let j = jump[curr].pop()!;
                curr = j;
            }
            if (loop.length == 0) continue;
            if (depth < minDepth) {
                outer = loop;
            } else {
                holes.push(loop);
            }
        }
        a.depth = minDepth;
        a.outer = outer;
        a.holes = holes;
        let link: IGrapher2DDualRegion[] = [];
        let set = new Set<IGrapher2DDualRegion>();
        set.add(a);
        for (let i = 0; i < allEdge.length; ++i) {
            let coes = allEdge[i].edge.coedges;
            for (let k = 0; k < coes.length; ++k) {
                if (coes[k].region == b) {
                    coes[k].region = a;
                }
                if (set.has(coes[k].region)) continue;
                link.push(coes[k].region);
                set.add(coes[k].region);
            }
        }
        a.link = link;
    }

    static adaptiveIdAllocation(list: IGrapher2DDualRegion[], empty: (a: IGrapher2DDualRegion) => boolean, withBg: (a: IGrapher2DDualRegion) => boolean) {
        const getNewRegion = (array: IGrapher2DDualRegion[]): [IGrapher2DDualRegion, IGrapher2DDualRegion] | undefined => {
            for (let k = 0; k < array.length; ++k) {
                if (!empty(array[k]) || !withBg(array[k]) || array[k].depth == 0) continue;
                for (let t = 0; t < array[k].link.length; ++t) {
                    if (empty(array[k].link[t]) || !withBg(array[k].link[t]) || array[k].link[t].depth == 0) continue;
                    let a = array[k];
                    let b = array[k].link[t];
                    array[k] = array[array.length - 1];
                    array.pop();
                    return [b, a];
                }
            }
            return undefined;
        }
        let delEdes: Set<IGrapher2DEdge> = new Set();
        let curr: [IGrapher2DDualRegion, IGrapher2DDualRegion] | undefined;
        while (curr = getNewRegion(list)) {
            RegionUtil.mergeDualRegion(curr[0], curr[1], delEdes);
        }
    }
}