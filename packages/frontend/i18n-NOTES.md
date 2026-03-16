# i18n 多语言设计思路与注意事项

## 技术选型

### 为什么用 next-intl
- Next.js 14 App Router 原生支持
- Cookie-based locale 切换（`NEXT_LOCALE`），无需 URL 路由变更
- 支持 ICU MessageFormat（插值、复数、选择）
- 类型安全的 `useTranslations()` hook

### Cookie-based vs URL-based
选择了 cookie-based 方案：
- 不改变 URL 结构（`/pair/0x...` 而非 `/zh/pair/0x...`）
- SEO 对本项目不是核心需求（DeFi 工具类产品）
- 部署更简单，不需要 i18n routing middleware

## 架构设计

### 文件结构
```
packages/frontend/
├── i18n.ts                    # next-intl 配置（locales, defaultLocale, cookie）
├── messages/
│   ├── en.json                # 英文（主语言，也是 key 命名参考）
│   ├── zh.json                # 中文
│   ├── ja.json                # 日文
│   ├── ko.json                # 韩文
│   └── id.json                # 印尼语
└── components/
    └── LanguageSwitcher.tsx    # 语言切换下拉菜单
```

### Namespace 设计原则
1. **按 UI 区域划分**，而非按页面：`pairDetail` 包含详情页所有内容，`filter` 包含所有筛选相关
2. **通用文案集中**：`common` 放 Loading/Error/Retry 等跨组件复用的文案
3. **表格类单独拆分**：`holdersTable`、`tradersTable`、`liquidityTable` 各自独立，因为表头字段不同
4. **避免过度拆分**：一个组件通常只需要 1-2 个 namespace

### Hook 使用规范
```tsx
// 单个 namespace
const t = useTranslations('pairDetail')

// 多个 namespace 时用前缀区分
const t = useTranslations('pairDetail')
const tSec = useTranslations('security')
const tCommon = useTranslations('common')
```

## 关键设计决策

### 1. labelKey 模式（数组选项翻译）
**问题**：Filter 选项通常是数组 `[{ value, label }]`，label 硬编码英文。

**方案**：改为 `labelKey` + 运行时 `t()` 查找：
```tsx
// Before
const OPTIONS = [
  { value: '24h', label: 'Last 24 hours' },
]

// After
const OPTION_KEYS = [
  { value: '24h', labelKey: 'last24h' },
]
// 渲染时
{options.map(opt => <span>{t(opt.labelKey)}</span>)}
```

**好处**：数组定义可以放在组件外（常量），翻译在渲染时动态获取。

### 2. 逻辑字段 vs 显示字段分离
**问题**：翻译后，用于逻辑判断的字符串会 break。

**案例**：Security 风险等级
```tsx
// 翻译前能工作
if (contractRisk.level === 'High') → 红色
if (contractRisk.level === 'Medium') → 黄色

// 翻译后 break
contractRisk.level = '高风险' // 中文环境下
'高风险' === 'High' // false!
```

**方案**：拆分为 `key`（逻辑用）和 `level`（显示用）：
```tsx
const riskDot = {
  key: 'high',          // 逻辑判断用，永远是英文
  level: tSec('high'),  // 显示用，翻译后的文本
}
// 判断用 key
if (riskDot.key === 'high') → 红色
// 显示用 level
<span>{riskDot.level}</span>
```

### 3. ICU 插值 vs 字符串拼接
**规则**：所有包含动态值的文案都用 ICU 插值，不用 JS 模板字符串拼接。

```tsx
// Bad — 拼接会导致语序问题（不同语言词序不同）
`Trade on ${dexName}`
`${count} pairs`

// Good — ICU 插值，翻译者可以自由调整语序
t('tradeOn', { dex: dexName })     // en: "Trade on {dex}" / ja: "{dex}で取引"
t('pairCount', { count })          // en: "{count} pairs" / zh: "{count} 个交易对"
```

### 4. 不翻译的内容
以下内容保持英文不翻译：
- **技术缩写**：FDV, LP, PnL, USD, ETH, MA, OHLCV
- **品牌名**：Dexpress, Go+, Bubblemaps, Lightweight Charts, Twitter, Uniswap
- **区块链术语**：Honeypot（但可翻译解释性文本）
- **代码/地址**：合约地址、tx hash
- **console.log**：调试日志保持英文

## 常见陷阱

### 1. tsc 验证命令
```bash
# 正确
cd packages/frontend && ./node_modules/.bin/tsc --noEmit

# 错误 — pnpm filter 找不到 tsc script
pnpm --filter='@dex/frontend' tsc --noEmit

# 错误 — npx 可能调用到全局 tsc
npx tsc --noEmit
```

### 2. 禁止在 dev server 运行时 build
`pnpm build` 和 dev server 共用 `.next` 缓存目录，同时运行会导致 CSS 全部丢失。
验证类型只用 `tsc --noEmit`。

### 3. JSON 格式一致性
- 所有 5 个 JSON 文件的 namespace 和 key 必须完全一致
- key 在 namespace 内按字母排序
- 末尾不留多余逗号
- 使用 2 空格缩进

### 4. LanguageSwitcher 定位
- 使用 React Portal 渲染下拉菜单（避免被 overflow:hidden 裁剪）
- 自动检测上方/下方空间，决定向上还是向下展开
- 侧边栏收起时用 `iconOnly` 模式（只显示地球图标）

## 新增语言的步骤

如果需要添加第 6 种语言（如越南语 `vi`）：

1. 创建 `messages/vi.json`，从 `en.json` 复制结构，翻译所有 value
2. 在 `i18n.ts` 的 `locales` 数组中添加 `'vi'`
3. 在所有 JSON 的 `language` namespace 中添加 `"vi": "Tiếng Việt"`
4. `LanguageSwitcher.tsx` 中的 `LOCALES` 数组会自动从 `language` namespace 读取，无需修改

## 翻译质量
- 当前翻译由 AI 生成，覆盖 4 种目标语言（zh/ja/ko/id）
- 建议后续由母语使用者 review，特别是：
  - 金融/交易术语的本地化习惯
  - 日语敬语层级
  - 韩语书面语 vs 口语体
  - 印尼语正式度
