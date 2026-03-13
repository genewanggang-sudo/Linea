import { Loader } from './loader';
import { types } from '../type_define/i_types';
import { IGeo } from '../type_define/i_element';



/**
 * 注册命令
 * @param constructor
 */
export function registerGeo(constructor: types.Class<IGeo> | any) {
    Loader.registerGeo(constructor);
}