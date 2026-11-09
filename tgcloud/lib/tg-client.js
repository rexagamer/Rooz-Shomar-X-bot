import { api } from 'sdk';

const withMarkup = (base, keyboard) =>
  keyboard && keyboard.length ? { ...base, reply_markup: { inline_keyboard: keyboard } } : base;

export function createTelegramClient() {
  return {
    send: (chatId, text, keyboard) =>
      api.sendMessage(withMarkup({ chat_id: chatId, text, parse_mode: 'HTML' }, keyboard)),

    // Omitting reply_markup on edit removes the old buttons.
    async edit(chatId, messageId, text, keyboard) {
      try {
        await api.editMessageText(
          withMarkup({ chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML' }, keyboard),
        );
      } catch (error) {
        if (String(error?.description ?? '').includes('message is not modified')) return;
        await api.sendMessage(withMarkup({ chat_id: chatId, text, parse_mode: 'HTML' }, keyboard));
      }
    },

    async answer(callbackQueryId, text) {
      try {
        await api.answerCallbackQuery(
          text ? { callback_query_id: callbackQueryId, text } : { callback_query_id: callbackQueryId },
        );
      } catch { /* an expired query id is harmless */ }
    },
  };
}
