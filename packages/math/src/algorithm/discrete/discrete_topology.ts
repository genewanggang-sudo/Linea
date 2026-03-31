import { SearchGraph } from '..';
import { PolyCurve, Vec2, EN_GEO_TYPE } from '../..';
import { DiscreteParam } from '../../base/discrete_param';
import { Polygon } from '../../topology/polygon';
import { IMesh2d } from './discrete_refiner';
import { DiscreteUtil } from './discrete_util';

export class DiscreteTopology {
    /**
     * 网格化PolygonEx，得到三角面片
     * @param polygon
     * @param params 离散精度
     * @param startIdx
     */
    public static tessPolygonEx(polygon: Polygon, params = DiscreteParam.NORMAL, _startIdx = 0): IMesh2d {
        if (polygon.getAllCurves().length < 1) {
            //
            console.error('input error');
            return {
                vertices: [],
                faces: [],
            };
        }

        const vecs = polygon.getLoops().map(loop => DiscreteTopology.discretePolyline(loop, params));
        return DiscreteUtil.tessVector2(vecs);
    }

    /**
     * 网格化polygon，得到三角面片
     * @param _polygon
     * @param params 离散精度
     * @param bCalPolygonEx
     */
    public static tessPolygon(_polygon: Polygon, params = DiscreteParam.NORMAL, bCalPolygonEx = true): IMesh2d {
        const result: IMesh2d = {
            vertices: [],
            faces: [],
        };
        if (_polygon.getLoops().length < 1) {
            return result;
        }

        let polygon;
        if (_polygon.isOnlyLines()) {
            polygon = _polygon;
        } else {
            polygon = new Polygon(DiscreteTopology.discretePolygon(_polygon, params));
        }

        let pexes: Polygon[] = [polygon];
        if (bCalPolygonEx) {
            pexes = SearchGraph.loopsToPolygonExes(polygon.getLoops());
        }
        if (polygon.getLoops().length > 0 && pexes.length < 1) {
            if (_polygon.getLoops().length === 1) {
                pexes = [polygon];
            } else {
                //
                console.log('离散出错');
            }
        }

        let start = 0;
        for (const pex of pexes) {
            start = result.vertices.length;
            const tri = DiscreteTopology.tessPolygonEx(pex, params, start);

            result.vertices.push(...tri.vertices);
            result.faces.push(...tri.faces);
        }

        return result;
    }

    /**
     * 离散polycurve，得到离散的点集
     * @param curve2ds
     * @param params 离散精度
     */
    public static discretePolyline(curve2ds: PolyCurve, params = DiscreteParam.NORMAL): Vec2[] {
        const ces = curve2ds.getAllCurves();
        const pts: Array<Vec2> = [];
        for (let i = 0; i < ces.length; i++) {
            const cv = ces[i];
            const discretedCurve = cv.discrete(params);
            if (i !== ces.length - 1 || curve2ds.getType() === EN_GEO_TYPE.LOOP) {
                discretedCurve.pop();
            }
            pts.push(...discretedCurve);
        }
        return pts;
    }

    /**
     * 离散polygon的边界，得到离散的点集
     * @param polygon
     * @param params 离散精度
     */
    public static discretePolygon(polygon: Polygon, params = DiscreteParam.NORMAL): Vec2[][] {
        const result: Vec2[][] = [];
        polygon.getLoops().forEach(l => {
            const pts = DiscreteTopology.discretePolyline(l, params);
            result.push(pts);
        });
        return result;
    }
}
