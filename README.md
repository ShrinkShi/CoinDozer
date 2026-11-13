# CoinDozer · 铲斗矿场

**v0.5.1**，纯前端游戏。在线试玩：https://shrinkshi.github.io/CoinDozer/

## v0.5.1

- 双向倍数门：×2、×3、×5、×10 从两个方向穿过都有效，离开门区再折返可重复增殖；短暂的时间和距离锁阻止抖动无限刷物体。
- 粉碎机：1 颗矿石转换为 3 枚独立金币，达到实体限制时拒绝不完整转换。
- 高光：门中新生成的额外物体先在 0.07 秒内迅速变白，再经约 1.25 秒缓慢恢复原色。
- 升级：四档成本降为 30、90、240、600 金币；旧存档已缴纳但未完成升级的金币自动结转。
- 保留 6500 个独立实物上限（不聚合）、手机版双指缩放、电脑版滚轮缩放及 v0.4.1 方向修复。

## 运行与部署

`dist/index.html` 可直接离线打开，`python -m http.server 8000` 可运行开发目录。
`python build.py` 将全部代码打包成静态 HTML。推送 main 后 GitHub Pages Actions 自动部署 dist，不需要 VPS。

操作：手机单指摇杆移动，双指缩放；电脑 WASD/方向键移动，滚轮缩放；P/Esc 暂停。
玩法：矿石过门→粉碎轮 1→3 金币→金币推入升级站逐枚缴纳→车辆升级。

## 测试

```bash
python build.py
node tests/v051_mechanics.mjs
node tests/v05_mechanics.mjs
node tests/v041_controls.mjs
xvfb-run -a python tests/smoke.py
xvfb-run -a python tests/v05_browser.py
```

该作品是原创程序化模型的广告玩法模拟，不包含商业游戏资源。物体逐个独立可见，但使用局部近似颗粒碰撞；仍非广告的近像素级视觉还原。
