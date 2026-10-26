// 本站模型统一通过本机 Magpie 的 OpenAI 兼容入口。
// 清单来自 2026-10-26 /v1/models 的12项；新增或移除模型后需同步本配置并重启API/worker。
// 具名项为可选模型，不代表全业务评测通过；后台选择与评测记录见 docs/local-development.md。
// 先保留文本输入；图像与各模型参数经样本评测后另行启用。
import type { ModelPreset } from "@aihot/contracts/site-config";
export type { ModelPreset } from "@aihot/contracts/site-config";

export const PRESETS: Record<string, ModelPreset> = {
  "magpie/auto/deepseek-v4.1-flash": {
    service: "llm", model: "auto/deepseek-v4.1-flash",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/auto/glm-5.3-flash": {
    service: "llm", model: "auto/glm-5.3-flash",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/group/smart-split": {
    service: "llm", model: "group/smart-split",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/open-design-go/deepseek-v4.1-flash": {
    service: "llm", model: "open-design-go/deepseek-v4.1-flash",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/open-design-go/glm-5.3-flash": {
    service: "llm", model: "open-design-go/glm-5.3-flash",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/open-design-go/glm-5.3-flashx": {
    service: "llm", model: "open-design-go/glm-5.3-flashx",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/codex/gpt-6-luna": {
    service: "llm", model: "codex/gpt-6-luna",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/workbuddy/deepseek-v4.1-flash": {
    service: "llm", model: "workbuddy/deepseek-v4.1-flash",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/workbuddy/glm-5.3-flash": {
    service: "llm", model: "workbuddy/glm-5.3-flash",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/antigravity/gemini-4-argon": {
    service: "llm", model: "antigravity/gemini-4-argon",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/antigravity/gemini-3.8-flash": {
    service: "llm", model: "antigravity/gemini-3.8-flash",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/antigravity/claude-sonnet-5-5": {
    service: "llm", model: "antigravity/claude-sonnet-5-5",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
};

/**
 * 未经后台或环境覆盖的步骤使用 .env 指定的本机 Magpie Gemini。
 * 各步骤的实际选择在后台“模型与评测”设置并审计；不在此写死，以免代码默认值覆盖测试隔离。
 */
export const DEFAULTS: Record<string, string> = {};
