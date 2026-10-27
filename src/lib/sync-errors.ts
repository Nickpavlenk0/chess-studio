/** Fixed messages: never forward arbitrary GitHub response bodies or credentials. */
export const syncErrorMessages = {
  GITHUB_TOKEN_MISSING:
    "В Worker не задан секрет GITHUB_TOKEN для хранилища результатов.",
  GITHUB_TOKEN_INVALID:
    "GitHub отклонил токен хранилища. Проверьте GITHUB_TOKEN в секретах Worker. Повторный вход в студию этот токен не заменяет.",
  GITHUB_PERMISSION_DENIED:
    "GitHub запретил доступ к хранилищу. У токена Worker должен быть доступ к chess-progress и право Contents: Read and write.",
  GITHUB_REPOSITORY_UNAVAILABLE:
    "Приватный репозиторий результатов недоступен токену Worker. Проверьте, что для токена выбран chess-progress в Repository access.",
  GITHUB_RATE_LIMITED:
    "GitHub временно ограничил запросы. Сохраните эту вкладку открытой и повторите отправку позже.",
  GITHUB_UNAVAILABLE:
    "GitHub временно недоступен. Ответ остаётся в этой вкладке — повторите отправку позже.",
  PROGRESS_DATA_INVALID:
    "Файл прогресса в GitHub требует проверки. Существующие данные сохранены; автоматическая перезапись остановлена.",
  PROGRESS_NOT_PRIVATE:
    "Репозиторий прогресса должен быть приватным. Сохранение остановлено.",
} as const;
export type SyncErrorCode = keyof typeof syncErrorMessages;
export function knownSyncError(code: unknown): string | undefined {
  return typeof code === "string" && Object.hasOwn(syncErrorMessages, code)
    ? syncErrorMessages[code as SyncErrorCode]
    : undefined;
}
