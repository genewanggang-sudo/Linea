export class DebugUtil {
    public static assert<T>(value: T, message: string, name: string, time: string): asserts value is NonNullable<T> {
        if (!value) {
            const showMesg = `${message}\n报告人:${name}\n报告时间：${time}\n点击确定可debug`;
            // TODO 触发事件
            throw new Error(showMesg);
        }
    }

    public static warn(value: boolean, message: string, name: string, time: string) {
        if (!value) {
            const showMesg = `${message}\n报告人:${name}\n报告时间：${time}\n点击确定可debug`;
            console.warn(showMesg)
        }
    }
}
