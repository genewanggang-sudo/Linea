import { Face } from '../../../brep/face';
import { Shell } from '../../../brep/shell';
import { ContinuousUtil } from '../../../continuous/continuous_util';
import { ShellModelingUtil } from '../smooth/shell_modeling_util';



// 通过面的邻接关系，进行分组
// 有些场景不需要分析所有的相邻关系，使用BFS不合适
function createShellGroupByFaces(faces: Face[], useBFS?: boolean): Array<Set<Shell>> {
    const allFs = new Set<Face>(faces);
    if (useBFS) {
        // 使用广度优先搜索，依据面的连接关系
        const splitFaces = ShellModelingUtil.divideFacesIntoConnectGroups(faces, true);

        const shellGroups: Array<Set<Shell>> = [];
        for (const tmpFaces of splitFaces) {
            const tmpShells = new Set<Shell>();
            tmpFaces.forEach(f => {
                tmpShells.add(f.getShell()!);
                f.getVertexes().forEach(v => {
                    const vShell = v.getParent() as Shell;
                    if (vShell) {
                        tmpShells.add(vShell);
                    }
                });
                f.getEdges().forEach(e => {
                    const eShell = e.getParent() as Shell;
                    if (eShell) {
                        tmpShells.add(eShell);
                    }
                });
            });
            shellGroups.push(tmpShells);
        }
        return shellGroups;
    }

    let groupId = 1;
    const shellGroupMap = new Map<Shell, number>();
    const groupShellsMap = new Map<number, Set<Shell>>();
    for (const curFace of allFs) {
        const connectedShells = new Set([curFace.getShell()!]);
        curFace.getVertexes().forEach(v => {
            v.getFaces().forEach(f => connectedShells.add(f.getShell()!));
            const vShell = v.getParent() as Shell;
            if (vShell) {
                connectedShells.add(vShell);
            }
        });
        curFace.getEdges().forEach(e => {
            const eShell = e.getParent() as Shell;
            if (eShell) {
                connectedShells.add(eShell);
            }
        });

        let tmpIds: number[] = [];
        for (const s of connectedShells) {
            const gId = shellGroupMap.get(s);
            if (gId) {
                tmpIds.push(gId);
            }
        }
        tmpIds = tmpIds.filter((it, pos) => tmpIds.indexOf(it) === pos);
        if (tmpIds.length >= 1) {
            const targetSet = groupShellsMap.get(tmpIds[0])!;
            for (let index = 1; index < tmpIds.length; index++) {
                groupShellsMap.get(tmpIds[index])!.forEach(it => targetSet.add(it));
                groupShellsMap.delete(tmpIds[index]);
            }
            connectedShells.forEach(s => targetSet.add(s));
            targetSet.forEach(s => shellGroupMap.set(s, tmpIds[0]));
        } else {
            const curId = groupId++;
            connectedShells.forEach(s => shellGroupMap.set(s, curId));
            groupShellsMap.set(curId, connectedShells);
        }
    }
    return Array.from(groupShellsMap.values());
}

/**
 * 依据连接关系，合并shell
 * @param faces 待合并的面
 * @param priorityShells 优先合并到的shell
 */
export function mergeShells(
    faces: Face[],
    priorityShells?: Shell[],
    useBFS?: boolean,
): {
    deleteShell: Shell[];
    addFaceMap: Map<Shell, Face[]>;
} {
    // 如果面连接了多个shell，需要将shell合并
    const shellGroups = createShellGroupByFaces(faces, useBFS);
    const deleteShell: Shell[] = [];
    const addFaceMap: Map<Shell, Face[]> = new Map();

    // 合并shell
    for (const group of shellGroups) {
        if (group.size <= 1) {
            continue;
        }

        let targetShell: Shell | undefined;
        if (priorityShells) {
            const tmpS = Array.from(group).filter(s => priorityShells!.findIndex(it => it === s) > 0);
            if (tmpS.length) {
                targetShell = tmpS[0];
            }
        }
        if (!targetShell) {
            targetShell = Array.from(group).sort((a, b) => b.getVertexs().length - a.getVertexs().length)[0];
        }
        const addFaces: Face[] = [];
        addFaceMap.set(targetShell, addFaces);

        // transfer face, edge, vertex to target shell.
        for (const shell of group) {
            if (shell === targetShell) {
                continue;
            }
            deleteShell.push(shell);
            addFaces.push(...shell.getFaces());

            const transFaces = shell.getFaces();
            const transEdges = shell.getEdges();
            const transVertexs = shell.getVertexs();
            for (let index = transFaces.length - 1; index >= 0; index--) {
                const tmp = transFaces[index];
                shell.deleteFace(tmp);
                targetShell.addFace(tmp);
            }
            for (const edge of transEdges) {
                shell.deleteEdge(edge);
                targetShell.addEdge(edge);
            }
            for (const vertex of transVertexs) {
                shell.deleteVertex(vertex);
                targetShell.addVertex(vertex);
            }

            // 更新连续边的信息
            ContinuousUtil.transferContinuousEdgeInfo(transEdges, shell, targetShell);
        }
    }
    return {
        deleteShell,
        addFaceMap,
    };
}