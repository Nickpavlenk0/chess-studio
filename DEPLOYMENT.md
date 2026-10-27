# Публикация Chess Studio

Проект подготовлен для GitHub Pages и Cloudflare Workers. Реальные пароли и токены не нужно вставлять в исходники или пересылать в чат. Фактический статус передачи: [docs/DELIVERY.md](docs/DELIVERY.md).

## 1. Репозитории GitHub

В аккаунте `Nickpavlenk0` создайте:

1. **Public** `chess-studio` — этот проект.
2. **Private** `chess-progress` — можно инициализировать README; Worker создаст `progress.json` при первом результате.

При первоначальной подготовке подключённая интеграция вернула `403 Resource not accessible by integration` при создании репозиториев. Нужен владелец аккаунта или GitHub-интеграция с разрешением создавать репозитории и доступом к обоим новым репозиториям. Доступ к существующим сторонним проектам не заменяет доступ к этим двум. Позднее владелец создал оба репозитория и открыл доступ. Если вы продолжаете текущую установку, повторно создавать их не нужно; актуальное состояние указано в docs/DELIVERY.md.

Из распакованного проекта (или существующего локального Git-репозитория):

```sh
# Выполняет владелец с обычной авторизацией GitHub CLI.
gh auth login
gh repo create Nickpavlenk0/chess-studio --public --description 'Персональная шахматная академия'
gh repo create Nickpavlenk0/chess-progress --private --add-readme

# Если .git уже существует, повторно git init выполнять не нужно.
git init -b main
git add .
git commit -m 'Build Chess Studio academy'
git remote add origin https://github.com/Nickpavlenk0/chess-studio.git
git push -u origin main
```

Если `origin` уже есть, проверьте `git remote -v`; не создавайте второй remote. Для восстановления предоставленного Git bundle можно выполнить `git clone chess-studio.bundle chess-studio`, после чего заменить локальный origin на GitHub URL.

Для отправки кода с `.github/workflows` учётная запись должна иметь права записи **Contents и Workflows**. Worker далее использует отдельный токен только для прогресса.

## 2. GitHub Pages

В `chess-studio` откройте **Settings → Pages → Build and deployment → Source → GitHub Actions**. Проверьте **Settings → Actions → General**, чтобы Actions были разрешены. Workflow [pages.yml](.github/workflows/pages.yml) выполняет lint, валидацию схем и контента, тесты, сборку, проверки Chromium и публикацию артефакта `dist`.

Если первая сборка завершилась до включения Pages, после настройки выберите **Actions → Test and publish academy → Run workflow** или повторите failed job.

Целевой адрес после успешной публикации:

```text
https://nickpavlenk0.github.io/chess-studio/
```

Это **целевой**, а не подтверждённый адрес уже опубликованного сайта. Фактический URL покажет job `deploy` и Settings → Pages.

Маршрутизация использует `HashRouter`: ссылки вида `/chess-studio/#/openings/ponziani` не требуют серверного SPA fallback и выдерживают обновление страницы. Vite `base` по умолчанию `/chess-studio/`. При другом имени репозитория задайте `VITE_BASE_PATH` на этапе сборки и обновите `FRONTEND_URL` Worker.

Сайт можно опубликовать до Worker: теория и доска работают, но приложение будет явно показывать, что синхронизация ещё не настроена.

## 3. Cloudflare и OAuth-приложение

В среде разработки сейчас нет авторизованного Cloudflare-аккаунта (`wrangler whoami`: not authenticated). Следующие действия выполняет владелец.

```sh
npm ci
npx wrangler login
```

В Cloudflare включите Workers и выберите свой `workers.dev` subdomain. Worker не требует D1, KV, R2, Durable Objects или постоянной базы Cloudflare. Встроенный binding `RATE_LIMITER` хранит только счётчики ограничения запросов.

В GitHub: **Settings → Developer settings → OAuth Apps → New OAuth App**:

- Name: `Chess Studio`.
- Homepage URL: `https://nickpavlenk0.github.io/chess-studio/`.
- Authorization callback URL: `https://chess-studio-api.axilles161.workers.dev/auth/callback`.

В [wrangler.toml](wrangler.toml) заполните только **несекретные** настройки:

| Переменная         | Значение                                           |
| ------------------ | -------------------------------------------------- |
| `API_URL`          | Точный HTTPS URL Worker, без завершающего `/`      |
| `FRONTEND_URL`     | HTTPS URL Pages, с путём `/chess-studio/`          |
| `GITHUB_CLIENT_ID` | Client ID созданного OAuth App; публичное значение |
| `OWNER_ID`         | `190060641` — числовой GitHub ID Nickpavlenk0      |
| `PROGRESS_OWNER`   | `Nickpavlenk0`                                     |
| `PROGRESS_REPO`    | `chess-progress`                                   |

OAuth не запрашивает `repo` scope: он нужен только для установления личности. Worker допускает исключительно пользователя с `OWNER_ID`; совпадение имени аккаунта в браузере не считается проверкой.

Разверните заготовку, чтобы создать Worker:

```sh
npx wrangler deploy
```

До настройки секретов защищённые операции будут отклоняться. Проверка готовности сборки без доступа к аккаунту: `npx wrangler deploy --dry-run`.

## 4. Минимальные права токена прогресса

Создайте **отдельный fine-grained Personal Access Token** в GitHub:

- Resource owner: `Nickpavlenk0`.
- Repository access: **Only select repositories → chess-progress**.
- Repository permissions: **Contents: Read and write**; Metadata Read-only добавляется GitHub.
- Не нужны права Administration, Workflows, Actions, Pages, других репозиториев или весь `repo` scope classic PAT.
- Выберите срок действия и сохраните дату обновления. При истечении приложение покажет ошибку синхронизации; результаты не будут ложно подтверждены.

Запишите секреты непосредственно в Cloudflare через защищённый ввод CLI:

```sh
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GITHUB_CLIENT_SECRET
openssl rand -base64 48 | npx wrangler secret put SESSION_SECRET
```

`GITHUB_CLIENT_SECRET` берётся из OAuth App; `GITHUB_TOKEN` — fine-grained PAT выше. `SESSION_SECRET` — случайный ключ HMAC с достаточной энтропией, не менее 43 символов. Эти значения не попадают в Git, Vite, GitHub Pages или JS браузера. Не называйте секреты префиксом `VITE_`.

Для локального `wrangler dev` можно использовать `.dev.vars`, который исключён из Git. Публичный сайт предназначен для HTTPS; не меняйте серверную проверку Origin ради обхода ошибок локальной настройки.

## 5. Подключение frontend к Worker

В текущей установке workflow `pages.yml` уже использует публичный адрес `https://chess-studio-api.axilles161.workers.dev` при сборке сайта. Вручную добавлять GitHub Actions Variable для этого аккаунта не требуется.

Для другого API URL задайте **Settings → Secrets and variables → Actions → Variables → VITE_API_URL**. Эта repository variable имеет приоритет над адресом по умолчанию:

```text
VITE_API_URL = https://chess-studio-api.axilles161.workers.dev
```

Это публичная настройка, не секрет. Перезапустите Pages workflow после изменения: Vite получает адрес во время сборки. Локально можно создать `.env` по `.env.example`; в Git его не добавлять. Без локальной переменной окружения приложение сохраняет гостевой режим без облачного API.

Для текущей установки можно подключить существующий Worker к репозиторию через [Cloudflare Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/):

1. В Cloudflare откройте `chess-studio-api` → **Settings → Builds → Connect**.
2. Подключите GitHub и разрешите Cloudflare доступ к `Nickpavlenk0/chess-studio`.
3. Выберите репозиторий `chess-studio` и production branch `main`.
4. Задайте параметры:

| Поле           | Значение                   |
| -------------- | -------------------------- |
| Root directory | `/` — корень репозитория   |
| Build command  | `npm run lint && npm test` |
| Deploy command | `npx wrangler deploy`      |

У проекта уже есть `wrangler.toml`, где `name = "chess-studio-api"`, `main = "worker/index.ts"`, публичный URL и OAuth Client ID. Cloudflare установит зависимости проекта и выполнит Wrangler для серверного Worker. Сайт продолжает публиковаться через GitHub Pages.

API token для Workers Builds Cloudflare может создать автоматически при подключении. Три секрета приложения (`GITHUB_TOKEN`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET`) должны оставаться в runtime **Settings → Variables and Secrets** существующего Worker. В Build variables их переносить не требуется. После подключения новый push в `main` запускает сборку и публикацию; для первой сборки можно использовать кнопку запуска/повтора в Builds либо новый commit.

После успешной публикации `https://chess-studio-api.axilles161.workers.dev/health` должен вернуть JSON с `service: "chess-studio"`, а обращение к `/api/progress` без авторизации — `401`. Ответ `Hello World!` означает, что рабочий код ещё не опубликован.

При желании настройте ручной workflow `worker.yml`: GitHub Environment `cloudflare`, Secrets `CLOUDFLARE_API_TOKEN` и `CLOUDFLARE_ACCOUNT_ID`. Cloudflare API token должен иметь Workers Scripts Edit и Account Settings Read для выбранного аккаунта. На своём домене для настройки маршрутов могут понадобиться дополнительные права Workers Routes. Секреты GitHub/OAuth остаются в **Worker Secrets**, workflow не копирует их в frontend.

## 6. Сессии, Android и CORS

1. Кнопка «Войти» открывает GitHub OAuth в popup. Worker проверяет подписанный state в HttpOnly cookie, обменивает одноразовый code и проверяет числовой ID владельца.
2. Результат — подписанная сессия на 1 час. Она передаётся только окну своего сайта через `postMessage` с точным origin; frontend проверяет также источник окна. Если popup недоступен, работает переход с одноразово считываемым URL fragment; fragment сразу удаляется из адресной строки.
3. В браузере сессия используется в памяти; Worker может также восстановить её из Secure HttpOnly SameSite=None cookie. В cookie нет прогресса или GitHub-токена.
4. После обновления приложение вызывает `/auth/session`, затем получает журнал из GitHub. Если Android блокирует сторонние cookie между `github.io` и `workers.dev`, восстановление cookie может не сработать. Нажмите «Войти» повторно: данные будут заново загружены из GitHub, локальная копия не нужна. Popup сохраняет неподтверждённую очередь в исходной вкладке.
5. Для автоматического восстановления без зависимости от сторонних cookie можно назначить Pages адрес `academy.example.com`, а Worker — `api.example.com`, затем изменить OAuth callback, `API_URL`, `FRONTEND_URL` и `VITE_API_URL`. Оба адреса должны быть HTTPS.
6. «Выйти» удаляет cookie и сессию из памяти. Как и любой stateless JWT, ранее выданная копия действительна до истечения 1 часа. Для аварийного отзыва всех сессий замените `SESSION_SECRET`.

Worker разрешает CORS только точному origin `FRONTEND_URL`, не использует `*` и независимо проверяет owner JWT на каждом запросе к прогрессу. CORS не является механизмом авторизации. Запрос без Origin тоже требует токен. Restore/logout cookie endpoints требуют точный Origin.

Система не даёт клиенту передавать GitHub URL, путь, branch, токен или имя репозитория. Есть ограничения тела, строгая схема, rate limit и обработка SHA-конфликтов. Ошибки не выводят секреты. Auth/API ответы имеют `Cache-Control: no-store`.

## 7. Проверка настоящей публикации

После настройки владельцем:

- Откройте сайт на Android; проверьте гостевую теорию и войдите владельцем.
- Решите задачу и дождитесь **«Сохранено»**. Убедитесь, что `progress.json` появился в приватном репозитории с соответствующим UUID и ходами.
- Обновите страницу и проверьте повторное чтение облака; при блокировке сторонних cookie повторите вход.
- На время отключите сеть, завершите упражнение, убедитесь в **«Ошибка синхронизации»**. Верните сеть и повторите отправку; проверьте один UUID в журнале, без дубликатов.
- Выйдите. Прямой GET `/api/progress` без Bearer-токена должен вернуть `401`. Другой аккаунт GitHub должен получить `403` после OAuth.
- Проверьте, что localStorage/IndexedDB не содержат прогресс, а публичный репозиторий не содержит личную историю.

Автотесты проверяют эти ветки на подменённых сетевых ответах. Настоящий OAuth, реальные Cloudflare Secrets и запись в GitHub требуют развёрнутых владельцем ресурсов; успешные unit/E2E-тесты сами по себе не подтверждают live-развёртывание.

## Диагностика ошибки синхронизации

При ошибке не закрывайте вкладку с неподтверждённым результатом. Кнопка экспорта журнала включает `pending`; экспорт можно сохранить как резервную копию перед любым обновлением страницы.

Страница `https://chess-studio-api.axilles161.workers.dev/api/storage-status` открывается отдельно и проверяет доступ сервера к GitHub без изменения файла прогресса. Она доступна только владельцу с действующей сессией (Bearer или HttpOnly cookie), не показывает токены, содержимое прогресса и необработанные ответы GitHub. Основной API прогресса по-прежнему требует Bearer-токен. Неавторизованный посетитель получает `401` до обращения к GitHub.

Коды: `GITHUB_TOKEN_INVALID` — GitHub отклонил токен; `GITHUB_REPOSITORY_UNAVAILABLE` — репозиторий недоступен токену; `GITHUB_PERMISSION_DENIED` — GitHub запретил операцию; `GITHUB_RATE_LIMITED` — лимит GitHub; `PROGRESS_DATA_INVALID` — проверка файла не пройдена, перезапись заблокирована. После исправления настройки вернитесь в исходную вкладку и нажмите «Повторить отправку»: UUID сохраняется и дублирование предотвращается.
