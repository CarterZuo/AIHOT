// 本站模型统一通过本机 Magpie 的 OpenAI 兼容入口。
// 清单来自 2026-10-25 /v1/models；新增或移除模型后需同步本配置并重启API/worker。
// 具名项为可选模型，不代表全业务评测通过；本机已评测步骤的后台选择见 docs/local-development.md。
// 先保留文本输入；图像与各模型参数经样本评测后另行启用。
import type { ModelPreset } from "@aihot/contracts/site-config";
export type { ModelPreset } from "@aihot/contracts/site-config";

export const PRESETS: Record<string, ModelPreset> = {
  "magpie/codex/gpt-6.1-sol": {
    service: "llm", model: "codex/gpt-6.1-sol",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/codex/gpt-6-astra": {
    service: "llm", model: "codex/gpt-6-astra",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/codex/gpt-6-luna": {
    service: "llm", model: "codex/gpt-6-luna",
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
  "magpie/antigravity/claude-opus-5-5": {
    service: "llm", model: "antigravity/claude-opus-5-5",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
  "magpie/antigravity/claude-sonnet-5-5": {
    service: "llm", model: "antigravity/claude-sonnet-5-5",
    baseUrlEnv: "LLM_BASE_URL", apiKeyEnv: "LLM_API_KEY",
    reasoningTokens: 4096, jsonMode: true, vision: false,
  },
};

/** 未经后台或环境覆盖的步骤使用 .env 指定的本机 Magpie Gemini。 */
export const DEFAULTS: Record<string, string> = {};
