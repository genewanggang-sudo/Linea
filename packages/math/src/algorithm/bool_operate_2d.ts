import { BoolOperateClipper } from './bool_operate/bool_operate_clipper';
import { PolycurvePolygonBool } from './bool_operate/polycurve_polygon_bool';
import { Polygon } from '../topology/polygon';
import { Loop } from '../topology/loop';
import { EN_GEO_TYPE } from '../type_define/i_element_type';
import { PolyCurve } from '../topology/polycurve';
import { Bool2d } from './bool_operate/bool2d/bool2d';
import { Tol } from '../base/tol';



/**
 * 布尔运算
 * -
 */
class BoolOperate2d {
    /**
     * 并
     * 使用Clipper, 支持直线
     * @param loopOrPolygons
     */
    public static union(loopOrPolygons: (Loop | Polygon)[]): Polygon {
        if (!loopOrPolygons.length) {
            return new Polygon();
        }
        return BoolOperateClipper.boolOperate(loopOrPolygons, 0, []);
    }

    /**
     * 交
     * 使用Clipper, 支持直线
     * @param loopOrPolygons
     */
    public static intersect(loopOrPolygons: (Loop | Polygon)[]): Polygon {
        if (!loopOrPolygons.length) {
            return new Polygon();
        }
        let result = loopOrPolygons[0];
        if (result.getType() === EN_GEO_TYPE.LOOP) {
            result = new Polygon(result.clone() as Loop);
        }
        for (let i = 1; i < loopOrPolygons.length; i++) {
            result = BoolOperateClipper.boolOperate([result], 1, [loopOrPolygons[i]]);
        }
        return result as Polygon;
    }

    /**
     * 差 loopOrPolygons1 - loopOrPolygons2
     * 使用Clipper, 支持直线
     * @param loopOrPolygons1
     * @param loopOrPolygons2
     */
    public static difference(loopOrPolygon1: Loop | Polygon, loopOrPolygons2: (Loop | Polygon)[]): Polygon {
        if (loopOrPolygon1.isEmpty()) {
            return new Polygon();
        }
        if (!loopOrPolygons2.length) {
            if (loopOrPolygon1 instanceof Polygon) {
                return loopOrPolygon1.clone();
            }
            return new Polygon(loopOrPolygon1.clone());
        }
        return BoolOperateClipper.boolOperate([loopOrPolygon1], 2, loopOrPolygons2);
    }

    /**
     * 求并集，适用于Loop, PolygonEx
     * 支持直线、圆弧
     * @param loopOrPolygonExs
     * @return 得到PolygonEx数组
     */
    public static polygonExUnion(
        loopOrPolygonExs: (Loop | Polygon)[],
        disTol: number = Tol.LENGTH,
        angleTol: number = Tol.ANGLE,
    ): Polygon[] {
        if (!loopOrPolygonExs.length) {
            return [];
        }
        const index = Math.ceil(loopOrPolygonExs.length / 2);
        return Bool2d.boolOperate(
            loopOrPolygonExs.slice(0, index),
            loopOrPolygonExs.slice(index, loopOrPolygonExs.length),
            0,
            disTol,
            angleTol,
        );
    }

    /**
     * 两组之间求交集，适用于Loop, PolygonEx
     * 支持直线、圆弧
     * @param loopOrPolygonExs1
     * @param loopOrPolygonExs2
     * @return 得到PolygonEx数组
     */
    public static polygonExIntersect(
        loopOrPolygonExs1: (Loop | Polygon)[],
        loopOrPolygonExs2: (Loop | Polygon)[],
        disTol: number = Tol.LENGTH,
        angleTol: number = Tol.ANGLE,
    ): Polygon[] {
        if (!loopOrPolygonExs1.length) {
            return [];
        }
        return Bool2d.boolOperate(loopOrPolygonExs1, loopOrPolygonExs2, 1, disTol, angleTol);
    }

    /**
     * 两组之间求差集，适用于Loop, PolygonEx
     * 支持直线、圆弧
     * @param loopOrPolygonExs1
     * @param loopOrPolygonExs2
     * @return 得到PolygonEx数组
     */
    public static polygonExDifference(
        loopOrPolygonExs1: (Loop | Polygon)[],
        loopOrPolygonExs2: (Loop | Polygon)[],
        disTol: number = Tol.LENGTH,
        angleTol: number = Tol.ANGLE,
    ): Polygon[] {
        if (!loopOrPolygonExs1.length) {
            return [];
        }
        return Bool2d.boolOperate(loopOrPolygonExs1, loopOrPolygonExs2, 2, disTol, angleTol);
    }

    /**
     * 返回polyline在loop/polygon内部的部分
     * @param polyline
     * @param loopOrPolygons
     * @param isTangentKeep 保留边界重叠部分
     * @param tolerance
     */
    public static polylineIntersect(
        polyline: PolyCurve,
        loopOrPolygons: (Polygon | Loop)[],
        isTangentKeep: boolean,
        tolerance: number = Tol.NUMBER,
    ): PolyCurve[] {
        if (!loopOrPolygons.length || polyline.isEmpty()) {
            return [];
        }

        return PolycurvePolygonBool.execute(polyline, loopOrPolygons, true, isTangentKeep, tolerance);
    }

    /**
     * 返回polyline在loop/polygon外部的部分
     * @param polyline
     * @param polygon
     * @param torlerance
     */
    public static polylineDifference(
        polyline: PolyCurve,
        loopOrPolygons: (Polygon | Loop)[],
        isTangentKeep: boolean,
        torlerance: number = Tol.NUMBER,
    ): PolyCurve[] {
        if (polyline.isEmpty()) {
            return [];
        }

        if (!loopOrPolygons.length) {
            return [polyline];
        }
        return PolycurvePolygonBool.execute(polyline, loopOrPolygons, false, isTangentKeep, torlerance);
    }
}

export { BoolOperate2d };