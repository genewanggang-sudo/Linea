# core

Core data model layer for editor domain objects.

## Element 字段约定

`Element` 类字段使用以下命名规则：

- `_xx`：不保存，不走事务
- `C_xx`：不保存，走事务
- 其它：保存并走事务
