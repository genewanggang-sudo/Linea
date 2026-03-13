import { Curve3, PolyCurve, Loop, Tol, Ln3, Vec3 } from '../..';
import { FacesX } from './intersect/face_face_intersect';
import { FaceFacesIntersect } from './intersect/face_faces_intersect';
import { Face } from '../brep/face';
import { LineFacesIntersect } from './intersect/line_face_intersect';



/**
 * 几何元素求交，线线求交，线面求交
 */
export class BRepCalcX {
    /**
     * Face与Face相交，结果为交线（交点可认为是退化成的线）
     * @param face1
     * @param face2
     * @returns 交线可能不止一条，故返回交线的数组,若无交线，则返回空数组
     */
    public static faces(face1: Face, face2: Face, tolerance: number = Tol.NUMBER): Curve3[] {
        return FacesX.execute(face1, face2, tolerance);
    }

    /**
     * Face 与 多个Face分别求交，然后将交线封装成Polyline[]
     *
     * 数组内的元素有可能是loop，也有可能是Polyline
     * @param face
     * @param faces
     */
    public static faceFaces(face: Face, faces: Face[], tolerance: number = Tol.NUMBER): (PolyCurve | Loop)[] {
        return FaceFacesIntersect.execute(face, faces, tolerance);
    }

    /**
     * 计算line与Face的有交点
     * @param line
     * @param face
     */
    public static line3dFace(line: Ln3, face: Face, tol = Tol.DEFAULT): Vec3[] {
        return LineFacesIntersect.execute(line, face, tol);
    }

    /**
     * 计算line与Face的有交点
     * @param line
     * @param face
     */
    public static isIntersectLine3dFace(curve: Curve3, face: Face, tol = Tol.DEFAULT): boolean {
        return LineFacesIntersect.hasIntersect(curve, face, tol);
    }
}