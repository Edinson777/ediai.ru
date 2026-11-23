<?php
/**
 * Flint — JSON API (этапы 2–3). Сессия — cookie flint_session (HttpOnly).
 *   GET  ?action=me       — кто вошёл ({auth:false} или {auth:true,user:{login,name}})
 *   POST ?action=logout   — выйти (сессия удаляется на сервере и в cookie)
 *   POST ?action=refresh  — обновить access-токен через refresh_token
 *   POST ?action=push     — отправить журнал на Яндекс Диск (app:/flint-backup.json)
 *   GET  ?action=pull     — забрать журнал с Диска ({ok,exists,data})
 *   GET  ?action=syncinfo — метаданные копии на Диске (есть/дата/размер)
 * Токены наружу не отдаются — только имя/логин пользователя и данные журнала.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/http.php';
require_once __DIR__ . '/disk.php';

function flint_json(array $data, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/** Сессия или 401 (для действий, требующих входа). */
function flint_require_session(PDO $db): array {
    $s = flint_current_session($db);
    if (!$s) {
        flint_json(['ok' => false, 'error' => 'not_logged_in'], 401);
    }
    return $s;
}

/** Токен Диска или понятный 502 (ошибка обновления — код refresh_failed). */
function flint_require_disk_token(PDO $db, int $uid): string {
    [$token, , , $err] = flint_disk_ensure_token($db, $uid);
    if ($err !== null) {
        flint_json([
            'ok'     => false,
            'error'  => $err === 'no_user' ? 'no_user' : 'refresh_failed',
            'detail' => $err === 'no_user' ? 'пользователь не найден' : $err,
        ], $err === 'no_user' ? 401 : 502);
    }
    return (string) $token;
}

$action = $_GET['action'] ?? '';
if (!in_array($action, ['me', 'logout', 'refresh', 'push', 'pull', 'syncinfo'], true)) {
    flint_json(['ok' => false, 'error' => 'unknown_action'], 404);
}

try {
    $db = flint_db();

    if ($action === 'me') {
        $s = flint_current_session($db);
        if (!$s) {
            flint_json(['auth' => false]);
        }
        flint_json([
            'auth' => true,
            'user' => [
                'login' => $s['login'],
                'name'  => $s['display_name'] !== '' ? $s['display_name'] : $s['login'],
            ],
        ]);
    }

    if ($action === 'logout') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            flint_json(['ok' => false, 'error' => 'method'], 405);
        }
        $t = $_COOKIE['flint_session'] ?? '';
        if (preg_match('/^[a-f0-9]{64}$/', $t)) {
            $db->prepare('DELETE FROM sessions WHERE token = ?')->execute([$t]);
        }
        flint_clear_session_cookie();
        flint_json(['ok' => true]);
    }

    if ($action === 'refresh') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            flint_json(['ok' => false, 'error' => 'method'], 405);
        }
        $s   = flint_require_session($db);
        $uid = (int) $s['uid'];
        $u   = $db->prepare('SELECT token_expires_at FROM users WHERE uid = ?');
        $u->execute([$uid]);
        $user = $u->fetch();
        if (!$user) {
            flint_json(['ok' => false, 'error' => 'no_user'], 401);
        }
        // токен ещё действителен (запас 5 минут) — обновлять не нужно
        if ((int) $user['token_expires_at'] > time() + 300) {
            flint_json([
                'ok'         => true,
                'refreshed'  => false,
                'expires_at' => (int) $user['token_expires_at'],
            ]);
        }
        [, , , $err] = flint_disk_ensure_token($db, $uid);
        if ($err !== null) {
            flint_json(['ok' => false, 'error' => 'refresh_failed', 'detail' => $err], 502);
        }
        flint_json(['ok' => true, 'refreshed' => true]);
    }

    if ($action === 'push') {
        if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
            flint_json(['ok' => false, 'error' => 'method'], 405);
        }
        $s   = flint_require_session($db);
        $raw = (string) file_get_contents('php://input');
        if (strlen($raw) > 5 * 1024 * 1024) {
            flint_json(['ok' => false, 'error' => 'too_big', 'detail' => 'журнал больше 5 МБ'], 413);
        }
        $data = json_decode($raw, true);
        if (!is_array($data) || !isset($data['workouts']) || !is_array($data['workouts'])) {
            flint_json(['ok' => false, 'error' => 'bad_json', 'detail' => 'ожидается объект с массивом workouts'], 400);
        }
        $token = flint_require_disk_token($db, (int) $s['uid']);
        [$ok, $err] = flint_disk_upload($token, $raw);
        if (!$ok) {
            flint_json(['ok' => false, 'error' => 'disk_error', 'detail' => $err], 502);
        }
        flint_json(['ok' => true, 'size' => strlen($raw), 'uploadedAt' => gmdate('c')]);
    }

    if ($action === 'pull') {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            flint_json(['ok' => false, 'error' => 'method'], 405);
        }
        $s     = flint_require_session($db);
        $token = flint_require_disk_token($db, (int) $s['uid']);
        [$ok, $content, $err] = flint_disk_download($token);
        if (!$ok) {
            flint_json(['ok' => false, 'error' => 'disk_error', 'detail' => $err], 502);
        }
        if ($content === null) {
            flint_json(['ok' => true, 'exists' => false]);
        }
        $data = json_decode((string) $content, true);
        if (!is_array($data) || !isset($data['workouts']) || !is_array($data['workouts'])) {
            flint_json([
                'ok'     => false,
                'error'  => 'disk_bad_file',
                'detail' => 'файл на Диске не похож на журнал Flint',
            ], 502);
        }
        flint_json(['ok' => true, 'exists' => true, 'data' => $data]);
    }

    if ($action === 'syncinfo') {
        if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
            flint_json(['ok' => false, 'error' => 'method'], 405);
        }
        $s     = flint_require_session($db);
        $token = flint_require_disk_token($db, (int) $s['uid']);
        [$st, $meta, $err] = flint_disk_meta($token);
        if ($err !== null) {
            flint_json(['ok' => false, 'error' => 'disk_error', 'detail' => $err], 502);
        }
        if ($st === 404) {
            flint_json(['ok' => true, 'exists' => false]);
        }
        flint_json([
            'ok'         => true,
            'exists'     => true,
            'size'       => (int) ($meta['size'] ?? 0),
            'modifiedAt' => $meta['modified_at'] ?? null,
        ]);
    }
} catch (Throwable $e) {
    flint_json(['ok' => false, 'error' => 'server', 'detail' => $e->getMessage()], 500);
}
