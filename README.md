# AI 自驾游规划器

> 🚗 基于高德地图的 AI 自驾游行程规划工具
>
> **📌 必读**：[`docs/PROJECT-STATUS.md`](file:///Users/LiYuan/Documents/Ai-TripPlanner/docs/PROJECT-STATUS.md) — 包含当前架构、待办、bug 历史、会话交接信息

---

## 一句话介绍

用户输入起/终点和旅行参数，系统自动计算 4 种驾车策略路线，沿途搜索 POI（景点/酒店/美食），用户选择并调整后形成最终行程。

## 快速开始

```bash
npm install
npm run dev      # 启动 dev server (默认 5173)
npm run build    # 生产构建
```

## 技术栈

- **前端**：Vue 3 + TypeScript + Pinia + Vite
- **样式**：Tailwind CSS 4
- **地图**：高德 JS API 2.0（驾车路线 / 行政区域 / 逆地理编码 / 定位 / 天气）
- **大模型**：JSONL 文件桥接 + watchdog（详见 `src/composables/useAI.ts`）

## 目录结构

```
src/
├── App.vue                    # 根组件，挂载 Chat/Map/Itinerary + PoiDrawer
├── main.ts
├── components/
│   ├── ChatPanel/             # 左侧 340px：大模型对话
│   ├── MapPanel/              # 中间：地图 + 路线
│   ├── ItineraryStrip/        # 右侧 260px：输入 + 路线卡 + 策略切换
│   ├── PoiDrawer/             # 320px 抽屉：POI 管理
│   └── Layout/                # 三栏布局
├── composables/               # useMap / useAI / useSession / usePolling
├── services/                  # 高德各 API 封装
├── store/                     # Pinia store
├── types/                     # TS 类型
└── utils/                     # JSONL 文件读写

docs/
├── PROJECT-STATUS.md          # ⭐ 当前状态 + 会话交接（必读）
└── compose/                   # 历史设计文档（已过期，仅作参考）
```

## 已知限制

- 高德 API 基础搜索服务（关键字/周边/POI 搜索）共享 5000/月池 → 当前仅用 polygon 搜索，节约配额
- AMAP_KEY 硬编码在 `services/` 多个文件中，未通过 `.env` 注入
- LLM 交互（ChatPanel）当前只发送 system prompt，未实际产生 POI 推荐
