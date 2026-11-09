# @local/dsh-chinese — 全中文模式插件

让 DSH 的**思考、回复、工具定义、工具调用与 Web 界面文案**全部使用简体中文。

> 本目录是**已安装到当前 profile 的插件源码**（`@local/dsh-chinese` v1.0.1，`application: applied`）。
> 宿主入口是 `host.js`；`index.js` 只保留一行兼容重导出。

---

## 一、需求与可行性

| 你的目标 | 实现机制 | 是否真正「全部中文」 |
|---|---|---|
| 思考与回复文字 | `ctx.systemPrompt.section()` 注入语言约定 | ✅ 靠系统提示词约束模型输出；思维链本身由模型生成，插件只能强约束、不能强制翻译 |
| 工具定义本地化 | 注册中文别名工具，模型看到的 name/description/参数 schema 全中文 | ✅ 原生执行器 `describe()` 直接投影注册定义的 `name/description/parameters` |
| 工具调用本身中文 | 中文别名工具的 `execute` 把中文参数键翻译回英文，转发给缓存的原工具定义 | ✅ 模型实际用「读文件 / 文件路径」发起调用，wire name 也是中文 |
| 界面显示中文 | Client `ctx.locale` 词典 + 中文别名工具让卡片标题天然中文化 + 状态徽标 | ✅ 界面自带 `zh` 内置词典；工具卡片标题来自 wire name |

### 关键设计判断（都经过当前 DSH 源码核实）

1. **不能就地改写现有工具的 `description`。** 注册表里的 `ToolDefinition` 属于各自的提供者插件，`ctx.tools.get(name)` 只是读取；没有公开的「替换描述」API。因此采用「中文别名 + 隐藏英文原名」的组合。
2. **不能用 `system-prompt/assemble` 改工具 schema。** `SystemPrompt.assemble()` 在 waterfall 之后用局部变量 `tools` 覆盖返回值，工具声明是 provider-owned 的。改描述必须落在工具注册层。
3. **不能用 `tools/pre-execute` 改写调用参数。** `createExecution()` 已对参数值做 `deepFreeze`，且 `exec` 随后会被冻结；即使改写也可能破坏 `tool/call` 日志的一致性。翻译放在别名工具自己的 `execute` 里最干净。
4. **`ctx.tools.restrict()` 必须在 `agent.ctx` 上调用。** 它要求 scoped context；全局调用会抛错。且英文原名被隐藏后 `get(name)` 查不到，所以别名工具**提前缓存原 definition 的对象引用**，直接调用它，不依赖运行时查找。
5. **复用原工具的 `output.schema` 与 `output.render`。** 返回值契约、内容渲染、错误语义与原工具完全一致；只在 render 前把参数键翻译回英文。
6. **`exec` 原样透传。** `deferContext()` / `concludeTurn()` 等依赖原 execution 对象的闭包方法，展开成副本会破坏 `concludeTurn` 的 `this` 绑定。
7. **界面本身已有中文。** `@deepseek-ai/dsh-client-locale` 内置 `zh`/`en` 词典（设置 → 通用 → 语言）。本插件不重复翻译宿主 UI，只注入自己的命名空间词典与状态徽标；也不擅自改写用户的语言偏好。
8. **渐进降级。** 映射表里不存在于当前部署的工具会被跳过，既不注册别名也不隐藏原名；映射表外的工具保持英文可用。升级 DSH 新增工具不会破坏已有能力。

---

## 二、架构

```
dsh-chinese/
├── package.json          # bundle 清单（dsh.bundle.patch + dsh.client）
├── cordis.patch.yml      # 一条 Host 行，config 可覆盖各项开关
├── index.js              # Host 半部：提示词、别名工具、隐藏原名、生命周期
├── catalog.js            # 中文映射表（唯一事实来源）+ schema/参数翻译构建器
├── client.js             # Client 半部：locale 词典 + 状态徽标
├── icon.svg              # 原创「中」字印章图标
├── locale/
│   ├── en.json           # 插件管理器显示元数据（英文）
│   └── zh.json           # 插件管理器显示元数据（中文）
└── README.md
```

### 按 Agent 注册（关键）

绝大多数内置工具由 preset 挂载到 **Agent 作用域**，Host 全局 `tools.get()` 看不到它们。
因此别名工具与 `restrict` 都注册在 **`agent.ctx`** 上：

- `agent/created` 是 `serial` 事件，在 agent-loop 的 `setup(agent.ctx, agent)`（preset 工具挂载）
  **之后**才发射，此时 `agentCtx.tools.get(name)` 能取到该 Agent 继承的全部工具。
- 别名工具注册在 `agent.ctx` 的 **own 层**；按 `ToolsService.view()` 规则，own 层注册不受
  `restrict` 掩码影响，而继承来的英文原名会被 `restrict({ deny })` 隐藏。
- 每个 `agentCtx.effect()` 的 disposer 同时记入插件自身 effect，插件卸载时主动回收；
  Agent 销毁时框架也会自行回收（双重所有权）。
- 插件激活时还会遍历 `ctx.agents.list()`，为热安装前已存在的 Agent 补做一次。

> 注意：DSH 的既有会话会保留**启动时的插件修订版**。安装或更新插件后，
> 必须**新建会话**才能看到完整的中文工具集；当前会话不会重新挂载 composition。

### 数据流

```
模型请求
  ├─ 系统提示词：语言约定（中文思考/回复） + 中文工具速查表
  └─ 工具 schema：来自 agent.ctx 上注册的中文别名工具（读文件 / 文件路径 …）
        │  模型用中文名 + 中文参数键发起调用
        ▼
  中文别名工具.execute(中文参数, exec)
        │  translateArgs() 把「文件路径」→「file_path」（递归、兼容英文键）
        ▼
  缓存的原 definition.execute(英文参数, exec)   ← 英文原名已被 restrict 隐藏
        │
        ▼
  output.render(翻译回英文的参数, value)  →  原样的 content blocks
        │
        ▼
  tool/call 日志里的 name = 中文名 → Web 工具卡片标题天然中文
```

### 扩展点清单（当前 DSH 版本核实）

| 扩展点 | 类型 | 用途 |
|---|---|---|
| `ctx.systemPrompt.section()` | Service | 注入语言约定与中文速查表 |
| `ctx.tools.register()` | Service | 注册中文别名工具 |
| `ctx.tools.get()` / `restrict()` | Service | 缓存原定义、按 Agent 隐藏英文原名 |
| `agent/created` | Event (serial) | 为每个新 Agent 调用 `agent.ctx.tools.restrict()` |
| `ctx.effect()` | Context | 托管全部注册的生命周期，卸载即回收 |
| `ctx.locale.register/bind/getLocale/setLocale` | Client Service | 徽标文案本地化、可选切换界面语言 |
| `ctx.slots.inject/register` | Client Service | `conversation.composer.dock` 状态徽标 |
| `--dsw-alias-*` | Theme tokens | 徽标配色随明暗主题自适应 |

---

## 三、配置

在 `cordis.patch.yml` 的 `config` 里覆盖（用户的补丁层在升级后保留）：

```yaml
- insert:
    - id: dsh-chinese
      name: '@local/dsh-chinese'
      config:
        languagePolicy: true          # 注入「思考/回复/调用一律中文」
        chineseToolNames: true        # 注册中文别名工具
        hideEnglishTools: true        # 隐藏被映射的英文原名
        chineseQuickReference: true   # 注入中文工具速查表
        switchUiLocale: false         # 是否强制把界面语言切到中文
        uiLocale: zh-CN               # 目标界面语言（内部映射到内置 id zh）
```

**推荐组合**：默认全开但 `switchUiLocale: false` —— 让模型全中文，界面语言交给用户在「设置 → 通用 → 语言」里自己选。

### 中文工具映射表

`catalog.js` 覆盖当前会话可见的 40+ 个工具（读文件、写文件、编辑文件、glob、grep、执行 PowerShell、联网搜索、抓取网页、技能、目标、任务清单、子代理、定时任务、插件管理、检查提供者等）。每条：`T(英文名, 中文名, 中文描述, [P(英文键, 中文键, 类型, 说明)])`，一处定义同时派生 schema 与翻译函数。新增工具只需追加一条 `T(...)`。

---

## 四、安装（你决定执行时才做）

本目录尚未安装。安装会**改动当前 profile，影响所有会话**，需审批：

```
plugin_manager  action=install_bundle  target=<本目录绝对路径>
```

安装后用 `cordis_inspect_list` / `Tool.listTools` 确认中文工具已出现在模型可见 schema 中；新建会话验证「读文件」调用与中文思考。已有会话保留启动时的插件修订版，**必须新建会话**才能看到变化。

---

## 五、已知局限（务必了解）

1. **思维链无法强制翻译。** 语言约定是系统提示词约束，不是对模型内部推理的后处理；模型仍可能偶尔混入英文推理片段。DSH 提供 `cotTranslation` 服务（推理翻译），但那是可选的、面向展示的翻译委托，不在本插件范围内。
2. **参数值保持原文。** 路径、命令、代码、URL、正则等不翻译（也不应翻译）；只有参数**键名**与工具**名称/描述**中文化。
3. **映射表外的工具仍是英文。** 例如 DSH 升级后新增的工具、或 MCP / 第三方插件注册的工具，会按语言约定第 4 条以英文原名调用。可往 `catalog.js` 追加映射。
4. **工具调用卡片的内容渲染来自原工具。** 卡片标题（wire name）是中文，但卡片内部的字段标签、状态文案由各自的 `tool.call.toolview` 渲染器决定，可能仍是英文；界面整体中文由 `ctx.locale` 的内置 `zh` 保证。
5. **`switchUiLocale` 依赖页面引导数据暴露插件配置。** 若宿主未透传，该开关静默不生效；请改用设置里的语言选择器。默认关闭正是为了避免覆盖用户偏好。
6. **本插件未经实际安装验证。** 按你的选择只交付设计与源码；语法与 manifest 已静态校验，但运行时行为（尤其是 `agent.ctx.tools.restrict` 与中文工具名的 wire 兼容性）需安装后在新会话中验证。

---

## 六、验证记录

### 静态

- 已用 `cordis_inspect_list` / `cordis_inspect_query` 读取当前 DSH 的 Service / Event / Tool / Slots / Theme / Config 目录。
- 已对照 `dsh-tools`、`dsh-system-prompt`、`dsh-agent-preset`、`dsh-client-locale`、`dsh-tool-executor-native`、`dsh-persona`、`dsh-agent-loop`、`dsh-agent`、`dsh-tool-cordis`、`@deepseek-ai/cordis` 的 `lib/` 实现核实全部 API 契约。
- 已按 display checklist 提供中英文 `meta.title` / `meta.description`、原创 SVG 图标，并在 `exports` 与 `files` 中导出全部资源。
- 4 个 JS 文件 `node --check` 通过；3 个 JSON 通过；`selftest.mjs` 验证 36/36 schema 合法、嵌套参数往返翻译正确。

### 运行时（当前 profile）

- `plugin_manager install_bundle` → `application: applied`、`warnings: []`。
- `cordis_inspect_query(Tool.listTools)`：**36 个工具全部为中文名 + 中文参数键，英文原名全部隐藏**。
- 端到端实测：用「读文件 / 文件路径 / 行数上限」发起调用，原 `read` 工具正确返回文件内容，参数翻译与转发链路可用。
- 当前会话的模型工具表已切换为中文名（系统提示词中的语言约定同时生效）。

### 调试中修正的三个真实问题

1. **作用域不匹配（1.0.0）**：`tools.get(name)` 未传 scope 只查 global view，多数工具由 preset 挂载在 Agent 作用域 → 改为按 `agent.ctx` 注册并传 `agent` 作为 scope。
2. **生命周期回收（1.0.1）**：收集每个 `agentCtx.effect()` 的 disposer，插件卸载时主动回收（双重所有权）。
3. **ESM 模块缓存（1.0.2）**：本地目录 link 安装下改源码不会重新 import；通过更换入口文件名 + 提升版本号 + `remove_bundle`/`install_bundle` 强制加载新模块代。

### 未验证 / 限制

- 浏览器端「全中文模式」徽标与 `ctx.locale` 词典未做视觉验证（无浏览器控制）；界面本身已有内置 `zh` 词典，工具卡片标题来自中文 wire name。
- 思维链无法强制翻译，靠系统提示词强约束。
- 映射表外的工具（MCP、DSH 升级新增）仍是英文原名。
- 既有会话保留启动时的插件修订版；本次验证通过新建子 Agent 完成，重启或新建会话后所有会话都会使用新修订版。

