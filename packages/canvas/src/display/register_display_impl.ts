
import { DisplayObject, IConstructor } from '@ccpc/core';
import type { DisplayObjectImpl } from './display_object_impl';
import { DisplayObjectImplMgr } from './display_object_impl_mgr';
/**
 * 注册显示对象的实现类
 * @param displayClass
 * @returns
 */
export function registerDisplayImplement<T extends DisplayObject>(displayClass: IConstructor<T>) {
    return (displayImplClass: new () => DisplayObjectImpl<DisplayObject>) => {
        DisplayObjectImplMgr.instance().registerDisplayObjectImplement(displayClass, displayImplClass);
    };
}
