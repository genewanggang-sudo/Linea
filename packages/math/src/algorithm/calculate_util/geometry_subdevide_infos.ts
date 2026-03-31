
import { Interval } from '../../base/interval';
import { Curve3 } from '../../geometry/curve3d';
import { Curve2 } from '../../geometry/curve2';
import { Box3 } from '../../base/box3';
import { CONST } from '../../type_define/const';
import { Surface } from '../../geometry/surface';
import { Vec2 } from '../../base/vec2';
import { Box2 } from '../../base/box2';
import { Tol } from '../../base/tol';
import { Vec3 } from '../../base/vec3';
import { Vec } from '../../base/vec';
import { Curve } from '../../geometry/curve';
import { Box } from '../../base/box';
import { CircularSurface } from '../../geometry/circular_surface';

export abstract class CurveSegment<VectorType extends Vec> {
    public static getEndPoints<VectorType extends Vec>(segs: CurveSegment<VectorType>[]): VectorType[] {
        const ret: VectorType[] = [];
        ret.push(segs[0].curve.getStartPt());
        ret.push(segs[0].curve.getEndPt());

        for (let i = 1; i < segs.length; i++) {
            const crv = segs[i].curve;
            const st = crv.getStartPt();
            const ed = crv.getEndPt();
            if (!st.equals(ret[ret.length - 1])) ret.push(st);
            ret.push(ed);
        }
        return ret;
    }

    // 将curveSeg细分成两段子subCurveSeg。为了避免在此函数中new CurveSegment，采用传入subCurveSegs
    public static subdivideCurveSegment<VectorType extends Vec>(
        curveSeg: CurveSegment<VectorType>,
        subCurveSegs: CurveSegment<VectorType>[],
    ) {
        const curSeg1 = subCurveSegs[0];
        const curSeg2 = subCurveSegs[1];
        if (curveSeg.curve.isNurbsCurve()) {
            const nurbs = curveSeg.curve;
            const ctrlPts = nurbs.getControlPoints();
            const degree2 = nurbs.getDegree() % 2 ? (nurbs.getDegree() + 1) / 2 : nurbs.getDegree() / 2;
            const containsKnot = nurbs.getKnots().some(knot => curveSeg.range.containsPt(knot));
            if (curveSeg.depth > 3 && ctrlPts.length < 2 ** (curveSeg.depth - degree2) && !containsKnot) {
                // 条件比较粗糙，后续改进
                return;
            }

            const m = curveSeg.range.getMid();
            curSeg1.curve = curveSeg.curve;
            curSeg1.range = new Interval(curveSeg.range.min, m);
            curSeg2.curve = curveSeg.curve;
            curSeg2.range = new Interval(m, curveSeg.range.max);
        } else if (curveSeg.curve.isArc()) {
            if (curveSeg.range.getLength() < CONST.PI_16 - Tol.ANGLE) {
                return; // 以后可以改成法向锥判断
            }

            const m = curveSeg.range.getMid();
            curSeg1.curve = curveSeg.curve;
            curSeg1.range = new Interval(curveSeg.range.min, m);
            curSeg2.curve = curveSeg.curve;
            curSeg2.range = new Interval(m, curveSeg.range.max);
        } else if (curveSeg.curve.isLine()) {
            if (curveSeg.depth > 5) {
                return;
            }

            const m = curveSeg.range.getMid();
            curSeg1.curve = curveSeg.curve;
            curSeg1.range = new Interval(curveSeg.range.min, m);
            curSeg2.curve = curveSeg.curve;
            curSeg2.range = new Interval(m, curveSeg.range.max);
        } else if (
            curveSeg.curve.isOffsetCurve3d() ||
            curveSeg.curve.isOffsetCurve2d()
        ) {
            if (curveSeg.depth > 5) {
                return; // 以后可以改成法向锥判断
            }

            const m = curveSeg.range.getMid();
            curSeg1.curve = curveSeg.curve;
            curSeg1.range = new Interval(curveSeg.range.min, m);
            curSeg2.curve = curveSeg.curve;
            curSeg2.range = new Interval(m, curveSeg.range.max);
        } else {
            throw new Error('unexpected curve type');
        }

        curSeg1.depth = curveSeg.depth + 1;
        curSeg2.depth = curveSeg.depth + 1;

        curveSeg.child.push(curSeg1);
        curveSeg.child.push(curSeg2);
    }

    public curve: Curve<VectorType>;

    public range: Interval; // 区间定义域

    public child: CurveSegment<VectorType>[];

    public depth: number; // 细分深度

    protected _box?: Box<VectorType>; // 当前给定参数域的包围盒

    // protected cone: Cone | undefined; //当前给定参数域的切向锥

    public abstract getSegBox(): Box2 | Box3;
}

export class Curve2dSegment extends CurveSegment<Vec2> {
    public curve: Curve2;

    public child: Curve2dSegment[];

    protected _box?: Box2;

    constructor(curv: Curve2) {
        super();
        this.curve = curv;
        this.child = [];
    }

    public getSegBox(): Box2 {
        if (!this._box) {
            this._box = this.curve.getBBox(this.range);
        }
        return this._box;
    }
}

export class Curve3dSegment extends CurveSegment<Vec3> {
    public curve: Curve3;

    public child: Curve3dSegment[];

    protected _box?: Box3;

    constructor(curv: Curve3) {
        super();
        this.curve = curv;
        this.child = [];
    }

    public getSegBox(): Box3 {
        if (!this._box) {
            this._box = this.curve.getBox(this.range);
        }
        return this._box;
    }
}

export class CurveSegmentPair<VectorType extends Vec> {
    public static combineCurveSegmentPairs<VectorType extends Vec>(
        curveSegmentPairs: CurveSegmentPair<VectorType>[],
        newCurveSegmentPairs: CurveSegmentPair<VectorType>[],
    ): boolean {
        let hasNewSubPair = false;
        for (const curvepair of curveSegmentPairs) {
            if (curvepair.segment1.child.length === 0 && curvepair.segment2.child.length === 0) {
                newCurveSegmentPairs.push(curvepair); // 没有细分新的片段，老的作为叶子结点一样需要存起来
                continue;
            }

            if (curvepair.segment1.child.length > 1) {
                for (const it1 of curvepair.segment1.child) {
                    if (curvepair.segment2.child.length > 1) {
                        for (const it2 of curvepair.segment2.child) {
                            const newSegPair = new CurveSegmentPair<VectorType>(it1, it2);
                            newCurveSegmentPairs.push(newSegPair);
                        }
                    } else {
                        const newSegPair = new CurveSegmentPair<VectorType>(it1, curvepair.segment2);
                        newCurveSegmentPairs.push(newSegPair);
                    }
                }
            } else {
                for (const it2 of curvepair.segment2.child) {
                    const newSegPair = new CurveSegmentPair<VectorType>(curvepair.segment1, it2);
                    newCurveSegmentPairs.push(newSegPair);
                }
            }

            hasNewSubPair = true;
        }

        return hasNewSubPair;
    }

    public static refreshCurveSegments<VectorType extends Vec>(
        curveSegmentPair: CurveSegmentPair<VectorType>[],
        curveSegments1: CurveSegment<VectorType>[],
        curveSegments2: CurveSegment<VectorType>[],
    ) {
        const newCurveSegments1: Set<CurveSegment<VectorType>> = new Set();
        const newCurveSegments2: Set<CurveSegment<VectorType>> = new Set();
        for (const tmpCurvePair of curveSegmentPair) {
            newCurveSegments1.add(tmpCurvePair.segment1);
            newCurveSegments2.add(tmpCurvePair.segment2);
        }

        curveSegments1.splice(0);
        curveSegments1.push(...newCurveSegments1);
        curveSegments2.splice(0);
        curveSegments2.push(...newCurveSegments2);
    }

    protected _segment1: CurveSegment<VectorType>;

    protected _segment2: CurveSegment<VectorType>;

    public get segment1(): CurveSegment<VectorType> {
        return this._segment1;
    }

    public get segment2(): CurveSegment<VectorType> {
        return this._segment2;
    }

    protected _boxMinDist?: number;

    constructor(segm1: CurveSegment<VectorType>, segm2: CurveSegment<VectorType>) {
        this._segment1 = segm1;
        this._segment2 = segm2;
    }

    public getTwoBoxsMinDistance(): number {
        if (this._boxMinDist === undefined) {
            const curveBox1 = this.segment1.getSegBox();
            const curveBox2 = this.segment2.getSegBox();
            if (curveBox1 instanceof Box3 && curveBox2 instanceof Box3) {
                this._boxMinDist = Math.sqrt(curveBox1.getSquareDistanceTo(curveBox2));
            } else if (curveBox1 instanceof Box2 && curveBox2 instanceof Box2) {
                this._boxMinDist = Math.sqrt(curveBox1.getSquareDistanceTo(curveBox2));
            } else {
                throw new Error('包围盒计算距离：不可能出现的类型！');
            }
        }

        return this._boxMinDist;
    }
}

export class Curve2dSegmentPair extends CurveSegmentPair<Vec2> {
    public get segment1(): Curve2dSegment {
        return this._segment1 as unknown as Curve2dSegment;
    }

    public get segment2(): Curve2dSegment {
        return this._segment2 as unknown as Curve2dSegment;
    }
}

export class Curve3dSegmentPair extends CurveSegmentPair<Vec3> {
    public get segment1(): Curve3dSegment {
        return this._segment1 as unknown as Curve3dSegment;
    }

    public get segment2(): Curve3dSegment {
        return this._segment2 as unknown as Curve3dSegment;
    }
}

export class SurfacePatch {
    // 对于曲面曲面求交，默认最多细分3次或4次；如果是曲线曲面求交，可以设置大一点，因为交点个数有限，组合结果不会太多
    public static subdivideSurfacePatch(surfPatch: SurfacePatch, maxSubTimes = 3): SurfacePatch[] {
        const subSurfPatchs: SurfacePatch[] = [];
        if (surfPatch.surface.isCylinder()) {
            if (surfPatch.depth > maxSubTimes || surfPatch.rangeU.getLength() < CONST.PI_6) {
                return subSurfPatchs; // 如果u向不细分了，v向也再不细分了// 以后可以改成法向锥判断
            }

            // 如果是斜包围盒，v向可以不细分。现在是轴平行包围盒，v向也要细分，减少可能相交的曲面片对儿，否则每一对曲面片包围盒都相交
            const vRangeSeg: Interval[] = [];
            const circleSurf = surfPatch.surface as CircularSurface;
            const maxRadius = circleSurf.getA() > circleSurf.getB() ? circleSurf.getA() : circleSurf.getB();
            if (surfPatch.rangeV.getLength() > maxRadius) {
                const mv = surfPatch.rangeV.getMid();
                const rangeV1 = new Interval(surfPatch.rangeV.min, mv);
                const rangeV2 = new Interval(mv, surfPatch.rangeV.max);

                vRangeSeg.push(rangeV1);
                vRangeSeg.push(rangeV2);
            } else {
                vRangeSeg.push(surfPatch.rangeV);
            }

            const uRangeSeg: Interval[] = [];
            const mu = surfPatch.rangeU.getMid();
            uRangeSeg.push(new Interval(surfPatch.rangeU.min, mu));
            uRangeSeg.push(new Interval(mu, surfPatch.rangeU.max));

            for (const irangeU of uRangeSeg) {
                for (const irangeV of vRangeSeg) {
                    const newSurfPatch: SurfacePatch = new SurfacePatch(surfPatch.surface);
                    newSurfPatch.rangeU = irangeU;
                    newSurfPatch.rangeV = irangeV;
                    subSurfPatchs.push(newSurfPatch);
                }
            }
        } else if (surfPatch.surface.isPlane()) {
            if (
                surfPatch.depth > maxSubTimes ||
                (surfPatch.rangeU.getLength() <= 10 && surfPatch.rangeV.getLength() <= 10)
            ) {
                return subSurfPatchs; // 平面细分很快，而且只要分的够细，最后的曲面片数约等于交点个数
            }

            const uRangeSeg: Interval[] = [];
            if (surfPatch.rangeU.getLength() > 1) {
                const mu = surfPatch.rangeU.getMid();
                const rangeU1 = new Interval(surfPatch.rangeU.min, mu);
                const rangeU2 = new Interval(mu, surfPatch.rangeU.max);
                uRangeSeg.push(rangeU1);
                uRangeSeg.push(rangeU2);
            }

            const vRangeSeg: Interval[] = [];
            if (surfPatch.rangeV.getLength() > 1) {
                const mv = surfPatch.rangeV.getMid();
                const rangeV1 = new Interval(surfPatch.rangeV.min, mv);
                const rangeV2 = new Interval(mv, surfPatch.rangeV.max);
                vRangeSeg.push(rangeV1);
                vRangeSeg.push(rangeV2);
            }

            for (const irangeU of uRangeSeg) {
                for (const irangeV of vRangeSeg) {
                    const newSurfPatch: SurfacePatch = new SurfacePatch(surfPatch.surface);
                    newSurfPatch.rangeU = irangeU;
                    newSurfPatch.rangeV = irangeV;
                    subSurfPatchs.push(newSurfPatch);
                }
            }
        }

        for (const subPatch of subSurfPatchs) {
            subPatch.depth = surfPatch.depth + 1;
            surfPatch.child.push(subPatch);
        }
        return subSurfPatchs;
    }

    public surface: Surface;

    public rangeU: Interval;

    public rangeV: Interval;

    public child: SurfacePatch[];

    // cone: Cone ;      //当前给定参数域的切向锥

    public depth: number; // 细分深度

    private _box?: Box3; // 当前给定参数域的包围盒

    constructor(surf: Surface, rangeUV?: Interval[]) {
        this.surface = surf;
        this.child = [];
        if (rangeUV) {
            this.rangeU = rangeUV[0];
            this.rangeV = rangeUV[1];
        }
    }

    public getPatchBox3d(): Box3 {
        if (!this._box) {
            this._box = this.surface.getBox(this.rangeU, this.rangeV);
        }

        return this._box;
    }
}

export interface ICurveSurfacePair {
    segment: Curve3dSegment;
    patch: SurfacePatch;
}

export interface ISurfacePatchPair {
    patch1: SurfacePatch;
    patch2: SurfacePatch;
}
