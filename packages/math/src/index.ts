export { Vec2 } from './core/vec2'
export { Mat3 } from './core/mat3'
export { Box2 } from './core/box2'
export { Coord2D } from './core/coord2d'
export { GeomBase } from './core/geom_base'

export { MathConst } from './constants/math_const'

export { Curve2 } from './curves/curve2'
export { Interval } from './curves/interval'
export { PeriodInterval } from './curves/period_interval'
export { CircleCurve2 } from './curves/circle_curve2'
export { EllipseCurve2 } from './curves/ellipse_curve2'
export { Line2 } from './curves/line2'
export { Circle2 } from './curves/circle2'
export { Arc2 } from './curves/arc2'
export { Ellipse2 } from './curves/ellipse2'
export { EllipseArc2 } from './curves/ellipse_arc2'
export { BSpline2 } from './curves/bspline2'
export type { IBSpline2Options } from './curves/bspline2'

export { Precision } from './utils/precision'
export { MathUtils } from './utils/math_utils'
export { MathError } from './utils/math_error'

export { DiscretizeEngine } from './discretize/discretize_engine'
export { DiscretizeOptions } from './discretize/discretize_options'

export { GeomMgr, geomMgr, RegisterGeom } from './serialize/geom_mgr'
export type { IDumpable, ILoadable } from './serialize/geom_mgr'
export type {
    IDB,
    IDBVec2,
    IDBMat3,
    IDBBox2,
    IDBCoord2D,
    IDBLine2,
    IDBCircle2,
    IDBArc2,
    IDBEllipse2,
    IDBEllipseArc2,
    IDBBSpline2,
} from './serialize/dump_types'

export type { IVec2, IClosestPointResult } from './types/type_define'
