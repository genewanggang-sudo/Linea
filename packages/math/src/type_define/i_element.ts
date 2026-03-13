import { types } from './i_types';
import { EN_GEO_TYPE } from './i_element_type';
import { DiscreteParam } from '../base/discrete_param';



// 数学库的接口
export interface IGeo {
    // 类型
    getType(): EN_GEO_TYPE;
    // 序列化成json
    dump(): types.IDBLibGeo;
    // 从json反序列化
    load(json: types.IDBLibGeo): this;
    //
    clone(): IGeo;
    //
    toString(): string;
}