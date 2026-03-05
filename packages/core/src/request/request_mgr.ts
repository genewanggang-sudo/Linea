import type { IDocument } from '../document/i_document'
import { ClassManager } from '../toolkit/class_manager'
import { DebugUtil } from '../toolkit/debug_util'
import { ITransaction } from '../transaction/i_transaction'
import { ITransactionGroup } from '../transaction/i_transaction_group'
import { Transaction } from '../transaction/transaction'
import { TransactionGroup } from '../transaction/transaction_group'
import { IConstructor } from '../types/type_guard'
import { IRequest } from './i_request'
import { Request } from './request'

/**
 * RequestMgr 用法说明：
 * 1) 单次请求：createReq -> executeReq(req, true)
 * 2) 可取消请求：createReq -> executeReq(req, false) -> 后续 commit/cancel
 * 3) 会话请求：
 *    startSession()
 *    createReq/executeReq 多次
 *    成功 commitSession()，失败 abortSession()
 *
 * 约束：
 * - 仅当 req.canTransact() 为 true 时会创建 Transaction。
 * - abortSession/cancelReq 会回滚当前事务或事务组。
 */
export class RequestMgr {
    private static _instance?: RequestMgr

    private _doc!: IDocument

    /** Request 类管理器 */
    private _requestClsMgr = new ClassManager<string, IConstructor<Request>>()

    private _transGroup?: ITransactionGroup

    private _transaction?: ITransaction

    public static getInstance(): RequestMgr {
        if (!this._instance) {
            this._instance = new RequestMgr()
        }
        return this._instance
    }

    public init(doc: IDocument): void {
        this._doc = doc
    }

    public startSession(name: string = ''): void {
        DebugUtil.assert(!this._transGroup, '请先提交上一个 request', 'wg', '2026-03-05')
        this._transGroup = new TransactionGroup(this._doc, name)
    }

    public commitSession(): void {
        this._transGroup?.assimilate()
        this._transGroup = undefined
    }

    public abortSession(): void {
        this._transGroup?.rollBack()
        this._transGroup = undefined
    }

    /**
     * 创建请求
     */
    public createReq<T extends IConstructor<Request>>(ctor: T, ...args: ConstructorParameters<T>): InstanceType<T> {
        const req = new ctor(...args)
        req.setDoc(this._doc)
        const reqName = this._requestClsMgr.getClsNameEnsure(ctor)
        if (req.canTransact()) {
            this._transaction = new Transaction(this._doc, `${reqName}-start`)
        }

        return req as InstanceType<T>
    }

    public executeReq<T extends IRequest, R = ReturnType<T['execute']>>(req: T, commit = true): R {
        const result = req.execute()
        if (!commit || !req.canTransact()) return result as R
        DebugUtil.assert(this._transaction, '请先创建一个 request', 'wg', '2026-03-05')
        this._transaction?.commit()
        // TODO: 视图刷新 + 事件处理
        this._transaction = undefined

        return result as R
    }

    public cancelReq(): void {
        this._transaction?.rollBack()
        this._transaction = undefined
    }
}

export const requestMgr = RequestMgr.getInstance()
