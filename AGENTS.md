# Ai-TripPlanner 项目导航

> 引用全局配置：读取 ~/.agent-shared/AGENTS.md

---

## 项目特有角色
- **地图开发**：`.agent/roles/role-map-developer.md`

## 目录结构
```
Ai-TripPlanner/
├── backend/          # FastAPI 后端
├── frontend/         # Vue 3 前端
├── amap-data-test-archive/  # 归档的数据采集
└── .agent/
```

## 启动命令
```bash
cd backend && python -m uvicorn app.main:app --reload --port 3001
cd frontend && npm run dev
```
