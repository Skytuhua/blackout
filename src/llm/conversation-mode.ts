import type { GatewayStart } from '../shared/contracts';
export const CONVERSATION_PROMPT_VERSION = 'coworker-v3';
/** Old exact-wire interactions retain their original prompt semantics. */
export const usesNaturalConversation = (start: GatewayStart) => start.interactionMode === 'conversation' && start.promptVersion === CONVERSATION_PROMPT_VERSION;
export const usesConversationPolicy = (start: GatewayStart) => usesNaturalConversation(start) || start.interactionMode === 'advisory' && start.promptVersion === 'coworker-v2';
