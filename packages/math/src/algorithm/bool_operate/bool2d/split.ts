import * as Quadtree from 'quadtree-lib';
import { IFace2D, areFacesTotallyOverlap } from './utils';
import { Curve2 } from '../../../geometry/curve2';
import { Loop } from '../../../topology/loop';
import { Box2 } from '../../../base/box2';
import { Vec2 } from '../../../base/vec2';
import { LoopCentroid } from '../../loop_property/loop-centroid';
import { CurvesOverlapJudge } from '../../pj/curves_oj';
import { CurvesPJType, PtLoopPJType } from '../../pj/pj_type';
import { PtPolygonPJ } from '../../pj/pt_polygon_pj';
import { Polygon } from '../../../topology/polygon';
import { SearchLoop2D } from '../../search_graph/search_loop2d';
import { ILoopsToPolygonExes } from '../../search_graph/iloops_polygonex';



class UniqueCurveInfo {
    public curve: Curve2;

    public validN: boolean;

    public validP: boolean;

    constructor(curve: Curve2) {
        this.curve = curve;
        this.validP = true;
        this.validN = true;
    }
}

class CurveInfo {
    public uCurve: UniqueCurveInfo;

    public dir: 0 | 1;
}

function calKey(obj: Curve2 | IFace2D): string {
    let center: Vec2;
    if (obj instanceof Curve2) {
        center = obj.getMidPt();
    } else {
        center = LoopCentroid.centroidOfLoop(obj.loops[0]);
    }
    return `${Math.round(center.x * 1e3)}/${Math.round(center.y * 1e3)}`;
}

function getOriginFaces(face: IFace2D): IFace2D[] {
    let originFaces: IFace2D[] | undefined;
    let tmpFaces: IFace2D[] | undefined = [face];
    while (tmpFaces && tmpFaces.length && tmpFaces !== originFaces) {
        originFaces = tmpFaces;
        tmpFaces = tmpFaces[0].originFaces;
    }
    return originFaces!;
}

function getValidFlag(curCurveInfo: CurveInfo, positive: boolean) {
    if (positive === curCurveInfo.dir > 0) {
        return curCurveInfo.uCurve.validP;
    }
    return curCurveInfo.uCurve.validN;
}

function updateValidFlag(curCurveInfo: CurveInfo, positive: boolean) {
    if (!curCurveInfo) {
        return;
    }
    if (positive === curCurveInfo.dir > 0) {
        curCurveInfo.uCurve.validP = false;
    } else {
        curCurveInfo.uCurve.validN = false;
    }
}

function dealWithDuplicates(
    objectBoxMap: Map<Curve2 | IFace2D, Box2>,
    curveInfoMap: Map<Curve2, CurveInfo>,
    validFace2ds: IFace2D[],
    distanceTol: number,
    angleTol: number,
) {
    const uniqueObjMap = new Map<string, Array<Curve2 | IFace2D>>();
    for (const obj of objectBoxMap.keys()) {
        const key = calKey(obj);
        let values = uniqueObjMap.get(key);
        if (!values) {
            values = [];
            uniqueObjMap.set(key, values);
        }
        values!.push(obj);
    }

    for (const values of uniqueObjMap.values()) {
        const tmpCurve2ds = values.filter(it => it instanceof Curve2) as Curve2[];
        const tmpUniqueCurveInfos: UniqueCurveInfo[] = [];
        tmpCurve2ds.forEach(tmpCurve => {
            let uniqueCurveInfo: UniqueCurveInfo | undefined;
            let sameDir: 0 | 1 = 1;
            for (const uInfo of tmpUniqueCurveInfos) {
                if (
                    CurvesOverlapJudge.execute(uInfo.curve, tmpCurve, distanceTol, angleTol) ===
                    CurvesPJType.TOTALLY_OVERLAP
                ) {
                    uniqueCurveInfo = uInfo;
                    if (
                        !uInfo.curve.getStartPt().equals(tmpCurve.getStartPt()) ||
                        !uInfo.curve.getStartTangent().equals(tmpCurve.getStartTangent())
                    ) {
                        sameDir = 0;
                    }
                    break;
                }
            }
            if (!uniqueCurveInfo) {
                uniqueCurveInfo = new UniqueCurveInfo(tmpCurve);
                tmpUniqueCurveInfos.push(uniqueCurveInfo);
            }
            curveInfoMap.set(tmpCurve, {
                uCurve: uniqueCurveInfo,
                dir: sameDir,
            });
        });

        const tmpFace2ds = values.filter(it => !(it instanceof Curve2)) as IFace2D[];
        const tmpValidFace2ds: IFace2D[] = [];
        tmpFace2ds.forEach(it => {
            let valid = true;
            for (const tmpValid of tmpValidFace2ds) {
                if (areFacesTotallyOverlap(it, tmpValid, distanceTol, angleTol)) {
                    valid = false;
                    break;
                }
            }
            if (valid && it.loops.length) {
                tmpValidFace2ds.push(it);
            }
        });
        validFace2ds.push(...tmpValidFace2ds);
    }
}

export function faces2DSplit(
    faces1: IFace2D[],
    faces2: IFace2D[],
    distanceTol: number,
    angleTol: number,
    newCurveMap?: Map<Curve2, Curve2>,
): IFace2D[] {
    const resultFaces: IFace2D[] = [];

    faces1.forEach(f => {
        f.bBlankFace = true;
    });

    // 计算包围盒, 构造四叉树
    const totalBox = new Box2();
    const objectBoxMap = new Map<Curve2 | IFace2D, Box2>();
    for (const face of [...faces1, ...faces2]) {
        const fBox = new Box2();
        for (const loop of face.loops) {
            for (const bc of loop) {
                const cBox = bc.getBBox();
                objectBoxMap.set(bc, cBox);
                fBox.union(cBox);
            }
        }
        objectBoxMap.set(face, fBox);
        totalBox.union(fBox);

        if (face.loops.length) {
            face.bPositive = new Loop(face.loops[0]).isAnticlockwise();
        }
    }

    const objs = [];
    for (const [key, value] of objectBoxMap) {
        const s = value.getSize();
        objs.push({
            x: Math.round(value.min.x),
            y: Math.round(value.min.y),
            width: s.x + 2,
            height: s.y + 2,
            obj: key,
        });
    }
    const quadtree = new (Quadtree as any)({
        x: Math.round(totalBox.min.x) - 50,
        y: Math.round(totalBox.min.y) - 50,
        width: totalBox.getSize().x + 100,
        height: totalBox.getSize().y + 100,
        maxElements: 20,
    });
    quadtree.pushAll(objs);

    // 去除重复的curve, face2d
    const validFace2ds: IFace2D[] = [];
    const curveInfoMap = new Map<Curve2, CurveInfo>();
    dealWithDuplicates(objectBoxMap, curveInfoMap, validFace2ds, distanceTol, angleTol);

    // 分割面
    validFace2ds.sort((a, b) => (a.bBlankFace ? 0 : 1) - (b.bBlankFace ? 0 : 1));
    for (const face2d of validFace2ds) {
        // 分析内部的
        const faceBox = objectBoxMap.get(face2d)!;
        const s = faceBox.getSize();
        const boundarySet = new Set<Curve2>();
        face2d.loops.forEach(l => l.forEach(c => boundarySet.add(c)));
        let overlaps = quadtree.colliding({
            x: Math.round(faceBox.min.x) - 2,
            y: Math.round(faceBox.min.y) - 2,
            width: s.x + 4,
            height: s.y + 4,
        }) as any[];
        overlaps = overlaps.filter(it => it.obj instanceof Curve2 && !boundarySet.has(it.obj));
        const innerCurves: Curve2[] = [];
        const tmpLoops = face2d.loops.map(l => new Loop(l));
        const tmpPoly = new Polygon();
        tmpLoops.forEach(l => tmpPoly.addLoop(l, false));
        overlaps.forEach(overlap => {
            const midPtInLoopRet = PtPolygonPJ.execute(
                (overlap.obj as any).getMidPt(),
                tmpPoly,
                distanceTol,
            );
            if (midPtInLoopRet === PtLoopPJType.IN) {
                innerCurves.push(overlap.obj);
            }
        });

        const tmpCurveInfoMap = new Map<Curve2, CurveInfo>();
        const tmpUniqueSet = new Set<UniqueCurveInfo>();
        innerCurves.forEach(innerCurve => {
            const oInfo = curveInfoMap.get(innerCurve)!;
            if (tmpUniqueSet.has(oInfo.uCurve)) {
                return;
            }
            if (getValidFlag(oInfo, face2d.bPositive!)) {
                tmpCurveInfoMap.set(innerCurve, oInfo);
            }
            if (getValidFlag(oInfo, !face2d.bPositive!)) {
                const rCruve = innerCurve.clone();
                rCruve.reverse();
                tmpCurveInfoMap.set(rCruve, {
                    uCurve: oInfo.uCurve,
                    dir: oInfo.dir ? 0 : 1,
                });
            }

            tmpUniqueSet.add(oInfo.uCurve);
        });

        // 分析自己的边界
        boundarySet.forEach(boundary => {
            const oInfo = curveInfoMap.get(boundary)!;
            if (getValidFlag(oInfo, face2d.bPositive!)) {
                tmpCurveInfoMap.set(boundary, oInfo);
            }
        });

        // 直接将自己返回
        if (!innerCurves.length && boundarySet.size && boundarySet.size === tmpCurveInfoMap.size) {
            face2d.originFaces = getOriginFaces(face2d);
            resultFaces.push(face2d);

            face2d.loops.forEach(l =>
                l.forEach(c => {
                    const iInfo = tmpCurveInfoMap.get(c);
                    if (iInfo) {
                        updateValidFlag(iInfo, face2d.bPositive!);
                    }
                }),
            );
            continue;
        }

        // 搜索新的环
        const newLoops = SearchLoop2D.execute(Array.from(tmpCurveInfoMap.keys()), face2d.bPositive!, distanceTol);

        // 创建新的面
        const newPolygons = ILoopsToPolygonExes.execute<Loop>(newLoops, false, true);
        const newFaces = newPolygons.map(polygon => {
            return {
                loops: polygon.map(l => l.getAllCurves()),
                bPositive: polygon[0].isAnticlockwise(),
            } as IFace2D;
        });
        newFaces.forEach(f => {
            f.originFaces = getOriginFaces(face2d);
            resultFaces.push(f);

            f.loops.forEach(l =>
                l.forEach(c => {
                    const iInfo = tmpCurveInfoMap.get(c);
                    if (iInfo) {
                        updateValidFlag(iInfo, f.bPositive!);
                        newCurveMap?.set(c, iInfo.uCurve.curve);
                    }
                }),
            );
        });
    }

    return resultFaces;
}