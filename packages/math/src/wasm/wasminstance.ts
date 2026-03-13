export interface WasmInstance {
    _malloc(nofBytes: number): number;
    _free(ptr: number): void;
    _realloc(ptr: number, len: number): number;
    HEAPF64: {
        buffer: ArrayBuffer;
    };
    HEAPF32: {
        buffer: ArrayBuffer;
    };

    package: any;



    helloword(): void;

    search(cptr: number, cbitsize: number, aptr: number, acount: number, tol: number, clean: number): any;

    getCurveSize(): number;

    clipperInter(ptr: number, bitsize: number, tol: number, tolAngle: number, scanLineBegin: number, scanLineEnd: number, performCross: boolean, midIndex: number): any;

    clipperDiff(ptr: number, bitsize: number, tol: number, tolAngle: number, scanLineBegin: number, scanLineEnd: number, performCross: boolean, midIndex: number): any;

    clipperUnion(ptr: number, bitsize: number, tol: number, tolAngle: number, scanLineBegin: number, scanLineEnd: number, performCross: boolean, midIndex: number): any;

    clipperXor(ptr: number, bitsize: number, tol: number, tolAngle: number, scanLineBegin: number, scanLineEnd: number, performCross: boolean, midIndex: number): any;

}