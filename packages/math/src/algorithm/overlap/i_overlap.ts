import { Interval } from '../../base/interval';



export interface ICurvesOverlapInfo {
    /** 重合段在第一条曲线上的参数 */
    range1: Interval;
    /** 重合段在第二条曲线上的参数 */
    range2: Interval;
    /** 重合段同向时为 true */
    isSameDirection: boolean;
}

// export interface ISurfaceSurfaceOverlapInfo {
//     /** 重合部分在第一个曲面上的 u 向参数范围 */
//     rangeU1: Interval;
//     /** 重合部分在第一个曲面上的 v 向参数范围 */
//     rangeV1: Interval;

//     /** 重合部分在第二个曲面上的 u 向参数范围 */
//     rangeU2: Interval;
//     /** 重合部分在第二个曲面上的 v 向参数范围 */
//     rangeV2: Interval;

//     /** 重合部分法向同向时为 true */
//     isSameDirection: boolean;
// }