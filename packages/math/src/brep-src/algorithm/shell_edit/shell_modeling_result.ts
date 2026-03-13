import { GeoElement } from '../../..';
import { Shell } from '../../brep/shell';
import { Face } from '../../brep/face';
import { BaseBRepTopoError } from '../shell_valid/base_brep_topo_error';
import { TopoObject } from '../../brep/topo_object';



export interface IShellModifyInfo {
    // 新添加的面
    addFaces?: Face[];

    // 删除的面
    deleteFaces?: Face[];

    // 修改的面
    modifiedFaces?: Face[];
}

export interface IShellModelingResult {
    // 错误信息
    errorStr?: string;

    // 新添加的shell
    addShells?: Shell[];

    // 删除的shell
    deleteShells?: Shell[];

    // 修改的shell信息
    modifiedShellsMap?: Map<Shell, IShellModifyInfo>;

    // 演化信息(old tag | geom object --> new tags)
    evolutionMap?: Map<string | GeoElement, string[]>;

    // 新增和修改的结果中非法的拓扑
    topoErrors?: BaseBRepTopoError[];
}

export function addShellModifyInfo(
    map: Map<Shell, IShellModifyInfo>,
    shell: Shell,
    addFaces?: Face[],
    deleteFaces?: Face[],
    modifyFaces?: Face[],
) {
    let shellModifyInfo = map.get(shell);
    if (!shellModifyInfo) {
        shellModifyInfo = { addFaces: [], deleteFaces: [], modifiedFaces: [] };
        map.set(shell, shellModifyInfo);
    }
    if (addFaces) {
        shellModifyInfo.addFaces!.push(...addFaces);
    }
    if (deleteFaces) {
        shellModifyInfo.deleteFaces!.push(...deleteFaces);
    }
    if (modifyFaces) {
        shellModifyInfo.modifiedFaces!.push(...modifyFaces);
    }
}

export function mergeShellModelingResult(r1: IShellModelingResult, r2: IShellModelingResult): void {
    if (!r1.errorStr && r2.errorStr) {
        r1.errorStr = r2.errorStr;
    }

    // 合并新加
    if (r2.addShells) {
        if (r1.addShells) {
            r1.addShells.push(...r2.addShells);
        } else {
            r1.addShells = r2.addShells;
        }
    }

    // 合并删除
    if (r2.deleteShells) {
        r1.deleteShells = r1.deleteShells || [];
        for (const s of r2.deleteShells!) {
            if (r1.addShells) {
                const index = r1.addShells.indexOf(s);
                if (index > -1) {
                    r1.addShells.splice(index, 1);
                    continue;
                }
            }

            r1.deleteShells!.push(s);
            if (r1.modifiedShellsMap) {
                r1.modifiedShellsMap.delete(s);
            }
        }
    }

    // 合并修改
    if (r2.modifiedShellsMap) {
        r1.modifiedShellsMap = r1.modifiedShellsMap || new Map();
        for (const [s, info2] of r2.modifiedShellsMap!) {
            if (r1.addShells) {
                const index = r1.addShells.indexOf(s);
                if (index > -1) {
                    continue;
                }
            }

            const info1 = r1.modifiedShellsMap!.get(s);
            if (!info1) {
                r1.modifiedShellsMap!.set(s, info2);
                continue;
            }

            if (info2.addFaces) {
                if (info1.addFaces) {
                    info1.addFaces.push(...info2.addFaces);
                } else {
                    info1.addFaces = info2.addFaces;
                }
            }

            if (info2.deleteFaces) {
                info1.deleteFaces = info1.deleteFaces || [];
                for (const df of info2.deleteFaces!) {
                    if (info1.addFaces) {
                        const index = info1.addFaces!.indexOf(df);
                        if (index > -1) {
                            info1.addFaces!.splice(index, 1);
                            continue;
                        }
                    }

                    info1.deleteFaces!.push(df);
                    if (info1.modifiedFaces) {
                        const index1 = info1.modifiedFaces!.indexOf(df);
                        if (index1 > -1) {
                            info1.modifiedFaces!.splice(index1, 1);
                        }
                    }
                }
            }

            if (info2.modifiedFaces) {
                info1.modifiedFaces = info1.modifiedFaces || [];
                for (const df of info2.modifiedFaces!) {
                    if (info1.addFaces) {
                        const index = info1.addFaces!.indexOf(df);
                        if (index > -1) {
                            info1.addFaces!.splice(index, 1);
                            continue;
                        }
                    }

                    const index1 = info1.modifiedFaces!.indexOf(df);
                    if (index1 < 0) {
                        info1.modifiedFaces!.push(df);
                    }
                }
            }
        }
    }

    // 合并演化关系
    if (r2.evolutionMap) {
        if (r1.evolutionMap) {
            const newEvolutionMap = new Map();
            const usedKey = new Set();
            for (const [key, values] of r1.evolutionMap!) {
                const newValueSet = new Set();
                for (const value of values) {
                    let newValue = r2.evolutionMap.get(value);
                    if (newValue) {
                        usedKey.add(value);
                    } else {
                        newValue = [value];
                    }
                    newValue.forEach(it => newValueSet.add(it));
                }
                newEvolutionMap.set(key, Array.from(newValueSet));
            }
            for (const [key, values2] of r2.evolutionMap!) {
                if (!usedKey.has(key)) {
                    const values1 = newEvolutionMap.get(key);
                    if (values1) {
                        values1.push(...values2);
                    } else {
                        newEvolutionMap.set(key, values2);
                    }
                }
            }
            r1.evolutionMap = newEvolutionMap;
        } else {
            r1.evolutionMap = new Map(r2.evolutionMap);
        }
    }
}

export function addEvolutionInfo(r: IShellModelingResult, oldTopo: TopoObject | GeoElement, newTopo: TopoObject) {
    const key = (oldTopo as any).tag || oldTopo;
    r.evolutionMap = r.evolutionMap || new Map();
    let news = r.evolutionMap.get(key);
    if (!news) {
        news = [];
        r.evolutionMap.set(key, news);
    }
    news.push(newTopo.tag);
}