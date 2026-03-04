# Linea 项目说明

Linea 是一个基于 `pnpm workspace` 的前端/工具仓库，当前主要包含：
- `apps/docs`：文档站点（VitePress）
- `apps/math-visual-test`：数学库可视化测试应用（Vue + Vite）
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

数学可视化测试：
```bash
pnpm dev:math-viz
```

## 构建与预览
文档站点构建：
```bash
pnpm build:docs
```

数学可视化测试构建：
```bash
pnpm build:math-viz
```

文档站点预览：
```bash
pnpm preview:docs
```

数学可视化测试预览：
```bash
pnpm preview:math-viz
```

## 代码检查
```bash
pnpm lint
pnpm lint:fix
```
