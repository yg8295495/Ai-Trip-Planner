# AI 自驾游规划器 — 项目状态 & 会话交接

> **📌 下一会话的 agent 必读**：新开会话第一件事就是读这个文件，里面有：
> - 当前架构（已废弃的旧设计勿要恢复）
> - 最近 5 个 commit 改了什么（知道现在在哪一步）
> - 已知的 bug 修复历史（避免重复踩坑）
> - 待办事项（按优先级）
> - 高德 API 配额状态

---

## 1. 架构决策变更（2026-06-22）

### 核心变更：从"OSM+携程双体系"转向"携程ID体系为主"

**变更原因：**
1. 携程数据本身有完整坐标（lat, lng），不需要OSM坐标
2. 携程有丰富字段：名称、评分、评论数、标签、封面图、开园状态
3. OSM匹配率只有16%，84%的携程景点无法入库
4. 系统复杂度应该最小化

**变更影响：**
- ❌ 不再需要OSM匹配逻辑
- ❌ 不再需要用 `ctrip_{poi_id}` 虚拟ID（但为兼容保留）
- ✅ 直接用携程 `poi_id` 作为主键
- ✅ 所有携程景点都能入库（100%）
- ✅ OSM仅在冷启动时使用（找小众景点）

**数据流向：**
```
携程API → collect_ctrip.py → ctrip_attractions.json
                                    ↓
                            import_ctrip_to_db.py
                                    ↓
                            poi_details + poi_images
                                    ↓
                            后端API /api/pois
                                    ↓
                            前端分类选择器
```

---

## 2. 当前架构（v3.1，2026-06-22）

```
┌─ ChatPanel 340px可拖拽 ─┬─ MapPanel flex-1 ─────┬─ ItineraryStrip 260px ─┬─ PoiDrawer 320px（抽屉）─┐
│ - 随心自驾 logo+简介     │ - 高德地图            │ - 起/终点输入（支持     │ - 滑入覆盖地图右半     │
│ - AI 对话               │ - 起/终点 marker     │   geocode fallback）    │ - 自定义地点           │
│ - 历史会话              │ - 路线 polyline      │ - 旅行参数              │ - 候选 POI             │
│ - Phosphor 图标         │ - POI marker         │ - 进入规划按钮          │ - 已选 POI 排序         │
│ - 三色装饰条            │ - 归位/策略/缩放      │ - 路线卡（距离/时长     │ - 天气（按城市）       │
│                         │ - 卫星切换            │   /收费/红绿灯）        │                        │
│                         │ - 🆕 携程分类按钮     │ - 3 策略切换器          │                        │
│                         │   (13个分类)          │   (2/13/10)            │                        │
│                         │                      │ - 备选路线折叠          │                        │
│                         │                      │ - 搜索/抽屉入口         │                        │
└─────────────────────────┴──────────────────────┴─────────────────────────┴────────────────────────┘
```

**新增功能：**
- 地图左上角新增**携程景点分类按钮**（罗盘图标）
- 点击展开13个分类：历史建筑、自然山水、主题乐园等
- 每个分类最多显示25个景点

---

## 3. 数据体系（2026-06-22）

### 3.1 采集数据

| 指标 | 数值 |
|------|------|
| 采集城市 | 10个核心城市 |
| 采集景点 | 2,138个 |
| 入库成功 | 2,138个（100%）|
| 分类数 | 13个 |

**核心城市：**
北京、上海、广州、深圳、成都、杭州、武汉、重庆、南京、西安

### 3.2 数据字段

| 字段 | 说明 | 来源 |
|------|------|------|
| poi_id | 携程景点ID（主键） | 携程 |
| name | 景点名称 | 携程 |
| city | 城市 | 携程 |
| lat/lng | 坐标 | 携程 |
| score | 用户评分 | 携程 |
| review_count | 点评数 | 携程 |
| tags | 分类标签（13类） | 携程 |
| cover_image | 封面图URL | 携程 |
| open_status | 开园状态 | 携程 |
| short_features | 短描述 | 携程 |
| is_free | 是否免费 | 携程 |

### 3.3 携程分类标签（13个）

历史建筑、自然山水、主题乐园&游乐场、亲子同乐、博物馆&展馆、地标观景、城市漫步、夜游观景、赏花胜地、遛娃宝藏地、亲近动物、园林花园、缆车索道

### 3.4 数据库表（2026-06-22 重构）

**poi_details 表结构：**

```sql
CREATE TABLE poi_details (
    osm_id TEXT PRIMARY KEY,          -- 兼容层：格式 ctrip_{poi_id}
    ctrip_id INTEGER UNIQUE,          -- 实际业务主键：携程景点ID
    gaode_id TEXT,
    gaode_name TEXT,
    keytag TEXT,
    phone TEXT,
    ticket TEXT,
    opening_hours TEXT,
    tips TEXT,
    traffic TEXT,
    review_total INTEGER,
    review_good_count INTEGER,
    review_mid_count INTEGER,
    review_bad_count INTEGER,
    review_good_rate REAL,
    review_tags TEXT,
    sub_pois TEXT,
    summary_text TEXT
);
CREATE INDEX idx_details_ctrip_id ON poi_details(ctrip_id);
```

**字段说明：**
- `osm_id`：兼容层，格式为 `ctrip_{poi_id}`，保持与现有代码兼容
- `ctrip_id`：实际业务主键，携程景点ID，建立唯一索引
- 其他字段：携程采集的景点详情数据

**数据迁移结果：**
- 总记录数：2,849
- 成功迁移：2,138 条（有 ctrip_id）

| 表名 | 说明 | 主键 |
|------|------|------|
| poi_details | 景点详情 | osm_id（兼容层）+ ctrip_id（业务主键）|
| poi_images | 景点图片 | id（自增）|
| local_pois | OSM数据（仅冷启动用）| osm_id |

---

## 4. API 接口

### GET /api/pois

查询携程景点数据

**参数：**
- `category`：携程分类标签（如"历史建筑"）
- `city`：城市名称
- `limit`：数量限制（默认25）

**返回：**
```json
{
  "pois": [...],
  "total": 25,
  "category": "历史建筑",
  "categories": ["历史建筑", "自然山水", ...]
}
```

---

## 5. 关键文件索引

| 文件 | 说明 |
|------|------|
| `backend/collect_ctrip.py` | 携程采集脚本 |
| `backend/import_ctrip_to_db.py` | 入库脚本 |
| `backend/main.py` | 后端API（含 `/api/pois`）|
| `backend/data/ctrip_attractions.json` | 携程采集数据 |
| `src/services/ctripPoiService.ts` | 前端携程服务 |
| `src/store/tripStore.ts` | 状态管理（含携程景点）|
| `src/components/MapPanel/MapPanel.vue` | 地图组件（含分类选择器）|

---

## 6. 待办事项（按优先级）

### 🔴 高优
- [x] 空间检索API（POST /api/pois/search）
- [x] OSM长尾发现（GET /api/pois/osm-discover）
- [x] 前端视窗联动

### 🟡 中优
- [ ] 景点详情页完善（门票/时间/电话）
- [ ] AI推荐集成携程数据
- [ ] 扩展采集到更多城市

### 🟢 低优
- [ ] 多语言支持
| 策略切换后景点推荐不更新 | 没自动重搜 | MapPanel watch currentStrategy → `searchPoisByRoute` |
| 起点选「我的位置」被重新 geocode 覆盖 | `renderRouteByREST` 内部读 store 重复 geocode | 改成接收参数 origin/dest |
| 路过常德而非长沙 | IP 定位漂移 | 改用 AMap.Geolocation |
| 地图点选「设为终点」无效 | 终点被重新 geocode 到城市 | 同上 |
| 4 策略「距离最短反而更远」 | 高德算法特性 | 已加主要道路名展示辅助判断，非 bug |

---

## 6. ⏭️ 待办（按优先级）

### 🔴 高优
- [x] **外部访问支持**：server.py 改监听 `0.0.0.0` ✅
- [ ] **LLM 底层对齐**：bridge.py provider 硬编码已修。待测试 MiMo/CodeBuddy 调用上下文连续性
- [x] **自适应 + 响应式布局**：CSS 变量响应式系统 + AppLayout 弹性布局 + MobileTabs 手机端 tab ✅

### 🟡 中优
- [ ] **大模型交互**：基于已选路线让 LLM 推荐 POI（依赖 LLM 底层对齐）
- [ ] **POI 抽屉测试**：新抽屉 UI 需用户测试验证
- [x] **途经列表溢出**：展开时加 max-h-32 滚动限制 ✅

### 🟢 低优
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

---

## 10. 🧪 Playwright 自动化测试

### 环境配置

**Chrome 浏览器路径**（`~/.cache/puppeteer`）：
```bash
# 完整版 Chrome for Testing（推荐用于可视化调试）
/Users/LiYuan/.cache/puppeteer/chrome/mac-148.0.7778.97/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing

# 精简版 headless shell（推荐用于 CI/自动化）
/Users/LiYuan/.cache/puppeteer/chrome-headless-shell/mac-149.0.7827.22/chrome-headless-shell-mac-x64/chrome-headless-shell
```

**Playwright 版本**：
- 项目已安装 `playwright` 和 `playwright-core`（在 `node_modules/`）
- 无需额外安装，直接使用

### 使用示例

```javascript
import { chromium } from 'playwright';

const browser = await chromium.launch({
  headless: false,  // 可视化调试用 false，CI 用 true
  executablePath: '/Users/LiYuan/.cache/puppeteer/chrome/mac-148.0.7778.97/chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
});

const page = await browser.newPage();
await page.goto('http://localhost:5173');

// 测试逻辑...

await browser.close();
```

### 运行测试

```bash
# 启动开发服务器（如果未启动）
npm run dev

# 运行测试脚本（必须使用完整路径，沙箱环境没有 node 命令）
/Users/LiYuan/.nvm/versions/node/v24.15.0/bin/node test-xxx.mjs
```

**注意**：沙箱环境 PATH 中没有 node/npm，必须使用完整路径 `/Users/LiYuan/.nvm/versions/node/v24.15.0/bin/node`。

### 注意事项

- 测试脚本使用 `.mjs` 扩展名（ES Module）
- 确保开发服务器在 `localhost:5173` 运行
- 使用 `headless: false` 可以看到浏览器操作过程
- 使用 `chrome-headless-shell` 时只能用 `headless: true`
