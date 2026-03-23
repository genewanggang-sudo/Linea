# 当前项目默认样式机制与迁移到 Linea 的最小落地方案

目标：说明当前项目里“默认样式”是怎么组织的，以及如果迁到 `Linea`，最小应该保留哪些层、按什么顺序落地。

## 1. 当前项目默认样式放在哪

当前项目的默认样式不是只放在一个地方，而是分成两层：

1. 基础默认样式
2. 交互状态样式

对应文件：

- `packages/core/src/grep/i_style.ts`
- `packages/core/src/grep/default_style.ts`

## 2. 基础默认样式

文件：`packages/core/src/grep/i_style.ts`

作用：定义样式类型，以及“普通状态下”的基础默认值。

### 2.1 样式类型

当前项目的样式总入口是：

```ts
export interface IStyle {
    point?: IPointStyle;
    line?: ILineStyle;
    face?: IFaceStyle;
    text?: ITextStyle;
    asset?: IAssetStyle;
}
```

它下面主要拆成这些子类型：

- `ITextStyle`
- `IPointStyle`
- `ILineStyle`
- `IFaceStyle`
- `IAssetStyle`

也就是说，样式是按几何类别组织的，而不是所有属性都堆在一个对象里。

### 2.2 基础默认值

同文件里有一组公共默认配置，例如：

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

这些值定义了“对象在普通情况下应该长什么样”。

### 2.3 默认值补全函数

当前项目不会要求每个 `GNode` 把样式字段都写满，而是提供补全函数，比如：

- `getTextStyle(...)`
- `getPointStyle(...)`
- `getLineStyle(...)`
- `getFaceStyle(...)`

它们的作用是：

- 输入一个可能不完整的 style
- 输出一个字段补齐后的 style

例如线样式最终能被补齐为：

- `opacity`
- `color`
- `width`
- `dotted`
- `dashSize`
- `gapSize`

这样渲染层就不用到处判空。

## 3. 交互状态样式

文件：`packages/core/src/grep/default_style.ts`

作用：专门管理交互状态，不负责普通默认长相。

典型内容是：

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

这层样式的职责是：

- 激活态长什么样
- 选中态长什么样

所以要把它和基础默认值分开理解：

- `i_style.ts` 解决“平时长什么样”
- `default_style.ts` 解决“状态变化时长什么样”

## 4. 样式挂在哪一层

文件：`packages/core/src/grep/gnode.ts`

当前项目里，样式不是挂在渲染器上，而是挂在 `GNode` 上。

核心接口是：

- `setStyle(style: IStyle)`
- `getStyle()`

核心设计是：

- `setStyle()` 设置当前节点自己的样式
- `getStyle()` 返回最终样式
- 最终样式会把父节点样式和当前节点样式合并

实现大意类似：

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

这说明当前项目默认支持：

- 局部样式覆盖
- 父子样式继承

## 5. 样式怎么传到渲染层

当前项目的样式链路是：

`GNode._style`
-> `GNode.getStyle()`
-> `RenderNode.style`
-> `RenderHub` / render 层根据 `style` 创建材质

渲染层消费位置主要在：

- `packages/canvas/src/render/hub.ts`

消费方式通常是：

- 线读取 `rNode.style.line`
- 点读取 `rNode.style.point`
- 面读取 `rNode.style.face`
- 文字读取 `rNode.style.text`

然后分别创建：

- `LineMaterial`
- `PointsMaterial`
- `MeshBasicMaterial / MeshPhongMaterial`
- Text 材质

这意味着样式系统是从 `core/grep` 往下传的，不是渲染层自己反向决定业务对象长什么样。

## 6. 为什么这样分层

这套设计的优点是职责边界清楚：

- `core/grep` 决定对象应该长什么样
- `canvas/render` 负责把这个样子画出来
- 交互状态样式单独管理
- 渲染层只消费“最终样式”，不用参与业务规则

所以它不是“渲染器主导样式”，而是“模型主导样式”。

## 7. 迁到 Linea 时，最小应该保留什么

如果把这套机制迁到 `Linea`，最小建议只保留这四层：

1. 最小 `IStyle`
2. 最小默认值
3. `GNode.setStyle/getStyle`
4. `RenderHub` 按 `RenderNode.style` 创建材质

最小阶段先不要做：

- 完整父子继承规则
- active/selection/highlight 多套状态样式叠加
- bucket hash / material cache
- asset / texture / pattern / gradient
- 复杂默认值补全工具

## 8. 对 Linea 的最小保留建议

对于 `Linea`，建议只保留下面 4 类样式：

- `point`
- `line`
- `face`
- `text`

建议先支持这些字段：

- `color`
- `size`
- `width`
- `opacity`
- `dashed`

也就是：

- 点：`color / size / opacity`
- 线：`color / width / opacity / dashed`
- 面：`color / opacity`
- 文本：`color / fontSize / opacity`

这已经足够跑通最小样式链路。

## 9. Linea 的可执行落地步骤

下面这部分是直接可以照着做的。

### 步骤 1：定义最小样式协议

文件：`packages/core/src/grep/i_style.ts`

作用：给 `GNode` 和 `RenderNode` 一个统一样式结构。

建议内容：

```ts
export interface IPointStyle {
    color?: number;
    size?: number;
    opacity?: number;
}

export interface ILineStyle {
    color?: number;
    width?: number;
    opacity?: number;
    dashed?: boolean;
}

export interface IFaceStyle {
    color?: number;
    opacity?: number;
}

export interface ITextStyle {
    color?: number;
    fontSize?: number;
    opacity?: number;
}

export interface IStyle {
    point?: IPointStyle;
    line?: ILineStyle;
    face?: IFaceStyle;
    text?: ITextStyle;
}
```

完成标准：全项目后续只引用这一份 `IStyle`。

### 步骤 2：给 `GNode` 增加样式存储和接口

文件：`packages/core/src/grep/gnode.ts`

作用：让每个图形节点都能挂样式。

建议实现：

```ts
protected _style: IStyle = {};

public setStyle(style: IStyle): this {
    Object.assign(this._style, style);
    return this;
}

public getStyle(): IStyle {
    return this._style;
}
```

说明：第一版先不要做父子继承，先保证最小链路跑通。

完成标准：你能对任意 `GNode` 调：

```ts
gnode.setStyle({ line: { color: 0xff0000, width: 2 } });
```

### 步骤 3：给 `RenderNode` 增加 `style`

文件：`packages/core/src/render/render_node.ts`

作用：让样式能从几何层流向渲染层。

建议实现：

```ts
public style: IStyle = {};
```

完成标准：任意 `RenderNode` 都有 `style` 字段。

### 步骤 4：在 `GNode -> RenderNode` 时透传样式

文件：

- `packages/core/src/grep/gpoint2d.ts`
- `packages/core/src/grep/gcurve2d.ts`
- `packages/core/src/grep/gpolycurve.ts`
- `packages/core/src/grep/gpolygon.ts`
- `packages/core/src/grep/gtext2d.ts`

作用：把 `GNode` 上的样式带给 `RenderNode`。

示例：

```ts
const render = new RenderEdge();
render.style = this.getStyle();
return render;
```

完成标准：在 `RenderHub` 里能拿到 `rNode.style`。

### 步骤 5：`RenderHub` 按样式创建材质

文件：`packages/canvas/src/render/render_hub.ts`

作用：让样式真正影响渲染结果。

#### 5.1 点

```ts
const pointStyle = rNode.style.point || {};
new PointsMaterial({
    color: pointStyle.color ?? 0xffffff,
    size: pointStyle.size ?? 6,
    transparent: true,
    opacity: pointStyle.opacity ?? 1,
});
```

#### 5.2 线

```ts
const lineStyle = rNode.style.line || {};
new LineMaterial({
    color: lineStyle.color ?? 0xffffff,
    linewidth: lineStyle.width ?? 2,
    transparent: true,
    opacity: lineStyle.opacity ?? 1,
    dashed: lineStyle.dashed ?? false,
});
```

#### 5.3 面

```ts
const faceStyle = rNode.style.face || {};
new MeshBasicMaterial({
    color: faceStyle.color ?? 0xcccccc,
    transparent: true,
    opacity: faceStyle.opacity ?? 1,
});
```

#### 5.4 文字

```ts
const textStyle = rNode.style.text || {};
text.color = textStyle.color ?? 0xffffff;
text.fontSize = textStyle.fontSize ?? 16;
```

完成标准：渲染层已经真正消费样式。

### 步骤 6：先验证线样式

建议对象：`LineElement`

作用：用最短链路确认方案可用。

测试方式：手动给 `GCurve2d` 设样式：

```ts
gcurve.setStyle({
    line: {
        color: 0xff0000,
        width: 4,
    },
});
```

完成标准：线条颜色、宽度有变化。

### 步骤 7：再验证点、面、文字

作用：确认不是“线条特例”，而是整套链路通了。

示例：

```ts
gpoint.setStyle({
    point: { color: 0x00ff00, size: 10 }
});

gpolygon.setStyle({
    face: { color: 0x3366ff, opacity: 0.8 }
});

gtext.setStyle({
    text: { color: 0xffff00, fontSize: 24 }
});
```

完成标准：

- 点大小、颜色变化
- 面颜色变化
- 字颜色、字号变化

## 10. 这轮不要做什么

为了保证落地，不要在第一轮做下面这些：

- 父子样式继承
- `default_style.ts` 完整迁移
- `active/selection/highlight` 样式
- asset 贴图样式
- 样式深合并工具
- 材质缓存
- pattern / gradient / texture

## 11. 一句话总结

当前项目的默认样式机制本质上是：

- 在 `core/grep` 层定义样式类型和默认值
- 在 `GNode` 层持有样式
- 在渲染层消费最终样式
- 交互状态样式单独补充

迁到 `Linea` 时，最小只要先把这条链跑通即可：

`IStyle`
-> `GNode.setStyle/getStyle`
-> `RenderNode.style`
-> `RenderHub` 按样式渲染

这条链跑通之后，再补默认样式补全、状态样式和继承规则。
