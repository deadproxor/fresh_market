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
