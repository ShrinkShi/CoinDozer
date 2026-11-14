# v0.6.3.1 代码审查修复说明

依据：用户提供的《[代码审查][v0.6.3] 物理触发准确性、图形恢复与工程可维护性问题汇总》。
这里只把由代码可确定的问题标记为已修复；风险不等于已经发生的故障。

## 问题对照

| 审查项 | 本次处理 | 边界 |
| --- | --- | --- |
| #1 低速倍数门漏判 | 移除 0.02 最小位移门槛，按轨迹跨越平面判断，保留解锁时间与离门距离逻辑 | 近零抖动仍不允许连续倍增 |
| #2 站台支付 | `World` 定义真实 X/Z/底部 Y 范围，仅在金币从外部进入且车在旁边时扣币；移走初始第 4 门站台重叠币 | 站台不模拟完整 3D 刚体；从上方落入并真实接触台面时可计费 |
| #3 回收带 | 几何及 `trigger` 参数同源，增加底部高度约束 | 半透明或视觉边缘存在少量 2.5D 近似 |
| #4 WebGL 上下文 | 监听 contextlost（preventDefault）/contextrestored；停止模拟/绘制并尝试重建 Renderer GPU 资源 | 浏览器/设备是否实际允许恢复仍需真机试验；失败可刷新 |
| #5 构建校验 | 严格检查入口标签各匹配一次、输出残留依赖、模块残留语法，异常立即失败 | 模块仍采用手工有序拼接，不是通用打包器 |
| #6 数据面板滚动 | v0.6.3 已有 pointer-events:auto、touch-action:pan-y，本次维持 | 手机小屏仍需手动滚动验证 |
| #7 场景按钮 | 文案改为**切换后进入的目标场景** | 第二场景仍是预览 |
| #8 实体数 | UI 使用活体计数而非资源数组长度，死亡实体可待压缩 | 待创建队列不计入活体，提交后才计入 |

## 限定重构

- 增加 `src/triggers.js` 作为纯空间检测模块：`boxTrigger`、`insideTrigger`、`enteredTrigger`、`crossedGatePlane`。`World` 定义位置和可视几何，`Simulation` 决定扣费、销毁、事件发射。
- `Simulation.hasCapacity(count)` 统一粉碎/倍增预留，`markDead()` 管理同帧存活数回收，`countLiving()` 负责精确 HUD 口径。粉碎失败的矿石仍被推回、冷却且保持原属性，后续释放槽位才能完整生产三枚金币。
- 保留 2.5D 颗粒近似，不做物理引擎更换。
- 音频尝试从“进入矿场”手势启动。若浏览器不支持音频，游戏逻辑正常继续，允许无声运行。

## 暂不作为已确认故障的风险

- #9 边界穿模：需先提供可复现坐标/画面再针对性处理。
- #13 透明混合次序：需要实际重叠画面证据再决定是否加入排序，以免破坏现有批次行为。
- #14 首次音效兼容：加入手势解锁；部分移动浏览器仍需实测。
- #15 CI Action SHA 固定属于可选治理项，本次未更换现有 Action。

## 验收

```bash
node tests/v0631_triggers.mjs
python tests/v0631_build.py
node tests/v063_performance.mjs
node tests/v062_mechanics.mjs
node tests/v061_economy.mjs
node tests/v06_progression.mjs
node tests/v051_mechanics.mjs
node tests/v041_controls.mjs
python build.py
```

人工复验：慢速推矿双向过门、推金币从台外进入、抛物线从支付台上方经过、回收带上方飞行及落地；在 Chrome DevTools 或 `WEBGL_lose_context` 模拟失去/恢复上下文后确认镜头与升级状态保留。不得以自动化单元测试宣称移动端复现均通过。

## 构建约束

- 运行时：Python 3.10+（纯标准库）；Node.js 20+ 可运行现有 ESM 测试。
- 不使用 npm 包或第三方 CDN。模块顺序在 `build.py:MODULES` 明确维护；修改 import 类型或 HTML 入口格式时须同步更新构建契约与测试。
- `python build.py` 生成 `dist/index.html`，独立 HTML 应能经 `file://` 运行；GitHub Pages 的 CI 从源码重新构建。
