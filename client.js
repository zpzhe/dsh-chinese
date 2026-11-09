/**
 * @local/dsh-chinese —— Client（Web）半部
 *
 * 职责：
 *   1. 通过 ctx.locale 注册本插件自己的命名空间词典（zh / en），让徽标文案
 *      随界面语言切换；所有可见文字都走 t()，不写死中文。
 *   2. 可选地把界面语言切到中文（switchUiLocale，默认关闭，尊重用户选择）。
 *   3. 在 conversation.composer.dock 挂一枚「全中文模式」状态徽标，提示
 *      思考、回复与工具调用均已中文化。
 *
 * 说明：DSH 的 Web UI 自带完整的 zh/en 内置词典，工具调用卡片的标题直接
 * 来自 wire name —— 本插件注册的中文别名工具本身就是中文名，因此卡片标题
 * 自然中文化；本半部不改写任何宿主组件、不读别的插件 DOM。
 *
 * 约定：动态 Client 半部使用 window.__ModuleLoader__.load 的 CJS 形态；
 * React 由浏览器模块表提供（require('react')），不重复安装。
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-chinese',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    const NS = 'dsh-chinese';
    const EN = {
      'badge.title': 'Full Chinese mode',
      'badge.subtitle': 'Thinking, replies and tool calls use Simplified Chinese',
      'badge.hint': 'Tool cards, parameter names and status labels are localized',
    };
    const ZH = {
      'badge.title': '全中文模式已启用',
      'badge.subtitle': '思考、回复与工具调用均使用简体中文',
      'badge.hint': '工具卡片、参数名与状态提示均已中文化',
    };

    /** 徽标组件：只使用 --dsw-alias-* 主题 token，随明暗主题自适应。 */
    function Badge({ t }) {
      const [open, setOpen] = React.useState(false);
      const style = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '3px 10px',
        borderRadius: 999,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-1)',
        color: 'var(--dsw-alias-label-secondary)',
        font: '400 12px/18px var(--dsw-font-family)',
        cursor: 'pointer',
        userSelect: 'none',
      };
      const dot = {
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--dsw-alias-state-success-primary)',
        flex: 'none',
      };
      const tip = {
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: 0,
        minWidth: 220,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-overlay)',
        color: 'var(--dsw-alias-label-primary)',
        font: '400 12px/18px var(--dsw-font-family)',
        boxShadow: '0 6px 20px rgba(0,0,0,.12)',
      };
      return h('div', { style: { position: 'relative', display: 'inline-block' } },
        h('button', {
          type: 'button',
          style,
          'aria-label': t('badge.title'),
          'aria-expanded': open,
          onClick: () => setOpen((v) => !v),
        },
          h('span', { style: dot, 'aria-hidden': true }),
          h('span', null, t('badge.title')),
        ),
        open && h('div', { style: tip, role: 'tooltip' },
          h('div', { style: { fontWeight: 600, marginBottom: 4 } }, t('badge.subtitle')),
          h('div', { style: { opacity: 0.85 } }, t('badge.hint')),
        ),
      );
    }

    return {
      inject: ['locale', 'slots'],
      apply(ctx) {
        const locale = ctx.locale;
        const slots = ctx.slots;

        // 1. 注册本插件命名空间的中英文词典；返回 disposer 交给 effect 托管。
        ctx.effect(() => locale.register(NS, { zh: ZH, en: EN }), 'dsh-chinese.locale');
        const t = locale.bind(NS);

        // 2. 可选：把界面语言切到中文。默认关闭，避免覆盖用户显式偏好。
        //    DSH 的 Web UI 自带完整 zh 内置词典，用户也可在
        //    「设置 → 通用 → 语言」中选择「中文」。本插件不擅自改写偏好；
        //    仅当宿主在页面引导数据中显式给出 switchUiLocale 标志时切换。
        try {
          const boot = globalThis.__DSH_BOOT__ || {};
          const candidates = [
            boot.packages?.['@local/dsh-chinese']?.config,
            boot.webPlugins?.['@local/dsh-chinese']?.config,
            boot.pluginConfigs?.['@local/dsh-chinese'],
          ];
          const cfg = candidates.find((c) => c && typeof c === 'object');
          if (cfg?.switchUiLocale === true) {
            const id = cfg.uiLocale === 'en' ? 'en' : 'zh';
            if (locale.getLocale().active !== id) locale.setLocale(id);
          }
        } catch {
          // 引导数据不可用：保持当前界面语言，不影响徽标。
        }

        // 3. 在 composer 下方的 ambient slot 挂状态徽标。
        //    ctx.slots.inject 的回调注册会在 owning declaration 折叠时回收。
        ctx.effect(() => slots.inject('conversation.composer.dock', () => slots.register({
          name: 'conversation.composer.dock',
          id: 'dsh-chinese-badge',
          order: 90,
          label: () => t('badge.title'),
        }, () => h(Badge, { t }))), 'dsh-chinese.badge');
      },
    };
  },
});
