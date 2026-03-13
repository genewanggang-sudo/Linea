import { CONST, Coord3, EN_GEO_TYPE, alg, Util, Plane, Polygon } from '../../..';
import { BrepBody } from '../..';
import { IProjectInfo } from '../alg_types';
import { FaceProject } from './face_project';



enum BodyPosition {
    UP, // 在投影方向上
    ON, // 横跨投影面
    DOWN, // 在投影方向反向上，不投影
}

export class SpaceProjectSimple {
    public static spaceProjectSimple(
        coord: Coord3,
        bodies: BrepBody[],
    ): { poly: Polygon; info: IProjectInfo[] } | undefined {
        const projectPlane = new Plane(coord);

        const newBodies: { body: BrepBody; dis: number }[] = [];
        for (const body of bodies) {
            const res = this._judgeBodyPosition(projectPlane, body);
            if (res.pos !== BodyPosition.DOWN) {
                newBodies.push({ body, dis: res.dis });
            }
        }
        if (newBodies.length < 1) return undefined;

        newBodies.sort((a, b) => a.dis - b.dis);

        const info: IProjectInfo[] = [];
        let poly: Polygon = new Polygon();
        const planeNorm = projectPlane.getNorm();
        for (let i = 0; i < newBodies.length; ++i) {
            const faces = newBodies[i].body.getFaces();
            for (const face of faces) {
                if (face.getSurface().getType() !== EN_GEO_TYPE.PLANE) continue;
                const plane = face.getSurface() as Plane;
                const norm = plane.getNorm().clone();
                if (!face.getSameDirWithSurface()) norm.reverse();
                if (norm.dot(planeNorm) > 0 || norm.isPerpendicular(planeNorm)) {
                    continue;
                }
                const res = FaceProject.execute(face, coord);
                if (res instanceof Polygon) {
                    if (i === 0) {
                        poly = res;
                        info.push({ distance: newBodies[i].dis, projFace: face });
                        continue;
                    }
                    const posJugde = alg.PJ.loopToLoop(poly.getLoops()[0], res.getLoops()[0]);
                    if (
                        posJugde === alg.LoopsPJType.CONTAIN ||
                        posJugde === alg.LoopsPJType.EQUAL
                    ) {
                        continue;
                    }
                    poly = alg.BoolOperateClipper.boolOperate([res], 0, [poly]);
                    info.push({ distance: newBodies[i].dis, projFace: face });
                }
            }
        }

        return { poly, info };
    }

    private static _judgeBodyPosition(plane: Plane, body: BrepBody): { pos: BodyPosition; dis: number } {
        const box = body.getBBox();
        const points = box.getCornerPts();
        points.push(box.getCenter());
        let below = 0;
        let upper = 0;
        let minDis = CONST.MAX_INTEGER;
        for (const pt of points) {
            const ptOnPlane = plane.getProjectedPtBy(pt);
            const norm = ptOnPlane.subtract(pt);
            const dis = pt.distanceTo(ptOnPlane);
            if (minDis > dis) minDis = dis;
            if (Util.isNearlyBiggerOrEqual(norm.dot(plane.getNorm()), 0)) {
                below++;
            } else {
                upper++;
            }
        }
        if (below > 0 && upper === 0) {
            return { pos: BodyPosition.DOWN, dis: minDis };
        }
        if (upper > 0 && below === 0) {
            return { pos: BodyPosition.UP, dis: minDis };
        }
        return { pos: BodyPosition.ON, dis: 0 };
    }
}