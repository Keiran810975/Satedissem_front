# Satedissem Frontend

前端可视化已对接后端 API：
- 读取后端可用拓扑文件列表
- 读取后端默认配置和算法选项
- 调用后端真实仿真并回放传输事件

## 本地运行

### 1) 启动后端 API
在 `Satedissem_back` 目录执行：

```bash
go run . -serve -addr :8080
```

### 2) 启动前端
在 `Satedissem_front` 目录执行：

```bash
npm install
npm run dev
```

默认通过 Vite 代理把 `/api` 转发到 `http://localhost:8080`。

## 可选环境变量

- `VITE_BACKEND_URL`：覆盖后端地址（默认 `http://localhost:8080`）
