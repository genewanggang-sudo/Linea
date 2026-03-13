import * as Short from 'short-uuid';
import { Loader } from '../../loader/loader';

/**
 * 定义一些工具类方法
 */
export class BrepUtil {
    /**
     * 生成UUID
     */
    public static generateUUID(): string {
        return Short.generate();
    }

    /**
     * 生成8位短的UUID
     */
    public static generateShortUUID(): string {
        return Short.generate().substring(0, 8);
    }

    // value是基础类型或者实现了接口IGeoElement
    public static dumpMapObj(map?: { [key: string]: any }): { [key: string]: any } | undefined {
        let dataObj;
        if (map) {
            dataObj = {};

            for (const k in map) {
                let value = map[k];
                try {
                    value = value.dump();
                    // eslint-disable-next-line no-empty
                } catch { }
                (dataObj as any)[k] = value;
            }
        }
        return dataObj;
    }

    // value是基础类型或者实现了接口IGeoElement
    public static loadMapObj(dataObj?: { [key: string]: any }): { [key: string]: any } | undefined {
        let map: any;
        if (dataObj) {
            map = {};

            for (const k in dataObj) {
                let value = dataObj[k];
                try {
                    value = Loader.load(value);
                    // eslint-disable-next-line no-empty
                } catch { }
                map[k] = value;
            }
        }
        return map;
    }
}
