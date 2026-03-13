import { Loop } from '../topology/loop';
import { Ln2 } from '../geometry/ln2';
import { Polygon } from '../topology/polygon';
import { alg } from '..';



export class TopologyEdit {
    /**
     * 只支持一个外环多个内环，不支持多个外环
     * @param polygon 要分割的polygon
     */
    public static splitPolygonRegion(polygon: Polygon) {
        if (polygon.getLoops().length === 0) {
            return new Loop();
        }

        let resLoop: Loop = polygon.getLoops()[0].clone();
        for (let i = 1; i < polygon.getLoops().length; i++) {
            resLoop = this._splitLoopLoopRegion(resLoop, polygon.getLoops()[i].clone());
        }

        return resLoop;
    }

    private static _splitLoopLoopRegion(loop1: Loop, loop2: Loop): Loop {
        if (loop1.getAllCurves().length === 0 || loop2.getAllCurves().length === 0) {
            return loop2.getAllCurves().length > 0 ? loop2 : loop1;
        }

        const minDistInfo: { minDist: number; index1: number; index2: number } = {
            minDist: loop1.getAllCurves()[0].getStartPt().sqDistanceTo(loop2.getAllCurves()[0].getStartPt()),
            index1: 0,
            index2: 0,
        };
        for (let i = 0; i < loop1.getAllCurves().length; i++) {
            const cv1 = loop1.getAllCurves()[i];
            for (let j = 0; j < loop2.getAllCurves().length; j++) {
                const cv2 = loop2.getAllCurves()[j];
                const tmpDist = cv1.getStartPt().sqDistanceTo(cv2.getStartPt());
                if (tmpDist < minDistInfo.minDist) {
                    minDistInfo.minDist = tmpDist;
                    minDistInfo.index1 = i;
                    minDistInfo.index2 = j;
                }
            }
        }

        const connectLine = new Ln2(
            loop1.getAllCurves()[minDistInfo.index1].getStartPt(),
            loop2.getAllCurves()[minDistInfo.index2].getStartPt(),
        );

        // 如果连接线和loop有交，就需要分割
        let curve1Index: number | undefined;
        let xPts1: alg.ICurvesXInfo2d[];
        for (let i = 0; i < loop1.getAllCurves().length; i++) {
            const cv1 = loop1.getAllCurves()[i];
            if (cv1.isLine2d()) {
                continue;
            }

            const xPts = alg.X.curve2ds(connectLine, cv1);
            const notEndXPts = xPts.filter(
                _x => !_x.point.equals(cv1.getStartPt()) && !_x.point.equals(cv1.getEndPt()),
            );
            if (notEndXPts.length > 0) {
                xPts1 = notEndXPts;
                curve1Index = i;
                break;
            }
        }

        let curve2Index: number | undefined;
        let xPts2: alg.ICurvesXInfo2d[];
        for (let j = 0; j < loop2.getAllCurves().length; j++) {
            const cv2 = loop2.getAllCurves()[j];
            if (cv2.isLine2d()) {
                continue;
            }

            const xPts = alg.X.curve2ds(connectLine, cv2);
            const notEndXPts = xPts.filter(
                _x => !_x.point.equals(cv2.getStartPt()) && !_x.point.equals(cv2.getEndPt()),
            );
            if (notEndXPts.length > 0) {
                xPts2 = notEndXPts;
                curve2Index = j;
                break;
            }
        }

        // if (curve1Index && curve2Index) {
        //     // 如果两个loop的curve相互杂糅，需要找到connectLine参数最近的两个交点
        // } else
        if (curve1Index !== undefined) {
            xPts1!.sort((a, b) => b.param1 - a.param1); // 从大到小排列，取最大的
            connectLine.getRange().min = xPts1![0].param1; // 修改connectLine
            const xCurve1 = loop1.getAllCurves()[curve1Index];
            const addCurve = xCurve1.clone();
            addCurve.getRange().min = xPts1![0].param2;
            xCurve1.getRange().max = xPts1![0].param2;
            loop1.insertCurve(curve1Index + 1, addCurve); // 分割有交的curve并加入

            minDistInfo.index1 = curve1Index + 1;
        } else if (curve2Index !== undefined) {
            xPts2!.sort((a, b) => a.param1 - b.param1); // 从小到大排列，取最小的
            connectLine.getRange().max = xPts2![0].param1; // 修改connectLine
            const xCurve2 = loop2.getAllCurves()[curve2Index];
            const addCurve = xCurve2.clone();
            addCurve.getRange().min = xPts2![0].param2;
            xCurve2.getRange().max = xPts2![0].param2;
            loop2.insertCurve(curve2Index + 1, addCurve); // 分割有交的curve并加入

            minDistInfo.index2 = curve2Index + 1;
        }

        // 接通两个loop
        loop1.insertCurve(minDistInfo.index1, connectLine);
        const loop2NextCurves = loop2.getAllCurves().slice(minDistInfo.index2);
        const loop2PrevCurves = loop2.getAllCurves().slice(0, minDistInfo.index2);
        loop1.insertCurve(minDistInfo.index1 + 1, ...loop2NextCurves);
        loop1.insertCurve(minDistInfo.index1 + 1 + loop2NextCurves.length, ...loop2PrevCurves);
        const revConnectLine = connectLine.clone();
        revConnectLine.reverse();
        loop1.insertCurve(minDistInfo.index1 + 1 + loop2.getAllCurves().length, revConnectLine);
        return loop1;
    }

    // // 欧拉操作，加入一条edge，删除一个loop
    // private static _mekl() {

    // }
}