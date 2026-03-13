import { Surface, Plane, Polygon, Loop, MathAssert } from '../../..';



import { Face } from '../../brep/face';

/**
 * line1向line2投影，返回一个区间，该区间代表投影后的线在line2参数域上的区间
 */
export class FaceProjectToSurface {
    public static execute(face1: Face, face2: Surface): Polygon {
        const plane1 = face1.getSurface();
        const plane2 = face2 as Plane;
        MathAssert.assert(face1.getSurface().isPlane() && plane2.isPlane(), '只支持平面');

        const result = new Polygon();
        face1
            .calcPolygon()
            .getLoops()
            .forEach(l => {
                const pts = l.toPath().map(p => {
                    return plane2.getUVAt(plane1.getPtAt(p));
                });
                result.addLoop(new Loop(pts));
            });
        if (result.calcArea() < 0) {
            result.reverse();
        }

        return result;
    }
}