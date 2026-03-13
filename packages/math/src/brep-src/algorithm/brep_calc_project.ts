import { Polygon, PolyCurve, Coord3 } from '../..';
import { FaceProject } from './project/face_project';
import { BodyProject } from './project/body_project';
import { Face } from '../brep/face';
import { BrepBody } from '../brep/brep_body';
import { SpaceProject } from './project/space_project';
import { IProjectInfo } from './alg_types';
import { SpaceProjectSimple } from './project/space_project_simple';
import { ViewProject } from './project/view_project';



/**
 * 投影算法
 * - face向coordinate投影
 * - body向coordinate投影
 * - bodys向coordinate投影
 */
export class BRepCalcProject {
    /**
     * face沿coordinate z轴向coordinateXOY面投影，投影出的线成环，返回Polygon，否则返回Polyline[]
     * 目前支持柱面和平面投影，但是目前不支持消隐，也即只针对面的边界进行投影，遮挡关系没有考虑
     */
    public static face(face: Face, coordinate: Coord3): PolyCurve[] | Polygon {
        return FaceProject.execute(face, coordinate);
    }

    /**
     * face沿coordinate z轴向coordinateXOY面投影
     * 注：与上面face投影接口对比不一样的是：对于曲线，这个接口投影出来的是离散的直线；如果用上面的face接口，投影出来是曲线。
     * 曲面也可以投影，但是曲面可能投影出多个polygon轮廓。因为曲面有face的边界轮廓还有非边界轮廓。平面face只会投影出一个polygon
     */
    public static faceToDiscretePolygons(face: Face, coordinate: Coord3): Polygon[] {
        return FaceProject.toDiscretePolygons(face, coordinate);
    }

    /**
     * 将body投影到一个局部坐标系下，得到polygon
     * 目前支持柱面和平面投影，但是目前不支持消隐，也即只针对面的边界进行投影，遮挡关系没有考虑
     */
    public static body(body: BrepBody, coordinate: Coord3): Polygon {
        return BodyProject.execute(body, coordinate);
    }

    /**
     * 将输入bodys沿着投影坐标系投影至投影面上，输出从投影面看过去可以看到的面的投影polygon以及对应距离（类似消隐效果）
     * 目前投影面仅支持平面，仅支持平行投影，也即投影坐标系与face方向相同
     * 同时，被投影体仅支持平面图形
     */
    public static bodysProject(
        projectFace: Face,
        projectCoord: Coord3,
        projectedBodies: BrepBody[],
    ): Map<Polygon, IProjectInfo> {
        const spaceProj = new SpaceProject(projectFace, projectCoord, projectedBodies);
        if (!spaceProj.canProject()) {
            return new Map();
        }
        return spaceProj.execute();
    }

    /**
     * 视图投影，实现类似某一视角看上去是视图的感觉
     * 目前投影面仅支持平面，仅支持平行投影，也即投影坐标系与face方向相同
     * 同时，被投影体仅支持平面图形
     */
    public static viewProject(
        projectFace: Face,
        projectCoord: Coord3,
        projectedBodies: BrepBody[],
    ): Map<Polygon, IProjectInfo> {
        const spaceProj = new ViewProject(projectFace, projectCoord, projectedBodies);
        if (!spaceProj.canProject()) {
            return new Map();
        }
        return spaceProj.execute();
    }

    /**
     * 投影只输出一个polygon，对应的投影面的信息以及投影距离，包含遮挡关系
     * @param projectCoord 投影坐标系
     * @param projectedBodies 投影body
     * @returns
     */
    public static bodyProjectSimple(
        projectCoord: Coord3,
        projectedBodies: BrepBody[],
    ): { poly: Polygon; info: IProjectInfo[] } | undefined {
        return SpaceProjectSimple.spaceProjectSimple(projectCoord, projectedBodies);
    }
}