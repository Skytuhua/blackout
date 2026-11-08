import type { GatewayStart } from '../shared/contracts';
export const CONVERSATION_PROMPT_VERSION = 'coworker-v2';
/** Old exact-wire interactions retain their original prompt semantics. */
export const usesConversationPolicy = (start: GatewayStart) => start.interactionMode === 'advisory' && start.promptVersion === CONVERSATION_PROMPT_VERSION;
