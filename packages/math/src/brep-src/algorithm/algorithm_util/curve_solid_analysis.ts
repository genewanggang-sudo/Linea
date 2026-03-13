import { Curve3, Tol, Vec3, alg, types, Coord3, CONST, Vec2 } from '../../..';
import { Face } from '../../brep/face';
import { Edge } from '../../brep/edge';
import { getLeftAndRightCoedge } from './body_base_util';



// 返回数字，1代表外；-1代表内；0为未知问题，可能是重合。
export class CurveSolidAnalysis {
    /**
     * curve与face相交，判断curve交点前后两段与face的内外关系
     * @param curve curve3d
     * @param xPointInfo curve与face的交点
     * @param face 面
     * @param prevRefParam 如果相切，用于判断前面一段在face内外
     * @param nextRefParam 如果相切，用于判断后面一段在face内外
     */
    public static curveFace(
        curve: Curve3,
        face: Face,
        xPointInfo: Vec3 | alg.ICvSurfXInfo,
    ): { prev: number; next: number } {
        let param: number;
        let uv: types.IXY;
        if (xPointInfo instanceof Vec3) {
            param = curve.getParamAt(xPointInfo);
            uv = face.getSurface().getUVAt(xPointInfo);
        } else {
            param = xPointInfo.curveT;
            uv = xPointInfo.surfaceUV;
        }

        const tangent = curve.getTangentAt(param);
        const faceNorm = face.getNormAt(uv);

        // 如果交点在奇异点的位置，切向不连续
        let isSingularPt = false;
        const singularities = curve.getSingularities();
        for (const t of singularities) {
            if (Math.abs(t - param) < Tol.NUMBER) {
                isSingularPt = true;
            }
        }

        let prevOutFace: number; // out: 1, in: -1, 长度为0或者在face上: 0
        let nextOutFace: number; // out: 1, in: -1, 长度为0或者在face上: 0
        const dot = tangent.dot(faceNorm);
        if (Math.abs(dot) <= Tol.ANGLE || isSingularPt) {
            // 相切
            const xPtInfo: alg.ICvSurfXInfo = {
                point: curve.getPtAt(param),
                curveT: param,
                surfaceUV: uv,
            };
            prevOutFace = this._curveFaceTangent(curve, face, xPtInfo, false);
            nextOutFace = this._curveFaceTangent(curve, face, xPtInfo, true);
            return { prev: prevOutFace, next: nextOutFace };
        }

        if (dot > 0) {
            return { prev: -1, next: 1 };
        }

        return { prev: 1, next: -1 };
    }

    public static curveEdge(
        curve: Curve3,
        edge: Edge,
        xPt: Vec3,
        edgeFaces?: Face[],
    ): { prev: number; next: number } {
        let leftFace: Face;
        let rightFace: Face;
        if (edgeFaces) {
            [leftFace, rightFace] = edgeFaces;
        } else {
            const [leftCoedge, rightCoedge] = edgeFaces || getLeftAndRightCoedge(edge);
            leftFace = leftCoedge.getFace()!;
            rightFace = rightCoedge.getFace()!;
        }

        const lSurf = leftFace.getSurface();
        const rSurf = rightFace.getSurface();
        const uv1 = lSurf.getUVAt(xPt);
        const uv2 = rSurf.getUVAt(xPt);
        const face1Norm = leftFace.getNormAt(uv1);
        const face2Norm = rightFace.getNormAt(uv2);
        const edgeCurve = edge.getCurve();
        const param = edgeCurve.getParamAt(xPt);
        const dirZ = edgeCurve.getTangentAt(param);

        // 从dirZ看过去，leftFace的投影和rightFace的投影构成逆时针的首尾想接edge。即leftDir的终点为rightDir的起点。curve的投影要spilt面积，如何判断？
        // 判断方法：将leftDir反向一下，判断curve的两后两段是否在rightDir到leftDir之间.如果在rightDir到leftDir之间，内；在rightDir到leftDir之外，外
        const face1ProjDir = face1Norm.cross(dirZ); // 将face1的投影到z轴为dirZ平面上
        const face2ProjDir = dirZ.cross(face2Norm); // 将face2投影到平面上，并作为x轴，计算角度的起始vect
        const dirY = dirZ.cross(face2ProjDir);
        const coord = new Coord3(xPt, face2ProjDir, dirY);
        const endAngle = face2ProjDir.angleTo(face1ProjDir, dirZ);

        const curveT = curve.getParamAt(xPt);
        let isSingularPt = false;
        const singularities = curve.getSingularities();
        for (const t of singularities) {
            if (Math.abs(t - curveT) < Tol.NUMBER) {
                isSingularPt = true;
                throw new Error();
            }
        }

        let prevSegAngle: number;
        let nextSegAngle: number;
        let prevSegTangent: Vec3;
        let nextSegTangent: Vec3;
        if (isSingularPt) {
            nextSegTangent = curve.getTangentAt(curveT);
            const localNextTangent = coord.getLocalVectorAt(nextSegTangent);
            if (localNextTangent.getSqLength() < Tol.ANGLE * Tol.ANGLE) {
                // edge的curve的切向和dirZ平行，即两个edge相切相交
                throw new Error();
            }

            const projNextDir = new Vec3(localNextTangent.x, localNextTangent.y, 0);
            nextSegAngle = Vec3.X().angleTo(projNextDir, Vec3.Z());

            prevSegTangent = curve.getTangentAt(curveT, true);
            const localPrevTangent = coord.getLocalVectorAt(prevSegTangent);
            if (localPrevTangent.getSqLength() < Tol.ANGLE * Tol.ANGLE) {
                // edge的curve的切向和dirZ平行，即两个edge相切相交
                throw new Error();
            }
            const projPrevDir = new Vec3(localPrevTangent.x, localPrevTangent.y, 0);
            prevSegAngle = Vec3.X().angleTo(projPrevDir, Vec3.Z());
        } else {
            const curveTangent = curve.getTangentAt(curveT);
            prevSegTangent = curveTangent;
            nextSegTangent = curveTangent;
            const localTangent = coord.getLocalVectorAt(curveTangent);
            if (localTangent.getSqLength() < Tol.ANGLE * Tol.ANGLE) {
                // edge的curve的切向和dirZ平行，即两个edge相切相交
                throw new Error();
            }
            const projDir = new Vec3(localTangent.x, localTangent.y, 0);
            nextSegAngle = Vec3.X().angleTo(projDir, Vec3.Z());
            prevSegAngle = nextSegAngle + CONST.PI;
            prevSegAngle = prevSegAngle > CONST.PI2 ? prevSegAngle - CONST.PI2 : prevSegAngle;
        }

        let nextOut: number;
        if (dirZ.isParallel(nextSegTangent)) {
            // 极有可能curve和某个face重合
            const index = this._edgeFacesContainsCurve([leftFace, rightFace], curve);
            if (index > -1) {
                // 如果重合，由于edge和face重合的情况一定会在前面处理，不会走到这里来，所以这个地方curve和surface重合，只能是在face外的surface上重合
                // 也不可能和两个face都重合，就成了edgeedge重合。因此与不重合的face判断关系
                const tangentFace = index === 1 ? leftFace : rightFace;
                const tangentUV = index === 1 ? uv1 : uv2;
                const xPtInfoT: alg.ICvSurfXInfo = { point: xPt, curveT, surfaceUV: tangentUV };
                const tangentFacePos = this._curveFaceTangent(curve, tangentFace, xPtInfoT, true);
                if (tangentFacePos === -1) {
                    nextOut = -1; // 在两个face内才算内
                } else if (tangentFacePos === 0) {
                    nextOut = -1; // 如果是重合，也算在face内
                } else {
                    nextOut = 1;
                }
            } else {
                // 都不重合
                const xPtInfoT1: alg.ICvSurfXInfo = { point: xPt, curveT, surfaceUV: uv1 };
                const tangentFacePos1 = this._curveFaceTangent(curve, leftFace, xPtInfoT1, true);
                if (tangentFacePos1 === 1) {
                    nextOut = 1; // 如果在其中一个face外面，则在体外
                } else {
                    const xPtInfoT2: alg.ICvSurfXInfo = { point: xPt, curveT, surfaceUV: uv2 };
                    const tangentFacePos2 = this._curveFaceTangent(curve, rightFace, xPtInfoT2, true);
                    if (tangentFacePos2 === -1) {
                        nextOut = -1; // 在两个face内才算内
                    } else if (tangentFacePos2 === 0) {
                        nextOut = -1; // 如果是重合，也算在face内
                    } else {
                        nextOut = 1;
                    }
                }
            }
        } else if (
            nextSegAngle < Tol.ANGLE ||
            Math.abs(nextSegAngle - CONST.PI2) < Tol.ANGLE ||
            Math.abs(nextSegAngle - endAngle) < Tol.ANGLE
        ) {
            // 如果这一段curve的切向和face的投影（偏微分）方向平行，curve可能和face相切或者重合
            // 如果是相切，取一个小的偏移，再分别判断与两个face的内外。只有再两个face内才是内，否则就是外
            let tangentFace: Face;
            let anotherFace: Face;
            let tangentUV: Vec2;
            let anotherUV: Vec2;
            if (nextSegAngle < Tol.ANGLE || Math.abs(nextSegAngle - CONST.PI2) < Tol.ANGLE) {
                tangentFace = rightFace;
                anotherFace = leftFace;
                tangentUV = uv2;
                anotherUV = uv1;
            } else {
                tangentFace = leftFace;
                anotherFace = rightFace;
                tangentUV = uv1;
                anotherUV = uv2;
            }

            // 如果edge的两个face也都相切，需要判断与两个face的内外关系；否则，只需要判断在相切face的内外
            if (Math.abs(endAngle) < Tol.ANGLE) {
                const xPtInfo: alg.ICvSurfXInfo = { point: xPt, curveT, surfaceUV: anotherUV };
                const tangentFacePos1 = this._curveFaceTangent(curve, anotherFace, xPtInfo, true);
                if (tangentFacePos1 === 1) {
                    nextOut = 1; // 如果在其中一个face外面，则在体外
                } else {
                    const xPtInfoT: alg.ICvSurfXInfo = { point: xPt, curveT, surfaceUV: tangentUV };
                    const tangentFacePos2 = this._curveFaceTangent(curve, tangentFace, xPtInfoT, true);
                    if (tangentFacePos2 === -1) {
                        nextOut = -1; // 如果在相切的face内，就是在内
                    } else if (tangentFacePos2 === 0) {
                        nextOut = -1; // 如果是重合，也算在face内
                    } else {
                        nextOut = 1; // 如果在相切的face外，就是在外
                    }
                }
            } else {
                const xPtInfoT: alg.ICvSurfXInfo = { point: xPt, curveT, surfaceUV: tangentUV };
                const tangentFacePos = this._curveFaceTangent(curve, tangentFace, xPtInfoT, true);
                if (tangentFacePos === -1) {
                    nextOut = -1; // 如果在相切的face内，就是在内
                } else if (tangentFacePos === 0) {
                    nextOut = -1; // 如果是重合，也算在face内
                } else {
                    nextOut = 1; // 如果在相切的face外，就是在外
                }
            }
        } else if (nextSegAngle < endAngle - Tol.ANGLE) {
            nextOut = -1;
        } else if (nextSegAngle > endAngle + Tol.ANGLE) {
            nextOut = 1;
        } else {
            throw new Error();
        }

        let prevOut: number;
        if (dirZ.isParallel(prevSegTangent)) {
            // 极有可能curve和某个face重合
            const index = this._edgeFacesContainsCurve([leftFace, rightFace], curve);
            if (index > -1) {
                // 如果重合，由于edge和face重合的情况一定会在前面处理，不会走到这里来，所以这个地方curve和surface重合，只能是在face外的surface上重合
                // 也不可能和两个face都重合，就成了edgeedge重合。因此与不重合的face判断关系
                const tangentFace = index === 1 ? leftFace : rightFace;
                const tangentUV = index === 1 ? uv1 : uv2;
                const xPtInfoT: alg.ICvSurfXInfo = { point: xPt, curveT, surfaceUV: tangentUV };
                const tangentFacePos = this._curveFaceTangent(curve, tangentFace, xPtInfoT, false);
                if (tangentFacePos === -1) {
                    prevOut = -1; // 在两个face内才算内
                } else if (tangentFacePos === 0) {
                    prevOut = -1; // 如果是重合，也算在face内
                } else {
                    prevOut = 1;
                }
            } else {
                // 都不重合
                const xPtInfoT1: alg.ICvSurfXInfo = { point: xPt, curveT, surfaceUV: uv1 };
                const tangentFacePos1 = this._curveFaceTangent(curve, leftFace, xPtInfoT1, false);
                if (tangentFacePos1 === 1) {
                    prevOut = 1; // 如果在其中一个face外面，则在体外
                } else {
                    const xPtInfoT2: alg.ICvSurfXInfo = { point: xPt, curveT, surfaceUV: uv2 };
                    const tangentFacePos2 = this._curveFaceTangent(curve, rightFace, xPtInfoT2, false);
                    if (tangentFacePos2 === -1) {
                        prevOut = -1; // 在两个face内才算内
                    } else if (tangentFacePos2 === 0) {
                        prevOut = -1; // 如果是重合，也算在face内
                    } else {
                        prevOut = 1;
                    }
                }
            }
        } else if (
            prevSegAngle < Tol.ANGLE ||
            Math.abs(prevSegAngle - CONST.PI2) < Tol.ANGLE ||
            Math.abs(prevSegAngle - endAngle) < Tol.ANGLE
        ) {
            // 如果这一段curve的切向和face的投影（偏微分）方向平行，curve可能和face相切或者重合
            // 如果是相切，取一个小的偏移，再分别判断与两个face的内外。只有再两个face内才是内，否则就是外
            let tangentFace: Face;
            let anotherFace: Face;
            let tangentUV: Vec2;
            let anotherUV: Vec2;
            if (prevSegAngle < Tol.ANGLE || Math.abs(prevSegAngle - CONST.PI2) < Tol.ANGLE) {
                tangentFace = rightFace;
                anotherFace = leftFace;
                tangentUV = uv2;
                anotherUV = uv1;
            } else {
                tangentFace = leftFace;
                anotherFace = rightFace;
                tangentUV = uv1;
                anotherUV = uv2;
            }

            // 如果edge的两个face也都相切，需要判断与两个face的内外关系；否则，只需要判断在相切face的内外
            if (Math.abs(endAngle) < Tol.ANGLE) {
                const xPtInfo: alg.ICvSurfXInfo = { point: xPt, curveT, surfaceUV: anotherUV };
                const tangentFacePos = this._curveFaceTangent(curve, anotherFace, xPtInfo, false);
                if (tangentFacePos === 1) {
                    prevOut = 1; // 如果在其中一个face外面，则在体外
                } else {
                    const xPtInfoT: alg.ICvSurfXInfo = { point: xPt, curveT, surfaceUV: tangentUV };
                    const tangentFacePos2 = this._curveFaceTangent(curve, tangentFace, xPtInfoT, false);
                    if (tangentFacePos2 === -1) {
                        prevOut = -1; // 在两个face内才算内
                    } else if (tangentFacePos2 === 0) {
                        prevOut = -1; // 如果是重合，也算在face内
                    } else {
                        prevOut = 1;
                    }
                }
            } else {
                const xPtInfoT: alg.ICvSurfXInfo = { point: xPt, curveT, surfaceUV: tangentUV };
                const tangentFacePos = this._curveFaceTangent(curve, tangentFace, xPtInfoT, false);
                if (tangentFacePos === -1) {
                    prevOut = -1; // 在两个face内才算内
                } else if (tangentFacePos === 0) {
                    prevOut = -1; // 如果是重合，也算在face内
                } else {
                    prevOut = 1;
                }
            }
        } else if (prevSegAngle < endAngle - Tol.ANGLE) {
            prevOut = -1;
        } else if (prevSegAngle > endAngle + Tol.ANGLE) {
            prevOut = 1;
        } else {
            throw new Error();
        }

        return { prev: prevOut, next: nextOut };
    }

    // // 此方法仅限平面使用，曲面不适用。用的是geometry and solid modeling书上的位置关系（分类）判定方法。曲线曲面的方法见bool3d中的函数_curveVertex
    // public static curveVertex(curve: Curve3, curveT: number, theVt: Vertex): { prev: number; next: number } {
    //     const vtFaces = theVt.getFaces();
    //     let isAllPlanes = true;
    //     for (const vf of vtFaces) {
    //         if (!vf.getSurface().isPlane()) {
    //             isAllPlanes = false;
    //             break;
    //         }
    //     }

    //     if (!isAllPlanes) {
    //         throw new Error();
    //     }

    //     const vtEdges = theVt.getEdges();
    //     const prevPt = curve.getPtAt(curveT - 0.01);
    //     const nextPt = curve.getPtAt(curveT + 0.01);
    //     let facePt: Vec3;
    //     const edge0Curve = vtEdges[0].getCurve();
    //     if (vtEdges[0].getStartVertex() === theVt) {
    //         facePt = edge0Curve.getPtAt(edge0Curve.getStartParam() + 0.01);
    //     } else {
    //         facePt = edge0Curve.getPtAt(edge0Curve.getEndParam() - 0.01);
    //     }
    //     const plane = Plane.makeBy3Pts(prevPt, nextPt, facePt);

    //     const intersectLines: Ln3[] = [];
    //     for (const vf of vtFaces) {
    //         const xCurve = planeIntersectFace();
    //         intersectLines.push(xCurve);
    //     }

    // }

    // private static _curveFaceNormal(
    //     curve: Curve3,
    //     face: Face,
    //     xPointInfo: alg.ICvSurfXInfo,
    //     useNextSeg: boolean,
    // ): number {
    //     const param = xPointInfo.curveT;
    //     const uv = xPointInfo.surfaceUV;

    //     const tangent = curve.getTangentAt(param);
    //     const faceNorm = face.getNormAt(uv);

    //     const dot = tangent.dot(faceNorm);
    //     if (Math.abs(dot) <= Tol.ANGLE) {
    //         return 0; // 可能是重合
    //     }

    //     if (useNextSeg) {
    //         return dot > 0 ? 1 : -1;
    //     }
    //     return dot > 0 ? -1 : 1;
    // }

    // 相切的时候判断内外，取一个点判断
    private static _curveFaceTangent(
        curve: Curve3,
        face: Face,
        xPointInfo: alg.ICvSurfXInfo,
        useNextSeg: boolean,
    ): number {
        const curvRange = curve.getRange();
        const tryParam = useNextSeg
            ? xPointInfo.curveT + curvRange.getLength() / 1e3
            : xPointInfo.curveT - curvRange.getLength() / 1e3;

        if (useNextSeg) {
            if (
                (curve.isNurbsCurve3d() && tryParam > curve.getDomain().max) ||
                (curve.isOffsetCurve3d() && curve.getBaseCurve().isNurbsCurve3d() && tryParam > curve.getDomain().max)
            ) {
                return 0; // 已经没有参数？？
            }
        } else {
            if (
                (curve.isNurbsCurve3d() && tryParam < curve.getDomain().min) ||
                (curve.isOffsetCurve3d() && curve.getBaseCurve().isNurbsCurve3d() && tryParam < curve.getDomain().min)
            ) {
                return 0; // 前面已经没有参数？？
            }
        }

        const surface = face.getSurface();
        const tryPt = curve.getPtAt(tryParam);
        const tryPtUV = surface.getUVAt(tryPt);

        const tryPtOnFace = surface.getPtAt(tryPtUV);
        const tryPtFaceNorm = face.getNormAt(tryPtUV);
        const tryVect = tryPt.subtracted(tryPtOnFace).normalize();
        const tryDot = tryVect.dot(tryPtFaceNorm);
        if (tryDot < -Tol.ANGLE) {
            return -1;
        }
        if (tryDot > Tol.ANGLE) {
            return 1;
        }

        return 0;
    }

    /**
     * 简单判断curve是否重合在face中
     * @param faces
     * @param curve
     */
    private static _edgeFacesContainsCurve(faces: Face[], curve: Curve3): number {
        let containCurveSurfIndex = -1;
        const [lSurf, rSurf] = faces.map(_ => _.getSurface());
        if (lSurf.isPlane() && lSurf.containsCurve(curve)) {
            containCurveSurfIndex = 0;
        } else if (rSurf.isPlane() && rSurf.containsCurve(curve)) {
            containCurveSurfIndex = 1;
        } else if ((lSurf.isCylinder()) && lSurf.containsCurve(curve)) {
            containCurveSurfIndex = 0;
        } else if ((rSurf.isCylinder()) && rSurf.containsCurve(curve)) {
            containCurveSurfIndex = 1;
        }
        return containCurveSurfIndex;
    }
}