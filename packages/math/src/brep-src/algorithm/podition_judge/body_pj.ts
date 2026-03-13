import { Box3, CONST, Coord3, Tol, Vec3 } from '../../..';
import { BrepBody, Face } from '../..';
import { BodyBuilder } from '../body_builder';
import { PtBodyPosition, PtBodyPositionType } from './pt_body_pj';



export enum BrepBodyPositionType {
    INTERSECT = 'INTERSECT',
    OUTSIDE = 'OUTSIDE',
    INSIDE = 'INSIDE',
    CONTAIN = 'CONTAIN',
    EQUAL = 'EQUAL',
    INSIDE_AND_TANGENCY = 'INSIDE_AND_TANGENCY',
    OUTSIDE_AND_TANGENCY = 'OUTSIDE_AND_TANGENCY',
    CONTAIN_AND_TANGENCY = 'CONTAIN_AND_TANGENCY',
}

export class BrepBodyPJ {
    /**
     * 处理brepbody间的位置关系
     * body1和body2的关系可能为相交，相离，被包含，包含
     */
    public static PJ(
        body1: BrepBody,
        body2: BrepBody,
        eps: number = Tol.DEFAULT.lengthEps,
        useBoundBox1: boolean = false,
        useBoundBox2: boolean = false,
    ): BrepBodyPositionType {
        let newBody1 = body1;
        if (useBoundBox1) {
            const box = body1.getBBox();
            const size = box.getSize();
            newBody1 = BodyBuilder.createCubic(new Coord3(box.getCenter()), size.x / 2, size.y / 2, size.z / 2);
        }
        let newBody2 = body2;
        if (useBoundBox2) {
            const box = body2.getBBox();
            const size = box.getSize();
            newBody2 = BodyBuilder.createCubic(new Coord3(box.getCenter()), size.x / 2, size.y / 2, size.z / 2);
        }
        return BrepBodyPJ.PositionJudgeComplex(newBody1, newBody2, eps);
    }

    /**
     * 处理brepbody间的位置关系
     * body1和body2的关系可能为相交，相离，被包含，包含
     */
    public static PositionJudgeSimple(
        body1: BrepBody,
        body2: BrepBody,
        eps: number = Tol.DEFAULT.lengthEps,
        useBoundBox1: boolean = false,
        useBoundBox2: boolean = false,
    ): BrepBodyPositionType {
        const boundingBox1 = body1.getBBox();
        const boundingBox2 = body2.getBBox();
        if (!boundingBox1.intersectsBox(boundingBox2, eps)) {
            return BrepBodyPositionType.OUTSIDE;
        }
        if (useBoundBox1 && useBoundBox2) {
            if (boundingBox1.containsBox(boundingBox2, eps)) {
                return BrepBodyPositionType.CONTAIN;
            }
            if (boundingBox2.containsBox(boundingBox1, eps)) {
                return BrepBodyPositionType.INSIDE;
            }
            return BrepBodyPositionType.INTERSECT;
        }
        if (useBoundBox1) {
            const pts = boundingBox1.getCornerPts();
            let inside = false;
            let outside = false;
            for (const pt of pts) {
                const positionType = PtBodyPosition.PJ(pt, body2, eps);
                if (positionType === PtBodyPositionType.INSIDE) {
                    inside = true;
                }
                if (positionType === PtBodyPositionType.OUTSIDE) {
                    outside = true;
                }
                if (inside && outside) {
                    return BrepBodyPositionType.INTERSECT;
                }
            }
            if (inside && !outside) {
                return BrepBodyPositionType.INSIDE;
            }
            if (!inside && outside) {
                return BrepBodyPositionType.CONTAIN;
            }
            return BrepBodyPositionType.INSIDE;
        }
        if (useBoundBox2) {
            const pts = boundingBox2.getCornerPts();
            let inside = false;
            let outside = false;
            for (const pt of pts) {
                const positionType = PtBodyPosition.PJ(pt, body1, eps);
                if (positionType === PtBodyPositionType.INSIDE) {
                    inside = true;
                }
                if (positionType === PtBodyPositionType.OUTSIDE) {
                    outside = true;
                }
                if (inside && outside) {
                    return BrepBodyPositionType.INTERSECT;
                }
            }
            if (inside && !outside) {
                return BrepBodyPositionType.CONTAIN;
            }
            if (!inside && outside) {
                return BrepBodyPositionType.INSIDE;
            }
            return BrepBodyPositionType.CONTAIN;
        }

        return this._generalBodyPositionJudge(body1, body2, eps);
    }

    public static PositionJudgeComplex(
        body1: BrepBody,
        body2: BrepBody,
        eps: number = Tol.DEFAULT.lengthEps,
    ): BrepBodyPositionType {
        // body2 及它的 face 的包围盒
        const body2Box = new Box3();
        const face2BoxMap = new Map<Face, Box3>();
        body2.getFaces().forEach(face2 => {
            const face2Box = face2.getBBox();
            body2Box.union(face2Box);
            face2BoxMap.set(face2, face2Box);
        });

        // 遍历 body1 中的 face，获取它们在 body2 内/外/上的个数
        const body1Box = new Box3();
        const face1BoxMap = new Map<Face, Box3>();
        const facePosTypes = { in: 0, out: 0, on: 0 };

        let face1List = body1.getFaces();
        if (face1List.length > CONST.MAX_ITER_NUM) {
            // 打乱离散的顺序，增加相交判定的效率，并提高“循环超时”时结果的准确性
            face1List = face1List.slice().sort((_a, _b) => (Math.random() > 0.5 ? -1 : 1));
        }

        let iter = 0;
        for (const face1 of face1List) {
            // face1 的包围盒
            const face1Box = face1.getBBox();
            body1Box.union(face1Box);
            face1BoxMap.set(face1, face1Box);

            if (!face1Box.intersectsBox(body2Box)) {
                // face1 在 body2 外
                facePosTypes.out++;
                if (facePosTypes.in > 0) {
                    return BrepBodyPositionType.INTERSECT;
                }
                continue;
            }
            // 进一步判断 face1 是否与 body2 中某些面可能存在相交
            let isIntersected = false;
            for (const face2Box of face2BoxMap) {
                if (face1Box.intersectsBox(face2Box[1])) {
                    isIntersected = true;
                    break;
                }
            }
            // 根据面内的点，判断 face1 与 body2 的位置关系
            // 其中，离散有相交可能性的面
            let point1List = [face1.getEdges()[0].getStartVertex().getPoint()];
            if (isIntersected) {
                point1List = [face1.getCentroidPoint(), ...face1.discrete().vertices.map(xyz => new Vec3(xyz))];
                if (point1List.length > CONST.MAX_ITER_NUM) {
                    point1List.sort((_a, _b) => (Math.random() > 0.5 ? -1 : 1));
                }
            }
            const pointPosTypes = { in: 0, out: 0, on: 0 };

            let needBreak = false;
            for (const point1 of point1List) {
                const pointPositionType = PtBodyPosition.PJ(point1, body2, eps, false, {
                    bodyBox: body2Box,
                    faceBoxMap: face2BoxMap,
                });
                if (pointPositionType === PtBodyPositionType.INSIDE) {
                    pointPosTypes.in++;
                } else if (pointPositionType === PtBodyPositionType.OUTSIDE) {
                    pointPosTypes.out++;
                } else {
                    pointPosTypes.on++;
                }
                if (pointPosTypes.in > 0 && pointPosTypes.out > 0) {
                    return BrepBodyPositionType.INTERSECT;
                }
                if (pointPosTypes.on > 5 && pointPosTypes.in === 0 && pointPosTypes.out === 0) {
                    break; // face1 有多个点在 body2 上，判定重合
                }
                iter++;
                if (iter > CONST.MAX_ITER_NUM) {
                    needBreak = true;
                    break;
                }
            }
            // face1 在 body2 内/外
            if (pointPosTypes.in > 0) {
                facePosTypes.in++;
            } else if (pointPosTypes.out > 0) {
                facePosTypes.out++;
            }
            if (pointPosTypes.on > 0) {
                facePosTypes.on++;
            }
            if (facePosTypes.in > 0 && facePosTypes.out > 0) {
                return BrepBodyPositionType.INTERSECT;
            }
            // 若在 body2 上的 face1 过多，检查是否 box 相等，若是则判断两 body 相等
            if (facePosTypes.on > CONST.NORMAL_ITER_NUM && body1Box.equals(body2Box)) {
                return BrepBodyPositionType.EQUAL;
            }
            if (needBreak) {
                break;
            }
        }
        if (facePosTypes.in === 0 && facePosTypes.out === 0) {
            return BrepBodyPositionType.EQUAL;
        }

        if (facePosTypes.in > 0) {
            if (facePosTypes.on === 0) {
                return BrepBodyPositionType.INSIDE;
            }
            return BrepBodyPositionType.INSIDE_AND_TANGENCY;
        }

        // facePosTypes.out > 0，可能相离或包含
        if (facePosTypes.on === 0) {
            const point = body2.getFaces()[0].getEdges()[0].getStartVertex().getPoint();
            if (PtBodyPosition.PJ(point, body1, eps) === PtBodyPositionType.INSIDE) {
                return BrepBodyPositionType.CONTAIN;
            }
            return BrepBodyPositionType.OUTSIDE;
        }
        let point2List = body2.getVertexs().map(vertex => vertex.getPoint());
        if (point2List.length < facePosTypes.on + facePosTypes.out) {
            point2List = body2.getEdges().flatMap(edge => edge.discrete());
        }
        const isBody2InBody1 = point2List.some(point => {
            const positionType = PtBodyPosition.PJ(point, body1, eps, false, {
                bodyBox: body1Box,
                faceBoxMap: face1BoxMap,
            });
            return positionType === PtBodyPositionType.INSIDE;
        });
        if (isBody2InBody1) {
            return BrepBodyPositionType.CONTAIN_AND_TANGENCY;
        }
        return BrepBodyPositionType.OUTSIDE_AND_TANGENCY;
    }

    // 采用的方式是取body上的采样点，然后取点数较少的body做射线法判定位置
    private static _generalBodyPositionJudge(
        body1: BrepBody,
        body2: BrepBody,
        eps: number = Tol.DEFAULT.lengthEps,
    ): BrepBodyPositionType {
        const vertices1 = body1.getVertexs();
        const vertices2 = body2.getVertexs();

        const rayVertices = vertices1 > vertices2 ? vertices2 : vertices1;
        const rayBody = vertices1 > vertices2 ? body1 : body2;
        let inside = false;
        let outside = false;
        for (const v of rayVertices) {
            const positionType = PtBodyPosition.PJ(v.getPoint(), rayBody, eps);
            if (positionType === PtBodyPositionType.INSIDE) {
                inside = true;
            }
            if (positionType === PtBodyPositionType.OUTSIDE) {
                outside = true;
            }
            if (inside && outside) {
                return BrepBodyPositionType.INTERSECT;
            }
        }

        // 对于射线法没有结果的情况，需要处理曲面的情况
        // for (const face of body1.getFaces()) {
        //     if (face.getSurface().isPlane()) {
        //         continue;
        //     }
        //     for (const face2 of body2.getFaces()) {
        //         if (face2.getSurface().isPlane()) {
        //             continue;
        //         }
        //         if (!face.getBBox().intersectsBox(face2.getBBox())) {
        //             continue;
        //         }
        //         const surface1 = face.getSurface();
        //         const surface2 = face2.getSurface();
        //         const res = alg.X.surfaces(
        //             surface1,
        //             surface2,
        //             surface1.getDomainU(),
        //             surface1.getDomainV(),
        //             surface2.getDomainU(),
        //             surface2.getDomainV(),
        //         );
        //         if (res.length > 0) {
        //             return BrepBodyPositionType.INTERSECT;
        //         }
        //     }
        // }

        const boundingBox1 = body1.getBBox();
        const boundingBox2 = body2.getBBox();
        if (boundingBox1.containsBox(boundingBox2, eps)) {
            return BrepBodyPositionType.CONTAIN;
        }
        if (boundingBox2.containsBox(boundingBox1, eps)) {
            return BrepBodyPositionType.INSIDE;
        }
        if (boundingBox1.intersectsBox(boundingBox2)) {
            return BrepBodyPositionType.INTERSECT;
        }
        return BrepBodyPositionType.OUTSIDE;
    }
}