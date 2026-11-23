<?php
/**
 * Flint — OAuth callback (заглушка этапа 1).
 * Реальная реализация добавляется в этапе 2: обмен authorization_code
 * на токены Яндекс ID, сохранение refresh-токена в SQLite (flint/data/),
 * редирект обратно в приложение с временным кодом входа.
 */
http_response_code(503);
header('Content-Type: text/plain; charset=utf-8');
echo "OAuth-колбэк подключается в этапе 2.\nСейчас доступна офлайн-версия журнала: https://ediai.ru/flint/\n";
