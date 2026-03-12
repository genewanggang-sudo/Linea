import { DebugUtil } from '../toolkit/debug_util';
import { IRender } from './i_render';

export class NullRender implements IRender {
    public updateView(): void {
        DebugUtil.warn(false, 'NullRender中的updateView方法未实现', 'wg', '2026-03-10')
    }
}
