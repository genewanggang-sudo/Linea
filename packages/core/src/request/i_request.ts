import type { IDocument } from '../document/i_document'

export interface IRequest {
    setDoc(doc: IDocument): void
    /** 执行请求逻辑 */
    execute(): unknown

    canTransact(): boolean;
}
