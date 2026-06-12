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

### 1.5 会话管理 ✅
- JSONL 文件格式：user/ai/system 消息
- 自动归档：4 小时无活动自动归档
- 手动关闭：用户关闭时写入 session_closed 标记

---

## 2. 待解决问题（按优先级）

### P0：核心功能缺失

#### 2.1 AI 推荐逻辑重构 ❌
**问题：** AI 自由发挥推荐景点，导致严重偏离路线（上海→成都推荐武夷山）
**目标：**
- AI 首先通过高德 API 获取路线沿途城市（高速/国道方案）
- 基于沿途城市推荐景点、美食、住宿
- 询问用户可接受的偏离距离（km），作为推荐过滤条件
- 偏离范围由用户定义，不是 AI 自己决定

#### 2.2 静态 Mock 数据替换 ❌
**现状：** 地点写死在 store 里
**目标：** AI 动态推荐 → locationUpdates → 前端实时显示

#### 2.3 行程实时重算 ❌
**现状：** 驾驶时间是 mock 数据
**目标：** 根据高德 REST API 实际驾车时间，自动分配每天行程

### P1：交互与体验

#### 2.4 前端设计美化 ❌
**现状：** 纯功能实现，无设计感
**目标：** 安装前端设计 skill/MCP，控制美学和交互风格
**待确认：** 需要安装哪些设计工具

#### 2.5 右侧行程列表信息不全 ❌
**现状：** 只显示日期、城市、时间、停靠点数
**目标：** 补充更多信息（景点名称、类型、描述、操作按钮）
**交互：** 点击展开详情、拖拽调整顺序、删除/添加

#### 2.6 移动端适配 ❌
**现状：** 只考虑 PC 端三面板布局
**目标：** 移动端浏览器可用
**方案：** 响应式布局，移动端改为单面板 + 底部导航

#### 2.7 地图标记图片 ❌
**现状：** 移除了外部图片，只显示文字标签
**目标：** 探索其他方案
**可能方案：**
- 高德默认标记图标（不自定义）
- 本地 SVG 图标（按分类）
- emoji 作为标记
- 高德 POI 图片 API（如果有的话）

### P2：功能扩展

#### 2.8 酒店推荐模块 ⏳
**复杂度：** 高
**依赖：** 路线城市列表、用户预算偏好
**计划：** 独立模块，后续单独实现

#### 2.9 景点筛选模块 ⏳
**复杂度：** 高
**依赖：** 路线城市列表、用户兴趣偏好、偏离距离
**计划：** 独立模块，后续单独实现

#### 2.10 导出行程 ⏳
**内容：** 可打印行程单、高德地图深链接
**优先级：** 低

---

## 3. 技术栈确认

| 层 | 技术 | 备注 |
|---|---|---|
| 前端框架 | Vue 3 + TypeScript | Composition API + `<script setup>` |
| 状态管理 | Pinia | 单 store，响应式 |
| 样式 | Tailwind CSS | 原子化 CSS，待美化 |
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

## 6. 开发计划

### Phase 3：走廊发现（AI 推荐景点）
**核心逻辑变更：**
1. AI 首先调用高德 API 获取路线沿途城市
2. 询问用户可接受偏离距离
3. 基于沿途城市 + 偏离距离推荐景点/美食/住宿
4. 前端解析 locationUpdates，地图显示新标记

**实现步骤：**
- [ ] 高德 REST API：获取路线途经城市列表
- [ ] System Prompt 更新：加入"先获取城市再推荐"的约束
- [ ] AI 输出 locationUpdates，Bridge 解析写入 JSONL
- [ ] 前端读取新景点，地图显示标记
- [ ] 调用高德 REST API 获取景点间驾车路线

### Phase 4：实时重算（行程根据实际时间更新）
- [ ] ItineraryCalculator 纯函数：根据实际驾车时间分配每天行程
- [ ] 超限自动检测和标记
- [ ] 行程面板实时更新

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

## 7. 待确认事项

### 7.1 前端设计工具
- [ ] 需要安装哪些前端设计 skill/MCP？
- [ ] 设计风格偏好？（简约/现代/中国风/其他）

### 7.2 移动端方案
- [ ] 响应式布局的具体断点？
- [ ] 移动端交互方式？（底部导航？抽屉菜单？）

### 7.3 标记图片方案
- [ ] 高德默认图标 vs 本地 SVG vs emoji？
- [ ] 是否需要按分类显示不同图标？

### 7.4 AI 推荐逻辑细节
- [ ] 偏离距离的默认值和范围？
- [ ] 推荐结果的数量限制？

---

## 8. 已知技术决策

| 决策 | 选择 | 原因 |
|------|------|------|
| AI 调用方式 | 文件桥接（JSONL） | 零 API 费用，Agent 可插拔 |
| 驾车路线 | 高德 REST API | JS API 插件未授权，REST 数据相同 |
| 地图标记 | AMap.Marker + label | 待优化，可能改为图标 |
| Prompt 注入 | 每 10 轮 + 首次 | 平衡 token 消耗和格式稳定性 |
| 会话管理 | `-c` 参数 | 不需要手动管理 session ID |

---

*End of project status.*
