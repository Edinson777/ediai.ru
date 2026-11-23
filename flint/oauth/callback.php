<?php
/**
 * Flint — OAuth callback (этап 2).
 * Проверяет state, обменивает code на токены (POST oauth.yandex.ru/token),
 * получает профиль (login.yandex.ru/info), сохраняет пользователя и сессию,
 * ставит cookie сессии и возвращает в приложение. Refresh-токен остаётся
 * в SQLite — наружу (в PWA) токены не отдаются.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/http.php';

function flint_html(string $title, string $body, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8">'
       . '<meta name="viewport" content="width=device-width, initial-scale=1">'
       . '<title>' . htmlspecialchars($title, ENT_QUOTES, 'UTF-8') . '</title></head>'
       . '<body style="font-family:sans-serif;max-width:640px;margin:40px auto;padding:0 16px">'
       . $body
       . '<p><a href="../">← В журнал Flint</a></p></body></html>';
    exit;
}

// Яндекс может вернуть отказ (пользователь не дал согласие)
if (!empty($_GET['error'])) {
    flint_html(
        'Flint — вход отменён',
        '<h2>Вход отменён</h2><p>Яндекс сообщил: '
        . htmlspecialchars((string) $_GET['error'], ENT_QUOTES, 'UTF-8') . '</p>'
    );
}

$code  = (string) ($_GET['code'] ?? '');
$state = (string) ($_GET['state'] ?? '');
if ($code === '' || $state === '') {
    flint_html(
        'Flint — ошибка входа',
        '<h2>Не хватает параметров</h2><p>В callback не пришли code или state.</p>',
        400
    );
}

if (FLINT_CLIENT_ID === '' || FLINT_CLIENT_SECRET === '') {
    flint_html(
        'Flint — не настроено',
        '<h2>Сервер не настроен</h2><p>ClientID/ClientSecret не заданы (см. инструкцию этапа 2).</p>',
        503
    );
}

try {
    $db = flint_db();

    // state: одноразовый, живёт 15 минут
    $st = $db->prepare('SELECT created_at FROM oauth_states WHERE state = ?');
    $st->execute([$state]);
    $row = $st->fetch();
    $db->prepare('DELETE FROM oauth_states WHERE state = ?')->execute([$state]);
    if (!$row || (time() - (int) $row['created_at']) > 900) {
        flint_html(
            'Flint — ошибка входа',
            '<h2>Недействительный state</h2><p>Ссылка устарела или была использована повторно. '
            . 'Вернитесь в журнал и войдите заново.</p>',
            400
        );
    }

    // обмен кода на токены
    [$status, $token] = flint_http_post_form('https://oauth.yandex.ru/token', [
        'grant_type'    => 'authorization_code',
        'code'          => $code,
        'client_id'     => FLINT_CLIENT_ID,
        'client_secret' => FLINT_CLIENT_SECRET,
        'redirect_uri'  => flint_redirect_uri(),
    ]);
    if ($status !== 200 || empty($token['access_token'])) {
        $desc = $token['error_description'] ?? ($token['error'] ?? ('HTTP ' . $status));
        flint_html(
            'Flint — ошибка входа',
            '<h2>Не удалось получить токен</h2><p>Яндекс ответил: '
            . htmlspecialchars((string) $desc, ENT_QUOTES, 'UTF-8') . '</p>',
            502
        );
    }

    // профиль пользователя (имя/логин — для шапки приложения)
    [$ustatus, $info] = flint_http_get_json('https://login.yandex.ru/info', [
        'Authorization: OAuth ' . (string) $token['access_token'],
    ]);
    $uid = isset($info['id']) ? (int) $info['id'] : 0;
    if ($ustatus !== 200 || $uid === 0) {
        flint_html(
            'Flint — ошибка входа',
            '<h2>Не удалось получить профиль</h2><p>Проверьте, что приложению доступен Яндекс ID.</p>',
            502
        );
    }

    // сохраняем пользователя (refresh-токен — ключ ко всей схеме синхронизации).
    // «Игнорирующий» INSERT, чтобы повторный вход не падал на дубле uid,
    // затем UPDATE обновляет поля: INSERT IGNORE (MySQL) / INSERT OR IGNORE
    // (SQLite) — семантика одинаковая, остальной SQL диалектов не различает.
    $now = time();
    $ignoreInsert = flint_driver() === 'mysql'
        ? 'INSERT IGNORE INTO users'
        : 'INSERT OR IGNORE INTO users';
    $db->prepare(
        $ignoreInsert . '
            (uid, login, display_name, refresh_token, access_token, token_expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )->execute([
        $uid,
        (string) ($info['login'] ?? ''),
        (string) ($info['real_name'] ?? ($info['display_name'] ?? '')),
        (string) $token['refresh_token'],
        (string) $token['access_token'],
        $now + (int) ($token['expires_in'] ?? 0) - 60,
        $now,
        $now,
    ]);
    $db->prepare(
        'UPDATE users SET
            login            = ?,
            display_name     = ?,
            refresh_token    = ?,
            access_token     = ?,
            token_expires_at = ?,
            updated_at       = ?
         WHERE uid = ?'
    )->execute([
        (string) ($info['login'] ?? ''),
        (string) ($info['real_name'] ?? ($info['display_name'] ?? '')),
        (string) $token['refresh_token'],
        (string) $token['access_token'],
        $now + (int) ($token['expires_in'] ?? 0) - 60,
        $now,
        $uid,
    ]);

    // сессия браузера/PWA
    $sessionToken = bin2hex(random_bytes(32));
    $db->prepare('INSERT INTO sessions (token, uid, created_at, last_seen) VALUES (?, ?, ?, ?)')
       ->execute([$sessionToken, $uid, $now, $now]);
    $db->exec('DELETE FROM sessions WHERE last_seen < ' . ($now - 365 * 86400));

    flint_set_session_cookie($sessionToken, $now + 180 * 86400);

    header('Location: ../?login=1');
    exit;
} catch (Throwable $e) {
    flint_html(
        'Flint — ошибка',
        '<h2>Внутренняя ошибка</h2><p>'
        . htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8') . '</p>',
        500
    );
}
