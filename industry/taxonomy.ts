// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（教程、观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * tagColor 是飞书推送卡片里跟在标题后面的这一类小标签的颜色（飞书 text_tag 的颜色名）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 */
export const CATEGORIES = [
  {"key": "national-policy", "tagColor": "indigo", "label": "国家政策", "section": "国家政策", "guide": "中央部门发布的汽车产业、准入、税费、消费与安全监管政策。明确发布机关、效力阶段与适用条件；地方执行文件归地方政策，出口政策归汽车出口。"},
  {"key": "local-policy", "tagColor": "turquoise", "label": "地方政策", "section": "地方政策", "guide": "省市汽车补贴、置换更新、限购限行、产业扶持、充电基础设施与地方实施细则。不得把地方适用范围写成全国。"},
  {"key": "industry", "tagColor": "orange", "label": "企业动态", "section": "企业动态", "guide": "中国市场中资、合资与外方独资车企的经营、产销、投资、组织、渠道与合作动态。所有制仅据明确材料标注，不由品牌国别推断。"},
  {"key": "products", "tagColor": "indigo", "label": "产品动态", "section": "产品动态", "guide": "车型上市、预售、改款、价格权益、配置与OTA更新。区分预售和上市、指导价和成交价；长安马自达官方产品发布也归此类。"},
  {"key": "service", "tagColor": "green", "label": "客户服务", "section": "客户服务", "guide": "售后政策、质保、召回、服务网络、充电补能与客户权益。正式召回归此类，长马个体投诉及评价归长马口碑。"},
  {"key": "export", "tagColor": "violet", "label": "汽车出口", "section": "汽车出口", "guide": "汽车出口的中国及目的国政策、认证、关税、通道、销量与企业出海动态；使用国内公开来源，区分生效政策、提案与媒体解读。"},
  {"key": "mazda-feedback", "tagColor": "purple", "label": "长马口碑", "section": "长马口碑", "guide": "长安马自达车型的媒体实测、车主评价、公开投诉及后续回应。保留媒体观点/车主自述/投诉待核实的归属；无分母不得推算缺陷率或整体满意度。"},
  {"key": "digital-ai", "tagColor": "turquoise", "label": "数字化与AI", "section": "数字化与AI", "guide": "按内容价值关注汽车数智应用、跨行业企业转型与To B应用、AI厂商与产业动态、经证据评估的社区及非官方实践。通用AI消息不要求汽车关联；不把其他行业案例写成汽车落地。非汽车的数字化政策归此栏，保留政策性质与适用范围；以汽车政策、车型或服务变化为核心的材料仍归相应汽车栏目。"},
] as const satisfies ReadonlyArray<{ key: string; tagColor: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布（AI 行业是新模型）：日报报头的“N 个新模型”、改分类后修订已出的报告都按它数。
 * category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 * 没有这样一类的行业设成 null，报头就不显示这个数。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "products", tag: "车型发布", unit: "项车型发布" };

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = ["ai", "api", "llm", "gpu", "ceo", "ipo", "bev", "phev", "hev", "reev", "ota", "adas", "cltc", "wltp", "nedc", "suv", "dms", "crm", "mes"];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["vehicle_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "产品更新", "车型发布", "论文/研究", "开源/仓库", "教程/实践", "现象/趋势", "观点分析", "评测/基准", "安全/对齐", "行业动态", "政策/监管",
  "其他",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "国家政策", "地方政策", "以旧换新", "税费补贴", "汽车出口", "关税认证", "中资车企", "合资车企", "外方独资车企", "新能源汽车", "燃油车", "销量经营", "渠道营销", "客户服务", "召回质保", "媒体评测", "车主口碑", "客户投诉", "数字化", "AI提效", "智能制造", "数据治理", "智能驾驶", "智能座舱", "EZ-6", "EZ-60", "CX-50", "CX-5", "CX-30", "昂克赛拉",
  "汽车数智应用", "企业转型应用", "AI产业动态", "AI社区观察",
  "AI应用·国内", "AI应用·国际",
  "Agent", "编码", "推理", "多模态", "语音", "视频", "图像生成", "RAG", "端侧", "数据/训练", "搜索", "部署/工程", "开源生态", "具身智能", "MCP/工具调用",
] as const;

/** 可选的实体标签（公司、机构、平台）。 */
export const ENTITY_TAGS = ["长安马自达", "马自达株式会社", "长安汽车", "比亚迪", "吉利汽车", "奇瑞汽车", "长城汽车", "上汽集团", "中国一汽", "东风汽车", "广汽集团", "蔚来", "小鹏汽车", "理想汽车", "零跑汽车", "小米汽车", "特斯拉", "一汽大众", "上汽大众", "广汽丰田", "一汽丰田", "东风本田", "华晨宝马", "北京奔驰", "OpenAI", "Anthropic", "DeepSeek", "DeepMind", "Google", "Meta", "Microsoft", "xAI", "Hugging Face", "GitHub", "arXiv"] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  "教程/玩法": "教程/实践", "技巧/最佳实践": "教程/实践", "合作/生态": "行业动态", "融资/收购": "行业动态", "公司动态": "行业动态",
  合作: "行业动态", 生态: "行业动态", 融资: "行业动态", 收购: "行业动态", 投资: "行业动态", 并购: "行业动态",
  政策: "政策/监管", 监管: "政策/监管", 法规: "政策/监管", 安全: "安全/对齐", 对齐: "安全/对齐",
  论文: "论文/研究", 研究: "论文/研究", paper: "论文/研究", papers: "论文/研究",
  "open-source": "开源/仓库", 开源: "开源/仓库", 仓库: "开源/仓库", repo: "开源/仓库",
  教程: "教程/实践", 玩法: "教程/实践", 指南: "教程/实践", 技巧: "教程/实践", 最佳实践: "教程/实践", 实践: "教程/实践",
  产品: "产品更新", 更新: "产品更新", 新车: "车型发布", 车型上市: "车型发布", 趋势: "现象/趋势", 现象: "现象/趋势", 观点: "观点分析",
  视频生成: "视频", 非ai: "其他", "non-ai": "其他", 通用工具: "其他", 工程工具: "其他",
  安全扫描: "其他", devops: "其他", 行业: "行业动态", 动态: "行业动态",
};

// 技术供应商身份用于核对汽车数智、企业应用和AI产业材料；是否收录仍按材料内容判断。
// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；orgNames 是这家公司发消息时开头用的组织名（公司、实验室、团队），
 * 在它自己的主题页上读者知道说的是谁，可以省去；otherNames 是公司的其他称呼（官方账号名、子品牌）。
 * 所有这些名字都用来认出说的是哪家公司，比如把事实的主体对到发布方。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = {
  chezhiwang: { name: "车质网", displayTag: null, aliases: ["车质网"] },
  "changan-mazda": {"name": "长安马自达", "displayTag": "长安马自达", "aliases": ["长安马自达", "长马", "Changan Mazda"], "orgNames": ["长安马自达"]},
  "mazda": {"name": "马自达株式会社", "displayTag": "马自达株式会社", "aliases": ["马自达株式会社", "Mazda Motor Corporation"], "orgNames": ["马自达株式会社"]},
  "changan": {"name": "长安汽车", "displayTag": "长安汽车", "aliases": ["长安汽车", "Changan Automobile"], "orgNames": ["长安汽车"]},
  "byd": {"name": "比亚迪", "displayTag": "比亚迪", "aliases": ["比亚迪", "BYD"], "orgNames": ["比亚迪"]},
  "geely": {"name": "吉利汽车", "displayTag": "吉利汽车", "aliases": ["吉利汽车", "Geely"], "orgNames": ["吉利汽车"]},
  "chery": {"name": "奇瑞汽车", "displayTag": "奇瑞汽车", "aliases": ["奇瑞汽车", "Chery"], "orgNames": ["奇瑞汽车"]},
  "gwm": {"name": "长城汽车", "displayTag": "长城汽车", "aliases": ["长城汽车", "GWM"], "orgNames": ["长城汽车"]},
  "saic": {"name": "上汽集团", "displayTag": "上汽集团", "aliases": ["上汽集团", "SAIC Motor"], "orgNames": ["上汽集团"]},
  "faw": {"name": "中国一汽", "displayTag": "中国一汽", "aliases": ["中国一汽", "FAW Group"], "orgNames": ["中国一汽"]},
  "dongfeng": {"name": "东风汽车", "displayTag": "东风汽车", "aliases": ["东风汽车", "Dongfeng Motor"], "orgNames": ["东风汽车"]},
  "gac": {"name": "广汽集团", "displayTag": "广汽集团", "aliases": ["广汽集团", "GAC Group"], "orgNames": ["广汽集团"]},
  "nio": {"name": "蔚来", "displayTag": "蔚来", "aliases": ["蔚来", "NIO"], "orgNames": ["蔚来"]},
  "xpeng": {"name": "小鹏汽车", "displayTag": "小鹏汽车", "aliases": ["小鹏汽车", "XPENG"], "orgNames": ["小鹏汽车"]},
  "li-auto": {"name": "理想汽车", "displayTag": "理想汽车", "aliases": ["理想汽车", "Li Auto"], "orgNames": ["理想汽车"]},
  "leapmotor": {"name": "零跑汽车", "displayTag": "零跑汽车", "aliases": ["零跑汽车", "Leapmotor"], "orgNames": ["零跑汽车"]},
  "xiaomi-auto": {"name": "小米汽车", "displayTag": "小米汽车", "aliases": ["小米汽车", "Xiaomi EV"], "orgNames": ["小米汽车"]},
  "tesla": {"name": "特斯拉", "displayTag": "特斯拉", "aliases": ["特斯拉", "Tesla"], "orgNames": ["特斯拉"]},
  "faw-vw": {"name": "一汽大众", "displayTag": "一汽大众", "aliases": ["一汽-大众", "一汽大众", "FAW-Volkswagen"], "orgNames": ["一汽-大众"]},
  "saic-vw": {"name": "上汽大众", "displayTag": "上汽大众", "aliases": ["上汽大众", "SAIC Volkswagen"], "orgNames": ["上汽大众"]},
  "gac-toyota": {"name": "广汽丰田", "displayTag": "广汽丰田", "aliases": ["广汽丰田", "GAC Toyota"], "orgNames": ["广汽丰田"]},
  "faw-toyota": {"name": "一汽丰田", "displayTag": "一汽丰田", "aliases": ["一汽丰田", "FAW Toyota"], "orgNames": ["一汽丰田"]},
  "dongfeng-honda": {"name": "东风本田", "displayTag": "东风本田", "aliases": ["东风本田", "Dongfeng Honda"], "orgNames": ["东风本田"]},
  "bmw-brilliance": {"name": "华晨宝马", "displayTag": "华晨宝马", "aliases": ["华晨宝马", "BMW Brilliance"], "orgNames": ["华晨宝马"]},
  "beijing-benz": {"name": "北京奔驰", "displayTag": "北京奔驰", "aliases": ["北京奔驰", "Beijing Benz"], "orgNames": ["北京奔驰"]},

  "world-labs": { name: "World Labs", displayTag: null, aliases: ["World Labs"] },
  "thinking-machines": { name: "Thinking Machines Lab", displayTag: null, aliases: ["Thinking Machines"] },
  amd: { name: "AMD", displayTag: null, aliases: ["AMD", "Advanced Micro Devices"] },
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT", "Sora", "Codex", "GPT"], orgNames: ["OpenAI"], otherNames: ["OpenAI Developers"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"], orgNames: ["Anthropic"], otherNames: ["Claude Code"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "DeepMind", "Gemini", "谷歌"], orgNames: ["Google DeepMind", "Google Research", "Google", "DeepMind", "谷歌"], otherNames: ["Google AI", "Google Labs", "Google Cloud"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"], orgNames: ["DeepSeek", "深度求索"] },
  qwen: { name: "千问 Qwen", displayTag: null, aliases: ["Qwen", "通义", "阿里"], orgNames: ["通义千问", "通义实验室", "阿里巴巴", "阿里云", "阿里", "Qwen Team", "Qwen", "Alibaba"], otherNames: ["千问", "千问APP", "Alibaba Cloud"] },
  kimi: { name: "Kimi / 月之暗面", displayTag: null, aliases: ["Kimi", "月之暗面", "Moonshot"], orgNames: ["Moonshot AI", "月之暗面", "Kimi"] },
  minimax: { name: "MiniMax", displayTag: null, aliases: ["MiniMax", "海螺"], orgNames: ["MiniMax", "稀宇科技"] },
  zhipu: { name: "智谱 GLM", displayTag: null, aliases: ["智谱", "GLM", "Z.ai"], orgNames: ["智谱AI", "智谱", "Zhipu AI", "Z.ai"], otherNames: ["Zhipu"] },
  xai: { name: "xAI", displayTag: "xAI", aliases: ["xAI", "Grok"], orgNames: ["SpaceX Super Intelligence", "SpaceXAI", "SpaceXSI", "xAI"], otherNames: ["Grok Bot"] },
  meta: { name: "Meta", displayTag: "Meta", aliases: ["Meta", "Llama"], orgNames: ["Meta Superintelligence Labs", "Meta AI", "Meta"], otherNames: ["AI at Meta", "Muse"] },
  microsoft: { name: "Microsoft", displayTag: "Microsoft", aliases: ["Microsoft", "微软", "Copilot"], orgNames: ["Microsoft Research", "Microsoft AI", "Microsoft", "微软"] },
  nvidia: { name: "NVIDIA", displayTag: null, aliases: ["NVIDIA", "英伟达"], orgNames: ["NVIDIA", "英伟达"] },
  "hugging-face": { name: "Hugging Face", displayTag: "Hugging Face", aliases: ["Hugging Face"], orgNames: ["Hugging Face", "HuggingFace"] },
  cursor: { name: "Cursor", displayTag: null, aliases: ["Cursor", "Anysphere"], orgNames: ["Cursor"] },
  openrouter: { name: "OpenRouter", displayTag: null, aliases: ["OpenRouter"], orgNames: ["OpenRouter"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "changan-mazda", name: "长安马自达", patterns: [/长安马自达|长马|Changan\ Mazda/i] },
  { id: "mazda", name: "马自达株式会社", patterns: [/马自达株式会社|Mazda\ Motor\ Corporation/i] },
  { id: "changan", name: "长安汽车", patterns: [/长安汽车|Changan\ Automobile/i] },
  { id: "byd", name: "比亚迪", patterns: [/比亚迪|BYD/i] },
  { id: "geely", name: "吉利汽车", patterns: [/吉利汽车|Geely/i] },
  { id: "chery", name: "奇瑞汽车", patterns: [/奇瑞汽车|Chery/i] },
  { id: "gwm", name: "长城汽车", patterns: [/长城汽车|GWM/i] },
  { id: "saic", name: "上汽集团", patterns: [/上汽集团|SAIC\ Motor/i] },
  { id: "faw", name: "中国一汽", patterns: [/中国一汽|FAW\ Group/i] },
  { id: "dongfeng", name: "东风汽车", patterns: [/东风汽车|Dongfeng\ Motor/i] },
  { id: "gac", name: "广汽集团", patterns: [/广汽集团|GAC\ Group/i] },
  { id: "nio", name: "蔚来", patterns: [/蔚来|NIO/i] },
  { id: "xpeng", name: "小鹏汽车", patterns: [/小鹏汽车|XPENG/i] },
  { id: "li-auto", name: "理想汽车", patterns: [/理想汽车|Li\ Auto/i] },
  { id: "leapmotor", name: "零跑汽车", patterns: [/零跑汽车|Leapmotor/i] },
  { id: "xiaomi-auto", name: "小米汽车", patterns: [/小米汽车|Xiaomi\ EV/i] },
  { id: "tesla", name: "特斯拉", patterns: [/特斯拉|Tesla/i] },
  { id: "faw-vw", name: "一汽大众", patterns: [/一汽\-大众|一汽大众|FAW\-Volkswagen/i] },
  { id: "saic-vw", name: "上汽大众", patterns: [/上汽大众|SAIC\ Volkswagen/i] },
  { id: "gac-toyota", name: "广汽丰田", patterns: [/广汽丰田|GAC\ Toyota/i] },
  { id: "faw-toyota", name: "一汽丰田", patterns: [/一汽丰田|FAW\ Toyota/i] },
  { id: "dongfeng-honda", name: "东风本田", patterns: [/东风本田|Dongfeng\ Honda/i] },
  { id: "bmw-brilliance", name: "华晨宝马", patterns: [/华晨宝马|BMW\ Brilliance/i] },
  { id: "beijing-benz", name: "北京奔驰", patterns: [/北京奔驰|Beijing\ Benz/i] },

  { id: "openai", name: "OpenAI", patterns: [/openai|chatgpt|\bgpt-?[o\d]|\bsora\b|\bcodex\b/i] },
  { id: "anthropic", name: "Anthropic", patterns: [/anthropic|\bclaude\b/i, /\b(?:opus|sonnet|haiku)\s*\d+(?:[.\-]\d+)*\b/i, /\bfable\s*\d+(?:[.\-]\d+)*\b|\bmythos\b/i] },
  { id: "google", name: "Google / Gemini", patterns: [/google|deepmind|\bgemini\b|notebooklm|\bveo\s?\d|\bAlphaFold\b|\bAMIE\b/i] },
  { id: "deepseek", name: "DeepSeek", patterns: [/deepseek|深度求索/i] },
  { id: "xai", name: "xAI / Grok", patterns: [/\bxai\b|\bgrok\b/i] },
  { id: "meta", name: "Meta / Llama", patterns: [/\bMeta\b/, /\bmeta\s?ai\b|\bllama\b/i] },
  { id: "microsoft", name: "Microsoft / Copilot", patterns: [/microsoft|copilot|微软/i] },
  { id: "nvidia", name: "NVIDIA", patterns: [/nvidia|英伟达|\bnemotron\b|\bnemo\b|\bblackwell\b|\brubin(?:\s+ultra)?\b|\bcuda\b/i] },
  { id: "qwen", name: "千问 Qwen", patterns: [/\bqwen|通义|千问/i] },
  { id: "hugging-face", name: "Hugging Face", patterns: [/hugging\s?face/i] },
  { id: "cursor", name: "Cursor", patterns: [/\bCursor\b/] },
  { id: "kimi", name: "Kimi / 月之暗面", patterns: [/\bkimi\b|月之暗面|\bmoonshot\s?ai\b/i] },
  { id: "openrouter", name: "OpenRouter", patterns: [/openrouter/i] },
  { id: "minimax", name: "MiniMax", patterns: [/minimax/i] },
  { id: "zhipu", name: "智谱 GLM", patterns: [/智谱|\bglm-?[4-9]/i] },
  { id: "hunyuan", name: "腾讯混元", patterns: [/混元|hunyuan/i] },
  { id: "doubao", name: "字节豆包", patterns: [/豆包|doubao|字节跳动|bytedance/i] },
  { id: "mistral", name: "Mistral", patterns: [/mistral/i] },
  { id: "perplexity", name: "Perplexity", patterns: [/\bPerplexity\b/] },
  { id: "runway", name: "Runway", patterns: [/\brunway\b/i] },
  { id: "suno", name: "Suno", patterns: [/\bsuno\b/i] },
  { id: "midjourney", name: "Midjourney", patterns: [/midjourney/i] },
  { id: "stability-ai", name: "Stability AI", patterns: [/stability\s?ai/i] },
  { id: "elevenlabs", name: "ElevenLabs", patterns: [/eleven\s?labs/i] },
  { id: "vllm", name: "vLLM", patterns: [/\bvllm\b/i] },
  { id: "ollama", name: "Ollama", patterns: [/\bollama\b/i] },
  { id: "windsurf", name: "Windsurf", patterns: [/windsurf/i] },
  { id: "devin", name: "Devin", patterns: [/\bdevin\b/i] },
  { id: "manus", name: "Manus", patterns: [/\bmanus\b/i] },
  { id: "apple", name: "Apple AI", patterns: [/\bapple\s?(intelligence|silicon|ai)\b|苹果(智能|\s?AI)/i] },
  { id: "amazon", name: "Amazon / AWS", patterns: [/amazon|\baws\b|亚马逊/i] },
  { id: "baidu", name: "百度文心", patterns: [/百度|baidu|文心|\bernie\s?bot\b/i] },
];

/** 这些域名上的文章，发布方就是对应的公司（托管平台如 GitHub、arXiv 不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  {"entityId": "changan-mazda", "domains": ["changan-mazda.com.cn"]},
  {"entityId": "mazda", "domains": ["mazda.com"]},
  {"entityId": "changan", "domains": ["changan.com.cn"]},
  {"entityId": "byd", "domains": ["byd.com"]},
  {"entityId": "geely", "domains": ["geely.com"]},
  {"entityId": "chery", "domains": ["chery.cn"]},
  {"entityId": "gwm", "domains": ["gwm.com.cn"]},
  {"entityId": "saic", "domains": ["saicmotor.com"]},
  {"entityId": "faw", "domains": ["faw.com.cn"]},
  {"entityId": "dongfeng", "domains": ["dfmc.com.cn"]},
  {"entityId": "gac", "domains": ["gac.com.cn"]},
  {"entityId": "nio", "domains": ["nio.cn"]},
  {"entityId": "xpeng", "domains": ["xiaopeng.com"]},
  {"entityId": "li-auto", "domains": ["lixiang.com"]},
  {"entityId": "leapmotor", "domains": ["leapmotor.com"]},
  {"entityId": "xiaomi-auto", "domains": ["xiaomiev.com"]},
  {"entityId": "tesla", "domains": ["tesla.cn"]},
  {"entityId": "faw-vw", "domains": ["faw-vw.com"]},
  {"entityId": "saic-vw", "domains": ["csvw.com"]},
  {"entityId": "gac-toyota", "domains": ["gtmc.com.cn"]},
  {"entityId": "faw-toyota", "domains": ["ftms.com.cn"]},
  {"entityId": "dongfeng-honda", "domains": ["dongfeng-honda.com"]},
  {"entityId": "bmw-brilliance", "domains": ["bmw-brilliance.cn"]},
  {"entityId": "beijing-benz", "domains": ["bbac.com.cn"]},

  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "anthropic", domains: ["anthropic.com", "claude.com"] },
  { entityId: "google", domains: ["deepmind.google", "ai.google", "blog.google"] },
  { entityId: "deepseek", domains: ["deepseek.com"] },
  { entityId: "xai", domains: ["x.ai"] },
  { entityId: "meta", domains: ["ai.meta.com"] },
  { entityId: "microsoft", domains: ["microsoft.com"] },
  { entityId: "nvidia", domains: ["nvidia.com"] },
  { entityId: "qwen", domains: ["qwen.ai"] },
  { entityId: "cursor", domains: ["cursor.com"] },
  { entityId: "openrouter", domains: ["openrouter.ai"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "meta", pattern: /@AIatMeta\b/i },
  { entityId: "zhipu", pattern: /\bZhipu(?:\s+AI\b|['’]s\b)/i },
];
