import { Curve2 } from '../../../geometry/curve2';
import { Box2 } from '../../../base/box2';
import { Vec2 } from '../../../base/vec2';
import { PtPolygonPJ } from '../../pj/pt_polygon_pj';
import { Loop } from '../../../topology/loop';
import { Polygon } from '../../../topology/polygon';
import { PtLoopPJType, CurvesPJType } from '../../pj/pj_type';
import { CurvesOverlapJudge } from '../../pj/curves_oj';
import { Bool2dType } from './bool2d';
import { SearchLoop2D } from '../../search_graph/search_loop2d';
import { ILoopsToPolygonExes } from '../../search_graph/iloops_polygonex';
import { Tol } from '../../../base/tol';
import { CurvesX } from '../../intersect/curves_x';

export interface IFace2D {
    loops: Curve2[][]; // 原始轮廓，第一个是外环，其他的是内环
    bcGroups?: Curve2dGroup[]; // 原始轮廓拆分成多个曲线组
    box?: Box2; // 包围盒
    bPositive?: boolean; // 标记面是朝上的
    bBlankFace?: boolean; // 标记面来自第一组
    originFaces?: IFace2D[]; // for the boolean result, collect it's origin face2Ds.
}

export class Curve2dGroup {
    // 检测两个曲线组是完全重叠的
    public static curvesEqual(g1: Curve2dGroup, g2: Curve2dGroup, disTol: number, angleTol: number): boolean {
        if (g1.curves.length !== g2.curves.length) {
            return false;
        }

        for (const bc1 of g1.curves) {
            if (
                g2.curves.every(
                    bc2 =>
                        CurvesOverlapJudge.execute(bc1, bc2, disTol, angleTol) !==
                        CurvesPJType.TOTALLY_OVERLAP,
                )
            ) {
                return false;
            }
        }
        return true;
    }

    // 当前曲线组所属的face2d
    public face: IFace2D;

    // 当前曲线组的曲线
    public curves: Curve2[];

    // 包围盒
    public box!: Box2;

    // 标记是否有效
    public bValid!: boolean;

    // 当前曲线组在 face2ds 内部
    public insideFaces!: IFace2D[];

    // 当前曲线组在 face2ds 边界上
    public onFaces!: IFace2D[];

    // 当前曲线组在 face2ds 外面
    public outsideFaces!: IFace2D[];

    constructor(face: IFace2D, bcs: Curve2[]) {
        this.face = face;
        this.curves = bcs;
    }

    public addInsideFace(face: IFace2D): void {
        if (!this.insideFaces) {
            this.insideFaces = [];
        }
        this.insideFaces.push(face);
    }

    public addOnFace(face: IFace2D): void {
        if (!this.onFaces) {
            this.onFaces = [];
        }
        this.onFaces.push(face);
    }

    // 获取反向的曲线
    // collect the new create bounded curve to map<new bounded curve, origin bounded curve>.
    public getReversedCurves(newCurveMap?: Map<Curve2, Curve2>): Curve2[] {
        const result: Curve2[] = [];
        for (const bc of this.curves) {
            const newBC = bc.clone();
            newBC.reverse();
            result.push(newBC);

            if (newCurveMap) {
                const origin = newCurveMap.get(bc);
                if (origin) {
                    newCurveMap.set(newBC, origin);
                } else {
                    newCurveMap.set(newBC, bc);
                }
            }
        }
        return result;
    }

    public cloneCurves(newCurveMap?: Map<Curve2, Curve2>): Curve2[] {
        const result: Curve2[] = [];
        for (const bc of this.curves) {
            const newBC = bc.clone();
            result.push(newBC);

            if (newCurveMap) {
                const origin = newCurveMap.get(bc);
                if (origin) {
                    newCurveMap.set(newBC, origin);
                } else {
                    newCurveMap.set(newBC, bc);
                }
            }
        }
        return result;
    }
}

function addToListMap<K, V>(
    map: Map<K, V[]>,
    key: K,
    value: V,
    keyEqualFunc?: (k1: K, k2: K) => boolean,
    valueEqualFunc?: (k1: V, k2: V) => boolean,
): void {
    // get array for the input key.
    let list: V[] | undefined;
    if (keyEqualFunc) {
        for (const k of map.keys()) {
            if (keyEqualFunc(k, key)) {
                list = map.get(k);
                break;
            }
        }
    } else {
        list = map.get(key);
    }

    if (!list) {
        list = [];
        map.set(key, list);
    }

    // push value.
    if (valueEqualFunc) {
        if (list.every(v => !valueEqualFunc(v, value))) {
            list.push(value);
        }
    } else {
        list.push(value);
    }
}

function splitCurve(bc: Curve2, splitParams: number[], resultCurves: Curve2[], tol: number): void {
    const newCurveSegs = bc.split(splitParams, tol);
    if (!newCurveSegs.length) {
        newCurveSegs.push(bc);
    }
    resultCurves.push(...newCurveSegs);
}

export function intersectFaces(faces1: IFace2D[], faces2: IFace2D[], distanceTol: number, angleTol: number): void {
    const allFaces: IFace2D[] = [...faces1, ...faces2];

    // 计算包围盒
    const allCurves: Curve2[] = [];
    for (const face of allFaces) {
        face.loops.forEach(loop => allCurves.push(...loop));
    }
    const allCurveBoxs: Box2[] = allCurves.map(bc => bc.getBBox());

    // 求交
    const intersectionMap: Map<Curve2, number[]> = new Map();
    const tol = new Tol(distanceTol, angleTol);
    for (let i = 0; i < allCurves.length; i++) {
        for (let j = i + 1; j < allCurves.length; j++) {
            if (allCurveBoxs[i].intersectsBox(allCurveBoxs[j])) {
                const intersectResults = CurvesX.curve2ds(allCurves[i], allCurves[j], tol);
                for (const result of intersectResults) {
                    if (result.isOverlap) {
                        addToListMap(intersectionMap, allCurves[i], result.overlap1!.min);
                        addToListMap(intersectionMap, allCurves[i], result.overlap1!.max);
                        addToListMap(intersectionMap, allCurves[j], result.overlap2!.min);
                        addToListMap(intersectionMap, allCurves[j], result.overlap2!.max);
                    } else {
                        addToListMap(intersectionMap, allCurves[i], result.param1);
                        addToListMap(intersectionMap, allCurves[j], result.param2);
                    }
                }
            }
        }
    }

    // 打断
    for (const face of allFaces) {
        const newLoops: Curve2[][] = [];
        for (const loop of face.loops) {
            const splitResult: Curve2[] = [];
            for (const bc of loop) {
                const splitParams = intersectionMap.get(bc);
                if (splitParams) {
                    splitCurve(bc, splitParams, splitResult, distanceTol);
                } else {
                    splitResult.push(bc);
                }
            }
            newLoops.push(splitResult);
        }
        face.loops.splice(0, face.loops.length);
        newLoops.forEach(loop => face.loops.push(loop));
    }
}

export function splitLoopByPoints(loop: Curve2[], points: Vec2[], result: Curve2[][], distanceTol: number): void {
    const indexs = points.map(pt => loop.findIndex(bc => bc.getStartPt().equals(pt, distanceTol)));
    indexs.sort((a, b) => a - b);
    for (let i = 0; i < indexs.length - 1; i++) {
        result.push(loop.slice(indexs[i], indexs[i + 1]));
    }
    result.push(loop.slice(indexs[indexs.length - 1], loop.length).concat(loop.slice(0, indexs[0])));
}

export function splitLoopsIntoGroup(faces1: IFace2D[], faces2: IFace2D[], distanceTol: number): void {
    const allFaces: IFace2D[] = [...faces1, ...faces2];
    // collect the point loop map<pt, pt used by loop>.
    const pointLoopsMap = new Map<Vec2, Curve2[][]>();
    for (const face of allFaces) {
        for (const loop of face.loops) {
            for (const bc of loop) {
                addToListMap(
                    pointLoopsMap,
                    bc.getStartPt(),
                    loop,
                    (p1: Vec2, p2: Vec2) => p1.equals(p2, distanceTol),
                    (l1: Curve2[], l2: Curve2[]) => l1 === l2,
                );
            }
        }
    }

    // get the key points which is used to split the loop.
    const loopPointsMap = new Map<Curve2[], Vec2[]>();
    const allSplitPoints: Vec2[] = [];
    for (const [pt, loops] of pointLoopsMap) {
        if (loops.length > 1) {
            allSplitPoints.push(pt);
            loops.forEach(loop => addToListMap(loopPointsMap, loop, pt));
        }
    }

    // split loops into bounded curve groups.
    for (const face of allFaces) {
        face.bcGroups = [];
        for (const loop of face.loops) {
            const groups: Curve2[][] = [];
            const splitPoints = loopPointsMap.get(loop);
            if (splitPoints && splitPoints.length > 1) {
                splitLoopByPoints(loop, splitPoints, groups, distanceTol);
            } else {
                groups.push(loop);
            }
            groups.forEach(g => face.bcGroups!.push(new Curve2dGroup(face, g)));
        }
    }
}

export function calculateFaceBBox(face: IFace2D): void {
    face.box = new Box2();
    if (face.bcGroups) {
        for (const bcGroup of face.bcGroups) {
            bcGroup.box = new Box2();
            for (const bc of bcGroup.curves) {
                bcGroup.box.union(bc.getBBox());
            }
            face.box.union(bcGroup.box);
        }
    } else {
        for (const loop of face.loops) {
            for (const bc of loop) {
                face.box.union(bc.getBBox());
            }
        }
    }
}

export function calculatePositionInfo(
    face: IFace2D,
    otherFaces: IFace2D[],
    distanceTol: number,
    angleTol: number,
    insideFaceMap?: Map<IFace2D, Curve2dGroup[]>,
): void {
    for (const otherFace of otherFaces) {
        if (face === otherFace) {
            continue;
        }
        if (!face.box || !otherFace.box || !face.box.intersectsBox(otherFace.box)) {
            continue;
        }

        for (const group of face.bcGroups!) {
            if (!group.curves.length) {
                continue;
            }
            if (!group.box.intersectsBox(otherFace.box)) {
                continue;
            }

            const bc = group.curves[0];
            const loops = otherFace.loops.map(l => new Loop(l));
            const midPtInLoopRet = PtPolygonPJ.execute(bc.getMidPt(), new Polygon(loops), distanceTol);
            if (midPtInLoopRet === PtLoopPJType.IN) {
                group.addInsideFace(otherFace);
                if (insideFaceMap) {
                    addToListMap(insideFaceMap, otherFace, group, undefined, (c1, c2) => {
                        return Curve2dGroup.curvesEqual(c1, c2, distanceTol, angleTol);
                    });
                }
            } else if (midPtInLoopRet === PtLoopPJType.ONEDGE || midPtInLoopRet === PtLoopPJType.ONVERTEX) {
                group.addOnFace(otherFace);
            }
        }
    }
}

/**
 * check if the bounded curve group is valid. it's on the other face's boundary.
 * @param group input bounded curve group.
 * @param reverseResult flag means reverse the result.
 */
export function validateOverlapCurveGroup(
    group: Curve2dGroup,
    distTol = Tol.LENGTH,
    reverseResult: boolean = false,
): void {
    if (group.bValid === false) {
        return;
    }

    const curCurves = group.curves;
    const firstStartPt = curCurves[0].getStartPt();
    const firstMidPt = curCurves[0].getMidPt();
    const lastMidPt = curCurves[curCurves.length - 1].getMidPt();
    const lastEndPt = curCurves[curCurves.length - 1].getEndPt();

    group.bValid = true; // set it as true firstly.
    for (const face of group.onFaces) {
        if (face.bPositive === undefined) {
            continue;
        }

        const bReverse = (group.face.bPositive !== face.bPositive) !== reverseResult;
        for (const otherGroup of face.bcGroups!) {
            let bOverlapInSameDir = false;
            let bOverlapInReverseDir = false;
            const otherCurves = otherGroup.curves;
            if (otherCurves.length !== curCurves.length) {
                continue;
            }

            // check overlap in same direction or not.
            if (
                !bOverlapInSameDir &&
                otherCurves[0].getStartPt().equals(firstStartPt, distTol) &&
                otherCurves[otherCurves.length - 1].getEndPt().equals(lastEndPt, distTol)
            ) {
                if (
                    otherCurves[0].containsPt(firstMidPt, distTol) &&
                    otherCurves[otherCurves.length - 1].containsPt(lastMidPt, distTol)
                ) {
                    bOverlapInSameDir = true;
                }
            } else if (
                !bOverlapInReverseDir &&
                otherCurves[0].getStartPt().equals(lastEndPt, distTol) &&
                otherCurves[otherCurves.length - 1].getEndPt().equals(firstStartPt, distTol)
            ) {
                if (
                    otherCurves[0].containsPt(lastMidPt, distTol) &&
                    otherCurves[otherCurves.length - 1].containsPt(firstMidPt, distTol)
                ) {
                    bOverlapInReverseDir = true;
                }
            }

            if ((!bReverse && bOverlapInReverseDir) || (bReverse && bOverlapInSameDir)) {
                group.bValid = false;
                otherGroup.bValid = false;
                break;
            }
        }
    }
}

export function areFacesTotallyOverlap(face1: IFace2D, face2: IFace2D, disTol: number, angleTol: number): boolean {
    if (!face1.loops.length || !face2.loops.length || face1.loops.length !== face2.loops.length) {
        return false;
    }
    if (face1.loops[0].length !== face2.loops[0].length) {
        return false;
    }

    const boundedCurves1: Curve2[] = face1.loops.flat();
    const boundedCurves2: Curve2[] = face2.loops.flat();
    for (const bc1 of boundedCurves1) {
        let findMatch = false;
        for (const bc2 of boundedCurves2) {
            if (CurvesOverlapJudge.execute(bc1, bc2, disTol, angleTol) === CurvesPJType.TOTALLY_OVERLAP) {
                findMatch = true;
                break;
            }
        }
        if (!findMatch) {
            return false;
        }
    }

    return true;
}

function areFacesMainPositive(faces: IFace2D[]): boolean {
    const numPositive = faces.filter(f => f.bPositive).length;
    return faces.length - numPositive <= numPositive;
}

/**
 * get candidate origin faces for the boolean result face.
 * @param face the boolean result face.
 * @param validBCOriginFacesMap the boolean result face's map<bounded curve, bounded curve's origin faces>
 */
function getCandidateOriginFaces(newFace: IFace2D, validBCOriginFacesMap: Map<Curve2, IFace2D[]>): Set<IFace2D> {
    const candidateOriginFaces: Set<IFace2D> = new Set();
    for (const loop of newFace.loops) {
        for (const bc of loop) {
            const bcOriginFaces = validBCOriginFacesMap.get(bc);
            if (bcOriginFaces) {
                bcOriginFaces.forEach(f => candidateOriginFaces.add(f));
            }
        }
    }
    return candidateOriginFaces;
}

// 使用最终有效的曲线段生成布尔运算的结果
// 搜环的时候，都向左搜，或者都向右搜
export function generateResult(
    allFaces: IFace2D[],
    resultFaces: IFace2D[],
    type: Bool2dType,
    getOriginFaces: (newFace: IFace2D, candidates: Set<IFace2D>) => IFace2D[],
    distanceTol: number,
    angleTol: number,
    newCurveMap?: Map<Curve2, Curve2>,
): void {
    // 大部分面是顺时针的还是逆时针的
    const bMainPositive = areFacesMainPositive(allFaces);
    const reverseFaceMap: Map<IFace2D, boolean> = new Map();
    for (const face of allFaces) {
        if (face.bPositive === undefined) {
            continue;
        }
        if (face.bPositive !== bMainPositive) {
            reverseFaceMap.set(face, true);
        } else {
            reverseFaceMap.set(face, false);
        }
    }

    // 得到所有有效的曲线，修改一些曲线的方向
    const overlapStr = 'overlap';
    const validOverlapGroupMap: Map<string, Curve2dGroup[]> = new Map();
    const validBCOriginFacesMap: Map<Curve2, IFace2D[]> = new Map();
    for (const face of allFaces) {
        let bReversed: boolean | undefined;
        if (type === Bool2dType.difference) {
            bReversed = reverseFaceMap.get(face) === face.bBlankFace;
        } else {
            bReversed = reverseFaceMap.get(face);
        }

        for (const group of face.bcGroups!) {
            if (group.bValid) {
                if (!group.onFaces || !group.onFaces.length) {
                    if (bReversed) {
                        group.getReversedCurves(newCurveMap).forEach(bc => validBCOriginFacesMap.set(bc, [face]));
                    } else {
                        group.curves.forEach(bc => validBCOriginFacesMap.set(bc, [face]));
                    }
                } else {
                    // add overlap bounded curve group into map to avoid duplicate.
                    addToListMap(validOverlapGroupMap, overlapStr, group, undefined, (c1, c2) => {
                        return Curve2dGroup.curvesEqual(c1, c2, distanceTol, angleTol);
                    });
                }
            }
        }
    }
    const validOverlapGroups = validOverlapGroupMap.get(overlapStr);
    if (validOverlapGroups) {
        for (const group of validOverlapGroups) {
            let bReversed: boolean | undefined;
            if (type === Bool2dType.difference) {
                bReversed = reverseFaceMap.get(group.face) === group.face.bBlankFace;
            } else {
                bReversed = reverseFaceMap.get(group.face);
            }

            if (bReversed) {
                group
                    .getReversedCurves(newCurveMap)
                    .forEach(bc => validBCOriginFacesMap.set(bc, [group.face, ...group.onFaces]));
            } else {
                group.curves.forEach(bc => validBCOriginFacesMap.set(bc, [group.face, ...group.onFaces]));
            }
        }
    }

    // 搜索新的环
    const validCurves = Array.from(validBCOriginFacesMap.keys());
    const newLoops = SearchLoop2D.execute(validCurves, bMainPositive, distanceTol);

    // 创建新的二维面域
    const newPolygons = ILoopsToPolygonExes.execute<Loop>(newLoops, false, true);
    const newFaces = newPolygons.map(polygon => {
        return {
            loops: polygon.map(l => l.getAllCurves()),
            bPositive: polygon[0].isAnticlockwise(),
        } as IFace2D;
    });
    newFaces.forEach(f => {
        const candidates = getCandidateOriginFaces(f, validBCOriginFacesMap);
        f.originFaces = getOriginFaces(f, candidates);
        resultFaces.push(f);
    });
}
