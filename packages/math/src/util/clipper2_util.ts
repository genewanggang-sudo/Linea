import * as ClipperLib from 'clipper2-wasm/dist/clipper2z';



export class Clipper2Util {
    public static clipper2Z: ClipperLib.MainModule;
    public static async initialize(Clipper2ZFactory: any) {
        if (!Clipper2ZFactory || !(typeof Clipper2ZFactory !== 'function'))
            this.clipper2Z = await Clipper2ZFactory();
    }
}