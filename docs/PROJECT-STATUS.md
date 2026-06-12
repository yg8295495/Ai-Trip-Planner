# AI 自驾游规划器 — 项目状态

**更新日期：** 2026-06-13
**当前阶段：** Phase 2 完成，Phase 3 未开始

---

## 1. 已完成功能

### 1.1 三面板布局 ✅
- 左侧：Chat Panel（AI 对话）
- 中间：Map Panel（高德地图）
- 右侧：Itinerary Strip（行程安排，纵向排列）
- 技术栈：Vue 3 + TypeScript + Tailwind CSS + Pinia

### 1.2 AI 对话集成 ✅
- 文件桥接架构：前端 ↔ JSONL ↔ Python Bridge ↔ AI CLI
- 默认 AI 后端：CodeBuddy（备用 MiMo）
- 支持会话持续（`-c` 参数）
- System Prompt 每 10 轮重新注入
- JSON 信封解析（chat/status/tripParamUpdates/locationUpdates）

### 1.3 高德地图集成 ✅
- 地图渲染：高德 JS API 2.0
- 地点标记：AMap.Marker + label（纯文字，无外部图片依赖）
- 驾车路线：REST API 获取实际道路坐标 → Polyline 绘制
- 缩放自适应：setFitView 自动调整视野

### 1.4 行程面板 ✅
- 纵向排列，每个 Day 一张卡片
- 显示：日期、住宿城市、驾驶时间、停靠点数
- 超限标记：红色进度条 + "超限" 标签
- 点击高亮对应地图路段

### 1.5 会话管理 ✅
- JSONL 文件格式：user/ai/system 消息
- 自动归档：4 小时无活动自动归档
- 手动关闭：用户关闭时写入 session_closed 标记

---

## 2. 当前问题与不足

### 2.1 静态 Mock 数据 ❌
**现状：** 地点（杭州西湖、黄山、武夷山、长沙美食）是写死在 store 里的
**应该：** AI 根据用户输入动态推荐沿途景点

### 2.2 AI 未推荐景点 ❌
**现状：** AI 只收集了 origin/destination/totalDays，没有推荐具体景点
**应该：** AI 在 planning 模式下输出 locationUpdates，前端解析后在地图上显示新标记

### 2.3 行程未根据实际驾驶时间重算 ❌
**现状：** 行程中的驾驶时间是 mock 数据（2h、3h、4h、7h）
**应该：** 根据高德 REST API 返回的实际驾车时间，自动分配每天的行程

### 2.4 高德 JS API 驾车插件未授权 ⚠️
**现状：** Key 只开通了 REST API，JS API Driving 插件返回 `USERKEY_PLAT_NOMATCH`
**影响：** 目前用 REST API 方案，功能正常，但未来如需更丰富的交互（拖拽改路）需要开通

### 2.5 系统代理干扰 ⚠️
**现状：** PAC 文件可能把高德 API 请求路由到本地代理
**影响：** JS API 插件调用失败，REST API 正常

### 2.6 UI 细节待优化
- 地图标记点击后无信息卡片
- 行程卡片无法拖拽调整顺序
- 没有"导出行程"功能

---

## 3. 技术栈确认

| 层 | 技术 | 备注 |
|---|---|---|
| 前端框架 | Vue 3 + TypeScript | Composition API + `<script setup>` |
| 状态管理 | Pinia | 单 store，响应式 |
| 样式 | Tailwind CSS | 原子化 CSS |
| 地图 | 高德地图 JS API 2.0 | REST API 获取驾车路线 |
| AI 后端 | CodeBuddy CLI（默认） | 备用 MiMo |
| 桥接 | Python (watchdog) | server.py + bridge.py |
| 会话存储 | JSONL 文件 | sessions/active/ + sessions/archive/ |

---

## 4. 项目文件结构

```
Ai-TripPlanner/
├── src/
│   ├── components/
│   │   ├── ChatPanel/        ← AI 对话界面
│   │   ├── MapPanel/         ← 高德地图
│   │   ├── ItineraryStrip/   ← 行程安排
│   │   └── Layout/           ← 三面板布局
│   ├── composables/
│   │   ├── useAI.ts          ← AI 调用（文件桥接）
│   │   ├── useMap.ts         ← 地图操作
│   │   ├── usePolling.ts     ← JSONL 轮询
│   │   └── useSession.ts     ← 会话管理
│   ├── store/
│   │   └── tripStore.ts      ← 全局状态
│   ├── types/
│   │   ├── index.ts          ← 数据模型
│   │   └── session.ts        ← 会话类型
│   ├── utils/
│   │   └── jsonl.ts          ← JSONL 读写工具
│   ├── prompts/
│   │   ├── system.txt        ← System Prompt（每10轮注入）
│   │   └── new_session.txt   ← 新会话 Prompt（首次注入）
│   └── constants/
│       ├── defaults.ts       ← 默认参数
│       └── categories.ts     ← 地点分类颜色
├── scripts/
│   ├── server.py             ← HTTP API 服务
│   └── bridge.py             ← 文件监控 + AI 调用
├── sessions/
│   ├── active/               ← 活跃会话 JSONL
│   └── archive/              ← 归档会话
└── docs/
    └── compose/              ← 设计文档和计划
```

---

## 5. 启动命令

```bash
# 1. 启动 API Server（端口 3001）
python3 scripts/server.py &

# 2. 启动 Bridge（监控文件 + 调用 AI）
python3 scripts/bridge.py &

# 3. 启动前端（端口 5173）
npm run dev
```

---

## 6. 下一步目标

### Phase 3：走廊发现（AI 推荐景点）
- [ ] AI 在 planning 模式下输出 locationUpdates
- [ ] Bridge 解析 locationUpdates 写入 JSONL
- [ ] 前端读取新景点，地图上显示新标记
- [ ] 调用高德 REST API 获取景点间的驾车路线

### Phase 4：实时重算（行程根据实际时间更新）
- [ ] 根据高德 API 返回的实际驾车时间分配每天行程
- [ ] ItineraryCalculator 纯函数重算
- [ ] 超限自动检测和标记

### Phase 5：精细化循环
- [ ] 用户点击标记可切换选中/取消
- [ ] 标记信息卡片（描述、类别、操作按钮）
- [ ] 聊天中 AI 根据用户反馈增删景点
- [ ] 所有变更实时联动（地图 + 行程 + 聊天）

### Phase 6：最终导出
- [ ] "完成规划" 按钮
- [ ] 可打印的行程单视图
- [ ] 每天驾驶路线的高德地图深链接

---

## 7. 已知技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| AI 调用方式 | 文件桥接（JSONL） | 零 API 费用，Agent 可插拔 |
| 驾车路线 | 高德 REST API | JS API 插件未授权，REST 数据相同 |
| 地图标记 | AMap.Marker + label | 不依赖外部图片，稳定 |
| Prompt 注入 | 每 10 轮 + 首次 | 平衡 token 消耗和格式稳定性 |
| 会话管理 | `-c` 参数 | 不需要手动管理 session ID |

---

*End of project status.*
