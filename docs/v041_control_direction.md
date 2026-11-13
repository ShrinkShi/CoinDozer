# v0.4.1 控制方向问题诊断与验收

## 根因

在 v0.4 中，`Simulation.update()` 使用 `forward=(sin(yaw), -cos(yaw))`，但 `renderVehicle()` 的局部网格变换和 `renderer.compose()` 把铲斗朝向旋转到了 `(-sin(yaw), -cos(yaw))`。因此绕 Y 轴偏航后，车体前部与物理行驶方向相反。履带印记也使用了相反的旋转约定。

同时，旧版本急转弯时独立推进速度会立即提高，在摇杆反向时车辆仍沿旧朝向行驶，造成初段反向位移。

## 修复

- 统一 `headingBasis`：`forward=(sin(yaw), -cos(yaw))`；`right=(cos(yaw), sin(yaw))`。
- 车体的局部 `-Z` 对齐物理前方；渲染器的偏航角为 `-yaw`，铲斗下缘的位置变换与 `GranularSolver` 一致。
- 轨迹随统一方位旋转；摇杆输入从屏幕水平/垂直向量转换到固定镜头世界平面。
- 急转弯先减速并原地对准，再沿请求方向移动；保留平滑转向，但阻止朝摇杆反方向滑行。

## 自动化验收

`node tests/v041_controls.mjs`：四个方位同时验证铲斗下缘位置、渲染朝向、铲斗推动方向和履带纹理；四向摇杆各跑 70 帧，断言每一帧的位移在请求方向上的投影不小于零，并且最终有显著正位移。

`xvfb-run -a python tests/v041_browser.py`：真实 PointerEvent 操作四个摇杆方向并验证投影。`tests/smoke.py` 与 `tests/v04_browser.py` 继续通过。

**待真机验证**：安卓设备低帧率情况下的摇杆控制手感、车体转向速度；本测试不能代替手机手动验收。
