/**
 * 模型层视图变化类型
 */
export enum EN_ModelViewChanged {
    ELEMENT_CREATE,
    ELEMENT_UPDATE,
    ELEMENT_DELETE,
}

export enum EN_RNODE_TYPE {
    UNKOWN = 0,
    POINT = 1,
    EDGE = 2,
    GROUP = 5,
}

/**
 * 不参与序列化的属性名前缀
 */
export enum EN_DontSavePropPrefix {
    UNDER_SCORE = '_',
    C_UNDER_SCORE = 'C_'
}

export enum EN_CoreRequestIds {
    UNDO = 'core.undo',
    REDO = 'core.redo'
}

export type IDBEleId = {
    id: number
}

export type IJSON = {
    [key: string]: unknown
}
