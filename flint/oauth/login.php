<?php
/**
 * Flint — вход через Яндекс ID (этап 2).
 * 1) создаёт одноразовый state (CSRF) в SQLite на 15 минут;
 * 2) перенаправляет на страницу согласия oauth.yandex.ru
 *    (право cloud_api:disk.app_folder запрашивается настройками приложения).
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

header('Content-Type: text/html; charset=utf-8');

if (FLINT_CLIENT_ID === '' || FLINT_CLIENT_SECRET === '') {
    http_response_code(503);
    echo '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">'
       . '<meta name="viewport" content="width=device-width, initial-scale=1">'
       . '<title>Flint — вход не настроен</title></head>'
       . '<body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px">'
       . '<h2>Flint: вход не настроен</h2>'
       . '<p>Серверная часть ещё не получила ClientID/ClientSecret.</p>'
       . '<p>Создайте <code>secrets.php</code> по шаблону из инструкции этапа 2 '
       . 'и проверьте <code>oauth/check.php</code>.</p>'
       . '<p><a href="../">← Вернуться в журнал</a></p></body></html>';
    exit;
}

try {
    $db = flint_db();

    // одноразовые state живут 15 минут — старые чистим
    $db->exec('DELETE FROM oauth_states WHERE created_at < ' . (time() - 900));

    $state = bin2hex(random_bytes(16));
    $db->prepare('INSERT INTO oauth_states (state, created_at) VALUES (?, ?)')
       ->execute([$state, time()]);

    $params = http_build_query([
        'response_type' => 'code',
        'client_id'     => FLINT_CLIENT_ID,
        'redirect_uri'  => flint_redirect_uri(),
        'state'         => $state,
        'force_confirm' => 'yes',
    ]);
    header('Location: https://oauth.yandex.ru/authorize?' . $params);
    exit;
} catch (Throwable $e) {
    http_response_code(500);
    echo 'Ошибка входа: ' . htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8');
}
