import { Curve2 } from '../../../geometry/curve2';
import {
    IFace2D,
    splitLoopsIntoGroup,
    calculateFaceBBox,
    calculatePositionInfo,
    Curve2dGroup,
    validateOverlapCurveGroup,
    generateResult,
} from './utils';
import { Loop } from '../../../topology/loop';
import { Bool2dType } from './bool2d';
import { Tol } from '../../../base/tol';



function getOriginFaces(newFace: IFace2D, originFaceSet: Set<IFace2D>): IFace2D[] {
    const originFaceArray = Array.from(originFaceSet);
    while (originFaceArray.length) {
        const originFace = originFaceArray.pop()!;

        let seedFaces: IFace2D[] = [];
        for (const bcGroup of originFace.bcGroups!) {
            if (bcGroup.onFaces) {
                seedFaces = seedFaces.concat(bcGroup.onFaces);
            }
            if (bcGroup.insideFaces) {
                seedFaces = seedFaces.concat(bcGroup.insideFaces);
            }
        }
        seedFaces = seedFaces.filter(f => f && !originFaceSet.has(f));
        seedFaces.forEach(f => {
            originFaceArray.push(f);
            originFaceSet.add(f);
        });
    }

    const results = Array.from(originFaceSet);
    results.sort((f1, f2) => (f1.bBlankFace ? 0 : 1) - (f2.bBlankFace ? 0 : 1));
    return results;
}

function validateCurveGroup(group: Curve2dGroup, distanceTol = Tol.LENGTH): void {
    if (group.insideFaces && group.insideFaces.length) {
        group.bValid = false;
    } else if (group.onFaces && group.onFaces.length) {
        validateOverlapCurveGroup(group, distanceTol);
    } else {
        group.bValid = true;
    }
}

/**
 * 两组二维面域求并集
 * @param faces1
 * @param faces2
 * @param newCurveMap 可选参数, map<new bounded curve, origin bounded curve>.
 */
export function faces2DUnion(
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
    allFaces.forEach(f => calculatePositionInfo(f, allFaces, distanceTol, angleTol));

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
    for (const face of allFaces) {
        if (!face.bcGroups!.length) {
            continue;
        }
        if (face.bcGroups!.every(g => g.bValid && (!g.onFaces || !g.onFaces.length))) {
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
    generateResult(leftFaces, resultFaces, 0 as Bool2dType, getOriginFaces, distanceTol, angleTol, newCurveMap);

    return resultFaces;
}