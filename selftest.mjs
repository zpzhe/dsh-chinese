/**
 * 离线自测：不依赖 DSH 运行时，只验证 catalog.js 的 schema 生成与参数翻译。
 *
 *   node selftest.mjs
 *
 * 期望输出：每个样例的中文参数被还原为原工具英文键，且 schema-ok 等于 total。
 */
import { TOOL_CATALOG, buildParameters, translateArgs } from './catalog.js';

let ok = 0;
let bad = 0;
for (const entry of TOOL_CATALOG) {
  const schema = buildParameters(entry.params, true);
  if (schema.type !== 'object' || !schema.properties) {
    console.error('BAD schema:', entry.en);
    bad++;
    continue;
  }
  JSON.stringify(schema); // 必须是可序列化的纯 JSON
  ok++;
}

const cases = [
  ['read', { 文件路径: 'a.txt', 起始行: 10, 行数上限: 5 }],
  ['todo_write', { 任务列表: [{ 内容: '第一步', 状态: 'in_progress' }] }],
  ['ask_user_question', { 问题列表: [{ 编号: 'q1', 问题: '选哪个？', 选项: [{ 标签: '甲', 说明: '快' }], 多选: false }] }],
  ['present', { 文件列表: [{ 路径: 'x.md', 说明: '报告' }] }],
  ['pwsh', { 描述: '列出目录', 命令: 'Get-ChildItem', 后台运行: false }],
  ['cordis_inspect_query', { 平台: 'host', 提供者: 'Service', 方法: 'listService', 输入: { service: 'tools' } }],
];
for (const [en, zhArgs] of cases) {
  const entry = TOOL_CATALOG.find((e) => e.en === en);
  console.log(en, '=>', JSON.stringify(translateArgs(entry.params, zhArgs)));
}

const e = TOOL_CATALOG.find((x) => x.en === 'read');
console.log('兼容英文键 =>', JSON.stringify(translateArgs(e.params, { file_path: 'b.txt', offset: 3 })));
console.log(`schema-ok=${ok} bad=${bad} total=${TOOL_CATALOG.length}`);
if (bad > 0 || ok !== TOOL_CATALOG.length) process.exitCode = 1;
