import { Edge } from '../brep/edge';
import { Face } from '../brep/face';
import { Vertex } from '../brep/vertex';



/** 扫掠体的拓扑索引 */
export interface ISweepTopo {
    /** 顶点，索引序号依次为 path, loop, edge, sub */
    vertices: Vertex[][][][];

    /** 扫掠边，索引序号依次为 path, loop, edge, sub */
    sweepEdges: Edge[][][][];

    /** 轮廓边，索引序号依次为 path, loop, edge, sub */
    frameEdges: Edge[][][][];

    /** 面，索引序号依次为 path, loop, edge */
    sideFaces: Face[][][];

    /** 起始面 */
    firstFace?: Face;

    /** 终止面 */
    lastFace?: Face;

    /** 路径在预处理中的分段 */
    pathSplitCounts: number[];

    /** 轮廓线在预处理中的分段数，索引序号依次为 loop, edge */
    baseLoopSplitCounts: number[][];
}

/**
 * 拉伸体的拓扑索引
 * 此处注意由于smoothpoly原因导致边，侧面需要额外数据记录序号
 */
export interface IExtrudeTopo {
    // 顶点，索引序号为loop，vertex
    topVertexs: Vertex[][];
    // 顶点，索引序号为loop，vertex
    bottomVertexs: Vertex[][];
    // 顶边，索引序号为loop，edge
    topEdges: Edge[][];
    // 侧边，索引序号为loop，edge
    sideEdges: Edge[][];
    // 底边，索引序号为loop，edge
    bottomEdges: Edge[][];
    // 顶面
    topFace: Face;
    // 侧面
    sideFaces: Face[][];
    // 底面
    bottomFace: Face;
    // smoothpoly段数，非smoothpoly时，为1
    // polySplitCount: number[][];
}

/** 布尔运算的拓扑索引 */
export interface IBool3dTopo {
    /** 各面的来源面 */
    faceSources: Map<string, string[]>;
}

/** 投影的附带信息 */
export interface IProjectInfo {
    distance: number; // 投影距离
    projFace: Face; // 投影面
    upDistance?: number; // 斜面投影对应的最远距离，与投影距离形成了一个区间
}