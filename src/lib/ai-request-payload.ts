/**
 * Completion messages for the assistant, Portfolio Notes Assistant,
 * Headmaster chat, and ticker notes.
 * The account name and email are not arguments and are not added here.
 */

export interface AiChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export const NEUTRAL_AI_GREETING = "Hello.";

export function assistantCompletionMessages(input: {
  systemPrompt: string;
  bookLine: string;
  history: readonly AiChatTurn[];
}): AiChatTurn[] {
  return [
    {
      role: "system",
      content: `${input.systemPrompt}\n\n${NEUTRAL_AI_GREETING} ${input.bookLine}`,
    },
    ...input.history,
  ];
}

export function portfolioCoachCompletionMessages(input: {
  systemPrompt: string;
  context: string;
  history: readonly AiChatTurn[];
  userMessage: string;
}): AiChatTurn[] {
  return [
    {
      role: "system",
      content: `${input.systemPrompt}\n\n${NEUTRAL_AI_GREETING}\n\nLive session context:\n${input.context}`,
    },
    ...input.history,
    { role: "user", content: input.userMessage },
  ];
}

export function headmasterCompletionMessages(input: {
  systemPrompt: string;
  context: string;
  history: readonly AiChatTurn[];
  userMessage: string;
}): AiChatTurn[] {
  return [
    {
      role: "system",
      content:
        `${input.systemPrompt}\n\n` +
        `${NEUTRAL_AI_GREETING} Here is the live unified portfolio snapshot — reason from it:\n\n${input.context}`,
    },
    ...input.history,
    { role: "user", content: input.userMessage },
  ];
}

export function tickerNoteCompletionMessages(input: {
  systemPrompt: string;
  symbol: string;
  securityName?: string;
  liveContext: string;
  question: string;
}): AiChatTurn[] {
  const label = input.securityName?.trim() || input.symbol;
  return [
    {
      role: "system",
      content:
        `${input.systemPrompt}\n\n` +
        `${NEUTRAL_AI_GREETING} You are analysing a SINGLE security. Focus tightly on ${label} (${input.symbol}). ` +
        `Use this live market data to ground your answer:\n${input.liveContext}`,
    },
    { role: "user", content: input.question },
  ];
}
