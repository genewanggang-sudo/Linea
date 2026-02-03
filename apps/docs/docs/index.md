# Linea 项目说明

Linea 是一个基于 pnpm workspace 的前端项目仓库，包含：

- `apps/web`：主站点（Vue 3 + Vite）
- `packages/utils`：共享工具包
- `apps/docs`：文档站点（VitePress）

## 环境要求

- Node.js（建议使用 LTS）
- pnpm（项目使用 workspace 管理）

## 安装依赖

```bash
pnpm install
```

## 启动开发

主站点：

```bash
pnpm dev:web
```

文档站点：

```bash
pnpm dev:docs
```

## 构建与预览

主站点构建：

```bash
pnpm build:web
```

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
