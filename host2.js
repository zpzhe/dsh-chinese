/**
 * @local/dsh-chinese —— Host 半部（v1.0.2）
 *
 * 职责：
 *   A. 中文思考/回复：注入一段中文语言策略提示词（systemPrompt.section）。
 *   B. 工具定义本地化 + 中文工具调用：为每个 Agent 注册一组「中文别名工具」
 *      （中文名 / 中文描述 / 中文参数键），其 execute 把中文参数翻译回英文后
 *      转发给缓存的原工具定义。
 *   C. 隐藏被映射的英文原工具：在同一个 agent.ctx 上调用
 *      ctx.tools.restrict({ deny })，让该 Agent 只看得到中文工具。
 *   D. 中文工具速查表：注入系统提示词，列出中文名与用途。
 *
 * 为什么按 Agent 注册（而非全局）：
 *   绝大多数内置工具由 preset 挂载到 Agent 作用域，Host 全局 view 里看不到
 *   它们。ToolsService.get/schemas 的 scope 是显式参数，必须传入 agent；
 *   agent/created 是 serial 事件，在 agent-loop 的 setup(agent.ctx, agent)
 *   ——即 preset 工具挂载——之后才发射，此时能取到该 Agent 继承的全部工具。
 *   别名工具注册在 agent.ctx 的 own 层，按 ToolsService.view() 规则，own 层
 *   注册不受 restrict 掩码影响，而继承来的英文原名会被 restrict({ deny }) 隐藏。
 *
 * 设计原则（见 references/practices.md）：
 *   - 注册资源一律用 ctx.effect 托管，插件卸载时全部回收。
 *   - 不改写别人的工具定义（注册表里的 definition 属于其提供者）。
 *   - 不新增 Session 事件类型；别名调用只产生一次 tool/call，名字是中文名。
 *   - 映射不到的工具保持原样，绝不隐藏、绝不破坏（渐进降级）。
 */

import { TOOL_CATALOG, buildParameters, translateArgs } from './catalog.js';

/** 本插件只依赖所有 preset 都具备的两个服务。 */
export const inject = ['tools', 'systemPrompt'];

const SECTION_LANGUAGE = 'chinese:language-policy';
const SECTION_QUICKREF = 'chinese:tool-quickref';

/** 中文语言策略：思考、回复、工具调用一律使用简体中文。 */
const LANGUAGE_POLICY = [
  '【语言约定 · 必须遵守】',
  '你正在「全中文模式」下工作。以下约定优先级高于其它所有风格要求：',
  '1. 你的内部思考、推理、分析与计划（含思维链、草稿、自我检查）全部使用简体中文。不要出现英文的推理句子。',
  '2. 你的回复、说明、报错解释、任务清单与总结全部使用简体中文；专有名词、代码、命令、路径、API 名、工具参数值保持原文，不做翻译。',
  '3. 调用工具时一律使用本插件提供的中文工具名与中文参数名；参数值（路径、命令、代码、URL 等）保持原文。',
  '4. 如果某个能力没有对应的中文工具，才可以使用其英文原名，并在回复中用中文说明原因。',
  '5. 引用文件内容、日志、搜索结果等原始资料时保留原文，但你对它们的叙述必须是中文。',
].join('\n');

/** 生成中文工具速查表。 */
function quickReference(entries) {
  const lines = [
    '【中文工具速查表】',
    '下列工具已启用中文名称与中文参数。调用时请使用中文名；括号内是对应的原始能力，仅供理解，不要用它来调用。',
  ];
  for (const entry of entries) {
    const names = entry.params.length > 0
      ? `，参数：${entry.params.map((p) => p.zh).join('、')}`
      : '，无参数';
    lines.push(`- ${entry.zh}（${entry.en}）：${entry.desc}${names}`);
  }
  lines.push('未列出的工具保持英文原名；遇到时按「语言约定」第 4 条处理。');
  return lines.join('\n');
}

/**
 * 构造一个中文别名工具定义。
 *
 * 复用原工具的 output.schema 与 output.render，保证返回值契约与展示内容
 * 与原工具完全一致；只在两处做翻译：
 *   - output.render 收到的参数先翻译回英文键，再交给原 render
 *   - execute 收到的中文键参数先翻译回英文键，再交给原 execute
 *
 * exec 原样透传，不构造副本：deferContext()/concludeTurn() 等闭包方法依赖
 * 原 execution 对象，展开会破坏 concludeTurn 的 this 绑定。
 */
function buildAlias(entry, original) {
  const parameters = buildParameters(entry.params, true);
  const render = original.output?.render;
  const schema = original.output?.schema ?? { type: 'json' };
  return {
    name: entry.zh,
    description: entry.desc,
    parameters,
    output: {
      schema,
      render: (args, value) => {
        if (typeof render !== 'function') return [{ type: 'text', text: JSON.stringify(value ?? null) }];
        return render(translateArgs(entry.params, args), value);
      },
    },
    execute: (args, exec) => original.execute(translateArgs(entry.params, args), exec),
  };
}

/** 为一个 Agent 建立中文别名工具并隐藏英文原名。返回该 Agent 的 disposer。 */
function localizeAgent(agent, options, totals) {
  const agentCtx = agent?.ctx;
  if (!agentCtx || !agentCtx.tools) return () => {};
  const owned = [];

  // 1. 按该 Agent 的作用域查询并缓存原工具定义。
  //    ToolsService.get(name, scope) 的 scope 是显式参数，不从 ctx 推断；
  //    必须把 agent 传进去，否则拿到的是 global view。
  const found = new Map(); // enName -> { entry, definition }
  for (const entry of TOOL_CATALOG) {
    let definition;
    try {
      definition = agentCtx.tools.get(entry.en, agent);
    } catch {
      definition = undefined;
    }
    if (definition && typeof definition.execute === 'function') {
      found.set(entry.en, { entry, definition });
    }
  }

  // 2. 注册中文别名工具到 agent.ctx 的 own 层（不受 restrict 掩码影响）。
  const active = [];
  if (options.chineseToolNames) {
    for (const { entry, definition } of found.values()) {
      let alias;
      try {
        alias = buildAlias(entry, definition);
      } catch {
        continue; // 单个工具构造失败不影响其它工具
      }
      try {
        owned.push(agentCtx.effect(() => agentCtx.tools.register(alias), `dsh-chinese.alias(${entry.zh})`));
        active.push(entry);
      } catch {
        // 同名工具已由别的插件占用：跳过，英文原名也不隐藏。
      }
    }
  }

  // 3. 隐藏成功别名化的英文原名。
  if (options.hideEnglishTools && active.length > 0) {
    try {
      owned.push(agentCtx.effect(
        () => agentCtx.tools.restrict({ deny: active.map((e) => e.en) }),
        'dsh-chinese.hide-english-tools',
      ));
    } catch {
      // 该 Agent 的工具集已被其它策略限制；中文别名仍可用。
    }
  }

  totals.agents += 1;
  totals.aliases += active.length;
  totals.hidden += options.hideEnglishTools ? active.length : 0;

  // 4. 该 Agent 的中文速查表（挂在 agent.ctx 上，只对这个 Agent 生效）。
  if (options.chineseQuickReference && active.length > 0 && agentCtx.systemPrompt?.section) {
    try {
      owned.push(agentCtx.effect(() => agentCtx.systemPrompt.section({
        name: SECTION_QUICKREF,
        order: 2,
        text: quickReference(active),
        interpolate: false,
      }), 'dsh-chinese.tool-quickref'));
    } catch {
      // 该 preset 未注入 systemPrompt 时忽略；全局语言策略仍然生效。
    }
  }

  // 双重所有权：agent 销毁时框架会自行回收；插件卸载时也主动回收一次。
  return () => {
    for (const dispose of owned.reverse()) {
      try { dispose(); } catch { /* 已随 agent 释放 */ }
    }
  };
}

export function apply(ctx, config = {}) {
  const options = {
    languagePolicy: config.languagePolicy ?? true,
    chineseToolNames: config.chineseToolNames ?? true,
    hideEnglishTools: config.hideEnglishTools ?? true,
    chineseQuickReference: config.chineseQuickReference ?? true,
    switchUiLocale: config.switchUiLocale ?? false,
    uiLocale: config.uiLocale ?? 'zh-CN',
  };

  const totals = { agents: 0, aliases: 0, hidden: 0 };

  // ---- 1. 中文语言策略（全局，所有 Agent 继承）---------------------------
  if (options.languagePolicy) {
    ctx.effect(
      () => ctx.systemPrompt.section({
        name: SECTION_LANGUAGE,
        // 紧跟 DEPLOYMENT_PERSONA_PREFIX(0)，在其它工具说明之前生效。
        order: 1,
        text: LANGUAGE_POLICY,
        interpolate: false,
      }),
      'dsh-chinese.language-policy',
    );
  }

  // ---- 2. 按 Agent 注册别名工具 -------------------------------------------
  // agent/created 是 serial：在 preset 工具挂载之后发射，可安全查询 agent 作用域。
  // agent.dispose 会回收 agentCtx.effect 的全部注册；这里再按 Agent 记录一份
  // disposer 到插件自己的 effect 中，保证插件卸载时也能立即回收。
  const perAgent = new Map();
  const localize = (agent) => {
    if (!agent || perAgent.has(agent)) return;
    const disposer = localizeAgent(agent, options, totals);
    perAgent.set(agent, disposer);
  };

  ctx.effect(() => {
    const off = ctx.on('agent/created', (payload) => localize(payload?.agent));
    // 兼容 HMR / 热安装：为已经存在的 Agent 补做一次。
    const agents = ctx.get('agents');
    if (agents && typeof agents.list === 'function') {
      for (const agent of agents.list()) localize(agent);
    }
    return () => {
      off();
      for (const disposer of perAgent.values()) {
        try { disposer(); } catch { /* 已随 agent 释放 */ }
      }
      perAgent.clear();
    };
  }, 'dsh-chinese.agents');

  // ---- 3. 生命周期日志 -----------------------------------------------------
  // 不向 Client 暴露 RPC：动态 Client 半部只依赖 ctx.locale / ctx.slots，
  // 与 Host 之间无需私有通道，避免依赖未公开的桥接 API。
  // 中文别名工具的 wire name 本身就是中文，因此工具调用卡片标题会自然中文化。
  ctx.effect(() => {
    try {
      ctx.logger?.info?.(
        `dsh-chinese v1.0.2: 全中文模式已启用（按 Agent 注册；累计 ${totals.agents} 个 Agent、${totals.aliases} 个中文工具）`,
      );
    } catch { /* 日志不可用不影响功能 */ }
    return () => {};
  }, 'dsh-chinese.log');

  return () => {}; // 所有资源已交给 ctx.effect 托管
}
