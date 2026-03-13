/** Short human-readable names for canonical model IDs. */
export const MODEL_DISPLAY: Record<string, string> = {
  'gpt-4o-mini':                                   'GPT-4o mini',
  'gpt-4o':                                        'GPT-4o',
  'claude-haiku-4-5-20251001':                     'Claude Haiku',
  'claude-sonnet-4-6':                             'Claude Sonnet',
  'claude-opus-4-6':                               'Claude Opus',
  'meta-llama/Llama-3.2-3B-Instruct-Turbo':        'Llama 3.2 3B',
  'mistralai/Mistral-7B-Instruct-v0.3':            'Mistral 7B',
  'Qwen/Qwen2.5-7B-Instruct':                      'Qwen 2.5 7B',
  'NousResearch/Nous-Hermes-2-Mixtral-8x7B-DPO':   'Nous Hermes 8x7B',
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct': 'Llama 4 Maverick',
  'Qwen/Qwen2.5-Coder-32B-Instruct':               'Qwen Coder 32B',
  'deepseek-ai/deepseek-coder-33b-instruct':       'DeepSeek Coder 33B',
  'Qwen/Qwen2.5-72B-Instruct':                     'Qwen 2.5 72B',
  'mistralai/Mixtral-8x22B-Instruct-v0.1':         'Mixtral 8x22B',
  'meta-llama/Llama-3.3-70B-Instruct':             'Llama 3.3 70B',
  'deepseek-ai/DeepSeek-V3':                       'DeepSeek V3',
};

/** Returns a short display name for a model ID, falling back to the last path segment. */
export function modelDisplayName(modelId: string): string {
  return MODEL_DISPLAY[modelId] ?? modelId.split('/').pop() ?? modelId;
}
