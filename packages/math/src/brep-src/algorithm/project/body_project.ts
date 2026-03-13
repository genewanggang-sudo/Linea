import { alg, Coord3, Polygon } from '../../..';



import { FaceProject } from './face_project';
import { BrepBody } from '../../brep/brep_body';

/**
 * 将body投影到一个局部坐标系下，得到polygon
 */
export class BodyProject {
    public static execute(brepbody: BrepBody, coordinate: Coord3): Polygon {
        const result: Polygon[] = [];
        for (const face of brepbody.getFaces()) {
            if (face.getNormAt({ x: 0, y: 0 }).isPerpendicular(coordinate.getDz())) {
                continue;
            }
            const p = FaceProject.execute(face, coordinate);
            if (p instanceof Polygon) {
                result.push(p);
            }
        }
        const res = alg.BoolOperate2d.polygonExUnion(result);
        return Polygon.fromPolygonEx(res);
    }
}