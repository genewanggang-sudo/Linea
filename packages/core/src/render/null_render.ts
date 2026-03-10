import { GRep } from '../grep/grep';
import { DebugUtil } from '../toolkit/debug_util';
import { IRender } from './i_render';

export class NullRender implements IRender {
    public updateView(): void {
        DebugUtil.warn(false, 'NullRender中的updateView方法未实现', 'wg', '2026-03-10')
    }

    public addGRep(_grep: GRep): void {
        DebugUtil.warn(false, 'NullRender中的addGrep方法未实现', 'wg', '2026-03-10')
    }

    public removeGRep(_eId: number): void {
        DebugUtil.warn(false, 'NullRender中的removeGRep方法未实现', 'wg', '2026-03-10')
    }
}
