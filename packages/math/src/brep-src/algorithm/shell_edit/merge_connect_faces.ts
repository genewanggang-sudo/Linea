import { Face } from '../../brep/face';
import { Edge } from '../../brep/edge';
import { addEvolutionInfo, IShellModelingResult, mergeShellModelingResult } from './shell_modeling_result';
import { ContinuousUtil } from '../../continuous';
import { ShellModelingUtil } from './smooth/shell_modeling_util';
import { mergeConnectedFace } from './operator/merge_connect_face';
import { Shell } from '../../brep/shell';
import ShellModelingBase from './shell_modeling_base';



export default class MergeConnectFaces extends ShellModelingBase {
    private _faces: Face[];

    constructor(faces: Face[], context: Shell[] = []) {
        super(context);
        this._faces = faces;
    }

    /**
     * 将一堆面中，满足共surface, 且相邻的情况，进行合并。
     * 不做布尔运算，（暂时只支持平面，不支持曲面）
     * @param faces 待合并的面
     */
    protected _executeImpl(): IShellModelingResult {
        const result = { modifiedShellsMap: new Map() };

        // 1. 去除曲面（连续面）, 留下平面（正常的平面，连续的平面）
        const filterFaces = this._faces.filter(f => f.getSurface().isPlane());
        const getFaces = () => {
            return filterFaces;
        };
        const getEdges = () => {
            const edgeSet = new Set<Edge>();
            filterFaces.forEach(f => f.getEdges().forEach(e => edgeSet.add(e)));
            return Array.from(edgeSet);
        };
        const interactiveFaces = ContinuousUtil.getAllInteractiveFaces({ getFaces, getEdges });
        const candidateFaceArrays: Face[][] = [];
        Array.from(interactiveFaces.contFaces)
            .filter(it => it.isPlane())
            .forEach(it => candidateFaceArrays.push(it.getFaces().slice()));

        // 2. 按照平面分组
        const planeFaceGroups = ShellModelingUtil.divideFacesIntoCoplanarGroups(interactiveFaces.faces);

        // 3. 按照连接关系分组
        for (const planeFaceGroup of planeFaceGroups) {
            const connectGroups = ShellModelingUtil.divideFacesIntoConnectGroups(planeFaceGroup, false);
            connectGroups.forEach(g => candidateFaceArrays.push(g));
        }

        // 4. 合并
        for (const candidateFaceArray of candidateFaceArrays) {
            const newFace = mergeConnectedFace(candidateFaceArray);
            if (newFace) {
                const tmpResult = {
                    modifiedShellsMap: new Map(),
                    evolutionMap: new Map(),
                };
                tmpResult.modifiedShellsMap.set(newFace.getShell()!, {
                    addFaces: [newFace],
                    deleteFaces: candidateFaceArray,
                });
                candidateFaceArray.forEach(f => addEvolutionInfo(tmpResult, f, newFace));

                mergeShellModelingResult(result, tmpResult);
            }
        }

        return result;
    }
}