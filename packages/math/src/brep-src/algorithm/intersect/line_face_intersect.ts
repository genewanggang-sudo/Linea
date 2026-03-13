
import { Ln3, Tol, Vec3, alg, Vec2, Curve3 } from '../../..';
import { Face } from '../../brep/face';



export class LineFacesIntersect {
    /**
     * 计算line与Face的有交点
     * @param line
     * @param face
     */
    public static execute(line: Ln3, face: Face, tol = Tol.DEFAULT): Vec3[] {
        const poly2d = face.calcPolygon();
        const outLoop = poly2d.getLoops()[0];
        const box2d = outLoop.getBBox();
        const surface = face.getSurface();
        const rangeU = surface.getDomainU().set(box2d.min.x, box2d.max.x);
        const rangeV = surface.getDomainV().set(box2d.min.y, box2d.max.y);
        const xPtInfos = alg.X.curveSurfaceAll(line, surface, tol, [rangeU, rangeV]);

        const xPtsInFace: Vec3[] = [];
        for (const iter of xPtInfos) {
            const position = alg.PJ.ptToPolygon(new Vec2(iter.surfaceUV), poly2d, tol.numberEps);
            if (position !== alg.PtLoopPJType.OUT) {
                xPtsInFace.push(iter.point);
            }
        }
        return xPtsInFace;
    }

    /**
     * 计算line与Face的有交点
     * @param curve
     * @param face
     */
    public static hasIntersect(curve: Curve3, face: Face, tol = Tol.DEFAULT): boolean {
        const poly2d = face.calcPolygon();
        const surface = face.getSurface();
        return alg.X.isIntersectCurveSurface(curve, surface, poly2d, tol);
    }
}

