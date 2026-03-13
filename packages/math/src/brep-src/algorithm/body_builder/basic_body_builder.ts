import { Coord3, Loop, Vec2, Polygon } from '../../..';
import { BrepBody } from '../../brep/brep_body';
import { ExtrudeBody } from './extrude_body';



/**
 * 简单体构造
 */
export class BasicBodyBuilder {
    /**
     * 构造立方体
     * @param coord 左下角所在的坐标系
     * @param a x轴向长度
     * @param b y轴向长度
     * @param c z轴向长度
     */
    public static makeCubic(coord: Coord3, a: number, b: number = a, c: number = a): BrepBody {
        const rect = Loop.createByRectangle(Vec2.rO(), { x: a, y: b });
        return ExtrudeBody.execute(coord, new Polygon([rect]), coord.getDz(), 0, c);
    }
}