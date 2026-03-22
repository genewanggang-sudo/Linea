# 当前项目默认样式机制

目标：说明当前项目里“默认样式”是怎么组织的，以及如果迁到 `Linea`，最小应该保留哪些层。

## 1. 默认样式放在哪

当前项目默认样式不是只放在一个地方，而是分成两层：

1. 基础默认样式
2. 交互状态样式

对应文件：

- `packages/core/src/grep/i_style.ts`
- `packages/core/src/grep/default_style.ts`

## 2. 基础默认样式

文件：`packages/core/src/grep/i_style.ts`

这里定义了样式接口和基础默认值。

### 2.1 样式类型

主要有这些类型：

- `ITextStyle`
- `IPointStyle`
- `ILineStyle`
- `IFaceStyle`
- `IAssetStyle`
- `IStyle`

其中 `IStyle` 是总入口：

```ts
export interface IStyle {
    point?: IPointStyle;
    line?: ILineStyle;
    face?: IFaceStyle;
    text?: ITextStyle;
    asset?: IAssetStyle;
}
```

### 2.2 基础默认值

同文件里有一组默认配置：

```ts
const commonStyleConfig = {
    default_style_opacity: 1,
    default_style_text_size: 16 / 50,
    default_style_text_color: 0x000000,
    default_style_point_size: 8,
    default_style_point_color: 0x000000,
    default_style_line_width: 1,
    default_style_line_color: 0x000000,
    default_style_face_color: 0xffffff,
    default_style_face_texture: '',
    default_style_dashed_line_dash_size: 3,
    default_style_dashed_line_gap_size: 1,
};
```

这些值就是编辑器“平时默认长什么样”的基础来源。

### 2.3 默认值补全函数

当前项目不会要求每个 `GNode` 都把所有样式字段写满，而是提供一组补全函数：

- `getTextStyle(...)`
- `getPointStyle(...)`
- `getLineStyle(...)`
- `getFaceStyle(...)`

作用是：

- 输入一个可能不完整的 `IStyle`
- 输出一个字段补齐后的 style

例如线样式会自动补：

- `opacity`
- `color`
- `width`
- `dotted`
- `dashSize`
- `gapSize`

所以渲染层不需要处理一堆 `undefined` 分支。

## 3. 交互状态样式

文件：`packages/core/src/grep/default_style.ts`

这里放的是编辑器交互态的样式，比如：

- 激活态
- 选中态

例如：

```ts
export const defaultActiveStyle: IStyle = {
    line: { color: 0x1bfff1 },
    face: { color: 0xc0d1ff }
};

export const defaultSelectionStyle: IStyle = {
    line: { color: 0x1bfff1 },
    face: { color: 0x5f91ff }
};
```

这层样式不负责“默认长相”，而负责“状态变化时长相”。

## 4. 样式挂在哪一层

文件：`packages/core/src/grep/gnode.ts`

`GNode` 自己持有 `_style`，并提供：

- `setStyle(style: IStyle)`
- `getStyle()`

核心设计是：

- `setStyle()` 只设置本地样式
- `getStyle()` 返回最终样式
- 最终样式会把父节点样式和当前节点样式合并

当前项目里的实现要点：

```ts
public setStyle(style: IStyle): this {
    Object.assign(this._style, style);
    return this;
}

public getStyle(): IStyle {
    const style = this._style;
    const pStyle = this.parent ? this.parent.getStyle() : {};
    return Object.assign(pStyle, style);
}
```

所以当前项目默认支持：

- 局部样式覆盖
- 父子样式继承

## 5. 样式怎么传到渲染层

在当前项目里，样式链路是：

`GNode._style -> GNode.getStyle() -> RenderNode.style -> RenderHub 根据 style 创建材质`

渲染层消费位置主要在：

- `packages/canvas/src/render/hub.ts`

例如：

- 线读 `rNode.style.line`
- 点读 `rNode.style.point`
- 面读 `rNode.style.face`

然后分别创建：

- `LineMaterial`
- `PointsMaterial`
- `MeshBasicMaterial / MeshPhongMaterial`

这意味着样式系统不是渲染层独占的，而是从 grep/core 层往下传。

## 6. 为什么这样分层

这套设计的好处是：

- 默认值集中管理
- 交互状态样式单独管理
- `GNode` 持有业务样式，不让渲染层反向控制业务对象
- 渲染层只负责“消费最终 style”

所以它的职责边界比较清楚：

- `core/grep` 决定对象应该长什么样
- `canvas/render` 负责把这个样子画出来

## 7. 迁到 `Linea` 时，最小保留什么

如果你要把这套机制最小迁到 `Linea`，建议只保留这四层：

1. 最小 `IStyle`
2. 最小默认值
3. `GNode.setStyle/getStyle`
4. `RenderHub` 按 `RenderNode.style` 创建材质

最小阶段先不要做：

- 完整父子继承的复杂规则
- active/selection/highlight 三套状态样式叠加
- bucket hash / material cache
- 复杂贴图、asset、pattern、gradient

## 8. 对 `Linea` 的最小建议

对于 `Linea`，最小样式体系建议只保留：

- `point`
- `line`
- `face`
- `text`

并且先只支持这些字段：

- `color`
- `size`
- `width`
- `opacity`
- `dashed`

也就是：

- 点：颜色、大小、透明度
- 线：颜色、宽度、透明度、虚线
- 面：颜色、透明度
- 文本：颜色、字号、透明度

这已经足够跑通最小样式链路。

## 9. 一句话总结

当前项目的默认样式机制本质上是：

- 在 `core/grep` 层定义样式类型和默认值
- 在 `GNode` 层持有和合并样式
- 在渲染层消费最终样式
- 状态样式单独补充，不和基础默认值混在一起

如果迁到 `Linea`，最小只要先把“基础默认样式 + GNode持有样式 + RenderHub消费样式”这条链跑通即可。
