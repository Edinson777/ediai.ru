# flint — дневник тренировок (PWA + PHP)

Этап 1: каркас PWA и журнал тренировок **без синхронизации** — данные хранятся
локально на устройстве (IndexedDB). Работает офлайн, устанавливается на главный
экран (Android/iOS), две темы (светлая + тёмная по системе).

## Состав

| Файл | Назначение |
|---|---|
| `index.html` | Единственная страница приложения (ввод, история, экспорт/импорт) |
| `manifest.webmanifest` | Манифест PWA: имя Flint, standalone, иконки |
| `service-worker.js` | Офлайн-кэш. При изменении файлов приложения поднять `VERSION` |
| `css/styles.css` | Стили, светлая/тёмная темы |
| `js/db.js` | Слой данных IndexedDB (хранилище `workouts`) |
| `js/app.js` | Логика журнала, экспорт/импорт JSON, темы, установка |
| `icons/` | Иконки: 192/512, maskable 192/512, apple-touch-icon 180 |
| `oauth/callback.php` | Заглушка — реализуется в этапе 2 |
| `data/.htaccess` | Закрытый доступ к папке данных (SQLite и токены — этап 2) |
| `php-test.php` | Проверка PHP (удалить после проверки) |

## Формат записи (согласованный минимальный набор)

```json
{
  "id": "…",
  "date": "2026-11-23",
  "title": "верх — жим",
  "exercises": [
    { "name": "Жим лёжа", "weight": 60, "reps": 8, "sets": 4 }
  ],
  "createdAt": 1763870000000,
  "updatedAt": 1763870000000
}
```

`createdAt`/`updatedAt` — время в мс; они понадобятся для синхронизации (этап 3).

## Размещение

Папка целиком кладётся в корень репозитория `Edinson777/ediai.ru`: адрес
приложения — **https://ediai.ru/flint/**. Папку `/pwa` не трогать.
В `.gitignore` репозитория — строка `flint/data/`, в `robots.txt` — `Disallow: /flint`.

## Деплой

commit → `git push origin main` → Actions → «🚀 Deploy website to FTP» → Run workflow.
