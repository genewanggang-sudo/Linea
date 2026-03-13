import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { Curve2 as MathCurve2d } from '../geometry/curve2';
import { Ln2 as MathLn2 } from '../geometry/ln2';
import { Arc2 as MathArc2d } from '../geometry/arc2d';
import { Matrix3 as MathMatrix3 } from '../base/matrix3';
import { Vec2 as MathVec2 } from '../base/vec2';
import { Loop } from '../topology/loop';
import { types } from '../type_define/i_types';
import { IGrapher2DInEdge, IGrapher2DOutPoint, IGrapher2DEdge, IGrapher2DCoeEdge, IGrapher2DDualRegion, IGrapher2DResult } from './grapher2d';
import { WasmInstance } from './wasminstance';
import { C2d, C2dType } from './c2d';
import { L2D } from './l2d';
import { A2D } from "./a2d";
import { Elli } from "./elli";
import { Bx2 } from './bx2';
import { getGeomInstance, loadWasmInstanceAsync } from './loader';



function mathCurveToCurve2d(mathCurve: MathCurve2d, id: number = -1): C2d {
    switch (mathCurve.getType()) {
        case EN_GEO_TYPE.LN_2: {
            let edge: MathLn2 = mathCurve as MathLn2;
            return new L2D(edge.getStartPt(), edge.getEndPt(), id);
        }
        case EN_GEO_TYPE.ARC_2: {
            let edge: MathArc2d = mathCurve as MathArc2d;
            let coord = edge.getCoord();
            let a = edge.getA();
            let b = edge.getB();
            let region = edge.getRange();
            if (Math.abs(a - b) < 0.0000000001) {
                return new A2D(edge.getStartPt(), edge.getEndPt(), a, (region.max - region.min) * (edge.isCCW() ? 1 : -1), coord.getOrigin(), id);
            } else {
                let dir = coord.getDx();
                return new Elli(edge.getStartPt(), edge.getEndPt(), a, b, Math.atan2(dir.y, dir.x), coord.getOrigin(), (region.max - region.min) * (edge.isCCW() ? 1 : -1), id);
            }
        }
        default: {
            throw "Unsupported data type " + mathCurve.getType();
        }
    }
}

interface BufferEdges {
    edgeCount: number;
    curveData: number;
    idData: number;
    ptr: number;
}

interface BufferPoints {
    data: number,
    list: number,
    begin: number,
    count: number
}

interface BufferRegion {
    id: number;
    obegin: number;
    oend: number;
    loopbegin: number;
    loopend: number;
    holes: { loopbegin: number, loopend: number }[];
}

interface BufferRegions {
    regions: BufferRegion[];
    loopsPtr: number;
    regionOldPtr: number;
}

export interface Grapher2DResultForWasm {
    alledge: BufferEdges;
    point: BufferPoints;
    regions: BufferRegions;
};

class GeomLibWrapper {
    private _instance: WasmInstance;

    public get instance() {
        return this._instance
    }

    public async initialize() {
        await loadWasmInstanceAsync();
        this._instance = getGeomInstance();
    }

    public helloworld(): void {
        this._instance.helloword();
    }

    public search(input: IGrapher2DInEdge[], clean: number = 1, tol: number = 1e-6): IGrapher2DResult {
        let rotator = this.getRot(input);
        const rotateMatrix = MathMatrix3.makeRotate(MathVec2.O(), rotator);
        const rotateBackMatrix = MathMatrix3.makeRotate(MathVec2.O(), -rotator);
        input.forEach(_ => {
            _.curve = _.curve.transformed(rotateMatrix);
        });
        let regionId: Map<number, number | string> = new Map();
        let curveId: Map<number, number | string> = new Map();
        let pointId: Map<number, number | string> = new Map();

        let regionMark: Map<string | number | undefined, number> = new Map();
        let curveMark: Map<string | number | undefined, number> = new Map();
        let pointMark: Map<string | number | undefined, number> = new Map();

        let algInput: any[] = [];
        let regionTotal = 0;
        let curveTotal = 0;
        let pointTotal = 0;
        let inputAllCurve: C2d[] = [];
        const build = (curves: IGrapher2DInEdge[]): void => {
            for (let k = 0; k < curves.length; ++k) {
                if ((curves[k].id === 0 || curves[k].id) && !curveMark.has(curves[k].id as number)) {
                    curveId.set(curveTotal, curves[k].id as number);
                    curveMark.set(curves[k].id as number, curveTotal++);
                }
                let from = -1, to = -1;
                if ((curves[k].from === 0 || curves[k].from) && !pointMark.has(curves[k].from as number)) {
                    pointId.set(pointTotal, curves[k].from as number);
                    pointMark.set(curves[k].from as number, pointTotal);
                    from = pointTotal++;
                }

                if ((curves[k].to === 0 || curves[k].to) && !pointMark.has(curves[k].to as number)) {
                    pointId.set(pointTotal, curves[k].to as number);
                    pointMark.set(curves[k].to as number, pointTotal);
                    to = pointTotal++;
                }

                if ((curves[k].lregion === 0 || curves[k].lregion) && !regionMark.has(curves[k].lregion as number)) {
                    regionId.set(regionTotal, curves[k].lregion as number);
                    regionMark.set(curves[k].lregion as number, regionTotal++);
                }

                if ((curves[k].rregion === 0 || curves[k].rregion) && !regionMark.has(curves[k].rregion as number)) {
                    regionId.set(regionTotal, curves[k].rregion as number);
                    regionMark.set(curves[k].rregion as number, regionTotal++);
                }
                let l = regionMark.get(curves[k].lregion);
                let r = regionMark.get(curves[k].rregion);
                if (l === undefined) l = -1;
                if (r === undefined) r = -1;
                let id = curveMark.get(curves[k].id);
                if (id == undefined) {
                    id = curveTotal++;
                }
                inputAllCurve.push(mathCurveToCurve2d(curves[k].curve, id))
                algInput.push(l, r, from, to);
            }
        }
        build(input);
        let bufferPt = this._instance._malloc(Int32Array.BYTES_PER_ELEMENT * algInput.length);
        let buffer = new Int32Array(this._instance.HEAPF64.buffer, bufferPt);
        for (let i = 0; i < algInput.length; ++i) {
            buffer[i] = algInput[i];
        }
        let inputInfo = this.curvesToBuffer(inputAllCurve);
        let _ret = this._instance.search(inputInfo.ptr, inputInfo.bitsize, bufferPt, algInput.length, tol, clean);
        input.forEach(_ => {
            _.curve.transform(rotateBackMatrix);
        });
        this._instance._free(bufferPt);
        this._instance._free(inputInfo.ptr);
        let ret = this._processGrapher2DBuffer(_ret);
        let allcurve: IGrapher2DEdge[] = [];
        let regionMap: Map<number, IGrapher2DDualRegion> = new Map();
        for (let i = 0; i < ret.regions.length; ++i) {
            regionMap.set(ret.regions[i].id, { id: ret.regions[i].id, oldId: [], outer: [], holes: [], link: [], depth: -1 });
        }
        let allPoint: IGrapher2DOutPoint[] = this.getPTS(ret, pointId, rotateBackMatrix);
        for (let i = 0; i < ret.allEdge.length; ++i) {
            let curve = this.cueveTomathCurve(ret.allEdge[i].c);
            curve.transform(rotateBackMatrix);
            let id = ret.allEdge[i].id;
            let lface = regionMap.get(ret.allEdge[i].l) as IGrapher2DDualRegion;
            let rface = regionMap.get(ret.allEdge[i].r) as IGrapher2DDualRegion;
            let oldId: (number | string)[] = [];
            for (let k = 0; k < ret.allEdge[i].o.length; ++k) {
                let tmpid = curveId.get(ret.allEdge[i].o[k]);
                if (tmpid || tmpid == 0) oldId.push(tmpid);
            }

            let edge: IGrapher2DEdge = {
                curve,
                coedges: [],
                from: allPoint[ret.allEdge[i].f],
                to: allPoint[ret.allEdge[i].t],
                oldId,
            };
            let start = curve.getStartPt();
            let end = curve.getEndPt();
            edge.from.point.x = start.x;
            edge.from.point.y = start.y;
            edge.to.point.x = end.x;
            edge.to.point.y = end.y;
            let coedgel: IGrapher2DCoeEdge = {
                edge, isRev: false, id, region: lface, oldId,
            }

            let coedger: IGrapher2DCoeEdge = {
                edge, isRev: true, id, region: rface, oldId,
            }
            edge.coedges.push(coedgel, coedger);
            allcurve.push(edge);
        }
        let root: IGrapher2DDualRegion = { id: -1, oldId: [], outer: [], holes: [], link: [], depth: -1 };
        const regionPassFilter = (region: IGrapher2DDualRegion) => {
            if (region.outer.length === 2) {
                const curve1 = region.outer[0].isRev ? region.outer[0].edge.curve.reversed() : region.outer[0].edge.curve;
                const curve2 = region.outer[1].isRev ? region.outer[1].edge.curve.reversed() : region.outer[1].edge.curve;
                if (clean && curve1 instanceof MathLn2 && curve2 instanceof MathLn2) {
                    const coedge1 = region.outer[0];
                    const coedge2 = region.outer[1];
                    if (coedge1.id && coedge2.id && coedge1.id !== coedge2.id) {
                        coedge1.edge.id = coedge2.edge.id;
                        coedge1.edge.coedges.forEach(co => co.id = coedge2.id);
                    }
                    return false;
                } else if ((curve1 instanceof MathArc2d || curve2 instanceof MathArc2d) && (curve1.getLength() < 1e-5 || curve2.getLength() < 1e-5) && Math.abs(new Loop([curve1, curve2]).calcArea()) < 1e-10) {
                    return false;
                }
            }
            if (region.outer.length === 1 && region.outer[0].edge.curve instanceof MathLn2) {
                return false;
            }
            return true;
        }
        for (let i = 0; i < ret.regions.length; ++i) {
            let ref = regionMap.get(ret.regions[i].id) as IGrapher2DDualRegion;
            ref.id = ret.regions[i].id;
            let outer = ret.regions[i].outer;
            let tmpchildern: Set<IGrapher2DDualRegion> = new Set();
            ref.link = [];
            for (let k = 0; k < outer.length; ++k) {
                let r = allcurve[outer[k].ind];
                ref.outer.push(r.coedges[outer[k].isrev ? 1 : 0]);
                for (let t = 0; t < r.coedges.length; ++t) {
                    if (r.coedges[t].region.id !== ref.id) {
                        if (!tmpchildern.has(r.coedges[t].region)) {
                            tmpchildern.add(r.coedges[t].region);
                            ref.link.push(r.coedges[t].region);
                            if (!r.coedges[t].region.link.includes(ref)) {
                                r.coedges[t].region.link.push(ref);
                            }
                        }
                    }
                }
            }
            let holes = ret.regions[i].holes;
            for (let k = 0; k < holes.length; ++k) {
                let tmp: IGrapher2DCoeEdge[] = [];
                for (let j = 0; j < holes[k].length; ++j) {
                    let r = allcurve[holes[k][j].ind];
                    tmp.push(r.coedges[holes[k][j].isrev ? 1 : 0]);
                    for (let t = 0; t < r.coedges.length; ++t) {
                        if (r.coedges[t].region.id !== ref.id) {
                            if (!tmpchildern.has(r.coedges[t].region)) {
                                tmpchildern.add(r.coedges[t].region);
                                ref.link.push(r.coedges[t].region);
                                if (!r.coedges[t].region.link.includes(ref)) {
                                    r.coedges[t].region.link.push(ref);
                                }
                            }
                        }
                    }
                }
                ref.holes.push(tmp);
            }
            for (let k = 0; k < ret.regions[i].o.length; ++k) {
                ref.oldId?.push(regionId.get(ret.regions[i].o[k]) as number);
            }
            if (ref.id === -1) {
                root = ref;
            }
        }
        const createDepth = (root: IGrapher2DDualRegion): IGrapher2DDualRegion[] => {
            let _list = [root];
            root.depth = 0;
            let l = 0;
            while (l < _list.length) {
                let ref = _list[l++];
                for (let i = 0; i < ref.link.length; ++i) {
                    if (ref.link[i].depth > -1) continue;
                    ref.link[i].depth = ref.depth + 1;
                    _list.push(ref.link[i]);
                }
            }
            return _list;
        }
        const regionList = createDepth(root).filter(region => regionPassFilter(region)).map(region => {
            region.holes = region.holes.filter(hole => {
                if (hole.length === 2) {
                    const curve1 = hole[0].isRev ? hole[0].edge.curve.reversed() : hole[0].edge.curve;
                    const curve2 = hole[1].isRev ? hole[1].edge.curve.reversed() : hole[1].edge.curve;
                    if (clean && curve1 instanceof MathLn2 && curve2 instanceof MathLn2) {
                        return false;
                    } else if ((curve1 instanceof MathArc2d || curve2 instanceof MathArc2d) && (curve1.getLength() < 1e-5 || curve2.getLength() < 1e-5) && Math.abs(new Loop([curve1, curve2]).calcArea()) < 1e-10) {
                        return false;
                    }
                }
                return true;
            });
            return region;
        });
        return {
            root,
            list: regionList
        };
    }

    // 两个区域求并，同时合并共线，毛刺
    public union(loops1: MathCurve2d[][], loops2?: MathCurve2d[][], tol: { angleEps: number, lengthEps: number } = { angleEps: 1e-4, lengthEps: 1e-6 },
        fast: boolean = false): MathCurve2d[][][] {
        let midIndex = 0;
        for (let i = 0; i < loops1.length; ++i)midIndex += loops1[i].length;
        if (fast)
            return this.cueveLoopsTomathCurveLoops(this._clipperUnion(this.mathCurveToCueves(loops1, loops2),
                tol.lengthEps, tol.angleEps, -1e100, 1e100, false, midIndex));
        return this.cueveLoopsTomathCurveLoops(this._clipperUnion(this.mathCurveToCueves(loops1, loops2),
            tol.lengthEps, tol.angleEps, -1e100, 1e100, true, midIndex));
    }

    // 两个区域求交，同时合并共线，毛刺
    public intersect(loops1: MathCurve2d[][], loops2: MathCurve2d[][], tol: { angleEps: number, lengthEps: number } = { angleEps: 1e-4, lengthEps: 1e-6 },
        fast: boolean = true): MathCurve2d[][][] {
        if (loops2.length === 0 || loops1.length === 0) return [];
        let scanLineBegin: number = -1e100, scanLineEnd: number = 1e100;
        let curves1 = this.mathCurveToCueves(loops1);
        let curves2 = this.mathCurveToCueves(loops2);
        let midIndex = curves2.length;
        if (fast) {
            let box1 = new Bx2();
            let box2 = new Bx2();
            for (let i = 0; i < curves1.length; ++i) {
                curves1[i].updateBox2d(box1);
            }
            for (let i = 0; i < curves2.length; ++i) {
                curves2[i].updateBox2d(box2);
            }
            if (box1.max.x < box2.min.x) return [];
            if (box2.max.x < box1.min.x) return [];
            scanLineBegin = Math.max(box1.min.x, box2.min.x) - 0.001;
            scanLineEnd = Math.min(box1.max.x, box2.max.x) + 0.001;
            for (let i = 0; i < curves1.length; ++i)curves2.push(curves1[i]);
            return this.cueveLoopsTomathCurveLoops(this._clipperInter(curves2, tol.lengthEps, tol.angleEps, scanLineBegin, scanLineEnd, true, midIndex));
        }
        for (let i = 0; i < curves1.length; ++i)curves2.push(curves1[i]);
        return this.cueveLoopsTomathCurveLoops(this._clipperInter(curves2, tol.lengthEps, tol.angleEps, scanLineBegin, scanLineEnd, true, midIndex));
    }

    // loops1 对 loops2 做差，保留loops2独有对点集。同时合并共线，毛刺
    public different(loops1: MathCurve2d[][], loops2: MathCurve2d[][], tol: { angleEps: number, lengthEps: number } = { angleEps: 1e-4, lengthEps: 1e-6 },
        fast: boolean = false) {
        let scanLineBegin: number = -1e100, scanLineEnd: number = 1e100;
        let curves1 = this.mathCurveToCueves(loops1);
        let midIndex = curves1.length;
        if (fast) {
            let ret = this.intersect(loops1, loops2, tol, true);
            let input: MathCurve2d[][] = [];
            for (let i = 0; i < ret.length; ++i) {
                for (let k = 0; k < ret[i].length; ++k) {
                    input.push(ret[i][k]);
                }
            }

            let curves2 = this.mathCurveToCueves(input);
            for (let i = 0; i < curves2.length; ++i) {
                curves1.push(curves2[i]);
            }
            let res = this.cueveLoopsTomathCurveLoops(this._clipperDiff(curves1, tol.lengthEps, tol.angleEps, scanLineBegin, scanLineEnd, true, midIndex));
            return res;
        }
        let curves2 = this.mathCurveToCueves(loops2);
        for (let i = 0; i < curves2.length; ++i) {
            curves1.push(curves2[i]);
        }
        return this.cueveLoopsTomathCurveLoops(this._clipperDiff(curves1, tol.lengthEps, tol.angleEps, scanLineBegin, scanLineEnd, true, midIndex));
    }

    public xor(loops1: MathCurve2d[][], loops2: MathCurve2d[][], tol: { angleEps: number, lengthEps: number } = { angleEps: 1e-4, lengthEps: 1e-6 },
        fast: boolean = true): MathCurve2d[][][] {
        if (fast) {
            let ret = this.intersect(loops1, loops2, tol, true);
            let input: MathCurve2d[][] = [];
            for (let i = 0; i < ret.length; ++i) {
                for (let k = 0; k < ret[i].length; ++k) {
                    input.push(ret[i][k]);
                }
            }
            let curves = this.mathCurveToCueves(input);
            let input1 = this.mathCurveToCueves(loops1);
            let input2 = this.mathCurveToCueves(loops2);
            let midIndex1 = input1.length;
            let midIndex2 = input2.length;
            for (let i = 0; i < curves.length; ++i) {
                input1.push(curves[i]);
                input2.push(curves[i]);
            }
            let result1 = this.cueveLoopsTomathCurveLoops(this._clipperDiff(input1, tol.lengthEps, tol.angleEps, -1e100, 1e100, false, midIndex1));
            let result2 = this.cueveLoopsTomathCurveLoops(this._clipperDiff(input2, tol.lengthEps, tol.angleEps, -1e100, 1e100, false, midIndex2));
            for (let i = 0; i < result1.length; ++i) {
                result2.push(result1[i]);
            }
            return result2;
        }
        let curves1 = this.mathCurveToCueves(loops1);
        let midIndex = curves1.length;
        let curves2 = this.mathCurveToCueves(loops2);
        for (let i = 0; i < curves2.length; ++i) {
            curves1.push(curves2[i]);
        }
        return this.cueveLoopsTomathCurveLoops(this._clipperXor(curves1,
            tol.lengthEps, tol.angleEps, -1e100, 1e100, true, midIndex));
    }

    // 简化多边形，合并共线，毛刺
    public simplfy(loops: MathCurve2d[][], tol: { angleEps: number, lengthEps: number } = { angleEps: 1e-4, lengthEps: 1e-6 }) {
        return this.union(loops, [], tol);
    }

    private cueveLoopsTomathCurveLoops(loops: C2d[][][]): MathCurve2d[][][] {
        let result: MathCurve2d[][][] = [];
        for (let i = 0; i < loops.length; ++i) {
            result.push([]);
            for (let k = 0; k < loops[i].length; ++k) {
                result[i].push([]);
                for (let t = 0; t < loops[i][k].length; ++t) {
                    result[i][k].push(this.cueveTomathCurve(loops[i][k][t]));
                }
            }
        }
        return result;
    }

    private cueveTomathCurve(curve: C2d): MathCurve2d {
        switch (curve.type) {
            case C2dType.line: {
                return L2D.toMathCurve(curve);
            } case C2dType.arc: {
                return A2D.toMathCurve(curve as A2D);
            } case C2dType.ellipse: {
                return Elli.toMathCurve(curve as Elli);
            }
        }
        return L2D.toMathCurve(curve);
    }

    private mathCurveToCueves(loops1: MathCurve2d[][], loops2?: MathCurve2d[][], tol: number = 1e-6): C2d[] {
        let curves: C2d[] = [];
        let data = loops2 ? [loops1, loops2] : [loops1];
        for (let t = 0; t < data.length; ++t) {
            let loops = data[t];
            for (let i = 0; i < loops.length; ++i) {
                let begin = curves.length;
                for (let k = 0; k < loops[i].length; ++k) {
                    curves.push(mathCurveToCurve2d(loops[i][k]));
                }
                if (!curves.length) continue;
                let prevPos = curves[curves.length - 1].end;
                let miny = Infinity, index = -1;
                for (let k = begin; k < curves.length; ++k) {
                    curves[k].start = prevPos;
                    prevPos = curves[k].end;
                    if (miny < curves[k].start.y) continue;
                    miny = curves[k].start.y;
                    index = k;
                }
                for (let k = index, n = curves.length - begin; n--; ++k) {
                    if (k === curves.length) k = begin;
                    if (Math.abs(curves[k].start.x - curves[k].end.x) <= tol) {
                        curves[k].end.x = curves[k].start.x;
                    }
                }
            }
        }
        return curves;
    }

    private _getPathByBufferEx(type: Int32Array, data: Float64Array, typeStep: number, dataStep: number, count: number) {
        let loop: C2d[] = [];
        for (let i = 0; i < count; ++i) {
            let offsetType = i * typeStep;
            let offsetData = i * dataStep + 1;
            switch (type[offsetType]) {
                case C2dType.line: {
                    loop.push(new L2D({ x: data[offsetData], y: data[offsetData + 1] }, { x: data[offsetData + 2], y: data[offsetData + 3] }, type[offsetType + 1]));
                }
                    break;
                case C2dType.arc: {
                    loop.push(new A2D({ x: data[offsetData], y: data[offsetData + 1] }, { x: data[offsetData + 2], y: data[offsetData + 3] },
                        data[offsetData + 4],
                        data[offsetData + 7],
                        {
                            x: data[offsetData + 5],
                            y: data[offsetData + 6]
                        },
                        type[offsetType + 1]));
                }
                    break;
                case C2dType.ellipse: {
                    loop.push(new Elli({ x: data[offsetData], y: data[offsetData + 1] }, { x: data[offsetData + 2], y: data[offsetData + 3] },
                        data[offsetData + 4],
                        data[offsetData + 5],
                        data[offsetData + 6],
                        {
                            x: data[offsetData + 7],
                            y: data[offsetData + 8]
                        },
                        data[offsetData + 9],
                        type[offsetType + 1]));
                }
                    break;
            }
        }
        return loop;
    }

    private _processGrapher2DBuffer_Points(input: BufferPoints) {
        let bufferPoint = new Float64Array(this._instance.HEAPF64.buffer, input.data);
        let bufferBegin = new Int32Array(this._instance.HEAPF64.buffer, input.begin);
        let bufferList = new Int32Array(this._instance.HEAPF64.buffer, input.list);
        let count = input.count;
        let points: types.IXY[] = [];
        let list = [];
        let begin = [0];
        for (let i = 0; i < count; ++i) {
            points.push({ x: bufferPoint[i * 2], y: bufferPoint[i * 2 + 1] });
        }
        let maxEnd = 0;
        for (let i = 0; i < count; ++i) {
            let end = bufferBegin[i + 1]
            begin.push(end);
            if (maxEnd < end) maxEnd = end;
        }
        for (let k = 0; k < maxEnd; ++k) {
            list.push(bufferList[k]);
        }
        return {
            points, list, begin
        }
    }

    private _processGrapher2DBuffer_Edge(input: BufferEdges) {
        let type = new Int32Array(this._instance.HEAPF64.buffer, input.ptr, input.edgeCount * this._instance.getCurveSize() / Int32Array.BYTES_PER_ELEMENT);
        let data = new Float64Array(this._instance.HEAPF64.buffer, input.ptr, input.edgeCount * this._instance.getCurveSize() / Float64Array.BYTES_PER_ELEMENT);
        let typeStep = this._instance.getCurveSize() / Int32Array.BYTES_PER_ELEMENT;
        let dataStep = this._instance.getCurveSize() / Float64Array.BYTES_PER_ELEMENT;
        let loops = this._getPathByBufferEx(type, data, typeStep, dataStep, input.edgeCount);
        let array = [];
        let buffer = new Int32Array(this._instance.HEAPF64.buffer, input.curveData);
        let oldIdBuffer = new Int32Array(this._instance.HEAPF64.buffer, input.idData);
        for (let i = 0, j = 0; i < loops.length; ++i) {
            let c = loops[i];
            let l = buffer[j++];
            let r = buffer[j++];
            let f = buffer[j++];
            let t = buffer[j++];
            let id = buffer[j++];
            let begin = buffer[j++];
            let end = buffer[j++];
            let o = [];
            while (begin < end) {
                o.push(oldIdBuffer[begin++]);
            }
            array.push({ c, l, r, f, t, id, o });
        }
        this._instance._free(input.ptr);
        this._instance._free(input.idData);
        this._instance._free(input.curveData);
        return array;
    }

    private _processGrapher2DBuffer_Regions(input: BufferRegions) {
        let regions = [];
        let bufferLoop = new Int32Array(this._instance.HEAPF64.buffer, input.loopsPtr);
        let bufferOldId = new Int32Array(this._instance.HEAPF64.buffer, input.regionOldPtr);
        for (let i = 0; i < input.regions.length; ++i) {
            let id = input.regions[i].id;
            let outer: { ind: number, isrev: number }[] = [];
            let obegin = input.regions[i].obegin;
            let oend = input.regions[i].oend;
            let o = [];
            while (obegin < oend) {
                o.push(bufferOldId[obegin++]);
            }
            let loopbegin = input.regions[i].loopbegin;
            let loopend = input.regions[i].loopend;
            while (loopbegin < loopend) {
                outer.push({ ind: bufferLoop[loopbegin], isrev: bufferLoop[loopbegin + 1] });
                loopbegin += 2;
            }
            let holes: { ind: number, isrev: number }[][] = [];
            for (let k = 0; k < input.regions[i].holes.length; ++k) {
                loopbegin = input.regions[i].holes[k].loopbegin;
                loopend = input.regions[i].holes[k].loopend;
                let hole: { ind: number, isrev: number }[] = [];
                while (loopbegin < loopend) {
                    hole.push({ ind: bufferLoop[loopbegin], isrev: bufferLoop[loopbegin + 1] });
                    loopbegin += 2;
                }
                holes.push(hole);
            }
            regions.push({ id: id, o, outer, holes });
        }
        return regions;
    }

    private _processGrapher2DBuffer(input: Grapher2DResultForWasm) {
        let res1 = this._processGrapher2DBuffer_Edge(input.alledge);
        let res2 = this._processGrapher2DBuffer_Points(input.point);
        let res3 = this._processGrapher2DBuffer_Regions(input.regions);
        return {
            allEdge: res1,
            points: res2.points,
            begin: res2.begin,
            list: res2.list,
            regions: res3,
        }
    }

    private _getPathByBuffer(isOuter: Int32Array, polyBegin: Int32Array, type: Int32Array, data: Float64Array, typeStep: number, dataStep: number, index: number) {
        let result: C2d[][] = [];
        do {
            let loop: C2d[] = [];
            for (let i = polyBegin[index], end = polyBegin[index + 1]; i < end; ++i) {
                let offsetType = i * typeStep;
                let offsetData = i * dataStep + 1;
                switch (type[offsetType]) {
                    case C2dType.line: {
                        loop.push(new L2D({ x: data[offsetData], y: data[offsetData + 1] }, { x: data[offsetData + 2], y: data[offsetData + 3] }, type[offsetType + 1]));
                    }
                        break;
                    case C2dType.arc: {
                        loop.push(new A2D({ x: data[offsetData], y: data[offsetData + 1] }, { x: data[offsetData + 2], y: data[offsetData + 3] },
                            data[offsetData + 4],
                            data[offsetData + 7],
                            {
                                x: data[offsetData + 5],
                                y: data[offsetData + 6]
                            },
                            type[offsetType + 1]));
                    }
                        break;
                    case C2dType.ellipse: {
                        loop.push(new Elli({ x: data[offsetData], y: data[offsetData + 1] }, { x: data[offsetData + 2], y: data[offsetData + 3] },
                            data[offsetData + 4],
                            data[offsetData + 5],
                            data[offsetData + 6],
                            {
                                x: data[offsetData + 7],
                                y: data[offsetData + 8]
                            },
                            data[offsetData + 9],
                            type[offsetType + 1]));
                    }
                        break;
                }
            }
            ++index;
            result.push(loop);
        } while (isOuter[index] == 0);
        return { result, index };
    }

    private _paraseBuffer(sul: any) {
        let isOuter: Int32Array = sul.isOuter;
        let polyBegin: Int32Array = sul.polyBegin;
        let type = new Int32Array(this._instance.HEAPF64.buffer, sul.edge, sul.edgeCount * this._instance.getCurveSize() / Int32Array.BYTES_PER_ELEMENT);
        let data = new Float64Array(this._instance.HEAPF64.buffer, sul.edge, sul.edgeCount * this._instance.getCurveSize() / Float64Array.BYTES_PER_ELEMENT);
        let typeStep = this._instance.getCurveSize() / Int32Array.BYTES_PER_ELEMENT;
        let dataStep = this._instance.getCurveSize() / Float64Array.BYTES_PER_ELEMENT;
        let i = 0, count = sul.count;
        let ret: C2d[][][] = [];
        while (i < count) {
            let { result, index } = this._getPathByBuffer(isOuter, polyBegin, type, data, typeStep, dataStep, i);
            i = index;
            ret.push(result);
        }
        this._instance._free(sul.edge);
        return ret;
    }

    private _clipperInter(curves: C2d[], tol: number, tolAngle: number, scanLineBegin: number, scanLineEnd: number, performCross: boolean, midIndex: number = 0): C2d[][][] {
        let { ptr, bitsize } = this.curvesToBuffer(curves);
        let result = this._paraseBuffer(this._instance.clipperInter(ptr, bitsize, tol, tolAngle, scanLineBegin, scanLineEnd, performCross, midIndex));
        this._instance._free(ptr);
        return result;
    }

    private _clipperDiff(curves: C2d[], tol: number, tolAngle: number, scanLineBegin: number, scanLineEnd: number, performCross: boolean, midIndex: number = 0): C2d[][][] {
        let { ptr, bitsize } = this.curvesToBuffer(curves);
        let result = this._paraseBuffer(this._instance.clipperDiff(ptr, bitsize, tol, tolAngle, scanLineBegin, scanLineEnd, performCross, midIndex));
        this._instance._free(ptr);
        return result;
    }

    private _clipperUnion(curves: C2d[], tol: number, tolAngle: number, scanLineBegin: number, scanLineEnd: number, performCross: boolean, midIndex: number = 0): C2d[][][] {
        let { ptr, bitsize } = this.curvesToBuffer(curves);
        let result = this._paraseBuffer(this._instance.clipperUnion(ptr, bitsize, tol, tolAngle, scanLineBegin, scanLineEnd, performCross, midIndex));
        this._instance._free(ptr);
        return result;
    }

    private _clipperXor(curves: C2d[], tol: number, tolAngle: number, scanLineBegin: number, scanLineEnd: number, performCross: boolean, midIndex: number = 0): C2d[][][] {
        let { ptr, bitsize } = this.curvesToBuffer(curves);
        let result = this._instance.clipperXor(ptr, bitsize, tol, tolAngle, scanLineBegin, scanLineEnd, performCross, midIndex);
        this._instance._free(ptr);
        return result;
    }

    private curvesToBuffer(curves: C2d[]) {
        let buffersize = curves.length * this._instance.getCurveSize();
        let ptr = this._instance._malloc(buffersize);
        let type = new Int32Array(this._instance.HEAPF64.buffer, ptr, buffersize / Int32Array.BYTES_PER_ELEMENT);
        let data = new Float64Array(this._instance.HEAPF64.buffer, ptr, buffersize / Float64Array.BYTES_PER_ELEMENT);
        let typeStep = this._instance.getCurveSize() / Int32Array.BYTES_PER_ELEMENT;
        let dataStep = this._instance.getCurveSize() / Float64Array.BYTES_PER_ELEMENT;
        for (let index = 0; index < curves.length; ++index) {
            curves[index].toBuffer(type, data, typeStep, dataStep, index);
        }
        return { ptr, bitsize: buffersize };
    }

    private getRot(input: IGrapher2DInEdge[]): number {
        let angle = 0;
        const angles = input.map(e => {
            if (e.curve instanceof MathLn2) {
                return e.curve.getDirection().angle({ x: 1, y: 0 });
            }
            return 0;
        });
        const avoidAngles = angles.map(a => Math.PI / 2 - a);
        angle = 0;
        const delta = 1.0 * Math.PI / 180.0;
        while (avoidAngles.some(a => Math.abs(a - angle) * 180 / Math.PI < 28)) {
            angle += delta;
        }
        return angle;
    }

    private getPTS(searchRET: any, pointId: Map<number, number | string>, rotateBackMatrix: MathMatrix3) {
        let pts: IGrapher2DOutPoint[] = [];

        let points = searchRET.points;
        let list = searchRET.list;
        let begin = searchRET.begin;
        for (let i = 0; i < points.length; ++i) {
            let oldId: (number | string)[] = [];
            for (let k = begin[i]; k < begin[i + 1]; ++k) {
                oldId.push(pointId.get(list[k]) as number);
            }
            const point = new MathVec2({ x: points[i].x, y: points[i].y });
            point.transform(rotateBackMatrix);
            pts.push({
                point,
                id: i,
                oldId
            })
        }
        return pts;
    }
}

const Geom: GeomLibWrapper = new GeomLibWrapper();

export {
    GeomLibWrapper,
    Geom,
}