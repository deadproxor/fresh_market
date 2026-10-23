# Supabase Edge Functions & Database Migrations (FreshMarket)

Данный каталог содержит бессерверные функции (Deno / TypeScript) и миграции базы данных для архитектурной изоляции секретов и версионирования схемы (§3.4 Аудита v3, Пакет 4).

---

## 1. Edge Functions (Deno / TypeScript)

### Доступные функции:

1. **`cloudinary-destroy`**:
   - **Назначение:** Безопасное серверное удаление фотографий из Cloudinary по `public_id`.
   - **Безопасность:**
     - Проверяет JWT токен вызывающего на наличие роли `admin` (`user.app_metadata.role === 'admin'`).
     - Секреты (`cloudinary_cloud_name`, `cloudinary_api_key`, `cloudinary_api_secret`) читаются из защищенного хранилища Supabase Vault / Secrets.
     - Сигнатура SHA-1 рассчитывается на сервере; секреты никогда не передаются в браузер.
   - **Запрос:** `POST /functions/v1/cloudinary-destroy` с телом `{"public_id": "freshmarket/item_xyz"}`.

2. **`gemini-vision`**:
   - **Назначение:** Серверное распознавание продуктов через Google Gemini Vision API.
   - **Безопасность:**
     - Проверяет JWT токен на роль `admin`.
     - Ключ `gemini_api_key` хранится в Supabase Secrets.
   - **Запрос:** `POST /functions/v1/gemini-vision` с телом `{"imageBase64": "...", "mimeType": "image/jpeg"}`.

---

## 2. Развертывание и настройка секретов

### Установка секретов в Supabase:
Через Supabase CLI или в веб-панели управления (*Project Settings -> Edge Functions -> Secrets*):

```bash
supabase secrets set \
  cloudinary_cloud_name="your_cloud_name" \
  cloudinary_api_key="your_api_key" \
  cloudinary_api_secret="your_api_secret" \
  gemini_api_key="your_gemini_api_key"
```

### Способ А. Развертывание через Supabase CLI:

```bash
# Развертывание функции удаления Cloudinary
supabase functions deploy cloudinary-destroy --project-ref qifazsptdgcskrchfocc

# Развертывание функции распознавания Gemini
supabase functions deploy gemini-vision --project-ref qifazsptdgcskrchfocc
```

### Способ Б. Автоматическое развертывание через GitHub Actions:

В репозитории настроен workflow [`.github/workflows/deploy-edge-functions.yml`](file:///.github/workflows/deploy-edge-functions.yml), который автоматически деплоит функции при пуше в ветки `feature/beta` и `main` при изменении файлов в каталоге `supabase/functions/`.

Для работы деплоя добавьте в репозитории GitHub (*Settings -> Secrets and variables -> Actions*):
* `SUPABASE_ACCESS_TOKEN` — персональный токен из [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens).
* `SUPABASE_PROJECT_ID` — ID проекта: `qifazsptdgcskrchfocc`.

Также доступен ручной запуск workflow кнопкой **«Run workflow»** во вкладке Actions репозитория.

---

## 3. Обратная совместимость клиента (Graceful Fallback)

Клиентский код админки ([admin/js/admin-catalog.js](file:///Users/elwis/dev/FreshMarket/admin/js/admin-catalog.js)) настроен по принципу **Edge Function First**:
- Сначала отправляется запрос в Supabase Edge Function (`this.sb.functions.invoke(...)`).
- Если функция еще не развернута или возвращает ошибку, админка мягко использует локальные настройки из `localStorage` (если они заданы закупщиком вручную).
- После развертывания функций ввод секретов в браузере больше не требуется.

---

## 4. Миграции базы данных (`supabase/migrations/`)

Схема и политики базы данных переведены из монолитного документа в версионированные файлы миграций согласно стандарту Supabase CLI (§3.4, §5 Аудита v3, Пакет 4, Шаг 4б):

```text
supabase/migrations/
├── 20261017000000_initial_schema.sql         # Базовые таблицы (products, orders, order_items, profiles), индексы, триггеры
├── 20261018000000_security_hardening.sql      # RLS политики, is_admin(), protect_profile_role(), RPC create_order
├── 20261020000000_hardening_v4.sql           # Rate Limiting, таймзона UTC+7, cart_updated_at, Realtime, зачистка RLS
└── 20261023000000_idempotent_order_creation.sql # Идемпотентность create_order(), возврат существующего заказа до rate limit
```

### Применение миграций:

#### Способ 1. Через Supabase CLI:
```bash
# Привязать проект к репозиторию (разово)
supabase link --project-ref qifazsptdgcskrchfocc

# Применить все новые миграции к удаленной базе данных
supabase db push
```

#### Способ 2. Через Supabase Dashboard (SQL Editor):
Если Supabase CLI не установлен локально, файлы миграций можно поочередно выполнить в **SQL Editor** панели [Supabase Dashboard](https://supabase.com/dashboard/project/qifazsptdgcskrchfocc/sql):
1. Выполнить `20261017000000_initial_schema.sql` (создание таблиц, типов и триггеров).
2. Выполнить `20261018000000_security_hardening.sql` (активация RLS, ограничение прямого INSERT, RPC `create_order`).

Подробное руководство по бизнес-логике и настройке авторизации сохранено в [SUPABASE_SETUP.md](file:///Users/elwis/dev/FreshMarket/SUPABASE_SETUP.md).

