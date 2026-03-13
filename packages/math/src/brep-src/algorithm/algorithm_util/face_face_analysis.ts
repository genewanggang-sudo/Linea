import { Curve3, Tol, CONST, PeriodInterval, Vec3, Util } from '../../..';
import { Face } from '../../brep/face';
import { PositionType } from './base_define';



export interface IFaceFacePosition {
    position1: PositionType; // face1(s)在face2(s)的内外关系

    position2: PositionType; // face2(s)在face1(s)的内外关系
}

interface IFacePair {
    face1: Face;

    face2: Face;

    isOverlap: boolean;

    isFaceSameDir?: boolean; // 各重合 face 与 face1 是否同向
}

interface IFaceInfo {
    face: Face;

    faceProjDir: Vec3;
}

export class FaceFaceAnalysis {
    /**
     * 返回0，不是相切，互不包含，相互穿插(因为这种情况只需要加入face就行，不需要管加入哪个face，所以不需要区分inout和outin)
     * 返回1，相切并且face2在face1外面（face1不包含face2）
     * 返回2，相切并且face2在face1里面（face1包含face2）
     * @param face1
     * @param face2
     * @param xCurve
     */
    public static FaceFace(face1: Face, face2: Face, xCurve: Curve3, eps = Tol.LENGTH): PositionType {
        const tryPtsNum = this._calcTryPtsNumber([face1, face2], xCurve);
        const range = xCurve.getRange();
        const rangeStep = range.getLength() / tryPtsNum;

        let isContain: number | undefined;
        const surf1 = face1.getSurface();
        const surf2 = face2.getSurface();
        for (let i = 0; i < tryPtsNum; i++) {
            const param = range.min + i * rangeStep; // 采样点判断相切
            const pt = xCurve.getPtAt(param);
            const tangent = xCurve.getTangentAt(param);

            const uv1 = surf1.getUVAt(pt);
            const norm1 = face1.getNormAt(uv1);
            const uv2 = surf2.getUVAt(pt);
            const norm2 = face2.getNormAt(uv2);
            if (!norm1.isParallel(norm2)) {
                return PositionType.UNKWON; // 不是相切
            }

            const cross = norm1.cross(tangent);
            const leftPt = pt.added(cross.multiplied(1e-2));
            const leftUV1 = surf1.getUVAt(leftPt);
            const leftUV2 = surf2.getUVAt(leftPt);
            const leftFacePt1 = surf1.getPtAt(leftUV1);
            const leftFacePt2 = surf2.getPtAt(leftUV2);
            const leftVect = leftFacePt2.subtracted(leftFacePt1).normalize();
            const leftNorm = face1.getNormAt(leftUV1);
            const leftDot = leftNorm.dot(leftVect);

            const rightPt = pt.subtracted(cross.multiplied(1e-2));
            const rightUV1 = surf1.getUVAt(rightPt);
            const rightUV2 = surf2.getUVAt(rightPt);
            const rightFacePt1 = surf1.getPtAt(rightUV1);
            const rightFacePt2 = surf2.getPtAt(rightUV2);
            const rightVect = rightFacePt2.subtracted(rightFacePt1).normalize();
            const rightNorm = face1.getNormAt(rightUV1);
            const rightDot = rightNorm.dot(rightVect);

            // face2上的点在face1外面
            if (leftDot * rightDot < 0) {
                return PositionType.UNKWON; // 不是相切
            }
            if (leftDot > eps && rightDot > eps) {
                const tmpContans = PositionType.OUT;
                if (isContain === undefined) {
                    isContain = tmpContans;
                } else if (isContain !== tmpContans) {
                    return PositionType.UNKWON;
                }
            } else if (leftDot < -eps && rightDot < -eps) {
                const tmpContans = PositionType.IN;
                if (isContain === undefined) {
                    isContain = tmpContans;
                } else if (isContain !== tmpContans) {
                    return PositionType.UNKWON;
                }
            }
        }

        if (isContain === undefined) {
            return PositionType.UNKWON;
        }
        return isContain;
    }

    // 这个关系在edgeface重合的时候就分析清楚并记录下来，避免重合分析??
    // position1:
    // in: face在edge的两个face内部
    // out: face在edge的两个face外部
    // inout：face的左半face在edge的两个face内，右半face在face在edge的两个face外
    // outin：face的左半face在edge的两个face外，右半face在face在edge的两个face内
    // position2:
    // in: edge的两个face在face内部
    // out: edge的两个face在face外部
    // inout：edge的左face在face内，右face在edge的两个face外
    // outin：edge的左face在face外，右face在edge的两个face内
    public static FaceAndEdgeFaces(
        face: Face,
        edgeCurve: Curve3,
        edgeFaces: Face[],
        overlapFacePairs: IFacePair[],
        eps = Tol.LENGTH,
    ): IFaceFacePosition {
        if (overlapFacePairs.length > 1) {
            return { position1: PositionType.IN, position2: PositionType.IN };
        }

        const [leftFace, rightFace] = edgeFaces;

        const tryPtsNum = this._calcTryPtsNumber([face, ...edgeFaces], edgeCurve);
        const range = edgeCurve.getRange();
        const rangeStep = range.getLength() / tryPtsNum;

        let pos1: PositionType | undefined;
        let pos2: PositionType | undefined;
        const surf = face.getSurface();
        const leftSurf = leftFace.getSurface();
        const rightSurf = rightFace.getSurface();
        for (let i = 0; i < tryPtsNum; i++) {
            const param = range.min + i * rangeStep; // 采样点判断相切
            const pt = edgeCurve.getPtAt(param);
            const tangent = edgeCurve.getTangentAt(param);

            const uv = surf.getUVAt(pt);
            const faceNorm = face.getNormAt(uv);
            const uv1 = leftSurf.getUVAt(pt);
            const uv2 = rightSurf.getUVAt(pt);
            const lFaceNorm = leftFace.getNormAt(uv1);
            const rFaceNorm = rightFace.getNormAt(uv2);

            const dirZ = tangent;
            const faceProjDir = dirZ.cross(faceNorm);

            // 从dirZ看过去，leftFace的投影和rightFace的投影构成逆时针的首尾想接edge。即leftDir的终点为rightDir的起点。投影要spilt面积，如何判断？
            // 判断方法：将leftDir反向一下，判断face投影的两后两段是否在rightDir到leftDir之间.如果在rightDir到leftDir之间，内；在rightDir到leftDir之外，外
            const lFaceProjDir = lFaceNorm.cross(dirZ); // 将face1的投影到z轴为dirZ平面上
            const rFaceProjDir = dirZ.cross(rFaceNorm); // 将face2投影到平面上，并作为x轴，计算角度的起始vect
            // const dirY = dirZ.cross(rFaceProjDir);
            // const coord = new Coord3(pt, rFaceProjDir, dirY);
            const lFaceAngle = rFaceProjDir.angleTo(lFaceProjDir, dirZ); // edge的两个face内部：从0到endAngle
            const eFacesAngleRange = new PeriodInterval(0, lFaceAngle, CONST.PI2);

            const faceAngle = rFaceProjDir.angleTo(faceProjDir, dirZ); // face内部：angle从faceAngle到faceAngle + CONST.PI
            const face1AngleRange = new PeriodInterval(faceAngle, faceAngle + CONST.PI, CONST.PI2);

            // if (overlapFacePairs.length === 1) {
            //     const overlapPair = overlapFacePairs[0];
            //     if (overlapPair.face1 === leftFace || overlapPair.face2 === leftFace) {
            //         if (face1AngleRange.containsPtAtStartOrEnd(0)) {
            //             const lFacePos = { position1: PositionType.IN, position2: PositionType.IN };
            //             // 不重合的是右边的face// 如果右边face相切
            //             const faceRightProjDir = rFaceProjDir;
            //             const rFacePos = this._tangentFaceHalfFaceTryPosition(
            //                 face,
            //                 rightFace,
            //                 pt,
            //                 rFaceProjDir,
            //                 faceRightProjDir,
            //             );
            //             pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos.position2, rFacePos.position2);
            //             pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos.position1, rFacePos.position1);
            //         } else {
            //             const lFacePos2 = face1AngleRange.containsPt(lFaceAngle) ? PositionType.IN : PositionType.OUT;
            //             const rFacePos2 = face1AngleRange.containsPt(0) ? PositionType.IN : PositionType.OUT;
            //             pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);

            //             const lFacePos1 = eFacesAngleRange.containsPt(faceAngle + CONST.PI)
            //                 ? PositionType.IN
            //                 : PositionType.OUT;
            //             const rFacePos1 = eFacesAngleRange.containsPt(faceAngle) ? PositionType.IN : PositionType.OUT;
            //             pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
            //         }
            //     } else {
            //         const rFacePos = { position1: PositionType.IN, position2: PositionType.IN };
            //         // 不重合的是右边的face
            //         if (face1AngleRange.containsPtAtStartOrEnd(0)) {
            //             // 如果右边face相切
            //             const faceRightProjDir = rFaceProjDir;
            //             const rFacePos = this._tangentFaceHalfFaceTryPosition(
            //                 face,
            //                 rightFace,
            //                 pt,
            //                 rFaceProjDir,
            //                 faceRightProjDir,
            //             );
            //             pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos.position2, rFacePos.position2);
            //             pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos.position1, rFacePos.position1);
            //         } else {
            //             const lFacePos2 = face1AngleRange.containsPt(lFaceAngle) ? PositionType.IN : PositionType.OUT;
            //             const rFacePos2 = face1AngleRange.containsPt(0) ? PositionType.IN : PositionType.OUT;
            //             pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);

            //             const lFacePos1 = eFacesAngleRange.containsPt(faceAngle + CONST.PI)
            //                 ? PositionType.IN
            //                 : PositionType.OUT;
            //             const rFacePos1 = eFacesAngleRange.containsPt(faceAngle) ? PositionType.IN : PositionType.OUT;
            //             pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
            //         }
            //     }
            // } else
            if (face1AngleRange.containsPtAtStartOrEnd(0) || face1AngleRange.containsPtAtStartOrEnd(lFaceAngle)) {
                if (overlapFacePairs.length === 0 && surf.isPlane() && rightSurf.isPlane() && leftSurf.isPlane()) {
                    // 如果没有face重合，且都是平面，是近似重合，但是不能当重合处理，用更高的精度判断关系，因为平面本身计算精度也比较高
                    const highEps = eps / 100;
                    const lFacePos2 = face1AngleRange.containsPt(lFaceAngle, highEps)
                        ? PositionType.IN
                        : PositionType.OUT;
                    const rFacePos2 = face1AngleRange.containsPt(0, highEps) ? PositionType.IN : PositionType.OUT;
                    pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);

                    const lFacePos1 = eFacesAngleRange.containsPt(faceAngle + CONST.PI, highEps)
                        ? PositionType.IN
                        : PositionType.OUT;
                    const rFacePos1 = eFacesAngleRange.containsPt(faceAngle, highEps)
                        ? PositionType.IN
                        : PositionType.OUT;
                    pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
                    continue;
                }

                // if (face.getSurface().isPlane()) {
                //     if (face1AngleRange.containsPtAtStartOrEnd(0)) {

                //     } else {
                //         // if (face1AngleRange.containsPtAtStartOrEnd(lFaceAngle)) {

                //     }
                // }
                // 如果这一段curve的切向和face的投影（偏微分）方向平行，curve可能和face相切或者重合
                let faceLeftProjDir: Vec3;
                let faceRightProjDir: Vec3;
                if (face1AngleRange.containsPtAtStartOrEnd(0)) {
                    faceLeftProjDir = rFaceProjDir.reversed();
                    faceRightProjDir = rFaceProjDir; // 右侧重合
                } else {
                    faceLeftProjDir = lFaceProjDir; // 左侧重合
                    faceRightProjDir = lFaceProjDir.reversed();
                }
                const lFacePos = this._tangentFaceHalfFaceTryPosition(
                    face,
                    leftFace,
                    pt,
                    lFaceProjDir,
                    faceLeftProjDir,
                    eps,
                );
                //
                const rFacePos = this._tangentFaceHalfFaceTryPosition(
                    face,
                    rightFace,
                    pt,
                    rFaceProjDir,
                    faceRightProjDir,
                    eps,
                );
                pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos.position2, rFacePos.position2);
                pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos.position1, rFacePos.position1);
            } else {
                const lFacePos2 = face1AngleRange.containsPt(lFaceAngle, eps) ? PositionType.IN : PositionType.OUT;
                const rFacePos2 = face1AngleRange.containsPt(0, eps) ? PositionType.IN : PositionType.OUT;
                pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);

                //
                const lFacePos1 = eFacesAngleRange.containsPt(faceAngle + CONST.PI, eps)
                    ? PositionType.IN
                    : PositionType.OUT;
                const rFacePos1 = eFacesAngleRange.containsPt(faceAngle, eps) ? PositionType.IN : PositionType.OUT;
                pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
            }

            if (pos1 === PositionType.UNKWON && pos2 === PositionType.UNKWON) {
                break;
            }
        }

        return { position1: pos1!, position2: pos2! };
    }

    // position1:
    // in: edge1的两个face在edge2的两个face内部
    // out: edge1的两个face在edge2的两个face外部
    // inout：edge1的左face在edge2的两个face内，右face在face在edge2的两个face外
    // outin：edge1的左face在edge2的两个face外，右face在face在edge2的两个face内
    // position2:
    // in: edge2的两个face在edge1的两个face内部
    // out: edge2的两个face在edge1的两个face外部
    // inout：edge2的左face在edge1的两个face内，右face在face在edge1的两个face外
    // outin：edge2的左face在edge1的两个face外，右face在face在edge1的两个face内
    public static EdgeFacesAndEdgeFaces(
        edgeCurve: Curve3,
        edgeSameDir: boolean,
        edge1Faces: Face[],
        edge2Faces: Face[],
        overlapFacePairs: IFacePair[],
        eps = Tol.LENGTH,
    ): IFaceFacePosition {
        const [leftFace1, rightFace1] = edge1Faces;
        // 如果edge1和edge2的方向相反，那么以edge的方向为准的时候，edge2的左右face就要互换一下
        const [tmpLeftFace2, tmpRightFace2] = edgeSameDir
            ? [edge2Faces[0], edge2Faces[1]]
            : [edge2Faces[1], edge2Faces[0]];

        const tryPtsNum = this._calcTryPtsNumber([...edge1Faces, ...edge2Faces], edgeCurve);
        const range = edgeCurve.getRange();
        const rangeStep = range.getLength() / tryPtsNum;

        let pos1: PositionType | undefined;
        let pos2: PositionType | undefined;
        const leftSurf1 = leftFace1.getSurface();
        const rightSurf1 = rightFace1.getSurface();
        const tmpLeftSurf2 = tmpLeftFace2.getSurface();
        const tmpRightSurf2 = tmpRightFace2.getSurface();
        for (let i = 0; i < tryPtsNum; i++) {
            const param = range.min + i * rangeStep; // 采样点判断相切
            const pt = edgeCurve.getPtAt(param);
            const tangent = edgeCurve.getTangentAt(param);

            const lUV1 = leftSurf1.getUVAt(pt);
            const rUV1 = rightSurf1.getUVAt(pt);
            const lFaceNorm1 = leftFace1.getNormAt(lUV1);
            const rFaceNorm1 = rightFace1.getNormAt(rUV1);
            const lUV2 = tmpLeftSurf2.getUVAt(pt);
            const rUV2 = tmpRightSurf2.getUVAt(pt);
            const tmpLFaceNorm2 = tmpLeftFace2.getNormAt(lUV2);
            const tmpRFaceNorm2 = tmpRightFace2.getNormAt(rUV2);

            const dirZ = tangent;

            const lFaceProjDir1 = lFaceNorm1.cross(dirZ); // 将lface1的投影到z轴为dirZ平面上
            const rFaceProjDir1 = dirZ.cross(rFaceNorm1); // 将rface1投影到平面上，并作为x轴，计算角度的起始vect

            // 从dirZ看过去，leftFace的投影和rightFace的投影构成逆时针的首尾想接edge。即leftDir的终点为rightDir的起点。投影要spilt面积，如何判断？
            // 判断方法：将leftDir反向一下，判断face投影的两后两段是否在rightDir到leftDir之间.如果在rightDir到leftDir之间，内；在rightDir到leftDir之外，外
            const tmpLFProjDir2 = tmpLFaceNorm2.cross(dirZ);
            const tmpRFProjDir2 = dirZ.cross(tmpRFaceNorm2);

            const overlapPairs = this._classifyOverlapFacePair(
                { face: leftFace1, faceProjDir: lFaceProjDir1 },
                { face: rightFace1, faceProjDir: rFaceProjDir1 },
                { face: tmpLeftFace2, faceProjDir: tmpLFProjDir2 },
                { face: tmpRightFace2, faceProjDir: tmpRFProjDir2 },
                overlapFacePairs,
            );

            let lFaceAngle1 = rFaceProjDir1.angleTo(lFaceProjDir1, dirZ); // edge1的两个face内部：从0到lFaceAngle1
            let tmpRFAngle2 = rFaceProjDir1.angleTo(tmpRFProjDir2, dirZ); // face内部：angle从faceAngle到faceAngle + CONST.PI
            let tmpLFAngle2 = rFaceProjDir1.angleTo(tmpLFProjDir2, dirZ);
            const curveStPt = edgeCurve.getStartPt();
            const curveEndPt = edgeCurve.getEndPt();
            if (lFaceProjDir1.equals(rFaceProjDir1)) {
                // 判断face的夹角到底是0度还是360度
                const lTryDirVect = this._adjustFaceProjectDir(curveStPt, curveEndPt, leftFace1, lFaceProjDir1);
                if (lTryDirVect) {
                    const refAngle1 = rFaceProjDir1.angleTo(lTryDirVect, dirZ);
                    lFaceAngle1 = refAngle1 > CONST.PI ? CONST.PI2 : 0;
                } else {
                    const rTryDirVect = this._adjustFaceProjectDir(curveStPt, curveEndPt, rightFace1, rFaceProjDir1);
                    if (rTryDirVect) {
                        const refAngle1 = rTryDirVect.angleTo(lFaceProjDir1, dirZ);
                        lFaceAngle1 = refAngle1 > CONST.PI ? CONST.PI2 : 0;
                    }
                }
            }
            if (tmpLFProjDir2.equals(tmpRFProjDir2)) {
                // 判断夹角是0度还是360度
                const lTryDirVect = this._adjustFaceProjectDir(curveStPt, curveEndPt, tmpLeftFace2, tmpLFProjDir2);
                if (lTryDirVect) {
                    const refAngle1 = tmpRFProjDir2.angleTo(lTryDirVect, dirZ);
                    tmpLFAngle2 = refAngle1 > CONST.PI ? tmpRFAngle2 + CONST.PI2 : tmpRFAngle2;
                } else {
                    const rTryDirVect = this._adjustFaceProjectDir(curveStPt, curveEndPt, tmpRightFace2, tmpRFProjDir2);
                    if (rTryDirVect) {
                        const refAngle2 = rTryDirVect.angleTo(tmpLFProjDir2, dirZ);
                        tmpLFAngle2 = refAngle2 > CONST.PI ? tmpRFAngle2 + CONST.PI2 : tmpRFAngle2;
                    }
                }
            }
            // 调整重合face的角度保持一致，防止出现重合的face，一个角度360，一个为0
            // 如果两个face重合，一起调整角度，如果差别180度重合也一起调整？？？？暂时不需要
            for (const op of overlapPairs) {
                if (op.face2 === tmpLeftFace2) {
                    if (op.face1 === leftFace1) {
                        tmpLFAngle2 = lFaceAngle1;
                    } else {
                        tmpLFAngle2 = 0;
                    }
                } else {
                    if (op.face1 === leftFace1) {
                        tmpRFAngle2 = lFaceAngle1;
                    } else {
                        tmpRFAngle2 = 0;
                    }
                }
            }

            const e1FacesAngleRange = new PeriodInterval(0, lFaceAngle1, CONST.PI2);

            const [rFaceAngle2, lFaceAngle2] = edgeSameDir ? [tmpRFAngle2, tmpLFAngle2] : [tmpLFAngle2, tmpRFAngle2]; // 实际的左边face和右边face的angle
            const e2FacesAngleRange = new PeriodInterval(tmpRFAngle2, tmpLFAngle2, CONST.PI2);

            // 如果出现0长range，调整会很麻烦，直接判断位置关系
            if (lFaceProjDir1.equals(rFaceProjDir1) || tmpLFProjDir2.equals(tmpRFProjDir2)) {
                let lFacePos1: PositionType | undefined;
                let rFacePos1: PositionType | undefined;
                let tmpLFPos2: PositionType | undefined;
                let tmpRFPos2: PositionType | undefined;

                if (lFaceProjDir1.equals(tmpLFProjDir2)) {
                    const pos = this._tangentFaceHalfFaceTryPosition(
                        leftFace1,
                        tmpLeftFace2,
                        pt,
                        tmpLFProjDir2,
                        lFaceProjDir1,
                        eps,
                    );
                    [lFacePos1, tmpLFPos2] = [pos.position1, pos.position2];
                }
                if (lFaceProjDir1.equals(tmpRFProjDir2)) {
                    const pos = this._tangentFaceHalfFaceTryPosition(
                        leftFace1,
                        tmpRightFace2,
                        pt,
                        tmpRFProjDir2,
                        lFaceProjDir1,
                        eps,
                    );
                    [lFacePos1, tmpRFPos2] = [pos.position1, pos.position2];
                }
                if (rFaceProjDir1.equals(tmpLFProjDir2)) {
                    const pos = this._tangentFaceHalfFaceTryPosition(
                        rightFace1,
                        tmpLeftFace2,
                        pt,
                        tmpLFProjDir2,
                        rFaceProjDir1,
                        eps,
                    );
                    [rFacePos1, tmpLFPos2] = [pos.position1, pos.position2];
                }
                if (rFaceProjDir1.equals(tmpRFProjDir2)) {
                    const pos = this._tangentFaceHalfFaceTryPosition(
                        rightFace1,
                        tmpRightFace2,
                        pt,
                        tmpRFProjDir2,
                        rFaceProjDir1,
                        eps,
                    );
                    [rFacePos1, tmpRFPos2] = [pos.position1, pos.position2];
                }

                if (!lFacePos1) {
                    lFacePos1 = e2FacesAngleRange.containsPt(lFaceAngle1) ? PositionType.IN : PositionType.OUT;
                }
                if (!rFacePos1) {
                    rFacePos1 = e2FacesAngleRange.containsPt(0) ? PositionType.IN : PositionType.OUT;
                }
                if (!tmpLFPos2) {
                    tmpLFPos2 = e1FacesAngleRange.containsPt(tmpLFAngle2) ? PositionType.IN : PositionType.OUT;
                }
                if (!tmpRFPos2) {
                    tmpRFPos2 = e1FacesAngleRange.containsPt(tmpRFAngle2) ? PositionType.IN : PositionType.OUT;
                }

                const [lFacePos2, rFacePos2] = edgeSameDir ? [tmpLFPos2, tmpRFPos2] : [tmpRFPos2, tmpLFPos2];
                pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);
                pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
            }

            const isAngleEqual = (angle1: number, angle2: number, numeps: number) => {
                const rAngle1 = PeriodInterval.RegularizeParam(angle1, CONST.PI2);
                const rAngle2 = PeriodInterval.RegularizeParam(angle2, CONST.PI2);
                return Util.isNearlyEqual(rAngle1, rAngle2, numeps);
            };

            // 特殊情况处理： 如果存在一对重合并且方向相反的face，并且edgeface的夹角和小于360度，那么一定是inout或者outin类型
            const reversedOverlapPairs = overlapPairs.filter(_o => _o.isFaceSameDir === false);
            if (reversedOverlapPairs.length > 0) {
                if (e1FacesAngleRange.getLength() + e2FacesAngleRange.getLength() < CONST.PI2 - 0.001) {
                    if (reversedOverlapPairs[0].face1 === leftFace1) {
                        pos1 = PositionType.INOUT;
                    } else {
                        pos1 = PositionType.OUTIN;
                    }
                    if (reversedOverlapPairs[0].face2 === edge2Faces[0]) {
                        pos2 = PositionType.INOUT;
                    } else {
                        pos2 = PositionType.OUTIN;
                    }
                    continue;
                }
            }
            // 如果不存在夹角角度为0的情况，对于重合的直接为in，不重合的直接用角度包含判断
            // if (overlapPairs.length === 2) {
            //     // 不用特殊处理判断，都是in
            // }
            if (overlapPairs.length === 1) {
                if (overlapPairs[0].face1 === rightFace1 && overlapPairs[0].face2 === edge2Faces[1]) {
                    const [rFacePos1, rFacePos2] = [PositionType.IN, PositionType.IN];
                    if (edgeSameDir && isAngleEqual(e1FacesAngleRange.max, e2FacesAngleRange.max, eps)) {
                        const tmpDir = edgeSameDir ? tmpLFProjDir2 : tmpRFProjDir2;
                        const facePos2 = this._tangentFaceHalfFaceTryPosition(
                            leftFace1,
                            edge2Faces[0],
                            pt,
                            tmpDir,
                            lFaceProjDir1,
                            eps,
                        );
                        const [lFacePos1, lFacePos2] = [facePos2.position1, facePos2.position2];
                        pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);
                        pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
                    } else {
                        const lFacePos1 = e2FacesAngleRange.containsPt(lFaceAngle1, eps)
                            ? PositionType.IN
                            : PositionType.OUT;
                        const lFacePos2 = e1FacesAngleRange.containsPt(lFaceAngle2, eps)
                            ? PositionType.IN
                            : PositionType.OUT;
                        pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);
                        pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
                    }
                } else if (overlapPairs[0].face1 === leftFace1 && overlapPairs[0].face2 === edge2Faces[1]) {
                    const [lFacePos1, rFacePos2] = [PositionType.IN, PositionType.IN];
                    const rFacePos1 = e2FacesAngleRange.containsPt(0, eps) ? PositionType.IN : PositionType.OUT;
                    const lFacePos2 = e1FacesAngleRange.containsPt(lFaceAngle2, eps)
                        ? PositionType.IN
                        : PositionType.OUT;
                    pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);
                    pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
                } else if (overlapPairs[0].face1 === rightFace1 && overlapPairs[0].face2 === edge2Faces[0]) {
                    const [rFacePos1, lFacePos2] = [PositionType.IN, PositionType.IN];
                    const lFacePos1 = e2FacesAngleRange.containsPt(lFaceAngle1, eps)
                        ? PositionType.IN
                        : PositionType.OUT;
                    const rFacePos2 = e1FacesAngleRange.containsPt(rFaceAngle2, eps)
                        ? PositionType.IN
                        : PositionType.OUT;
                    pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);
                    pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
                } else if (overlapPairs[0].face1 === leftFace1 && overlapPairs[0].face2 === edge2Faces[0]) {
                    const [lFacePos1, lFacePos2] = [PositionType.IN, PositionType.IN];
                    if (edgeSameDir && isAngleEqual(e1FacesAngleRange.min, e2FacesAngleRange.min, eps)) {
                        const tmpDir = edgeSameDir ? tmpLFProjDir2 : tmpRFProjDir2;
                        const facePos1 = this._tangentFaceHalfFaceTryPosition(
                            rightFace1,
                            edge2Faces[1],
                            pt,
                            tmpDir,
                            rFaceProjDir1,
                            eps,
                        );
                        const [rFacePos1, rFacePos2] = [facePos1.position1, facePos1.position2];
                        pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);
                        pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
                    } else {
                        const rFacePos1 = e2FacesAngleRange.containsPt(0, eps) ? PositionType.IN : PositionType.OUT;
                        const rFacePos2 = e1FacesAngleRange.containsPt(rFaceAngle2, eps)
                            ? PositionType.IN
                            : PositionType.OUT;
                        pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);
                        pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
                    }
                }
                continue;
            }

            if (
                isAngleEqual(e1FacesAngleRange.min, e2FacesAngleRange.min, eps) &&
                isAngleEqual(e1FacesAngleRange.max, e2FacesAngleRange.max, eps)
            ) {
                const facePos1 = this._tangentFaceHalfFaceTryPosition(
                    rightFace1,
                    tmpRightFace2,
                    pt,
                    tmpRFProjDir2,
                    rFaceProjDir1,
                    eps,
                );
                const facePos2 = this._tangentFaceHalfFaceTryPosition(
                    leftFace1,
                    tmpLeftFace2,
                    pt,
                    tmpLFProjDir2,
                    lFaceProjDir1,
                    eps,
                );
                const [rFacePos1, tmpRFPos2] = [facePos1.position1, facePos1.position2];
                const [lFacePos1, tmpLFPos2] = [facePos2.position1, facePos2.position2];
                const [lFacePos2, rFacePos2] = edgeSameDir ? [tmpLFPos2, tmpRFPos2] : [tmpRFPos2, tmpLFPos2];
                pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);
                pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
            } else if (
                isAngleEqual(e1FacesAngleRange.min, e2FacesAngleRange.max, eps) &&
                isAngleEqual(e1FacesAngleRange.max, e2FacesAngleRange.min, eps)
            ) {
                const facePos1 = this._tangentFaceHalfFaceTryPosition(
                    leftFace1,
                    tmpRightFace2,
                    pt,
                    tmpRFProjDir2,
                    lFaceProjDir1,
                    eps,
                );
                const [lFacePos1, tmpRFPos2] = [facePos1.position1, facePos1.position2];
                const facePos2 = this._tangentFaceHalfFaceTryPosition(
                    rightFace1,
                    tmpLeftFace2,
                    pt,
                    tmpLFProjDir2,
                    rFaceProjDir1,
                    eps,
                );
                const [rFacePos1, tmpLFPos2] = [facePos2.position1, facePos2.position2];
                const [lFacePos2, rFacePos2] = edgeSameDir ? [tmpLFPos2, tmpRFPos2] : [tmpRFPos2, tmpLFPos2];
                pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);
                pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
            } else if (
                e1FacesAngleRange.containsPtAtStartOrEnd(e2FacesAngleRange.min, eps) ||
                e1FacesAngleRange.containsPtAtStartOrEnd(e2FacesAngleRange.max, eps)
            ) {
                // 如果这一段curve的切向和face的投影（偏微分）方向平行，curve可能和face相切或者重合
                // 如果同时有两个face都重合或相切就更麻烦
                if (isAngleEqual(e1FacesAngleRange.min, e2FacesAngleRange.min, eps)) {
                    //
                    const rFacePos = this._tangentFaceHalfFaceTryPosition(
                        rightFace1,
                        tmpRightFace2,
                        pt,
                        tmpRFProjDir2,
                        rFaceProjDir1,
                        eps,
                    );
                    const [rFacePos1, tmpRFPos2] = [rFacePos.position1, rFacePos.position2];
                    const lFacePos1 = e2FacesAngleRange.containsPt(lFaceAngle1, eps)
                        ? PositionType.IN
                        : PositionType.OUT;
                    const tmpLFPos2 = e1FacesAngleRange.containsPt(tmpLFAngle2, eps)
                        ? PositionType.IN
                        : PositionType.OUT;
                    const [lFacePos2, rFacePos2] = edgeSameDir ? [tmpLFPos2, tmpRFPos2] : [tmpRFPos2, tmpLFPos2];
                    pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);
                    pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
                } else if (isAngleEqual(e1FacesAngleRange.max, e2FacesAngleRange.min, eps)) {
                    //
                    const facePos = this._tangentFaceHalfFaceTryPosition(
                        leftFace1,
                        tmpRightFace2,
                        pt,
                        tmpRFProjDir2,
                        lFaceProjDir1,
                        eps,
                    );
                    const [lFacePos1, tmpRFPos2] = [facePos.position1, facePos.position2];
                    const rFacePos1 = e2FacesAngleRange.containsPt(0, eps) ? PositionType.IN : PositionType.OUT;
                    const tmpLFPos2 = e1FacesAngleRange.containsPt(tmpLFAngle2, eps)
                        ? PositionType.IN
                        : PositionType.OUT;
                    const [lFacePos2, rFacePos2] = edgeSameDir ? [tmpLFPos2, tmpRFPos2] : [tmpRFPos2, tmpLFPos2];
                    pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);
                    pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
                } else if (isAngleEqual(e1FacesAngleRange.min, e2FacesAngleRange.max, eps)) {
                    //
                    const facePos = this._tangentFaceHalfFaceTryPosition(
                        rightFace1,
                        tmpLeftFace2,
                        pt,
                        tmpLFProjDir2,
                        rFaceProjDir1,
                        eps,
                    );
                    const [rFacePos1, tmpLFPos2] = [facePos.position1, facePos.position2];
                    const lFacePos1 = e2FacesAngleRange.containsPt(lFaceAngle1, eps)
                        ? PositionType.IN
                        : PositionType.OUT;
                    const tmpRFPos2 = e1FacesAngleRange.containsPt(tmpRFAngle2, eps)
                        ? PositionType.IN
                        : PositionType.OUT;
                    const [lFacePos2, rFacePos2] = edgeSameDir ? [tmpLFPos2, tmpRFPos2] : [tmpRFPos2, tmpLFPos2];
                    pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);
                    pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
                } else if (isAngleEqual(e1FacesAngleRange.max, e2FacesAngleRange.max, eps)) {
                    //
                    const facePos = this._tangentFaceHalfFaceTryPosition(
                        leftFace1,
                        tmpLeftFace2,
                        pt,
                        tmpLFProjDir2,
                        lFaceProjDir1,
                        eps,
                    );
                    const [lFacePos1, tmpLFPos2] = [facePos.position1, facePos.position2];
                    const rFacePos1 = e2FacesAngleRange.containsPt(0, eps) ? PositionType.IN : PositionType.OUT;
                    const tmpRFPos2 = e1FacesAngleRange.containsPt(tmpRFAngle2, eps)
                        ? PositionType.IN
                        : PositionType.OUT;
                    const [lFacePos2, rFacePos2] = edgeSameDir ? [tmpLFPos2, tmpRFPos2] : [tmpRFPos2, tmpLFPos2];
                    pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);
                    pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
                } else {
                    throw new Error();
                }
            } else {
                const lFacePos2 = e1FacesAngleRange.containsPt(lFaceAngle2, eps)
                    ? PositionType.IN
                    : PositionType.OUT;
                const rFacePos2 = e1FacesAngleRange.containsPt(rFaceAngle2, eps)
                    ? PositionType.IN
                    : PositionType.OUT;
                pos2 = this._judgeFaceAndEdgeFacesPostion(pos2, lFacePos2, rFacePos2);

                const lFacePos1 = e2FacesAngleRange.containsPt(lFaceAngle1, eps)
                    ? PositionType.IN
                    : PositionType.OUT;
                const rFacePos1 = e2FacesAngleRange.containsPt(0, eps) ? PositionType.IN : PositionType.OUT;
                pos1 = this._judgeFaceAndEdgeFacesPostion(pos1, lFacePos1, rFacePos1);
            }

            if (pos1 === PositionType.UNKWON && pos2 === PositionType.UNKWON) {
                break;
            }
        }

        return { position1: pos1!, position2: pos2! };
    }

    /**
     * 返回0，不是相切，互不包含；返回1，face1包含face2(face2在face1里面)；返回-1，face2包含face1(face1在face2里面)
     * @param face1
     * @param face2
     * @param xCurve
     */
    public static FaceHalfFace(
        face1: Face,
        face2: Face,
        xCurve: Curve3,
        isLeft: boolean,
        eps = Tol.LENGTH,
    ): number {
        const leftSign = isLeft ? 1 : -1;
        const range = xCurve.getRange();
        const rangeStep = range.getLength() / 6;

        let isContains: number | undefined;
        const surf1 = face1.getSurface();
        const surf2 = face2.getSurface();
        for (let i = 0; i < 6; i++) {
            const param = range.min + i * rangeStep; // 采样点判断相切
            const pt = xCurve.getPtAt(param);
            const tangent = xCurve.getTangentAt(param);

            // const uv1 = surf1.getUVAt(pt);
            // const norm1 = face1.getNormAt(uv1);
            const uv2 = surf2.getUVAt(pt);
            const norm2 = face2.getNormAt(uv2);
            // if (!norm1.isParallel(norm2)) {
            //     return 0; // 不是相切
            // }

            const cross = norm2.cross(tangent); // face2左侧的点（指向face2内部的方向）
            const leftPt = pt.added(cross.multiplied(leftSign * 1e-2));
            const leftUV1 = surf1.getUVAt(leftPt);
            const leftUV2 = surf2.getUVAt(leftPt);
            const leftFacePt1 = surf1.getPtAt(leftUV1);
            const leftFacePt2 = surf2.getPtAt(leftUV2);
            const leftVect = leftFacePt2.subtracted(leftFacePt1).normalize();
            const leftNorm = face1.getNormAt(leftUV1);
            const leftDot = leftNorm.dot(leftVect);

            // face2上的点在face1外面
            if (leftDot > eps) {
                const tmpContans = -1;
                if (isContains === undefined) {
                    isContains = tmpContans;
                } else if (isContains !== tmpContans) {
                    return 0;
                }
            } else if (leftDot < -eps) {
                const tmpContans = 1;
                if (isContains === undefined) {
                    isContains = tmpContans;
                } else if (isContains !== tmpContans) {
                    return 0;
                }
            }
        }

        if (isContains === undefined) {
            return 0;
        }
        return isContains;
    }

    private static _tangentFaceHalfFaceTryPosition(
        face: Face,
        halfFace: Face,
        pt: Vec3,
        halfFaceProjDir: Vec3,
        faceProjDir: Vec3,
        eps = Tol.LENGTH,
    ): { position1: PositionType; position2: PositionType } {
        const eps2 = eps * eps;
        let tryMoveDist = 1e-2;
        const faceSurf = face.getSurface();
        const halfSurf = halfFace.getSurface();
        if (faceSurf.isCylinder() && faceSurf.isEqualAB() && faceSurf.getRadius() > 10) {
            tryMoveDist *= faceSurf.getRadius() / 10; // 半径越大，越接近于平面，vect就越小，所以要增大移动距离。其实此处应该跟曲面的一阶微分大小有关，但是计算一阶偏导效率较低，不使用
        } else if (halfSurf.isCylinder() && halfSurf.isEqualAB() && halfSurf.getRadius() > 10) {
            tryMoveDist *= halfSurf.getRadius() / 10;
        }

        const tryPt = pt.added(halfFaceProjDir.multiplied(tryMoveDist)); // face2某一侧的点（指向face2内部的方向）
        const halfFaceUV = halfFace.getSurface().getUVAt(tryPt);
        const halfFacePt = halfFace.getSurface().getPtAt(halfFaceUV);
        const faceUV = face.getSurface().getUVAt(tryPt);
        const facePt = face.getSurface().getPtAt(faceUV);

        const vect = halfFacePt.subtracted(facePt);
        if (vect.getSqLength() < eps2) {
            return { position1: PositionType.IN, position2: PositionType.IN };
        }

        const vect2 = vect.normalize();
        const faceNorm = face.getNormAt(faceUV);
        const dot2 = faceNorm.dot(vect2);
        let pos2: PositionType;
        if (dot2 > eps) {
            pos2 = PositionType.OUT;
        } else if (dot2 < -eps) {
            pos2 = PositionType.IN;
        } else {
            const halfFaceNorm = halfFace.getNormAt(halfFaceUV);
            if (faceNorm.isParallel(halfFaceNorm)) {
                pos2 = PositionType.IN; // 重合
            } else {
                throw new Error('');
            }
        }

        const vect1 = vect2.reversed();
        const halfFaceNorm = halfFace.getNormAt(halfFaceUV);
        const dot1 = halfFaceNorm.dot(vect1);
        let pos1: PositionType;
        if (dot1 > eps) {
            pos1 = PositionType.OUT;
        } else if (dot1 < -eps) {
            pos1 = PositionType.IN;
        } else {
            // dot为0，两个face垂直情况，判断出错。取face的点偏移，判断
            const tryPt2 = pt.added(faceProjDir.multiplied(1e-2));
            const halfFaceUV2 = halfFace.getSurface().getUVAt(tryPt2);
            const halfFacePt2 = halfFace.getSurface().getPtAt(halfFaceUV2);
            const faceUV2 = face.getSurface().getUVAt(tryPt2);
            const facePt2 = face.getSurface().getPtAt(faceUV2);

            const vect21 = facePt2.subtracted(halfFacePt2).normalize();
            const halfFaceNorm2 = halfFace.getNormAt(halfFaceUV2);
            const dot21 = halfFaceNorm2.dot(vect21);
            if (dot21 > eps) {
                pos1 = PositionType.OUT;
            } else if (dot21 < -eps) {
                pos1 = PositionType.IN;
            } else {
                const faceNorm2 = halfFace.getNormAt(faceUV2);
                if (halfFaceNorm2.isParallel(faceNorm2)) {
                    pos1 = PositionType.IN; // 重合
                } else {
                    throw new Error('');
                }
            }
        }

        return { position1: pos1, position2: pos2 };
    }

    // // overlap face关系处理
    // private static _overlapFacesPostion() {

    // }

    private static _judgeFaceAndEdgeFacesPostion(
        oldPos: PositionType | undefined,
        lFacePos: PositionType,
        rFacePos: PositionType,
    ): PositionType {
        let newPos = oldPos;
        if (lFacePos === PositionType.IN && rFacePos === PositionType.IN) {
            const tmpPos: PositionType = PositionType.IN;
            if (newPos === undefined || newPos === tmpPos) {
                newPos = tmpPos;
            } else {
                newPos = PositionType.UNKWON;
            }
        } else if (lFacePos === PositionType.OUT && rFacePos === PositionType.OUT) {
            const tmpPos: PositionType = PositionType.OUT;
            if (newPos === undefined || newPos === tmpPos) {
                newPos = tmpPos;
            } else {
                newPos = PositionType.UNKWON;
            }
        } else if (lFacePos === PositionType.IN && rFacePos === PositionType.OUT) {
            const tmpPos: PositionType = PositionType.INOUT;
            if (newPos === undefined || newPos === tmpPos) {
                newPos = tmpPos;
            } else {
                newPos = PositionType.UNKWON;
            }
        } else if (lFacePos === PositionType.OUT && rFacePos === PositionType.IN) {
            const tmpPos: PositionType = PositionType.OUTIN;
            if (newPos === undefined || newPos === tmpPos) {
                newPos = tmpPos;
            } else {
                newPos = PositionType.UNKWON;
            }
        } else {
            newPos = PositionType.UNKWON;
        }

        return newPos;
    }

    private static _adjustFaceProjectDir(
        curveStPt: Vec3,
        curveEndPt: Vec3,
        theFace: Face,
        faceProjDir: Vec3,
    ): Vec3 | undefined {
        if (theFace.getSurface().isPlane()) {
            return undefined;
        }

        let tryDirVect: Vec3 | undefined;
        for (const ce of theFace.getWires()[0].getCoedge3ds()) {
            const curve = ce.getCurve();
            const tmpStTangent = curve.getStartTangent();
            const tmpEndTangent = curve.getEndTangent();
            const tmpCvRange = curve.getRange();
            if (curve.getStartPt().equals(curveStPt) && tmpStTangent.isParallel(faceProjDir)) {
                const tryPt = curve.getPtAt(tmpCvRange.min + tmpCvRange.getLength() / 8);
                tryDirVect = tryPt.subtracted(curveStPt);
                break;
            }
            if (curve.getEndPt().equals(curveStPt) && tmpEndTangent.isParallel(faceProjDir)) {
                const tryPt = curve.getPtAt(tmpCvRange.max - tmpCvRange.getLength() / 8);
                tryDirVect = tryPt.subtracted(curveStPt);
                break;
            }
            if (curve.getStartPt().equals(curveEndPt) && tmpStTangent.isParallel(faceProjDir)) {
                const tryPt = curve.getPtAt(tmpCvRange.min + tmpCvRange.getLength() / 8);
                tryDirVect = tryPt.subtracted(curveEndPt);
                break;
            }
            if (curve.getEndPt().equals(curveEndPt) && tmpEndTangent.isParallel(faceProjDir)) {
                const tryPt = curve.getPtAt(tmpCvRange.max - tmpCvRange.getLength() / 8);
                tryDirVect = tryPt.subtracted(curveEndPt);
                break;
            }
        }

        return tryDirVect;
    }

    // if (
    //     Math.abs(lFaceAngle1 - CONST.PI2) < Tol.ANGLE ||
    //     Math.abs(tmpRFAngle2 - tmpLFAngle2) < Tol.ANGLE
    // ) {
    //     // 如果出现0长range才做调整

    //     // 如果是2pi的角度，要区分到底是0还是2pi，做一个角度微调整
    //      else if (!rightFace1.getSurface().isPlane()) {
    //         let tryDirVect: Vec3 | undefined;
    //         for (const ce of rightFace1.getWires()[0].getCoedge3ds()) {
    //             const curve = ce.getCurve();
    //             const tmpStTangent = curve.getStartTangent();
    //             const tmpEndTangent = curve.getEndTangent();
    //             const tmpCvRange = curve.getRange();
    //             if (curve.getStartPt().equals(stPt) && tmpStTangent.isParallel(rFaceProjDir1)) {
    //                 const tryPt = curve.getPtAt(tmpCvRange.min + tmpCvRange.getLength() / 8);
    //                 tryDirVect = tryPt.subtracted(stPt);
    //                 break;
    //             }
    //             if (curve.getEndPt().equals(stPt) && tmpEndTangent.isParallel(rFaceProjDir1)) {
    //                 const tryPt = curve.getPtAt(tmpCvRange.max - tmpCvRange.getLength() / 8);
    //                 tryDirVect = tryPt.subtracted(stPt);
    //                 break;
    //             }
    //             if (curve.getStartPt().equals(endPt) && tmpStTangent.isParallel(rFaceProjDir1)) {
    //                 const tryPt = curve.getPtAt(tmpCvRange.min + tmpCvRange.getLength() / 8);
    //                 tryDirVect = tryPt.subtracted(endPt);
    //                 break;
    //             }
    //             if (curve.getEndPt().equals(endPt) && tmpEndTangent.isParallel(rFaceProjDir1)) {
    //                 const tryPt = curve.getPtAt(tmpCvRange.max - tmpCvRange.getLength() / 8);
    //                 tryDirVect = tryPt.subtracted(endPt);
    //                 break;
    //             }
    //         }

    //         if (tryDirVect) {
    //             const refAngle1 = tryDirVect.angleTo(lFaceProjDir1, dirZ);
    //             lFaceAngle1 = refAngle1 > CONST.PI ? CONST.PI2 : 0;
    //         }
    //     }
    // }
    // if (Math.abs(tmpRFAngle2 - tmpLFAngle2) < Tol.ANGLE) {
    //     const stPt = edgeCurve.getStartPt();
    //     const endPt = edgeCurve.getEndPt();
    //     if (!tmpLeftFace2.getSurface().isPlane()) {
    //         let tryDirVect: Vec3 | undefined;
    //         for (const ce of tmpLeftFace2.getWires()[0].getCoedge3ds()) {
    //             const curve = ce.getCurve();
    //             const tmpStTangent = curve.getStartTangent();
    //             const tmpEndTangent = curve.getEndTangent();
    //             const tmpCvRange = curve.getRange();
    //             if (curve.getStartPt().equals(stPt) && tmpStTangent.isParallel(rFaceProjDir1)) {
    //                 const tryPt = curve.getPtAt(tmpCvRange.min + tmpCvRange.getLength() / 8);
    //                 tryDirVect = tryPt.subtracted(stPt);
    //                 break;
    //             }
    //             if (curve.getEndPt().equals(stPt) && tmpEndTangent.isParallel(rFaceProjDir1)) {
    //                 const tryPt = curve.getPtAt(tmpCvRange.max - tmpCvRange.getLength() / 8);
    //                 tryDirVect = tryPt.subtracted(stPt);
    //                 break;
    //             }
    //             if (curve.getStartPt().equals(endPt) && tmpStTangent.isParallel(rFaceProjDir1)) {
    //                 const tryPt = curve.getPtAt(tmpCvRange.min + tmpCvRange.getLength() / 8);
    //                 tryDirVect = tryPt.subtracted(endPt);
    //                 break;
    //             }
    //             if (curve.getEndPt().equals(endPt) && tmpEndTangent.isParallel(rFaceProjDir1)) {
    //                 const tryPt = curve.getPtAt(tmpCvRange.max - tmpCvRange.getLength() / 8);
    //                 tryDirVect = tryPt.subtracted(endPt);
    //                 break;
    //             }
    //         }

    //         if (tryDirVect) {
    //             const refAngle1 = rFaceProjDir1.angleTo(tryDirVect, dirZ);
    //             lFaceAngle1 = refAngle1 > CONST.PI ? CONST.PI2 : 0;
    //         }
    //     } else if (!tmpRightFace2.getSurface().isPlane()) {
    //         let tryDirVect: Vec3 | undefined;
    //         for (const ce of tmpRightFace2.getWires()[0].getCoedge3ds()) {
    //             const curve = ce.getCurve();
    //             const tmpStTangent = curve.getStartTangent();
    //             const tmpEndTangent = curve.getEndTangent();
    //             const tmpCvRange = curve.getRange();
    //             if (curve.getStartPt().equals(stPt) && tmpStTangent.isParallel(rFaceProjDir1)) {
    //                 const tryPt = curve.getPtAt(tmpCvRange.min + tmpCvRange.getLength() / 8);
    //                 tryDirVect = tryPt.subtracted(stPt);
    //                 break;
    //             }
    //             if (curve.getEndPt().equals(stPt) && tmpEndTangent.isParallel(rFaceProjDir1)) {
    //                 const tryPt = curve.getPtAt(tmpCvRange.max - tmpCvRange.getLength() / 8);
    //                 tryDirVect = tryPt.subtracted(stPt);
    //                 break;
    //             }
    //             if (curve.getStartPt().equals(endPt) && tmpStTangent.isParallel(rFaceProjDir1)) {
    //                 const tryPt = curve.getPtAt(tmpCvRange.min + tmpCvRange.getLength() / 8);
    //                 tryDirVect = tryPt.subtracted(endPt);
    //                 break;
    //             }
    //             if (curve.getEndPt().equals(endPt) && tmpEndTangent.isParallel(rFaceProjDir1)) {
    //                 const tryPt = curve.getPtAt(tmpCvRange.max - tmpCvRange.getLength() / 8);
    //                 tryDirVect = tryPt.subtracted(endPt);
    //                 break;
    //             }
    //         }

    //         if (tryDirVect) {
    //             const refAngle1 = rFaceProjDir1.angleTo(tryDirVect, dirZ);
    //             lFaceAngle1 = refAngle1 > CONST.PI ? CONST.PI2 : 0;
    //         }
    //     }
    // }

    // private static _adjustFaceDirs(
    //     edgeCurve: Curve3,
    //     edgeSameDir: boolean,
    //     edge1Faces: Face[],
    //     edge2Faces: Face[],
    //     overlapFacePair: IFacePair[],
    // ) {
    //     const curveStPt = edgeCurve.getStartPt();
    //     const curveEndPt = edgeCurve.getEndPt();

    //     if (lFaceProjDir1.equals(rFaceProjDir1)) {
    //         // 如果出现0长range需要做调整
    //         // 首先考虑调整重合的face，这样只需调整一次.重合，并且是在同一边，而不是在edge的两侧分开重合的那种
    //         if (
    //             !leftFace1.getSurface().isPlane() &&
    //             lFaceProjDir1.equals(tmpLFProjDir2) &&
    //             isOverlap(leftFace1, tmpLeftFace2)
    //         ) {
    //             const newDir = adjustFaceDir(leftFace1);
    //             if (newDir) {
    //                 lFaceProjDir1 = newDir;
    //                 tmpLFProjDir2 = newDir;
    //             }
    //         } else if (
    //             !leftFace1.getSurface().isPlane() &&
    //             lFaceProjDir1.equals(tmpRFProjDir2) &&
    //             isOverlap(leftFace1, tmpRightFace2)
    //         ) {
    //             const newDir = adjustFaceDir(leftFace1);
    //             if (newDir) {
    //                 lFaceProjDir1 = newDir;
    //                 tmpRFProjDir2 = newDir;
    //             }
    //         } else if (
    //             !rightFace1.getSurface().isPlane() &&
    //             rFaceProjDir1.equals(tmpLFProjDir2) &&
    //             isOverlap(rightFace1, tmpLeftFace2)
    //         ) {
    //             const newDir = adjustFaceDir(rightFace1);
    //             if (newDir) {
    //                 rFaceProjDir1 = newDir;
    //                 tmpLFProjDir2 = newDir;
    //             }
    //         } else if (
    //             !rightFace1.getSurface().isPlane() &&
    //             rFaceProjDir1.equals(tmpRFProjDir2) &&
    //             isOverlap(rightFace1, tmpRightFace2)
    //         ) {
    //             const newDir = adjustFaceDir(rightFace1);
    //             if (newDir) {
    //                 rFaceProjDir1 = newDir;
    //                 tmpRFProjDir2 = newDir;
    //             }
    //         }
    //     }
    // }

    private static _classifyOverlapFacePair(
        lFaceInfo1: IFaceInfo,
        rFaceInfo1: IFaceInfo,
        lFaceInfo2: IFaceInfo,
        rFaceInfo2: IFaceInfo,
        overlapFacePair: IFacePair[],
    ): IFacePair[] {
        const isOverlap = (face1Info: IFaceInfo, face2Info: IFaceInfo) => {
            for (const pair of overlapFacePair) {
                if (pair.face1 === face1Info.face && pair.face2 === face2Info.face) {
                    if (face1Info.faceProjDir.dot(face2Info.faceProjDir) > 0) {
                        return pair;
                    }

                    return undefined; // surface重合，但是face在edge的两侧
                }
            }

            return undefined;
        };

        const overlapPairs: IFacePair[] = [];
        const op1 = isOverlap(lFaceInfo1, lFaceInfo2);
        if (op1) {
            overlapPairs.push(op1);
        }
        const op2 = isOverlap(lFaceInfo1, rFaceInfo2);
        if (op2) {
            overlapPairs.push(op2);
        }
        const op3 = isOverlap(rFaceInfo1, lFaceInfo2);
        if (op3) {
            overlapPairs.push(op3);
        }
        const op4 = isOverlap(rFaceInfo1, rFaceInfo2);
        if (op4) {
            overlapPairs.push(op4);
        }

        return overlapPairs;
    }

    private static _calcTryPtsNumber(connectFaces: Face[], edgeCurve: Curve3): number {
        if (!edgeCurve.isLine3d()) {
            return 4;
        }

        let tryPtsNum = 1;
        for (const fc of connectFaces) {
            const surf = fc.getSurface();
            if (surf.isPlane() || surf.isCylinder()) {
                tryPtsNum = 1;
            } else {
                return 4;
            }
        }

        return tryPtsNum;
    }
}