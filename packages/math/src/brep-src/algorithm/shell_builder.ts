import { Surface, Curve3, Tol } from '../..';
import { createShellFromCurve3ds } from './shell_builder/create_shell_from_curves';
import { IShellModelingResult } from './shell_edit/shell_modeling_result';



/**
 * 构造壳：目前只支持surface为平面、且只有一个外环多个内环的face的壳
 */
export class ShellBuilder {
    /**
     * @author  //当前只支持一个外环多个内环的情况，后续有需求再修改支持多外环。
     * function 输入一个curve3d二维数组和一个surface，构造有一个外环多个内环的face的shell。会检查curve3ds是否首尾相接。不检查逆时针、自交等。
     * @param surf 输入curve3d所在的surface曲面
     * @param curve3ds curve3d的二维数组。每个一维数组为一个环，规定第一个curve3d数组为外环，其余都为内环
     */
    public static createShell(surf: Surface, curve3dss: Curve3[][], tolerance?: Tol): IShellModelingResult {
        const shellCreate: IShellModelingResult = { addShells: [] };
        shellCreate.addShells!.push(createShellFromCurve3ds.createShell(surf, curve3dss, tolerance));
        return shellCreate;
    }

    /**
     * 通过几何数据，创建一些面
     * @param surf 输入curve3d所在的surface曲面
     * @param faceObjs curve3d的三维数组。第一维是面，第二维是环（外环+内环），第三维是曲线
     * @param option 配置参数（checkOverlap -- 检查重叠的点、边, 不会创建重复的拓扑）
     */
    public static createFacesFromCurves(
        surf: Surface,
        faceObjs: Curve3[][][],
        option?: { checkOverlap?: boolean; smoothTess?: boolean; ratio?: number },
        tolerance?: Tol,
    ): IShellModelingResult {
        const res: IShellModelingResult = {};
        res.addShells = createShellFromCurve3ds.createShells(surf, faceObjs, option, tolerance);
        return res;
    }
}