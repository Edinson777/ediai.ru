<?php
// Публичная точка входа вебхука MAX: https://ваш-домен/maxbot/index.php
// MAX присылает сюда POST с событием; отвечаем 200 сразу (лимит 30 с), обработка — после ответа.
require __DIR__ . '/lib/bootstrap.php';

if (PHP_SAPI === 'cli') {
    fwrite(STDERR, "index.php — вебхук: его вызывает MAX по HTTPS. Для запуска polling используйте: php run.php\n");
    exit(1);
}

// Проверка живости для мониторинга
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET' && ($_SERVER['REQUEST_URI'] ?? '') === '/health') {
    header('Content-Type: text/plain');
    echo 'ok';
    exit;
}

// Секрет вебхука: MAX присылает его в заголовке X-Max-Bot-Api-Secret
$secret = (string)cfg('webhook_secret');
if ($secret !== '' && ($_SERVER['HTTP_X_MAX_BOT_API_SECRET'] ?? '') !== $secret) {
    bot_log('WARN', 'Вебхук с неверным секретом отклонён');
    http_response_code(403);
    header('Content-Type: application/json');
    echo '{"success":false}';
    exit;
}

ignore_user_abort(true);
@set_time_limit(180);

$raw = file_get_contents('php://input');

// Отвечаем немедленно — тело и его длину задаём явно, чтобы клиент не ждал завершения обработки
$resp = '{"success":true}';
header('Content-Type: application/json');
header('Connection: close');
header('Content-Length: ' . strlen($resp));
http_response_code(200);
echo $resp;
if (function_exists('fastcgi_finish_request')) {
    fastcgi_finish_request();
} else {
    while (ob_get_level() > 0) {
        @ob_end_flush();
    }
    flush();
}

$update = json_decode((string)$raw, true);
if (!is_array($update)) {
    bot_log('ERROR', 'Не удалось разобрать JSON вебхука: ' . mb_substr((string)$raw, 0, 200));
    exit;
}
try {
    bot_handle_update($update);
} catch (Throwable $e) {
    bot_log('ERROR', 'Ошибка обработки события: ' . $e->getMessage());
}
