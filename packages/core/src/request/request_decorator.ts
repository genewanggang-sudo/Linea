import { IConstructor } from '../types/type_guard';
import { Request } from './request';
import { requestMgr } from './request_mgr';

/**
 * 请求注册装饰器
 * @param requestId 请求id
 */
export function registerRequest(requestId: string) {
    return (ctor: IConstructor<Request>) => {
        requestMgr.registerRequest(requestId, ctor);
    };
}
