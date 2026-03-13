export enum EN_GEO_TYPE {
    // 矩阵
    MATRIX_3 = 'm3',
    MATRIX_4 = 'm4',



    // 局部坐标系
    COORD_2 = 'd2',
    COORD_3 = 'd3',

    // 点/向量
    VEC_2 = 'v2',
    VEC_3 = 'v3',

    // 直线
    LN_2 = 'l2',
    LN_3 = 'l3',

    // 圆弧
    ARC_2 = 'a2',
    ARC_3 = 'a3',

    // 整圆
    CIRCLE_3 = 'c3',

    INTERSECT_3D = 'x3',

    // nurbs曲线
    NURBS_CURVE_3D = 'n3',
    NURBS_CURVE_2D = 'n2',

    // SmoothPoly
    SMOOTHPOLY_2D = 's2',
    SMOOTHPOLY_3D = 's3',

    // offset 曲线
    OFFSET_CURVE_2D = 'f2',
    OFFSET_CURVE_3D = 'f3',

    EXTEND_CURVE_2D = 'e2',

    // 边集
    POLY_CURVE = 'pc',
    // 环
    LOOP = 'lp',
    // 多边形
    POLYGON = 'pg',

    // 平面
    PLANE = 'pl',
    // 圆柱面
    CYLINDER = 'cd',
    // 裁剪曲面
    TRIM = 'ts',

    // 临时做法，brep类型
    // 顶点
    BREP_VERTEX = 'bv',
    // 半边
    BREP_COEDGE = 'bc',
    // edge
    BREP_EDGE = 'be',
    // wire
    BREP_WIRE = 'bw',
    // face
    BREP_FACE = 'bf',
    // shell
    BREP_SHELL = 'bs',
    // body
    BREP_BODY = 'bb',
}