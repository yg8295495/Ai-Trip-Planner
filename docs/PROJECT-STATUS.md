# AI 自驾游规划器 — 项目状态 & 会话交接

> **📌 下一会话的 agent 必读**：新开会话第一件事就是读这个文件，里面有：
> - 当前架构（已废弃的旧设计勿要恢复）
> - 最近 5 个 commit 改了什么（知道现在在哪一步）
> - 已知的 bug 修复历史（避免重复踩坑）
> - 待办事项（按优先级）
> - 高德 API 配额状态

---

## 1. 当前架构（v2.3，2026-06-13）

```
┌─ ChatPanel 340px ─┬─ MapPanel flex-1 ─────┬─ ItineraryStrip 260px ─┬─ PoiDrawer 320px（抽屉）─┐
│ - 行程对话         │ - 高德地图            │ - 起/终点 chip（可点击  │ - 滑入覆盖地图右半     │
│ - 大模型推荐       │ - 起/终点 marker     │   聚焦地图）            │ - 自定义地点           │
│                   │ - 路线 polyline      │ - 旅行参数              │ - 候选 POI             │
│                   │ - POI marker         │ - 进入规划按钮          │ - 已选 POI 排序         │
│                   │ - 左上 4 策略（折叠） │ - 路线卡（4 维决策数据）│ - 天气（按城市）       │
│                   │                       │ - 4 策略切换器         │                          │
│                   │                       │ - 搜索/抽屉入口         │                          │
└────────────────────┴───────────────────────┴─────────────────────────┴──────────────────────────┘
```

**两阶段流程**（无 preview 卡顿）：
- stage 1 = input：起/终点 + 旅行参数
- stage 2 = confirmed：进入后默认策略 0（高速优先），4 策略可实时切换

---

## 2. 关键文件 & 职责

| 文件 | 职责 |
|------|------|
| [src/store/tripStore.ts](file:///Users/LiYuan/Documents/Ai-TripPlanner/src/store/tripStore.ts) | 全局状态：params / locations / routeInfo / currentStrategy / candidatePois / selectedPois / mapControls / poiDrawerOpen |
| [src/composables/useMap.ts](file:///Users/LiYuan/Documents/Ai-TripPlanner/src/composables/useMap.ts) | 高德地图封装：initMap / renderRouteByREST / panTo / setEndpointMarker / POI marker / 4 策略定义 |
| [src/components/MapPanel/MapPanel.vue](file:///Users/LiYuan/Documents/Ai-TripPlanner/src/components/MapPanel/MapPanel.vue) | 地图组件：watch origin/dest → panTo(zoom=10)；watch currentStrategy → 重算+重搜；左上 4 策略面板默认折叠 |
| [src/components/ItineraryStrip/ItineraryStrip.vue](file:///Users/LiYuan/Documents/Ai-TripPlanner/src/components/ItineraryStrip/ItineraryStrip.vue) | 260px 窄右栏：起终点输入 + 路线卡 + 4 策略切换器 + 搜索按钮 |
| [src/components/PoiDrawer/PoiDrawer.vue](file:///Users/LiYuan/Documents/Ai-TripPlanner/src/components/PoiDrawer/PoiDrawer.vue) | 320px 抽屉：自定义地点 + 候选 POI + 已选 POI + 天气 |
| [src/services/amapDistrict.ts](file:///Users/LiYuan/Documents/Ai-TripPlanner/src/services/amapDistrict.ts) | 行政区域预加载 + localStorage 缓存（v2 密钥）+ 客户端模糊匹配（替代输入提示 API） |
| [src/services/amapRegeo.ts](file:///Users/LiYuan/Documents/Ai-TripPlanner/src/services/amapRegeo.ts) | 逆地理编码（替代周边搜索 + 地图点击查 POI） |
| [src/services/amapGeolocation.ts](file:///Users/LiYuan/Documents/Ai-TripPlanner/src/services/amapGeolocation.ts) | AMap.Geolocation 插件（GPS + 电脑内置定位，替代 IP 定位） |
| [src/services/amapWeather.ts](file:///Users/LiYuan/Documents/Ai-TripPlanner/src/services/amapWeather.ts) | 天气 base+all（独立池 5000/月） |
| [src/services/poiSearch.ts](file:///Users/LiYuan/Documents/Ai-TripPlanner/src/services/poiSearch.ts) | 地理编码 + 多边形搜索（基础搜索池 5000/月） |
| [src/composables/useAI.ts](file:///Users/LiYuan/Documents/Ai-TripPlanner/src/composables/useAI.ts) | LLM 消息发送（JSONL 文件桥接） |
| [src/composables/useSession.ts](file:///Users/LiYuan/Documents/Ai-TripPlanner/src/composables/useSession.ts) | 会话管理（JSONL session 列表） |
| [src/composables/usePolling.ts](file:///Users/LiYuan/Documents/Ai-TripPlanner/src/composables/usePolling.ts) | 轮询 AI 响应（默认 1s 间隔，30s 超时） |

---

## 3. 高德 API 配额池现状（v2.3）

| 池 | 配额 | 用途 | 状态 |
|---|---|---|---|
| 基础搜索服务 | 5000/月 **共享** | 关键字 / 周边 / 多边形 / ID / 输入提示 | ✅ **仅用 `poiSearch.ts` 的多边形搜索**（1 次/策略切换） |
| 基础 LBS | 150k/日 | 地理编码 / 驾车路线 / 逆地理 / 行政区域 / 坐标转换 / IP 定位 | ✅ 充足 |
| 基础地图定位 | 1.5M/日 | JS 地图初始化 / AMap.Geolocation / 静态地图 | ✅ 充足 |
| 天气 | 5000/月 | 天气查询 | ✅ 充足 |

**关键策略**：
- 输入提示 ❌ → 客户端 `amapDistrict` 区划匹配（1 次启动调用 + localStorage 缓存）
- 周边搜索 ❌ → 逆地理编码 `extensions=all` 替代
- IP 定位 ❌ → AMap.Geolocation 插件替代（精度更高）

---

## 4. 最近 5 个 commit

```
4a3f6a2 refactor(ui): 260px 窄右栏 + POI 抽屉 + 路线决策数据
fb8ffc8 fix(ui): single-page stage 2 + 4 策略切换器内联 + 起点/终点地图跟随
ac85955 fix: 基础搜索 5,000 池月消耗从 292 降到 ~1
3e7a8b1 feat: 行政区域缓存 + AMap.Geolocation + 逆地理编码
fb205e2 chore: 初版基础架构（直接用高德 API，含 input_tips 大量消耗）
```

---

## 5. ⚠️ 用户反馈的 bug 历史（避免重蹈覆辙）

| bug | 原因 | 修复 |
|---|---|---|
| 「加载地名数据」banner 看不到 | 缓存命中后状态闪一下就 true | banner 加 setTimeout 1.8s 持续显示 |
| 定位后地图不跟随 | 没调 `panTo` | MapPanel watch origin/dest → `panTo(lon, lat, 10)` |
| 输入「昆明」下拉永远无匹配 | localStorage 旧版 v1 缓存可能为空 | 缓存 key v1→v2 强制重拉 |
| 「进入规划」按钮卡灰 | `originValid/destValid` 状态机过于复杂 | 改为只看 `store.params.origin.lat` |
| preview 阶段流程卡住 | 用户要求单页 | 删 stage 2 = preview，改为单页 stage 2 confirmed |
| 4 策略切换卡点不动 | UI 误用 | 改在 confirmed 阶段头部 inline 切换器 |
| 策略切换后景点推荐不更新 | 没自动重搜 | MapPanel watch currentStrategy → `searchPoisByRoute` |
| 起点选「我的位置」被重新 geocode 覆盖 | `renderRouteByREST` 内部读 store 重复 geocode | 改成接收参数 origin/dest |
| 路过常德而非长沙 | IP 定位漂移 | 改用 AMap.Geolocation |
| 地图点选「设为终点」无效 | 终点被重新 geocode 到城市 | 同上 |
| 4 策略「距离最短反而更远」 | 高德算法特性 | 已加主要道路名展示辅助判断，非 bug |

---

## 6. ⏭️ 待办（按优先级）

### 🔴 高优
- [ ] **大模型交互**：ChatPanel 当前只发了 system prompt，AI 没在产生地点推荐。基于已选路线让 LLM 推荐 POI
- [ ] **POI 抽屉测试**：用户上一轮还没测试过新抽屉 UI

### 🟡 中优
- [ ] **「途经」列表溢出问题**：15 个城市横排挤在小卡片里。可改为 tooltip 或"展开/收起"按钮
- [ ] **API 真实数据可视化**：补充展示 - 主要道路 step 详情（点击地图上某段高亮路名）
- [ ] **「添加自定义地点」**：用户希望在 stage 2 也能添加 POI（不只是从搜索结果选）

### 🟢 低优
- [ ] **响应式布局**：< 1024px 屏幕适配
- [ ] **AMAP_KEY 抽到 .env**：目前硬编码在 5 个文件中
- [ ] **多语言**：当前纯中文

---

## 7. 🛠️ 开发备忘

### 启动
```bash
# 主目录
cd /Users/LiYuan/Documents/Ai-TripPlanner
npm run dev

# Worktree（如需并行）
cd /Users/LiYuan/.trae-cn/worktrees/Ai-TripPlanner/feat-analyze-readme-NocuDQ
```

### 构建
```bash
npm run build
```

### 提交规范
```bash
# 在 worktree 改 → commit → 合并到 master
git add -A
git commit -m "fix/feat/refactor: 简明描述"
cd /Users/LiYuan/Documents/Ai-TripPlanner
git merge feat-analyze-readme-NocuDQ --ff-only
```

### 清缓存（开发调试）
```js
// 浏览器 console
localStorage.removeItem('adcode_cache_v2')
location.reload()
```

---

## 8. 已清理的冗余（v2.3）

- ❌ `src/components/HelloWorld.vue`（Vite scaffold 残留）
- ❌ `src/components/ItineraryStrip/DayCard.vue`（从未使用）
- ❌ `src/components/ItineraryStrip/DriveTimeBar.vue`（从未使用）
- ❌ `src/assets/hero.png` / `vue.svg` / `vite.svg`（scaffold 残留）
- ❌ `docs/roadtrip-planner-architecture.md`（第一版已废弃）
- ❌ `useMap.ts` 中 `prefetchStrategies`（已注释，未引用）
- ❌ `env.d.ts` 中 `VITE_AMAP_KEY`（未通过 env 注入，改为注释说明）

## 9. 保留的历史文档

- `docs/compose/specs/` — 第 1 版设计 spec
- `docs/compose/plans/` — 第 1-3 阶段实施计划
- `docs/compose/reports/` — 第 1-3 阶段完成报告

这些是历史决策记录，**新会话勿要参考其架构设计**（已被本文件 v2.3 架构取代），但可作为"为什么改成现在这样"的背景。
