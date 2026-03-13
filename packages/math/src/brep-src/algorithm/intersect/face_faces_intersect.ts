import {
    Ln3, Curve3, Plane,
    alg, Ln2, PolyCurve, Loop, Tol, MathAssert
} from '../../..';



import { Face } from '../../brep/face';

import { BRepCalcX } from '../brep_calc_x';
/**
 * Face 与 多个Face分别求交，然后将交线封装成Polyline[]
 */
class FaceFacesIntersect {
    /**
     * Face 与 多个Face分别求交，然后将交线封装成Polyline[]
     * @param face1
     * @param faces
     * @returns 返回Loop的数组
     */
    public static execute(face: Face, faces: Face[], tolerance: number = Tol.NUMBER): (PolyCurve | Loop)[] {
        MathAssert.assert(face.getSurface().isPlane(), 'just suport plane type');
        const plane = face.getSurface() as Plane;
        const curve2ds: Ln2[] = [];
        for (const f of faces) {
            const intcurves = BRepCalcX.faces(face, f, tolerance);
            if (intcurves.length < 1) {
                continue;
            }
            intcurves.forEach(cur3d => {
                MathAssert.assert((cur3d as Curve3).isLine3d(), 'just suport line3d type');
                const cv2 = plane.getLine2D(cur3d as Ln3);
                if (cv2) {
                    curve2ds.push(cv2);
                }
            });
        }

        // 搜环
        const loops = alg.SearchGraph.simpleLoop(curve2ds);

        return loops;
    }
}

export { FaceFacesIntersect };