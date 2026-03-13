import { WasmInstance } from "./wasminstance";
import { GeomLibWrapper } from "./wrapper";
import * as initModule from "./wasm-geom";



let wasmModule: WasmInstance | undefined | Error;

export class GeomError extends Error {
    constructor(public message: string) {
        super(message);
        Object.setPrototypeOf(this, GeomError.prototype);
        this.name = this.constructor.name;
        this.stack = new Error().stack;
    }
}

export const loadWasmInstanceAsync = async (): Promise<GeomLibWrapper> => {
    if (wasmModule instanceof Error) {
    } else if (wasmModule === undefined) {
        try {
            if (!global.document) {
                global.document = {} as any;
            }
            // let initModule = require("./wasm-geom");
            wasmModule = (await initModule.asyncLoad()) as WasmInstance;
            wasmModule.package = initModule.package1;
            let lib = new GeomLibWrapper();
            return lib;
        } catch (err) {
            wasmModule = err as any;
            console.log(wasmModule);
        }
    } else {
        return new GeomLibWrapper();
    }
    throw new GeomError("could not load native geom lib in the desired format");
}

export const getGeomInstance = (): WasmInstance => {
    if (wasmModule instanceof Error || wasmModule == undefined) {
        throw "webassembly is not loaded correctly";
    }
    return wasmModule;
}

