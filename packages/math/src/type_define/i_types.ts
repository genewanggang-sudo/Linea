import { Matrix3 } from '../base/matrix3';
import { Matrix4 } from '../base/matrix4';
import { Vec2 } from '../base/vec2';
import { Vec3 } from '../base/vec3';
import { EN_GEO_TYPE } from './i_element_type';

declare namespace types {
    interface Class<T> {
        new(): T;
    }

    type numberArr2 = [number, number];

    type numberArr3 = [number, number, number];
    type numberArrs3X3 = [numberArr3, numberArr3, numberArr3];

    type numberArr4 = [number, number, number, number];
    type numberArrs4X4 = [numberArr4, numberArr4, numberArr4, numberArr4];

    type IInterval = numberArr2;
    type IPeriodInterval = numberArr3;

    type IXYArr = numberArr2;
    type IXYZArr = numberArr3;

    type IXY = {
        x: number;
        y: number;
    };

    type IXYZ = {
        x: number;
        y: number;
        z: number;
    };

    interface IMatrix<IMatrixArray extends number[][]> {
        data: IMatrixArray;
    }

    interface IMatrix3 extends IMatrix<numberArrs3X3> { }

    interface IMatrix4 extends IMatrix<numberArrs4X4> { }
    interface IMatrix3Svd {
        uTransform: Matrix3;
        scale: Vec2;
        vRotate: Matrix3;
    }

    interface IMatrix4Svd {
        uTransform: Matrix4;
        scale: Vec3;
        vRotate: Matrix4;
    }

    interface IRenderDebug {
        id?: number;
        name: string;
        visible: boolean;
        // 选择本身，高亮的Id，比如选中coedge，是需要高亮Edge的
        selectedId?: number;
        color?: string;
    }

    type IFlatMeshBase = { [key: string]: number[] };

    /** 离散得到的三角面片，高效存储 */
    interface IFlatMesh extends IFlatMeshBase {
        /** 离散后的所有顶点, 每3个一组表示一个顶点 */
        vertices: number[];
        /** 三角片集，一个三角面片，每3个一组表示一个三角面片的三个顶点索引 */
        faces: number[];
        /** 顶点法矢，与vertices对应，每3个一组表示一个顶点的法向方向 */
        normals: number[];
        /** 顶点UV，与vertices对应，2个一组 */
        uvs: number[];
    }

    type IFlatMeshPlus = IFlatMesh & { uvs1?: number[] }

    /** 含有骨骼信息的网格 */
    interface IBoneFlatMesh extends IFlatMesh {
        /** 骨架索引，4个一组 */
        boneIndices: number[];
        /** 骨架权重，4个一组 */
        boneWeights: number[];
    }

    // 离散得到的三角面片（将弃用）
    interface IMesh {
        // 离散后的所有顶点
        vertices: numberArr3[];
        // 三角片集，一个三角面片，由3个索引组成
        faces: numberArr3[];
        // 顶点法矢，与vertices对应
        normals: numberArr3[];
        // 顶点UV，与vertices对应
        uvs: numberArr2[];
    }

    // 离散后的节点
    interface IRenderNode {
        // -------点----------
        // 点集
        points?: numberArr3[];

        // -------边----------
        // 边集，一条边，由多条边组成
        edges?: numberArr3[][];

        // -------三角片----------
        mesh?: IMesh;
        // 子节点
        children?: IRenderNode[];
    }

    interface IRenderMesh {
        // -------三角片----------
        mesh: IMesh;
    }
    interface IRenderEdge extends IRenderNode {
        // -------边----------
        edges: numberArr3[][];
    }

    interface IRenderPoint extends IRenderNode {
        // -------点------
        points: numberArr3[];
    }

    // 几何库dump出的数据
    interface IDBLibGeo {
        type: EN_GEO_TYPE;
        _d?: any;
    }

    // ---------------math------------------------
    // 向量/点
    interface IDBVector {
        type: EN_GEO_TYPE;
        data: number[];
    }
    interface IDBVector2 extends IDBVector {
        type: EN_GEO_TYPE.VEC_2;
        data: IXYArr;
    }

    interface IDBVector3 extends IDBVector {
        type: EN_GEO_TYPE.VEC_3;
        data: IXYZArr;
    }

    interface IDBMatrix {
        type: EN_GEO_TYPE;
        data: number[][];
    }

    interface IDBMatrix3 extends IDBMatrix {
        type: EN_GEO_TYPE.MATRIX_3;
        data: numberArrs3X3;
    }

    interface IDBMatrix4 extends IDBMatrix {
        type: EN_GEO_TYPE.MATRIX_4;
        data: numberArrs4X4;
    }

    interface IDBCoordinate2 extends IDBLibGeo {
        type: EN_GEO_TYPE.COORD_2;
        data: [
            // origin
            IXYArr,
            // xDir
            IXYArr,
        ];
    }

    interface IDBCoordinate3 extends IDBLibGeo {
        type: EN_GEO_TYPE.COORD_3;
        data: [
            // origin
            IXYZArr,
            // xDir
            IXYZArr,
            // yDir
            IXYZArr,
        ];
    }
    // ---------------math------------------------

    // curve2的基类
    interface IDBCurve2d extends IDBLibGeo {
        type: EN_GEO_TYPE;
    }

    interface IDBLine2d extends IDBCurve2d {
        type: EN_GEO_TYPE;
        data: [
            // origin
            IXYArr,
            // dir
            IXYArr,
            // range
            IInterval,
        ];
    }

    interface IDBArc2d extends IDBCurve2d {
        type: EN_GEO_TYPE;
        data: [
            // a
            number,
            // b
            number,
            // coordinate
            IDBCoordinate2,
            // clockSign
            1 | -1,
            // range
            IInterval,
        ];
    }

    interface IDBSmoothPoly2d extends IDBCurve2d {
        type: EN_GEO_TYPE;
        data: [
            // 顶点
            numberArr2[],
        ];
    }

    interface IDBSmoothPoly3d extends IDBCurve3d {
        type: EN_GEO_TYPE;
        data: [
            // 顶点
            numberArr3[],
        ];
    }

    interface IDBCircle3d extends IDBCurve3d {
        type: EN_GEO_TYPE;
        data: [
            // coordinate
            IDBCoordinate3,
            // radius
            number,
        ];
    }

    interface IDBArc3d extends IDBCurve3d {
        type: EN_GEO_TYPE;
        data: [
            // coordinate
            IDBCoordinate3,
            // a
            number,
            // b
            number,
            // range
            IInterval,
        ];
    }
    interface IDBPolyCurve extends IDBLibGeo {
        type: EN_GEO_TYPE;
        data: IDBCurve2d[];
    }

    interface IDBLoop extends IDBPolyCurve {
        type: EN_GEO_TYPE.POLY_CURVE;
    }

    interface IDBPolygon extends IDBLibGeo {
        type: EN_GEO_TYPE.POLYGON;
        data: IDBLoop[];
    }

    // 3D
    interface IDBCurve3d extends IDBLibGeo {
        type: EN_GEO_TYPE;
    }

    interface IDBLine3d extends IDBCurve3d {
        type: EN_GEO_TYPE;
        data: [
            // origin
            IXYZArr,
            // dir
            IXYZArr,
            // range
            IInterval,
        ];
    }

    interface IDBNurbsCurve2d extends IDBCurve2d {
        type: EN_GEO_TYPE.NURBS_CURVE_2D;
        data: [
            // degree
            number,
            // control points
            numberArr2[],
            // konts
            number[],
            // weights
            number[],
            // range
            numberArr2,
        ];
    }

    interface IDBNurbsCurve3d extends IDBCurve3d {
        type: EN_GEO_TYPE.NURBS_CURVE_3D;
        data: [
            // degree
            number,
            // control points
            numberArr3[],
            // konts
            number[],
            // weights
            number[],
            // range
            numberArr2,
        ];
    }

    interface IDBOffsetCurve2d extends IDBCurve2d {
        type: EN_GEO_TYPE;
        data: [
            // base curve
            IDBLibGeo,
            // offset
            number,
            // range
            IInterval,
        ];
    }

    interface IDBOffsetCurve3d extends IDBCurve3d {
        type: EN_GEO_TYPE;
        data: [
            // base curve
            IDBLibGeo,
            // dz
            types.numberArr3,
            // offsetXY
            number,
            // offsetZ
            number,
            // range
            IInterval,
        ];
    }

    interface IDBExtendCurve2d extends IDBCurve2d {
        type: EN_GEO_TYPE;
        data: [
            // base curve
            IDBLibGeo,
            // range
            types.numberArr2,
        ];
    }

    interface IDBSurface extends IDBLibGeo {
        type: EN_GEO_TYPE;
    }

    interface IDBPlane extends IDBSurface {
        type: EN_GEO_TYPE;
        data: [IDBCoordinate3];
    }

    interface IDBCylinder extends IDBSurface {
        type: EN_GEO_TYPE;
        data: [
            // coordinate
            IDBCoordinate3,
            // a
            number,
            // b
            number,
        ];
    }

    interface IDBTrimmedSur extends IDBSurface {
        type: EN_GEO_TYPE.TRIM;
        data: [
            // surface
            IDBSurface,
            // bPositive
            boolean,
            // uvPolygon
            IDBPolygon,
        ];
    }
}

export type { types };
