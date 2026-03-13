import {
    Coord3,
    Polygon,
    Vec3,
    Curve3,
    Curve2,
} from '../..';
import { BrepBody } from '../brep/brep_body';
import { ExtrudeBody } from './body_builder/extrude_body';
import { SweepBody } from './body_builder/sweep_body';
import type { Face } from '../brep/face';
import { IExtrudeTopo } from './alg_types';
import { BasicBodyBuilder } from './body_builder/basic_body_builder';



/**
 * 造体：拉伸、扫掠
 */
export class BodyBuilder {
    /**
     * 构造立方体
     * @param coord 左下角所在的坐标系
     * @param a x轴向长度
     * @param b y轴向长度
     * @param c z轴向长度
     */
    public static createCubic(coord: Coord3, a: number, b: number = a, c: number = a): BrepBody {
        return BasicBodyBuilder.makeCubic(coord, a, b, c);
    }

    /**
     *  !!!!注意，外面使用时，尽量避免将很多个polygon一起扔进去拉伸，会影响效率，尽量不同的polyfor循环分开拉升body
     * 拉伸造体
     * @param coordinate 局部坐标系
     * @param polygon 在坐标轴下的polyogn
     * @param dir 拉伸方向
     * @param startOffset 起始偏移
     * @param endOffset 终止偏移
     * @param bCalPolygonEx 是否依据环的包含关系，将polygon分成多个区域，默认为true
     * 如果输入明确只有一个区域，可以设置成false，提高性能
     */
    public static extrude(
        coordinate: Coord3,
        polygon: Polygon,
        dir: Vec3,
        startOffset: number,
        endOffset: number,
        bCalPolygonEx = true,
        extrudeTopo?: IExtrudeTopo[],
    ): BrepBody {
        return ExtrudeBody.execute(
            coordinate,
            polygon,
            dir,
            startOffset,
            endOffset,
            bCalPolygonEx,
            false,
            extrudeTopo,
        )!;
    }

    /**
     * @deprecated
     *  构造扫掠体
     * @param profileLines  扫掠的截面线，可以封闭，也可以不封闭
     * @param path3d    扫描路径，可以封闭，也可以不封闭
     */
    public static sweep(
        // 扫描轮廓所在的局部坐标系
        coordinate: Coord3,
        // 扫描轮廓
        polygon2d: Polygon,
        // 扫描路径
        path3d: Curve3[],
        // 自动调整扫描轮廓，垂直于路径
        adjustProfile: boolean = true,
        // 自动调整扫描路径，寻找起始路径（距离近，且角度大）
        adjustPath: boolean = false,
        // 拓扑追踪,0表示底面，1表示顶面，Curve2d为扫描轮廓
        topoTrack?: Map<Curve2 | 0 | 1, Face[]>,
    ): BrepBody {
        // if (path3d.length === 1 && path3d[0] instanceof Ln3) {
        //     const isSameDir = coordinate.getDz().dot(path3d[0].getEndTangent()) > 0;
        //     const extrudeDir = path3d[0].getEndTangent();
        //     if (!isSameDir) {
        //         extrudeDir.reverse();
        //     }

        //     const body = ExtrudeBody.execute(coordinate, polygon2d, extrudeDir, 0, path3d[0].getLength());
        //     if (topoTrack) {
        //         const faces = [...body.getFaces()];
        //         topoTrack.set(0, [faces.shift()!]);
        //         topoTrack.set(1, [faces.shift()!]);
        //         polygon2d.getAllCurves().forEach(cv => topoTrack.set(cv, [faces.shift()!]));
        //     }
        //     return body;
        // }
        return new SweepBody(coordinate.clone(), polygon2d, path3d, adjustProfile, adjustPath, topoTrack).execute();
    }
}