# Core 事务框架（骨架版）

## IRequest

```ts
interface IRequest {
  type: string;
  mergeKey?: string;

  // 执行业务动作（可能触发 create/delete/属性修改）
  execute(doc: Document): void;
}
```

## UndoRedoEntity

```ts
type TModifiedProp = {
  propertyName: string;
  oldValue: unknown;
  newValue: unknown;
};

class UndoRedoEntity {
  // 新增元素集合
  added: Set<Element>;

  // 删除元素集合
  deleted: Set<Element>;

  // 发生过修改的元素集合
  modified: Set<Element>;

  // 每个元素对应的属性修改列表
  modifiedProps: Map<number, TModifiedProp[]>;

  // 记录新增
  recordAdded(ele: Element): void;

  // 记录删除
  recordDeleted(ele: Element): void;

  // 记录属性修改
  recordModified(ele: Element): void;
}
```

## ITransactionNode

```ts
interface ITransactionNode {}
```

## Transaction

```ts
class Transaction implements ITransactionNode {
  // 一次原子事务的变更实体
  readonly entity: UndoRedoEntity;

  // request 类型标识
  requestType: string;

  // 合并键（用于连续事务合并）
  mergeKey?: string;
}
```

## TransactionGroup

```ts
class TransactionGroup implements ITransactionNode {
  // 当前可回滚单元栈（Transaction / TransactionGroup）
  readonly undoStack: ITransactionNode[];

  // 当前可重做单元栈（Transaction / TransactionGroup）
  readonly redoStack: ITransactionNode[];

  // 父事务组（用于嵌套）
  parent?: TransactionGroup;

  // 组级回滚（支持子组下钻）
  undo(doc: Document): void;

  // 组级重做（支持子组下钻）
  redo(doc: Document): void;
}
```

## TransactionManager

```ts
class TransactionManager {
  // 文档顶级事务组（唯一根）
  readonly rootNode: TransactionGroup;

  // 执行一个 request，并写入当前事务组
  runRequest(req: IRequest, doc: Document): void;

  // 全局 undo（从 rootNode 驱动）
  undo(doc: Document): void;

  // 全局 redo（从 rootNode 驱动）
  redo(doc: Document): void;

  // 元素新增事件上报
  onElementCreated(ele: Element): void;

  // 元素删除事件上报
  onElementDeleted(ele: Element): void;

  // 元素属性修改事件上报
  onElementModified(ele: Element): void;

  // 获取当前 request 对应事务（用于记账）
  private getCurrentTransaction(): Transaction | undefined;
}
```

## 关系（一句话）

`IRequest` 触发动作，`TransactionManager` 负责调度与记账，变更落入 `Transaction.entity`，多个事务由 `TransactionGroup` 组织，并由 `rootNode` 统一执行 `undo/redo`。
