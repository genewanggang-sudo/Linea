import { Curve2 } from '../../../geometry/curve2';
import {
    IFace2D,
    splitLoopsIntoGroup,
    calculateFaceBBox,
    Curve2dGroup,
    calculatePositionInfo,
    validateOverlapCurveGroup,
    generateResult,
} from './utils';
import { Loop } from '../../../topology/loop';
import { Tol } from '../../../base/tol';



function validateCurveGroup(group: Curve2dGroup, distanceTol = Tol.LENGTH): void {
    if (group.insideFaces && group.insideFaces.length) {
        if (group.face.bBlankFace) {
            group.bValid = false;
        } else {
            group.bValid = true;
        }
    } else if (group.onFaces && group.onFaces.length) {
        if (group.face.bBlankFace) {
            validateOverlapCurveGroup(group, distanceTol, true);
        } else {
            group.bValid = false;
        }
    } else {
        group.bValid = !!group.face.bBlankFace;
    }
}

function intersectionSet(thisSet: Set<any>, otherSet: Set<any>): Set<any> {
    const interSectionSet = new Set();
    for (const e of thisSet) {
        if (otherSet.has(e)) {
            interSectionSet.add(e);
        }
    }

    return interSectionSet;
}

function getOriginFaces(newFace: IFace2D, candidateOriginFaces: Set<IFace2D>): IFace2D[] {
    if (!newFace.box) {
        calculateFaceBBox(newFace);
    }

    // for subtract operation, origin face should be blank face.
    // special case: if candidateOriginFaces has no blank face, try below workflow.
    // get the intersection of bcGroup.insideFaces.
    let candidates = Array.from(candidateOriginFaces).filter(f => f.bBlankFace);
    if (!candidates.length) {
        let finalOriginSet;
        for (const face of candidateOriginFaces) {
            const seedFaces = new Set<IFace2D>();
            for (const bcGroup of face.bcGroups!) {
                if (bcGroup.insideFaces) {
                    bcGroup.insideFaces.filter(f => f.bBlankFace).forEach(f => seedFaces.add(f));
                }
            }
            if (finalOriginSet) {
                finalOriginSet = intersectionSet(finalOriginSet, seedFaces);
            } else {
                finalOriginSet = seedFaces;
            }
        }
        if (finalOriginSet) {
            candidates = Array.from(finalOriginSet);
        }
    }

    const originFaceSet = new Set<IFace2D>();
    for (const face of candidates) {
        face.originFaces!.forEach(f => {
            if (f.box!.intersectsBox(newFace.box!)) {
                originFaceSet.add(f);
            }
        });
    }

    return Array.from(originFaceSet).sort((f1, f2) => (f1.bBlankFace ? 0 : 1) - (f2.bBlankFace ? 0 : 1));
}

/**
 * 两组二维面域相减
 * @param faces1
 * @param faces2
 * @param newCurveMap 可选参数, map<new bounded curve, origin bounded curve>.
 */

export function faces2DDifference(
    faces1: IFace2D[],
    faces2: IFace2D[],
    distanceTol: number,
    angleTol: number,
    newCurveMap?: Map<Curve2, Curve2>,
): IFace2D[] {
    const resultFaces: IFace2D[] = [];

    // 1. 轮廓曲线分组
    faces1.forEach(f => {
        f.bBlankFace = true;
    });
    faces2.forEach(f => {
        f.bBlankFace = false;
    });
    splitLoopsIntoGroup(faces1, faces2, distanceTol);

    // 2. 计算每组曲线的位置信息
    const allFaces: IFace2D[] = [...faces1, ...faces2];
    allFaces.forEach(f => calculateFaceBBox(f));
    const insideMap: Map<IFace2D, Curve2dGroup[]> = new Map();
    faces1.forEach(f => calculatePositionInfo(f, faces2, distanceTol, angleTol, insideMap));
    faces2.forEach(f => calculatePositionInfo(f, faces1, distanceTol, angleTol, insideMap));

    // 3. 检测每组曲线的有效性
    for (const face of allFaces) {
        if (!face.loops.length || face.bPositive !== undefined) {
            continue;
        }
        face.bPositive = new Loop(face.loops[0]).isAnticlockwise();
    }
    for (const face of allFaces) {
        if (face.bPositive === undefined) {
            continue;
        }
        for (const group of face.bcGroups!) {
            validateCurveGroup(group, distanceTol);
        }
    }

    // 4. 返回简单结果，对于特殊情况
    const leftFaces: IFace2D[] = [];
    for (const face of faces1) {
        if (!face.bcGroups!.length) {
            continue;
        }
        if (face.bcGroups!.every(g => g.bValid) && !insideMap.get(face)) {
            // 面内的曲线都是有效的，则可以直接作为结果
            face.originFaces = getOriginFaces(face, new Set<IFace2D>([face]));
            resultFaces.push(face);
        } else {
            leftFaces.push(face);
        }
    }
    if (!leftFaces.length) {
        return resultFaces;
    }

    // 5. 生成结果：搜环并组成新的二维面域
    generateResult([...leftFaces, ...faces2], resultFaces, 2, getOriginFaces, distanceTol, angleTol, newCurveMap);

    // 确保结果的顺逆时针和原始是一致的
    resultFaces.forEach(resultFace => {
        if (
            resultFace.originFaces &&
            resultFace.originFaces.length === 1 &&
            resultFace.originFaces[0].bPositive !== resultFace.bPositive
        ) {
            const newLoops = resultFace.loops.map(loop => {
                loop.reverse();
                loop.forEach(c => c.reverse());
                return loop;
            });
            resultFace.loops = newLoops;
        }
    });
    return resultFaces;
}