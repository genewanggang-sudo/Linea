export class DebugWarn {
    public static assert(value: boolean, message: string, name: string, time: string) {
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
