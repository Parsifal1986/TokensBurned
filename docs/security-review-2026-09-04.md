# 安全审查记录

审查日期：2026-09-04（America/Los_Angeles）。本次检查了仓库中的网站、CLI、生命周期钩子、历史解析、凭据存储、API 客户端、Cline 集成、插件分发副本、依赖锁文件和 CI / Pages 工作流，并修补下列问题。改动保留在本地工作区，尚未发布到网站或插件渠道。

## 已修补

| 问题 | 触发条件与影响 | 修补与验证 |
| --- | --- | --- |
| 更新信息进入代理提示时缺少校验 | 版本接口返回 `99.0.0` 后附带换行或指令，原代码仍视为版本号，并将原文插入 SessionStart 的代理上下文。需要上游接口或自定义 API 返回恶意数据，不代表正常服务已遭入侵。 | 严格限制版本字符串的格式和长度；只保留三个发布元数据字段；更新链接仅接受无凭据、无空白控制字符的 HTTPS URL。恶意版本及链接回归测试通过。 |
| API 请求自动跟随重定向 | 原始目的地通过 HTTPS 校验后，307 / 308 仍可能将授权码或用量请求体转发到另一目的地。跨源时浏览器标准可能剥离 Authorization，并不意味着请求体也会被剥离。 | 所有 API 请求设置 `redirect: "error"`。真实本地 HTTP 测试覆盖 301、302、303、307、308，确认重定向接收端未收到任何请求。 |
| 凭据与 API 配置缺少绑定 | 切换服务或连接过程部分写入失败，可能留下新凭据与旧 API 配置的组合。 | 新连接将 API 地址写入凭据文件；CLI 和 Cline 在发送前校验其绑定。隐私查询完成后才保存新凭据。不同地址的请求在发出前被拒绝，已覆盖 API 和 CLI 回归测试。旧凭据保持兼容，重新连接后才获得地址绑定。 |
| 敏感文件使用可预测的临时路径 | 有权限在目标目录预置文件或符号链接时，原来的非排他写入可能跟随链接，把凭据或含敏感配置的钩子设置写到错误位置；同进程并发写入也会复用路径。 | 统一使用 UUID 临时文件、`wx` 排他创建、0600 权限和原子重命名，失败时清理临时文件。凭据、配置、统计、钩子设置和上传队列共用实现。测试覆盖预置符号链接、并发完整性、权限和失败清理。 |
| 原型属性被当作业务数据 | `constructor`、`__proto__` 等维度名称会使计数错误；异常服务端确认记录还可能通过继承属性修改 `Object.prototype`。 | 累计只读取自身属性，并显式定义数据属性；确认记录只能访问实际存在的日期；CLI 和 SVG 的标签查询也排除继承属性。测试覆盖序列化后的正确计数和原型对象不被修改。 |
| 本地预览服务器的请求与路径处理不足 | 畸形 URL 的解析异常可逃逸异步处理函数；静态目录内指向目录外的符号链接可绕过原字符串路径检查。 | 捕获 URL / 编码异常，按解析后的真实路径检查目录边界，限制 GET / HEAD，并添加 `nosniff`、禁止框架嵌入和 referrer 响应头。真实 HTTP 测试确认异常请求后服务器仍正常工作，目录外文件不会返回。 |

重定向处理依据 [Fetch Standard](https://fetch.spec.whatwg.org/#http-redirect-fetch)；排他创建及文件权限语义依据 [Node.js 文件系统文档](https://nodejs.org/api/fs.html)。所有客户端修补已同步至 `plugins/tokensburned/src/`，逐文件核对一致。

## 网页图标

沿用现有 `public/favicon.svg` 火焰标识，新增包含 16、32、48 像素图像的 `public/favicon.ico` 和 180 × 180 像素、背景不透明的 `public/apple-touch-icon.png`。首页和用量限制页均已声明这些图标；预览服务器提供对应 MIME 类型。图像已解码检查并人工查看，无新增运行时依赖。

## 仍需在部署层处理

2026-09-05 02:33 UTC 的只读请求中，`https://tokensburned.com/` 返回 GitHub Pages 的 HTTP 200。所观察响应未提供 `Strict-Transport-Security`、`X-Content-Type-Options`、`X-Frame-Options` 或 HTTP `Content-Security-Policy`；页面源码中已有 meta CSP 和 referrer 策略。当前页面是公开静态内容，此处属于浏览器防护加固，未发现依赖登录态的操作。

建议在网站实际使用的托管或 CDN 层为 HTML 响应设置以下内容，并在部署后重新验证：

```http
Strict-Transport-Security: max-age=31536000
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://api.tokensburned.com; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
```

`frame-ancestors` 无法通过 meta CSP 生效，必须使用响应头，见 [W3C CSP 规范](https://www.w3.org/TR/CSP3/#directive-frame-ancestors)。本仓库的部署工作流仅上传静态文件，没有可用的生产响应头配置；此次新增的本地预览响应头不会改变 GitHub Pages 的线上响应。

带当前客户端版本头的公开接口 `https://api.tokensburned.com/v1/client/version` 返回 HTTP 200，最新版本为 0.6.3，最低版本为 0.6.1，没有重定向。它已提供 `nosniff`、`DENY` 和 `no-referrer`；该次响应未提供 HSTS。后续已在私有 Worker 中补上 HSTS，待部署生效。版本元数据为公开可缓存内容，不能据此推断认证接口的缓存行为。

## 验证结果与边界

- `npm run check`：59 项测试全部通过，包括真实回环 HTTP 测试。
- `npm audit --omit=dev --json`：0 条已知依赖漏洞；当前锁文件没有实际安装的第三方依赖，这一结果不覆盖宿主自行提供的可选 Cline SDK。
- 已跟踪文件的常见私钥、GitHub 凭据、AWS 访问密钥及完整设备令牌模式扫描：未命中。未进行 Git 历史或外部秘密存储审计。
- 网站交互使用文本节点和受限的 GitHub 用户名；SVG 文本有 XML 转义；历史文件有真实路径边界；钩子使用数据和环境白名单；工作流动作固定到提交 SHA，令牌权限按任务限制。检查中保留了这些已有措施。
- 本公共仓库不包含生产 Worker。用户提供私有仓库位置后，已另行基于 TokensBurned-Cloud 的最新 main 检查并修补服务端代码，73 项测试及 Worker 打包验证通过；详细结果保留在私有仓库的同日期审查报告中。生产部署版本、秘密配置、实际 D1 迁移状态和 R2 数据仍未验证。

上述是本次可见代码与少量公开响应的审查结果，不是整套生产系统已经完成安全认证的声明。
