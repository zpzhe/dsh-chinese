/**
 * 中文工具映射表。
 *
 * 这是本插件唯一的「事实来源」：一份条目同时派生出三样东西
 *   1. 中文别名工具的模型可见 JSON Schema（中文名 + 中文参数名 + 中文说明）
 *   2. 把模型生成的中文调用参数翻译回原工具英文参数名的函数
 *   3. （可选）注入系统提示词的中文工具速查表
 *
 * 新增工具时只需在 TOOL_CATALOG 末尾追加一条 T(...)，不需要改 index.js。
 * 未被本表覆盖的工具保持原样可见，不会被隐藏，也不会被破坏。
 */

/** 一个参数节点。 */
const P = (en, zh, type, desc, opts = {}) => ({ en, zh, type, desc, ...opts });
/** 一个工具条目。 */
const T = (en, zh, desc, params = []) => ({ en, zh, desc, params });

const SANDBOX = ['workspace-write', 'danger-full-access'];
const GOAL_ACTION = ['edit', 'pause', 'resume', 'complete', 'blocked'];

export const TOOL_CATALOG = [
  T('working_directory', '工作目录', '读取当前工作目录，或用 cd 切换。相对路径基于当前目录；已存在的 shell 与后台进程保留各自目录。', [
    P('cd', '目录', 'string', '要进入的已有目录；留空表示只读取当前目录。'),
  ]),
  T('load_workspace_dependencies', '加载工作区依赖', '获取内置 Python、依赖库目录及发行版本；若负载提供，也返回 Node.js 与 pnpm 路径。'),

  T('job_output', '读取后台任务输出', '读取一个后台任务：流式任务返回上次读取之后的新输出，最终输出任务返回其结果。', [
    P('job_id', '任务编号', 'string', '启动该后台任务的工具所返回的任务 id。', { required: true }),
    P('wait', '等待完成', 'boolean', '是否阻塞直到任务结束或超时；超时的等待会让任务继续运行。默认 false。'),
    P('timeout_ms', '超时毫秒', 'number', '配合「等待完成」使用的最大等待毫秒数，受配置上限约束。'),
  ]),
  T('job_list', '列出后台任务', '列出你启动的后台任务（运行中及已结束），含 id、类型与状态。'),
  T('job_kill', '终止后台任务', '请求取消一个正在运行的后台任务。', [
    P('job_id', '任务编号', 'string', '要取消的后台任务 id。', { required: true }),
    P('reason', '原因', 'string', '可选的简短原因，会写入日志并转发给任务。'),
  ]),

  T('present', '交付文件', '把已存在的文件声明为最终交付物。宿主可能在你本轮结束后才展示，请在文件定稿后调用一次。', [
    P('files', '文件列表', 'array', '通常 1–2 个最重要的交付物，每次最多 4 个。', {
      required: true,
      items: [
        P('path', '路径', 'string', '已存在的普通文件路径；相对路径基于会话工作目录。', { required: true }),
        P('description', '说明', 'string', '给用户的简短描述。'),
      ],
    }),
  ]),
  T('plugin_manager', '插件管理', '列出插件或扩展包、启用/禁用、安装或移除。每个操作都需要危险权限或审批，且改动影响该配置下的所有会话。', [
    P('action', '操作', 'string', '取值：list_plugins / list_bundles / set_plugin / set_bundle / install_bundle / remove_bundle / list_version_exemptions / set_version_exemption。', { required: true, enum: ['list_plugins', 'list_bundles', 'set_plugin', 'set_bundle', 'install_bundle', 'remove_bundle', 'list_version_exemptions', 'set_version_exemption'] }),
    P('target', '目标', 'string', '按操作而定：插件条目 id、扩展包名称或安装说明。'),
    P('enabled', '启用', 'boolean', 'set 操作必填；安装时默认为 true。'),
    P('runtimeVersion', '运行时版本', 'string', '仅用于 set_version_exemption：来自版本豁免列表的精确 DSH 版本。'),
    P('acceptRisk', '接受风险', 'boolean', '仅在已向用户警告崩溃与数据丢失风险、并就该插件/运行时组合取得明确许可后设为 true。'),
    P('approvedBuilds', '批准构建', 'array', '仅用于 install_bundle：用户明确批准运行其安装脚本后的 pendingBuilds 名称。', { items: { type: 'string' } }),
    P('registry', '镜像源', 'string', '仅用于 install_bundle：用户指定的 npm registry URL。'),
    P('offset', '偏移量', 'number', '列表分页的起始下标，默认 0。'),
    P('limit', '每页数量', 'number', '列表分页大小，1–100，默认 25。'),
  ]),

  T('read', '读文件', '读取一个 UTF-8 文本文件，返回带行号的内容。', [
    P('file_path', '文件路径', 'string', '要读取的文件路径。', { required: true }),
    P('offset', '起始行', 'number', '从第几行开始返回，1 起算，默认 1。'),
    P('limit', '行数上限', 'number', '最多返回多少行，默认 2000。'),
  ]),
  T('write', '写文件', '创建或整体覆盖一个 UTF-8 文本文件。', [
    P('file_path', '文件路径', 'string', '要写入的文件路径，须在 content 之前给出。', { required: true }),
    P('content', '内容', 'string', '完整的 UTF-8 文本内容。', { required: true }),
    P('sandbox_permissions', '沙箱权限', 'string', '沙箱拒绝后一次性重试所需的最窄更宽权限。', { enum: SANDBOX }),
    P('justification', '理由', 'string', '配合沙箱权限：用用户当前请求的语言，一句话说明为何该操作需要更宽权限。'),
  ]),
  T('edit', '编辑文件', '通过替换一段字面文本来修改已有的 UTF-8 文本文件。', [
    P('file_path', '文件路径', 'string', '要编辑的文件路径，须在其余参数之前给出。', { required: true }),
    P('old_string', '原文本', 'string', '要被替换的字面文本；replace_all 为 false 时必须恰好出现一次。', { required: true }),
    P('new_string', '新文本', 'string', '替换后的字面文本；空字符串表示删除。', { required: true }),
    P('replace_all', '全部替换', 'boolean', '是否替换所有匹配项，默认 false。'),
    P('sandbox_permissions', '沙箱权限', 'string', '沙箱拒绝后一次性重试所需的最窄更宽权限。', { enum: SANDBOX }),
    P('justification', '理由', 'string', '配合沙箱权限：一句话说明为何需要更宽权限。'),
  ]),
  T('glob', '按模式找文件', '按 glob 模式查找文件（不含目录），包含隐藏与被忽略的文件，按修改时间排序。', [
    P('pattern', '模式', 'string', 'glob 模式，例如 "**/*.ts"、"src/**/*.test.js"。', { required: true }),
    P('path', '目录', 'string', '搜索起始目录，默认为会话工作目录；相对路径按它解析。'),
  ]),
  T('grep', '搜索文件内容', '用 ripgrep 正则搜索文件内容，返回带行号的匹配行并按文件分组。', [
    P('pattern', '正则', 'string', '要搜索的 ripgrep 正则表达式。', { required: true }),
    P('path', '路径', 'string', '要搜索的文件或目录，默认为会话工作目录。'),
    P('include', '文件过滤', 'string', '单个 glob 过滤器，例如 "*.ts"、"*.{js,jsx}"。'),
  ]),

  T('skill', '加载技能', '加载一项技能的完整说明。当任务点名技能或明显匹配技能描述时，先调用它再开始行动。', [
    P('name', '技能名', 'string', '技能目录中的精确名称。', { required: true }),
  ]),
  T('web_search', '联网搜索', '搜索互联网获取最新信息，返回可选的摘要与来源 URL 列表。', [
    P('queries', '查询词', 'array', '1–4 条搜索查询，结果会合并。', { required: true, items: { type: 'string' } }),
  ]),
  T('web_fetch', '抓取网页', '抓取指定 HTTP(S) URL 的内容并解码为文本。', [
    P('url', '网址', 'string', '要抓取的 HTTP(S) URL。', { required: true }),
  ]),
  T('pwsh', '执行 PowerShell', '执行一条 PowerShell 命令并返回标准输出/错误。每次调用都是全新的 pwsh 进程。', [
    P('description', '描述', 'string', '5–10 个词、主动语态的简短说明，会显示在界面上。', { required: true }),
    P('command', '命令', 'string', '要执行的 PowerShell 命令。', { required: true }),
    P('timeoutMs', '超时毫秒', 'number', '超时毫秒数；到期后命令转入后台而不是被杀掉。'),
    P('workdir', '工作目录', 'string', '命令的工作目录，默认为会话工作目录。'),
    P('run_in_background', '后台运行', 'boolean', '是否立即在后台运行并返回任务 id。'),
    P('sandbox_permissions', '沙箱权限', 'string', '沙箱拒绝后一次性重试所需的最窄更宽权限。', { enum: SANDBOX }),
    P('justification', '理由', 'string', '配合沙箱权限：一句话说明为何需要更宽权限。'),
  ]),
  T('read_image', '读取图片', '读取 PNG/JPEG/WebP/GIF 图片并返回图像本身；大图会自动缩小。', [
    P('file_path', '文件路径', 'string', '图片文件路径。', { required: true }),
  ]),

  T('cordis_inspect_list', '列出检查提供者', '列出宿主已知的 Cordis 检查提供者（含客户端清单）。编写或配置插件前先调用它。'),
  T('cordis_inspect_query', '查询检查提供者', '运行某个检查提供者声明的只读查询。platform、provider、method 必须来自「列出检查提供者」的结果。', [
    P('platform', '平台', 'string', '拥有该提供者的运行时平台。', { required: true, enum: ['host', 'client'] }),
    P('provider', '提供者', 'string', '「列出检查提供者」返回的精确提供者 id。', { required: true }),
    P('method', '方法', 'string', '提供者清单声明的精确方法名。', { required: true }),
    P('input', '输入', 'object', '可选的查询输入，必须满足该方法的输入 schema。', { passthrough: true }),
  ]),

  T('get_goal', '读取目标', '读取当前会话目标，包含 update_goal 所需的 id 与 revision。'),
  T('create_goal', '创建目标', '创建一个持久化目标，让本会话在自动续轮中持续推进。用于长线任务，不用于单轮工作。', [
    P('objective', '目标', 'string', '从用户直接请求中推断出的具体完成目标。', { required: true }),
    P('max_goal_rounds', '最大轮数', 'number', '可选的自动续轮次数上限（正整数）。'),
  ]),
  T('update_goal', '更新目标', '更新当前会话目标。edit/pause/resume 需要用户直接提出；complete/blocked 可在自动续轮中使用。', [
    P('goal_id', '目标编号', 'string', '读取目标返回的精确 id。', { required: true }),
    P('revision', '修订号', 'number', '读取目标返回的精确正整数修订号。', { required: true }),
    P('action', '操作', 'string', 'edit / pause / resume / complete / blocked。', { required: true, enum: GOAL_ACTION }),
    P('objective', '目标', 'string', '仅 edit 有效：替换后的目标。'),
    P('max_goal_rounds', '最大轮数', 'number', '仅 edit 有效：替换后的续轮上限。'),
    P('blocked_reason', '阻塞原因', 'string', '仅 blocked 必填：连续多轮持续存在、导致无法推进的具体条件。'),
  ]),

  T('ask_user_question', '询问用户', '在需要确认、选择或补充信息时，向用户提出一个简明的问题。', [
    P('questions', '问题列表', 'array', '要提出的问题；某题未选且无自定义输入表示用户跳过。', {
      required: true,
      items: [
        P('id', '编号', 'string', '该问题的稳定 id，会原样回显在答案中。', { required: true }),
        P('question', '问题', 'string', '要问用户的具体问题。', { required: true }),
        P('header', '标题', 'string', '可选的短标题，如「确认」「选择模式」。'),
        P('options', '选项', 'array', '可选的下拉选项；推荐项放首位并加「(推荐)」。', {
          items: [
            P('label', '标签', 'string', '面向用户的简短选项标签。', { required: true }),
            P('description', '说明', 'string', '一句话说明取舍或影响。'),
          ],
        }),
        P('multi_select', '多选', 'boolean', '是否允许多选，默认 false。'),
      ],
    }),
  ]),
  T('todo_write', '任务清单', '记录并更新任务列表以规划多步工作并展示进度；每完成一步就把它标为 completed。', [
    P('todos', '任务列表', 'array', '完整的任务列表，替换之前的列表。', {
      required: true,
      items: [
        P('content', '内容', 'string', '任务是什么——一条简短的祈使句。', { required: true }),
        P('status', '状态', 'string', 'pending（未开始）/ in_progress（进行中）/ completed（已完成）。', { required: true, enum: ['pending', 'in_progress', 'completed'] }),
      ],
    }),
  ]),

  T('workflow', '运行工作流', '运行一段 JavaScript 工作流脚本，把工作分派给多个子代理（阶段、流水线、并行）。仅在用户明确要求工作流或大规模多代理编排时使用。', [
    P('script', '脚本', 'string', '纯 JavaScript 脚本体，顶层可 await，以 return <value> 结束。', { required: true }),
    P('meta', '元信息', 'object', '工作流身份：name、description，以及可选的 whenToUse、phases。', { passthrough: true }),
    P('args', '参数', 'object', '可选的 JSON 输入，在脚本中作为 args 全局暴露。', { passthrough: true }),
    P('run_in_background', '后台运行', 'boolean', '是否作为后台任务运行并立即返回任务 id。'),
  ]),
  T('list_agents', '列出子代理', '列出你启动的子代理及其 id、标签与状态。', [
    P('scope', '范围', 'string', 'children（默认，只列直接子级）或 descendants（列整棵子树）。', { enum: ['children', 'descendants'] }),
  ]),
  T('send_message', '给子代理发消息', '向一个可继续的直接子代理（或直接父代理）发送消息；返回投递确认，不是答复。', [
    P('agent_id', '代理编号', 'string', '目标代理的 id。', { required: true }),
    P('message', '消息', 'string', '要投递的消息内容。', { required: true }),
  ]),
  T('interrupt_agent', '中断子代理', '要求一个子代理停止当前工作；此调用立即返回，不等待它停止。', [
    P('agent_id', '代理编号', 'string', '由你创建的代理 id（直接子级或更深层后代）。', { required: true }),
  ]),
  T('exit_plan_mode', '提交计划', '仅在计划模式下使用：把计划交给用户审阅，获批后退出计划模式。', [
    P('plan', '计划', 'string', '完整的 Markdown 计划，以 # 标题开头并点明计划名称。', { required: true }),
  ]),
  T('list_subagent_models', '列出子代理模型', '查看可用的子代理模型而不改动当前代理；委托前先用它确认 provider/model id。', [
    P('provider', '供应方', 'string', '已注册的 LLM 供应方 id。'),
    P('model', '模型', 'string', '精确模型 id；需配合 provider。'),
  ]),
  T('subagent', '委派子代理', '把一个自包含的任务委派给独立上下文的子代理，使其不占用本会话上下文。', [
    P('description', '描述', 'string', '3–5 个词的简短任务描述，用于展示。', { required: true }),
    P('prompt', '任务', 'string', '完整、自包含的任务说明；子代理看不到本会话上下文。', { required: true }),
    P('provider', '供应方', 'string', '子代理 LLM 供应方 id（与 model 同时给出）。'),
    P('model', '模型', 'string', '该供应方下的模型 id。'),
    P('reasoning_effort', '推理强度', 'string', '模型特定的推理强度 id。'),
    P('cwd', '工作目录', 'string', '子代理初始工作目录，默认继承当前目录。'),
  ]),
  T('subagent_fork', '派生续写子代理', '把任务委派给一个继承本会话全部已完成轮次的子代理，适合基于上下文的后续分析或续写。', [
    P('description', '描述', 'string', '3–5 个词的简短任务描述。', { required: true }),
    P('prompt', '任务', 'string', '子代理的任务；它已看到本会话已完成的轮次。', { required: true }),
    P('cwd', '工作目录', 'string', '子代理初始工作目录，默认继承当前目录。'),
  ]),

  T('schedule_create', '创建定时任务', '创建一个定时任务；每次触发时把提示词投递到目标会话。仅在用户明确要求时创建。', [
    P('title', '标题', 'string', '不超过 120 字的任务名：动作加对象，不含时间、状态、id。', { required: true }),
    P('prompt', '提示词', 'string', '每次触发时投递的指令。', { required: true }),
    P('rrule', '重复规则', 'string', '一行 DTSTART 加一行 RRULE 的 RFC 5545 子集。', { required: true }),
    P('target', '目标', 'string', 'this_session（本会话）/ new_once（固定新会话）/ new（每次新会话）。', { required: true, enum: ['this_session', 'new_once', 'new'] }),
  ]),
  T('schedule_list', '列出定时任务', '列出定时任务，包含其他会话创建的任务；活跃任务优先。', [
    P('active', '仅活跃', 'boolean', 'true 只列活跃任务，false 只列已暂停/已结束，省略则列全部。'),
    P('limit', '每页数量', 'number', '分页大小 1–500，默认 100。'),
    P('offset', '偏移量', 'number', '跳过的任务数，默认 0。'),
  ]),
  T('schedule_view', '查看定时任务', '按 id 查看一个定时任务。', [
    P('id', '任务编号', 'string', '任务 id。', { required: true }),
  ]),
  T('schedule_edit', '修改定时任务', '按 id 更新、暂停、恢复或删除一个定时任务；删除不会撤回已排队的消息。', [
    P('id', '任务编号', 'string', '任务 id。', { required: true }),
    P('action', '操作', 'string', 'update（更新所提供字段）或 delete（删除）。', { required: true, enum: ['update', 'delete'] }),
    P('title', '标题', 'string', '新任务名。'),
    P('prompt', '提示词', 'string', '每次触发时投递的新指令。'),
    P('rrule', '重复规则', 'string', 'schedule_create 格式的新重复规则。'),
    P('target', '目标', 'string', '提供时替换投递目标。', { enum: ['this_session', 'new_once', 'new'] }),
    P('active', '启用', 'boolean', 'false 暂停；true 仅在其时间仍有未来触发点时恢复。'),
    P('expectedUpdatedAt', '预期更新时间', 'string', '最近一次返回该任务时的 updatedAt；若任务已变更则报冲突。'),
  ]),
];

/** 把一个参数节点列表编译成 JSON Schema 对象。useZh 决定属性键用中文还是英文。 */
function schemaForList(list, useZh) {
  const properties = {};
  const required = [];
  for (const p of list) {
    const key = useZh ? p.zh : p.en;
    properties[key] = schemaForNode(p, useZh);
    if (p.required) required.push(key);
  }
  const schema = { type: 'object', properties, additionalProperties: false };
  if (required.length > 0) schema.required = required;
  return schema;
}

function schemaForNode(p, useZh) {
  // 自由形态对象（如 cordis_inspect_query.input、workflow.meta）：原样透传，不翻译键名。
  if (p.passthrough) return { type: 'object', description: p.desc, additionalProperties: true };
  const node = { type: p.type, description: p.desc };
  if (p.enum) node.enum = p.enum;
  if (p.type === 'array') {
    if (Array.isArray(p.items)) node.items = schemaForList(p.items, useZh);
    else if (p.items && p.items.type) node.items = { type: p.items.type };
    else node.items = { type: 'string' };
  }
  if (p.type === 'object' && Array.isArray(p.properties)) {
    Object.assign(node, schemaForList(p.properties, useZh));
  }
  return node;
}

/** 构建中文别名工具的模型可见参数 schema。 */
export function buildParameters(params, useChineseKeys = true) {
  return schemaForList(params, useChineseKeys);
}

/** 把模型生成的中文键参数递归翻译回原工具的英文键；同时兼容模型直接给英文键。 */
function translateList(list, args) {
  if (args === null || typeof args !== 'object' || Array.isArray(args)) return args;
  const out = {};
  for (const p of list) {
    const hasZh = Object.prototype.hasOwnProperty.call(args, p.zh);
    const hasEn = Object.prototype.hasOwnProperty.call(args, p.en);
    if (!hasZh && !hasEn) continue;
    let value = hasZh ? args[p.zh] : args[p.en];
    if (!p.passthrough) {
      if (p.type === 'array' && Array.isArray(p.items) && Array.isArray(value)) {
        value = value.map((item) => translateList(p.items, item));
      } else if (p.type === 'object' && Array.isArray(p.properties) && value && typeof value === 'object') {
        value = translateList(p.properties, value);
      }
    }
    out[p.en] = value;
  }
  return out;
}

export function translateArgs(params, args) {
  return translateList(params, args);
}
