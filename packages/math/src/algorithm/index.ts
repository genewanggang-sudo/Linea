// 综合
export { D } from './calc_d';
export type {
    IPtCvDistanceInfo,
    IPtCvDistanceInfo2,
    IPtCvDistanceInfo3,
} from './distance/pt_to_curve_distance_info';
export { X } from './calc_x';
export { CurvesColinear } from './overlap/curves_colinear';
export { CurvesMerge } from './overlap/curves_merge';
export { GeometryMerge } from './geometry_merge';
export { Project } from './calc_project';
export { Offset } from './calc_offset';
export { CalcOverlap, Overlap } from './calc_overlap';
export type { ICurvesOverlapInfo } from './overlap/i_overlap';
export type {
    ICurvesXInfo,
    ICurvesXInfo2d,
    ICurvesXInfo3d,
    ICvSurfXInfo,
    ISurfacesXInfo,
} from './intersect/x_info';



// 二维操作
export { BoolOperate2d } from './bool_operate_2d';
export { Bool2d, Bool2dType, Bool2dType as BoolType } from './bool_operate/bool2d/bool2d';
export type { IFace2D } from './bool_operate/bool2d/utils';
export { PolygonOffset, type IPolygonOffsetResult } from './offset/polygon_offset';
export { SearchGraph } from './search_graph';
export { BoolOperateClipper } from './bool_operate/bool_operate_clipper';
export { TopologyEdit } from './topology_edit';

// 二维属性
export { LoopArea } from './loop_property/loop-area';
export { LoopCentroid } from './loop_property/loop-centroid';

// 位置关系类型
export { PJ, type IPtLoopResult } from './position_judge';
export { PtPolygonPositionJudger } from './pj/pt_polygon_position_judger';
export { CurvesPJType, PtLoopPJType, LoopsPJType } from './pj/pj_type';
export { ILoopsToPolygonExes } from './search_graph/iloops_polygonex';

// 网格
export { ClipMesh, type IMeshClipResult } from './mesh/clip_mesh';
export { MeshUtil } from './mesh/mesh_util';
export { ExtrudeClip, Extruder } from './mesh/extrude_clip';

// 其他
export { DiscreteUtil } from './discrete/discrete_util';
export type { IDirectedCurve, IDirectedCurve2d, IDirectedCurve3d } from './discrete/discrete_surface';
export { DiscreteTopology } from './discrete/discrete_topology';
export { boxCutLine, boxToTrimmedSurfaces } from './intersect/box_cut_line';

// 铺贴算法
export { PatternUtil, IPavePattern, IPolygon, RegionMesh } from './pattern/pattern_util';