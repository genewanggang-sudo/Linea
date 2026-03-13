import * as alg from './algorithm';
import * as MatrixUtil from './base/matrix_util';
import * as ClipperLib from './clipperlib/clipperlib';



import * as brep from './brep-src';

export { brep };

export const VERSION = '"@sk-3d/math":"0.1.1"';

export type { types } from './type_define/i_types';
export { EN_GEO_TYPE } from './type_define/i_element_type';

export type { IGeo } from './type_define/i_element';
export { GeoElement } from './base/geo_element';
export type { IGeometry, IGeometry2d, IGeometry3d } from './type_define/i_geometry';

// 基础类型
export { Interval } from './base/interval';
export { PeriodInterval } from './base/period_inverval';

export { Box } from './base/box';
export { Box2 } from './base/box2';
export { Box3 } from './base/box3';

export { Vec } from './base/vec';
export { Vec2 } from './base/vec2';
export { Vec3 } from './base/vec3';

export { Matrix } from './base/matrix';
export { Matrix3 } from './base/matrix3';
export { Matrix4 } from './base/matrix4';
export { Quaternion } from './base/quaternion';

export { Coord } from './base/coord';
export { Coord2 } from './base/coord2';
export { Coord3 } from './base/coord3';
export { Euler } from './base/euler';

export { Tol } from './base/tol';
export { DiscreteParam } from './base/discrete_param';

// 几何类型
export { Curve } from './geometry/curve';
export { Curve2 } from './geometry/curve2';
export { Curve3 } from './geometry/curve3d';

export { Ln2 } from './geometry/ln2';
export { Ln3 } from './geometry/ln3';

export { Arc2, ArcType } from './geometry/arc2d';
export { Arc3 } from './geometry/arc3d';
export { Circle3d } from './geometry/circle3d';

export { Surface } from './geometry/surface';
export { Plane } from './geometry/plane';
export { Cylinder } from './geometry/cylinder';

export { NurbsCurve2 } from './geometry/nurbs_curve2';
export { NurbsCurve3 } from './geometry/nurbs_curve3';
export { SmoothPoly2 } from './geometry/smooth_poly2';
export { SmoothPoly3 } from './geometry/smooth_poly3';
export { OffsetCurve2 } from './geometry/offset_curve2';
export { OffsetCurve3 } from './geometry/offset_curve3';
export { IntersectCurve3 } from './geometry/intersect_curve3'; // 仅用于计算过程

// 拓扑
export { PolyCurve } from './topology/polycurve';
export { Loop } from './topology/loop';
export { Polygon } from './topology/polygon';
export { TrimmedSurface } from './topology/trimmed_surface';
export { EvolutionMap } from './topology/evolution_map';

// 数学运算
export { InvBilinear } from './math/inv_bilinear';
export { gaussIntegration } from './math/gauss_integration';
export { SolveEquationUtil } from './solve_equations/solve_equation_util';

// IO
export { type ISVGData, SVGParser } from './io/svgparser';
export { ObjParser } from './io/obj_parser';

// 其他
export { CONST } from './type_define/const';
export { Loader } from './loader/loader';
export { registerGeo } from './loader/register_geo';
export { Util as Util } from './util/util';
export { GeomUtil } from './util/geom_util';
export { CurveUtil } from './util/curve_util';
export { UvUtil } from './util/uv_util';
export { SurfaceUtil } from './util/surface_util';
export { ClipperUtil } from './util/clipper_util';
export { Clipper2Util } from './util/clipper2_util';
export { MathAssert } from './util/assert';
export { UnitType, UnitsConversion, NormalUnitsConversion } from './conversion/units_conversion';

// Log
export { Log } from './util/log';
export { MathError, MathErrorType, type MathErrorParamType } from './util/math_error';

export { alg };
export { MatrixUtil };

export { ClipperLib };

export * from './wasm/grapher2d';
export * from './wasm/grapherutil';
export { loadWasmInstanceAsync, getGeomInstance } from './wasm/loader';
export { GeomLibWrapper, Geom } from './wasm/wrapper';