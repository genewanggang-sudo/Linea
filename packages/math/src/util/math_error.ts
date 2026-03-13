import { IGeo } from '../type_define/i_element';



export type MathErrorParamType = IGeo | IGeo[] | number | Object;

export enum MathErrorType {
    /** 输入错误 */
    Input = 'input',

    /** 运算中发生异常 */
    Algorithm = 'algorithm',

    /** 运算结果有误 */
    Geometry = 'geometry',

    /** 未实现功能 */
    Unimplemented = 'unimplemented',

    /** 未知 */
    Unknown = 'unknown',

    /** 默认 */
    Default = 'default',

    /** 成功，无报错 */
    None = 'none',
}

export class MathError extends Error {
    public static showMutedWarn = false;

    public static assert(
        value: (() => boolean) | any,
        message?: string,
        type?: MathErrorType,
        ...params: MathErrorParamType[]
    ): void {
        const result = value instanceof Function ? value() : value;
        if (!result) {
            const err = new MathError(message, '', type, params);
            if (process.env.NODE_ENV !== 'production') err.message = err.fullMessage;
            throw err;
        }
    }

    public static warn(
        value: (() => boolean) | any,
        message?: string,
        type?: MathErrorType,
        ...params: MathErrorParamType[]
    ): void {
        if (process.env.NODE_ENV === 'production') return;

        const result = value instanceof Function ? value() : value;
        if (!result) {
            const warn = new MathError(message, '', type, params);
            warn.message = warn.fullMessage;

            //
            console.warn(warn.message, warn.params);
        }
    }

    public static mutedWarn(
        value: (() => boolean) | any,
        message?: string,
        type?: MathErrorType,
        ...params: MathErrorParamType[]
    ): void {
        if (process.env.NODE_ENV === 'production' || !this.showMutedWarn) return;

        const result = value instanceof Function ? value() : value;
        if (!result) {
            const warn = new MathError(message, '', type, params);
            warn.message = warn.fullMessage;

            //
            console.warn(warn.message, warn.params);
        }
    }

    constructor(
        message: string = '',
        private _algorithm = '',
        private _type = MathErrorType.Default,
        private _params: MathErrorParamType[] = [],
    ) {
        super(message);
    }

    public get algorithm(): string {
        return this._algorithm;
    }

    public set algorithm(value: string) {
        this._algorithm = value;
    }

    public get type(): MathErrorType {
        return this._type;
    }

    public set type(type: MathErrorType) {
        this._type = type;
    }

    public get name() {
        return this.constructor.name;
    }

    public get params(): MathErrorParamType[] {
        return this._params;
    }

    public set params(params: MathErrorParamType[]) {
        this._params = params;
    }

    public get fullMessage(): string {
        let msg = `${this.algorithm}(${this.type}) - ${this.message} \n`;
        for (const param of this._params) {
            msg += param instanceof Object ? `${param.constructor.name}} \n` : `${param} \n`;
        }
        return msg;
    }

    public toString(): string {
        return this.fullMessage;
    }
}