/* eslint-disable no-console */
// eslint-disable-next-line max-classes-per-file
import { IGeo } from '../type_define/i_element';



/**
 * 调试信息工具类
 */
export class Log {
    public static showError = true;

    private static _instance: Log;

    public static instance(): Log {
        if (!this._instance) this._instance = new Log();
        return Log._instance;
    }

    /**
     * 传入几何对象或者几何对象的数组，打印出几何的字符串
     * @param geos
     * @param prefix
     * @param postfix
     */
    public static d(geos: IGeo[] | IGeo, prefix: string = '', postfix: string = '') {
        let s = `${prefix}\n`;
        s += Log.toString(geos);
        s += `\n${postfix}`;
        console.log(s);
    }

    public static e(geos: IGeo[] | IGeo, prefix: string = '', postfix: string = '') {
        let s = `${prefix}\n`;
        s += Log.toString(geos);
        s += `\n${postfix}`;
        console.error(s);
    }

    public static w(geos: IGeo[] | IGeo, prefix: string = '', postfix: string = '') {
        let s = `${prefix}\n`;
        s += Log.toString(geos);
        s += `\n${postfix}`;
        console.warn(s);
    }

    public static toString(geos: IGeo[] | IGeo) {
        let s = '';
        if (geos instanceof Array) {
            geos.forEach(l => {
                s += `${l}\n`;
            });
        } else {
            s += `${geos}`;
        }
        return s;
    }
}