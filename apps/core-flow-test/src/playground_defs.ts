export type ShapeKind = 'line' | 'polyline' | 'rectLine' | 'circle' | 'arc' | 'ellipse' | 'ellipseArc' | 'bspline'

export type ToolId = ShapeKind | 'polygon' | 'demo' | 'styleDemo' | 'clear'

export type CursorPoint = {
    x: number
    y: number
}

export type DrawingState = {
    activeTool: ShapeKind | null
    title: string
    detail: string
    steps: string[]
    fixedPoints: number
}

export type PlaygroundState = {
    cursorWorld: CursorPoint | null
    drawing: DrawingState
    toast: string
}

export const toolMeta: Record<ToolId, { label: string, accent: string, subtitle: string }> = {
    polyline: { label: '绘制折线', accent: '#22c55e', subtitle: '依次拾取多个折线点' },
    rectLine: { label: '绘制矩形', accent: '#f59e0b', subtitle: '通过两个角点生成矩形' },
    line: { label: '绘制直线', accent: '#38bdf8', subtitle: '两点定义线段' },
    circle: { label: '绘制圆', accent: '#60a5fa', subtitle: '圆心加半径点' },
    arc: { label: '绘制圆弧', accent: '#fb923c', subtitle: '三点定义圆弧' },
    ellipse: { label: '绘制椭圆', accent: '#34d399', subtitle: '中心加长短轴点' },
    ellipseArc: { label: '绘制椭圆弧', accent: '#4ade80', subtitle: '五点拟合椭圆弧' },
    bspline: { label: '绘制 B 样条', accent: '#f472b6', subtitle: '四点控制点样条' },
    polygon: { label: '插入轮廓', accent: '#a78bfa', subtitle: '插入随机测试轮廓' },
    demo: { label: '加载图框', accent: '#fbbf24', subtitle: '显示工程图图框与投影视图' },
    styleDemo: { label: '样式测试', accent: '#22d3ee', subtitle: '验证 style 机制链路' },
    clear: { label: '清空画布', accent: '#f87171', subtitle: '删除当前测试图形' },
}
