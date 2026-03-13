// a和b的位置关系：in：a在b内部；out：a在b外部；intersect：贯穿相交
export enum PositionType {
    UNKWON,
    OUT,
    IN,
    INOUT, // 左内右外
    OUTIN, // 左外右内
}