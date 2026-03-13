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
        group.bValid = true;
    } else if (group.onFaces && group.onFaces.length) {
        if (group.face.bBlankFace) {
            validateOverlapCurveGroup(group, distanceTol);
        } else {
            group.bValid = false;
        }
    } else {
        group.bValid = false;
    }
}

function getOriginFaces(newFace: IFace2D, candidateOriginFaces: Set<IFace2D>): IFace2D[] {
    if (!newFace.box) {
        calculateFaceBBox(newFace);
    }

    const originFaceSet = new Set<IFace2D>();
    for (const face of candidateOriginFaces) {
        face.originFaces!.forEach(f => {
            if (f.box!.intersectsBox(newFace.box!)) {
                originFaceSet.add(f);
            }
        });
    }

    const results = Array.from(originFaceSet);
    results.sort((f1, f2) => (f1.bBlankFace ? 0 : 1) - (f2.bBlankFace ? 0 : 1));
    return results;
}

/**
 * 两组二维面域相交
 * @param faces1
 * @param faces2
 * @param newCurveMap 可选参数, map<new bounded curve, origin bounded curve>.
 */
export function faces2DIntersect(
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
    faces1.forEach(f => calculatePositionInfo(f, faces2, distanceTol, angleTol));
    faces2.forEach(f => calculatePositionInfo(f, faces1, distanceTol, angleTol));

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

    // 4. 生成结果：搜环并组成新的二维面域
    generateResult(allFaces, resultFaces, 1, getOriginFaces, distanceTol, angleTol, newCurveMap);

    return resultFaces;
}

