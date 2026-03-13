import { Curve3, Vec3, Matrix4, Plane, Tol, Cylinder } from '../..';
import { Shell } from '../brep/shell';
import AddEdges from './shell_edit/add_edges/add_edges';
import { IShellModelingResult, mergeShellModelingResult } from './shell_edit/shell_modeling_result';
import { Face } from '../brep/face';
import PullPushFace from './shell_edit/pull_push_face/pull_push_face';
import IsolateFaces, { IIsolateFacesResult } from './shell_edit/isolate_faces';
import { Edge } from '../brep/edge';
import CopyFaces from './shell_edit/copy_faces';
import { MoveEdges } from './shell_edit/move_operators/move_edges';
import { MoveFaces } from './shell_edit/move_operators/move_faces';
import { Rounding2D } from './shell_edit/roundinng/2d_rounding';
import FacesShellsMerge from './shell_edit/faces_boolean/faces_shells_boolean';
import { ContinuousUtil } from '../continuous';
import MergeConnectFaces from './shell_edit/merge_connect_faces';
import PullPushFacePreview from './shell_edit/pull_push_face/pull_push_face_preview';
import DeleteFacesEdges from './shell_edit/delete_faces_edges/delete_faces_edges';
import SplitEdge from './shell_edit/split_edge';
import MergeEdges from './shell_edit/merge_edges';



export class ShellEdit {
    /**
     * 往模型中加入线条，分割面或者形成新的面
     * @param curves 输入线条
     * @param context 当前模型中所有的shell
     */
    public static addEdges(
        curves: Curve3[],
        context: Shell[] = [],
        curvePlane: Plane | Cylinder | undefined = undefined,
    ): IShellModelingResult {
        return new AddEdges(curves, curvePlane, context).execute();
    }

    /**
     * 用指定的点将边拆分
     * @param edge 被拆分的边
     * @param pts 拆分点
     * @returns
     */
    public static splitEdge(edge: Edge, pts: Vec3[]) {
        return new SplitEdge(edge, pts).execute();
    }

    /**
     * 将一些边合并起来
     * @param edges 被合并的边
     * @returns
     */
    public static mergeEdges(edges: Edge[]) {
        return new MergeEdges(edges).execute();
    }

    /**
     * 移动模型中的edges，预览效果
     * @param edges 输入要移动的edges
     * @param moveVect 移动的向量
     */
    public static moveEdgesPreview(edges: Edge[], moveVect: Vec3): IShellModelingResult {
        return new MoveEdges(edges, moveVect).preview();
    }

    /**
     * 移动模型中的edges，移动后如果跟其他face相交，会分割形成新的面。//注：如果希望移动后不与场景内其他的shell求交分割，可传入空的shells
     * @param edges 输入要移动的edges
     * @param moveVect 移动的向量
     * @param context 当前场景中所有的shell, 用于移动后的求交。如果未传入shells，则不会与场景中已有的face求交分割
     */
    public static moveEdges(edges: Edge[], moveVect: Vec3, context: Shell[] = []): IShellModelingResult {
        return new MoveEdges(edges, moveVect, context).execute();
    }

    /**
     * 移动模型中的faces，移动后如果跟其他face相交，会分割形成新的面。//注：如果希望移动后不与场景内其他的shell求交分割，可传入空的shells
     * @param faces 输入要移动的faces
     * @param moveVect 移动的向量
     * @param context 当前场景中所有的shell, 用于移动后的求交。如果未传入shells，则不会与场景中已有的face求交分割
     */
    public static moveFaces(faces: Face[], moveVect: Vec3, context: Shell[] = []): IShellModelingResult {
        return new MoveFaces(faces, moveVect, context).execute();
    }

    // 操作之后，发生改变的改变face与场景内其他shell的所有face做求交分割合并
    /**
     * 将多个面合并到场景中
     * @param faces 待合并的面
     * @param context 当前模型中所有的shell
     * @param checkOverlap1 待合并面存在自相交，需要处理
     * @param preResult 之前操作的结果
     */
    public static facesAndShellsMerge(
        faces: Face[],
        context: Shell[],
        checkOverlap1: boolean = false,
        preResult?: IShellModelingResult,
        tolerance?: Tol,
    ): IShellModelingResult {
        const mergeRes = new FacesShellsMerge(faces, context, checkOverlap1, true, tolerance).execute();
        if (preResult) {
            mergeShellModelingResult(preResult, mergeRes);
            return preResult;
        }
        return mergeRes;
    }

    /**
     * 将相邻的面进行合并，变成大的面
     * 不做布尔运算，（暂时只支持平面，不支持曲面）
     * @param faces 待合并的面
     * @param preResult 之前操作的结果
     */
    public static mergeConnectedFaces(faces: Face[], preResult?: IShellModelingResult): IShellModelingResult {
        const modelingResult = new MergeConnectFaces(faces).execute();

        if (preResult) {
            mergeShellModelingResult(preResult, modelingResult);
            return preResult;
        }
        return modelingResult;
    }

    /**
     * 推拉一个面
     * @param face 被推拉的面
     * @param vec 推拉方向 + 距离
     * @param context 当前模型中所有的shell
     * @param extrudeBehavior 是否使用拉伸的行为-->保留底面
     * @param bTopFaceDeal 顶面合并后，成为另外一个面的内环，则进行删除
     * @param bBoolean 侧面和顶面是否需要进行布尔合并
     */
    public static pullPushFace(
        face: Face,
        vec: Vec3,
        context: Shell[] = [],
        extrudeBehavior: boolean = false,
        bTopFaceDeal: boolean = true,
        bBoolean: boolean = true,
    ): IShellModelingResult {
        return new PullPushFace(face, vec, context, extrudeBehavior, bTopFaceDeal, bBoolean).execute();
    }

    /**
     * 预览面推拉，比面推拉要快,但是结果不一定对，只能保证看起来对
     * @param face 被推拉的面
     * @param vec 推拉方向 + 距离
     * @param extrudeBehavior 是否使用拉伸的行为-->保留底面
     */
    public static pullPushFacePreview(
        face: Face,
        vec: Vec3,
        extrudeBehavior: boolean = false,
    ): IShellModelingResult {
        return new PullPushFacePreview(face, vec, extrudeBehavior).execute();
    }

    /**
     * 将originShell中的faces，转移到新的独立的shell中
     * 新的shell中同时生成所需的edge和vertex，不会重用tag（用于成组操作）。
     * originShell中会删除输入的faces
     * @param originShell
     * @param faces
     */
    public static isolateFaces(originShell: Shell, faces: Set<Face>): IIsolateFacesResult {
        return new IsolateFaces(Array.from(faces), originShell).execute() as IIsolateFacesResult;
    }

    /**
     * 复制多个面到新的位置.
     * 面可以属于不同的shell
     * @param faces 待复制的面
     * @param reuseTag 是否重用tag
     * @param matrix 新位置的变换矩阵
     * @returns origin face -> new face map
     */
    public static copyFaces(faces: Face[], reuseTag?: boolean, matrix?: Matrix4): IShellModelingResult {
        return new CopyFaces(faces, reuseTag, matrix).execute();
    }

    /**
     * 删除多个面和多个边
     * 从模型中删除edges，并且删除和edge关联的coedges，但不会删除edge关联的vertex。删除coedge之后wire不成环也要删去。
     * @param faces 待删除的面
     * @param edges 待删除的边
     * @param mergeEdge 是否合并相邻的断边
     */
    public static deleteFacesAndEdges(faces: Face[], edges: Edge[], mergeEdge?: boolean): IShellModelingResult {
        return new DeleteFacesEdges(faces, edges, mergeEdge).execute();
    }

    /**
     * 2d倒圆角：相邻的两个edge倒圆角
     * @param edge1 输入倒圆角的edge1
     * @param edge2 输入倒圆角的edge2
     * @param radius 输入倒圆角半径
     * @param context 当前模型中所有的shell
     * @param useSmoothPoly 使用连续边(true -> 真圆弧，false -> 离散的连续边)
     */
    public static makeRounding2D(
        edge1: Edge,
        edge2: Edge,
        radius: number,
        context: Shell[] = [],
        useSmoothPoly: boolean = false,
    ): IShellModelingResult {
        return new Rounding2D(edge1, edge2, radius, context, useSmoothPoly).execute();
    }

    /**
     * 将shell进行矩阵变换
     * @param shells
     * @param m
     */
    public static transformShells(shells: Shell[], m: Matrix4): IShellModelingResult {
        const result = { modifiedShellsMap: new Map() };

        shells.forEach(s => {
            s.transform(m);
            result.modifiedShellsMap.set(s, { modifiedFaces: s.getFaces().slice() });

            // 更新连续边信息
            ContinuousUtil.transformContinuousEdgeInfo(s.getEdges(), m);
        });

        return result;
    }
}