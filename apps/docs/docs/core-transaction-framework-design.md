# Core 事务最小完整示例（按当前代码思想）

本文按你的方向重写：

1. 不再使用 `ModelChangeContext`。
2. `Request` 执行时可直接修改元素属性。
3. 元素新增/删除必须通过 `Document.create/delete`。
4. 事务相关细节全部由 `TransactionManager` 负责。
5. `UndoRedoEntity` 按你确认的结构记录增删改。

## 1. 最小执行链路

一次 request 的执行流程：

1. 调用 `Document.runRequest(req)`。
2. `Document` 将调用转发给 `TransactionManager.runRequest(req)`。
3. `TransactionManager` 创建 `TransactionRecorder`，并进入“当前事务执行窗口”。
4. 执行 `req.execute(doc)`。
5. request 中可以直接改属性；属性 setter 会上报到 `Document`，再转发给 `TransactionManager`。
6. request 中如果要增删元素，只能走 `doc.create/delete`，`Document` 在内部通知 `TransactionManager` 记账。
7. request 执行完后，`TransactionManager` 结束 recorder，生成 `Transaction`。
8. `Transaction` 进入 `TransactionManager` 内部的当前事务组。
9. 根事务组提交后，才进入 `HistoryManager`。

## 2. 类职责（精简版）

1. `Request`
- 职责：表达业务动作。
- 规则：`execute(doc)` 内可直接改属性；增删必须调用 `doc.create/delete`。

2. `Document`
- 职责：模型入口 + 事务 API 转发层。
- 做的事：
- 对外暴露 `runRequest/beginGroup/commitGroup/rollbackGroup/undo/redo`。
- 内部全部转发给 `TransactionManager`。
- 维持 `create/delete` 作为唯一元素增删入口，并通知 `TransactionManager` 记账。

3. `TransactionManager`
- 职责：事务总控。
- 做的事：
- 管理 `TransactionRecorder` 生命周期。
- 管理事务组栈（`groupStack`）。
- 管理已提交历史（`HistoryManager`）。
- 执行事务合并、提交、回滚、`undo/redo`。

4. `TransactionRecorder`
- 职责：收集“本次 request 的增删改”。
- 来源：
- 属性修改来自 setter 上报。
- create/delete 来自 `Document.create/delete` 回调。

5. `Transaction`
- 职责：一次原子操作，内部持有一个 `UndoRedoEntity`。

6. `UndoRedoEntity`
- 职责：承载增删改数据。
- 说明：名字虽然叫 Entity，但它表示“一次事务的变更集合”，不是单个元素实例。

7. `TransactionGroup`
- 职责：运行中事务容器，用于嵌套（主环境/子环境）与合并。

8. `HistoryManager`
- 职责：管理“已提交历史”（`past/future`），提供 `undo/redo`。

## 3. 为什么既要 history 又要 groupStack

两者处理的是不同阶段的数据。

1. `groupStack`：运行中（未最终提交）
- 用于主环境/子环境嵌套。
- 子环境提交时先并入父组，不直接入历史。
- 子环境回滚时可整组丢弃。

2. `HistoryManager`：已提交（可撤销/重做）
- 只接收根事务组最终提交的结果。
- 不关心“当前是否在子环境里编辑”。

可以理解为：
- `groupStack` 是暂存区（staging）。
- `HistoryManager` 是历史区（committed）。

## 4. UndoRedoEntity 数据结构（按当前确认）

```ts
type T_ModifiedProps = {
  propertyName: string;
  oldValue: unknown;
  newValue: unknown;
};

class UndoRedoEntity {
  private readonly _added = new Set<Element>();
  private readonly _deleted = new Set<Element>();
  private readonly _modified = new Set<Element>();
  private readonly _modifiedProperties: Map<number, T_ModifiedProps[]> = new Map();

  public recordAdded(ele: Element) {
    this._added.add(ele);
  }

  public recordDeleted(ele: Element) {
    this._deleted.add(ele);
  }

  public recordModified(ele: Element) {
    this._modified.add(ele);
    this._modifiedProperties.set(ele.id.asInt(), ele.getModified());
  }
}
```

说明：

1. 删除时只是从 `ElementMgr` 移除，元素对象仍可保留在 `_deleted` 中用于回滚。
2. 修改属性由 `ele.getModified()` 提供，能拿到“哪个属性、旧值、新值”。
3. 事务结束前不要销毁被删元素实例，否则会影响回滚。

## 5. 最小接口

```ts
interface IRequest {
  type: string;
  mergeKey?: string;
  execute(doc: Document): void;
}

class Transaction {
  entity = new UndoRedoEntity();
}
```

## 6. Document 与 TransactionManager 最小伪代码

```ts
class Document {
  private readonly transactionManager = new TransactionManager(this);

  runRequest(req: IRequest, opts?: { merge?: boolean }) {
    this.transactionManager.runRequest(req, opts);
  }

  beginGroup(label: string) {
    this.transactionManager.beginGroup(label);
  }

  commitGroup() {
    this.transactionManager.commitGroup();
  }

  rollbackGroup() {
    this.transactionManager.rollbackGroup();
  }

  undo() {
    return this.transactionManager.undo();
  }

  redo() {
    return this.transactionManager.redo();
  }

  create<T extends IElement>(ctor: IElementCtor<T>): T {
    const ele = this.createInternal(ctor);
    this.transactionManager.onElementCreated(ele);
    return ele;
  }

  delete(id: ElementId | number): void {
    const ele = this.getElementById(id);
    if (!ele) return;
    this.transactionManager.onElementDeleted(ele);
    this.deleteInternal(id);
  }

  onElementPropChanged(ele: IElement, prop: string, before: unknown, after: unknown) {
    this.transactionManager.onElementPropChanged(ele, prop, before, after);
  }
}
```

```ts
class TransactionManager {
  private readonly history = new HistoryManager();
  private readonly groupStack: TransactionGroup[] = [];
  private currentRecorder?: TransactionRecorder;

  constructor(private readonly doc: Document) {}

  runRequest(req: IRequest, opts?: { merge?: boolean }) {
    const group = this.getCurrentGroupOrCreateRoot();

    this.currentRecorder = new TransactionRecorder(this.doc);
    req.execute(this.doc);
    const tx = this.currentRecorder.finish();
    this.currentRecorder = undefined;

    this.commitTouchedElements(tx.entity);
    group.push(tx, opts);
  }

  onElementCreated(ele: IElement) {
    this.currentRecorder?.recordCreated(ele);
  }

  onElementDeleted(ele: IElement) {
    this.currentRecorder?.recordDeleted(ele);
  }

  onElementPropChanged(ele: IElement, prop: string, before: unknown, after: unknown) {
    this.currentRecorder?.recordUpdated(ele, prop, before, after);
  }

  beginGroup(label: string) { this.groupStack.push(new TransactionGroup(label)); }

  commitGroup() {
    const g = this.groupStack.pop();
    if (!g) return;

    const parent = this.groupStack[this.groupStack.length - 1];
    if (parent) {
      parent.mergeFrom(g);
    } else {
      this.history.push(g);
    }
  }

  rollbackGroup() {
    const g = this.groupStack.pop();
    if (!g) return;
    this.rollbackGroupChanges(g);
  }

  undo() {
    const g = this.history.undo();
    if (!g) return false;
    this.applyGroupBackward(g);
    return true;
  }

  redo() {
    const g = this.history.redo();
    if (!g) return false;
    this.applyGroupForward(g);
    return true;
  }
}
```

## 7. Element setter 如何上报更新

你当前有 `element_decorator.ts` 的属性拦截逻辑。建议在 setter 中补一条上报：

```ts
set(value) {
  const before = this.cache[propName] ?? this.db[propName];

  if (!this.isTemporary()) {
    this.cache[propName] = value;
  } else {
    this.db[propName] = value;
  }

  const after = this.cache[propName] ?? this.db[propName];
  const doc = this.getDoc();
  doc?.onElementPropChanged(this, propName, before, after);
}
```

这样 request 直接写属性时，事务仍然能自动采集 `modified`。

## 8. Request 示例（直接用 doc）

```ts
class CreateRectRequest implements IRequest {
  type = 'create-rect';

  execute(doc: Document): void {
    const rect = doc.create(RectElement);
    rect.name = 'R1';
    rect.x = 10;
    rect.y = 20;
  }
}

class MoveRectRequest implements IRequest {
  type = 'move-rect';
  mergeKey: string;

  constructor(private id: number, private dx: number, private dy: number, gid: string) {
    this.mergeKey = `drag:${gid}:${id}`;
  }

  execute(doc: Document): void {
    const rect = doc.getElementById<RectElement>(this.id);
    if (!rect) return;
    rect.x += this.dx;
    rect.y += this.dy;
  }
}

class DeleteRectRequest implements IRequest {
  type = 'delete-rect';
  constructor(private id: number) {}

  execute(doc: Document): void {
    doc.delete(this.id);
  }
}
```

## 9. 嵌套事务组示例

```ts
const doc = new Document();

doc.beginGroup('main');
doc.runRequest(new CreateRectRequest());

doc.beginGroup('sub');
doc.runRequest(new MoveRectRequest(1, 5, 0, 'g1'));
doc.runRequest(new MoveRectRequest(1, 5, 0, 'g1'));
doc.commitGroup(); // sub -> 并入 main，不进 history

doc.commitGroup(); // main -> 进入 history

doc.undo();
doc.redo();
```

## 10. 最小不变量

1. 所有 create/delete 只能走 `Document.create/delete`。
2. 所有属性修改必须在 `runRequest` 的执行窗口内发生。
3. setter 上报的改动只能写入当前 `TransactionManager.currentRecorder`。
4. 未提交事务组不能进入 `HistoryManager`。
5. `undo/redo` 以事务组为粒度。
6. 被删除元素在事务结束前必须可被事务访问（用于回滚）。
