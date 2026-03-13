# Linea 项目说明

Linea 是一个基于 `pnpm workspace` 的前端工具仓库，当前主要包含：

- `apps/docs`：文档站点（VitePress）
- `packages/*`：业务与工具包（如 `@ccpc/math`）

## 环境要求

- Node.js（建议使用 LTS）
- pnpm（workspace 管理）

## 安装依赖

```bash
pnpm install
```

## 启动开发

文档站点：

```bash
pnpm dev:docs
```

## 构建与预览

文档站点构建：

```bash
pnpm build:docs
```

文档站点预览：

```bash
pnpm preview:docs
```

## 代码检查

```bash
pnpm lint
pnpm lint:fix
```
