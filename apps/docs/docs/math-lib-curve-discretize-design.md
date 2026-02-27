# 曲线离散设计（实现概括）

## 1. 离散参数

当前统一参数类：`DiscretizeOptions`

1. `chordTol`：弦高容差（控制折线逼近误差）
2. `angleTolRad`：角度容差（控制相邻段转角）
3. `maxSegments`：最大分段数（防止无限细分）

预设参数：

1. `DiscretizeOptions.low`
2. `DiscretizeOptions.medium`
3. `DiscretizeOptions.high`

---

## 2. 写了哪些类

离散模块核心类：

1. `DiscretizeEngine`：统一离散入口与主流程
2. `DiscretizeOptions`：离散参数对象

依赖的曲线类（当前支持）：

1. `Line2`
2. `Circle2`
3. `Arc2`
4. `Ellipse2`
5. `EllipseArc2`
6. `BSpline2`

---

## 3. 具体离散算法（概括）

1. `Line2`：
直接取起点和终点；若退化则返回单点。

2. `Circle2 / Arc2`：
解析法按角步长均匀采样。角步长由 `chordTol + angleTolRad` 共同约束，结果受 `maxSegments` 限制。

3. `Ellipse2 / EllipseArc2`：
自适应细分。按弦高偏差和切向转角判断是否继续二分，直到满足容差或达到 `maxSegments`。

4. `BSpline2`：
先按连续性断点做初始分段，再做自适应细分（与椭圆同一套细分判定逻辑）。

5. 后处理：
相邻点去重、修正起终点、闭合曲线去掉重复尾点，最终输出 `Vec2[]`。
