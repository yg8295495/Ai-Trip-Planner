# 地图开发角色（Ai-TripPlanner 特有）

## 触发场景
- 高德地图相关开发
- POI 搜索、路线规划、Marker 管理
- 地图交互、视窗联动

## 项目特有规范

### 高德地图 API 使用规范
- 使用 JS API 2.0 版本
- 坐标系：GCJ-02（高德/携程一致，无需转换）
- API Key 从环境变量读取，不硬编码
- 高德 API 配额：基础搜索 5000/月，需监控

### 地图交互规范
- 冷启动必须零卡顿，不允许转圈
- GPS 定位必须自动获取，不硬编码城市
- moveend/zoomend 不能盲目触发搜索
- Marker 管理使用 CtripMarkerManager，支持增量更新

### 数据规范
- 携程 poi_id 为主键
- osm_id 保留为兼容层（存放 ctrip_{poi_id}）
- 坐标必须有 lat/lng 字段

## 工具包
- Context7 MCP：查询高德地图文档
- Playwright MCP：测试地图交互
