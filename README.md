# AI 自驾游规划器

> AI-powered self-driving trip planner with real-time map interaction

## 快速开始

**新会话请先阅读：** [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md) — 项目状态、已确认架构、待办事项

**项目文档：**
- [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md) — 当前状态 & 待办
- [`docs/compose/specs/`](docs/compose/specs/) — 设计规格
- [`docs/compose/plans/`](docs/compose/plans/) — 实施计划

---

## 项目简介

一个 AI 辅助的自驾游规划工具。用户通过**表单输入**起点、终点、天数等参数，系统自动计算最优路线并搜索沿途景点。AI 作为辅助角色，在路线确认后推荐"最值得去"的景点，用户可自由选择、补充、调整。

### 核心设计原则

- **表单引导 + AI 辅助** — 结构化输入保证可靠性，AI 负责个性化推荐
- **地图是决策工具** — 可视化路线检查，实时联动
- **高德为主，AI 为辅** — 路线计算、景点搜索由高德 API 完成，AI 只做智能筛选
- **有限 API 调用** — 多边形搜索替代多次城市搜索，单次路线确认只消耗 1 次 API
- **叠加态交互** — 用户可同时手动输入和与 AI 讨论，实时更新行程

---

## 技术栈

| 层 | 技术 | 用途 |
|---|---|---|
| 前端框架 | Vue 3 + TypeScript | 组件化 UI |
| 状态管理 | Pinia | 跨面板数据同步 |
| 样式 | Tailwind CSS | 快速布局 |
| 地图 | 高德地图 JS API 2.0 | 地图渲染、路线规划、POI 搜索 |
| AI 后端 | CodeBuddy CLI（备用 MiMo） | 对话式规划 |
| 桥接 | Python (watchdog) | 文件监控 + AI 调用 |
| 会话 | JSONL 文件 | 对话持久化 |

---

## 架构概览

```
┌─────────────────────────────────────────────────────────────┐
│                        用户界面                              │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐  │
│  │  聊天面板    │  │    地图面板      │  │  行程面板    │  │
│  │  AI 对话     │  │  路线 + 标记     │  │  表单 + 景点 │  │
│  │  输入框      │  │  实时更新        │  │  选择列表    │  │
│  └──────────────┘  └──────────────────┘  └──────────────┘  │
└────────────────────────────┬────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  文件桥接架构    │
                    │  前端 ↔ JSONL   │
                    │  ↔ Python Bridge │
                    │  ↔ AI CLI       │
                    └─────────────────┘
```

### 三层推荐体系

| 层 | 职责 | 实现 |
|----|------|------|
| Layer 1 | 自动搜索沿途景点 | 高德多边形搜索 API（1次调用） |
| Layer 2 | 用户补充特定地点 | 表单输入 + 高德输入提示搜索 |
| Layer 3 | AI 个性化推荐 | 网络检索 + 智能筛选（列表内选最值得 + 列表外推荐绕路） |

---

## 功能状态

| 功能 | 状态 |
|------|------|
| 三面板布局 | ✅ |
| AI 对话集成 | ✅ |
| 高德地图集成 | ✅ |
| 表单输入（起点/终点/天数/偏好） | ✅ |
| 路线计算 + 多边形搜索 | ✅ |
| 景点选择 + 路线更新 | ✅ |
| AI 主动推荐 | ⏳ 待实现 |
| 每日细化规划 | ⏳ 待实现 |
| 导出到高德 App | ⏳ 待实现 |
| UI 美化 | ⏳ 待实现 |

---

## 启动

```bash
# 1. 启动 API Server（端口 3001）
python3 scripts/server.py &

# 2. 启动 Bridge（监控文件 + 调用 AI）
python3 scripts/bridge.py &

# 3. 启动前端（端口 5173）
npm run dev
```

---

## 文件结构

```
/src
  /components
    /ChatPanel        — AI 对话界面
    /MapPanel         — 高德地图
    /ItineraryStrip   — 行程规划（表单+景点列表）
    /Layout           — 三面板布局
  /composables
    useAI.ts          — AI 调用
    useMap.ts         — 地图操作
    useSession.ts     — 会话管理
  /store
    tripStore.ts      — 全局状态
  /services
    poiSearch.ts      — 高德 POI 搜索 + 多边形生成
  /types              — TypeScript 接口
  /prompts            — AI 系统提示词
  /constants          — 配置常量

/scripts
  server.py           — HTTP API 服务
  bridge.py           — 文件监控 + AI 调用

/sessions
  /active/            — 活跃会话 JSONL
  /archive/           — 归档会话
```

---

## AI 提示词设计

AI 的核心职责是**个性化推荐**，不是重复高德数据：

```
1. 从高德推荐列表中选出最值得去的 3-5 个，给具体理由
2. 列表外有值得绕路的地方，也推荐出来（说明偏离距离和理由）
3. 推荐前做网络检索，确认最新信息
4. 不复述用户已知信息，推荐理由要具体
```

---

## 开发阶段

| 阶段 | 内容 | 状态 |
|------|------|------|
| Phase 1 | 三面板布局 | ✅ |
| Phase 2 | AI 对话集成 | ✅ |
| Phase 3 | 走廊发现（多边形搜索 + AI 推荐） | 🔄 基础跑通 |
| Phase 4 | 每日细化规划 | ⏳ |
| Phase 5 | 精细化循环（叠加态调整） | ⏳ |
| Phase 6 | 导出到高德地图 App | ⏳ |

---

*详细状态见 [`docs/PROJECT-STATUS.md`](docs/PROJECT-STATUS.md)*
