import { Loop } from '../../../topology/loop';
import { Polygon } from '../../../topology/polygon';
import { Curve2 } from '../../../geometry/curve2';
import { faces2DDifference } from './difference';
import { faces2DUnion } from './union';
import { intersectFaces, IFace2D } from './utils';
import { Tol } from '../../../base/tol';
import { faces2DIntersect } from './intersect';
import { faces2DSplit } from './split';



export enum Bool2dType {
    union = 0,
    intersect = 1,
    difference = 2,
    xor = 3,
    split = 4,
}

export { Bool2dType as BoolType };

/**
 *
 * 二维布尔运算，暂时支持直线、圆弧的交、并、差、分割
 */
class Bool2d {
    public static boolOperate(
        loopOrPolygons1: (Loop | Polygon)[],
        loopOrPolygons2: (Loop | Polygon)[],
        type: Bool2dType,
        distanceTol: number = Tol.LENGTH,
        angleTol: number = Tol.ANGLE,
    ): Polygon[] {
        // 1. 转换成Face2d结构
        const newFaces1 = loopOrPolygons1.map(it => this._toFace2d(it));
        const newFaces2 = loopOrPolygons2.map(it => this._toFace2d(it));

        // 2. 相互求交分割
        intersectFaces(newFaces1, newFaces2, distanceTol, angleTol);

        // 3. 布尔运算
        const res = this.boolOperateCore(newFaces1, newFaces2, type, distanceTol, angleTol);
        return res.map(face2d => {
            const loops = face2d.loops.map(curves => new Loop(curves));
            const tmpPoly = new Polygon();
            loops.forEach(l => tmpPoly.addLoop(l, false));
            return tmpPoly;
        });
    }

    public static boolOperateCore(
        faces1: IFace2D[],
        faces2: IFace2D[],
        type: Bool2dType,
        distanceTol: number = Tol.LENGTH,
        angleTol: number = Tol.ANGLE,
        newCurveMap?: Map<Curve2, Curve2>,
        noOverlap1?: boolean,
        noOverlap2?: boolean,
    ): IFace2D[] {
        if (type === Bool2dType.difference) {
            let resultFaces1 = faces1;
            if (!noOverlap1) {
                resultFaces1 = faces2DUnion(faces1, [], distanceTol, angleTol, newCurveMap);
            }
            let resultFaces2 = faces2;
            if (!noOverlap2) {
                resultFaces2 = faces2DUnion([], faces2, distanceTol, angleTol, newCurveMap);
            }
            return faces2DDifference(resultFaces1, resultFaces2, distanceTol, angleTol, newCurveMap);
        }
        if (type === Bool2dType.union) {
            return faces2DUnion(faces1, faces2, distanceTol, angleTol, newCurveMap);
        }
        if (type === Bool2dType.intersect) {
            let resultFaces1 = faces1;
            if (!noOverlap1) {
                resultFaces1 = faces2DUnion(faces1, [], distanceTol, angleTol, newCurveMap);
            }
            let resultFaces2 = faces2;
            if (!noOverlap2) {
                resultFaces2 = faces2DUnion([], faces2, distanceTol, angleTol, newCurveMap);
            }
            return faces2DIntersect(resultFaces1, resultFaces2, distanceTol, angleTol, newCurveMap);
        }
        if (type === Bool2dType.split) {
            return faces2DSplit(faces1, faces2, distanceTol, angleTol, newCurveMap);
        }
        throw new Error('二维布尔运算类型：暂未支持');
    }

    private static _toFace2d(loopOrPolygons1: Loop | Polygon): IFace2D {
        if (loopOrPolygons1 instanceof Loop) {
            return {
                loops: [loopOrPolygons1.getAllCurves().map(it => it.clone())],
            };
        }
        return {
            loops: loopOrPolygons1.getLoops().map(loop => loop.getAllCurves().map(it => it.clone())),
        };
    }
}

export { Bool2d };