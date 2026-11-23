<?php
/**
 * Flint — Яндекс Диск (этап 3).
 *
 * Все операции идут ЧЕРЕЗ ЭТОТ СЕРВЕР (oauth/api.php), а не из браузера напрямую:
 * у cloud-api.yandex.net нет CORS для сторонних страниц, главное — access-токен
 * не покидает сервер и продлевается здесь же автоматически. Копия журнала —
 * файл app:/flint-backup.json в папке приложения на Диске того пользователя,
 * который вошёл (app:/ у каждого аккаунта свой, поэтому uid в имени не нужен).
 */
require_once __DIR__ . '/http.php';

/** Путь к файлу журнала в папке приложения на Диске. */
function flint_disk_path(): string {
    return 'app:/flint-backup.json';
}

/** База API Диска; FLINT_DISK_API_BASE в secrets.php — только для отладки/тестов. */
function flint_disk_api_base(): string {
    return defined('FLINT_DISK_API_BASE') && FLINT_DISK_API_BASE !== ''
        ? (string) FLINT_DISK_API_BASE
        : 'https://cloud-api.yandex.net';
}

/**
 * Действующий access-токен пользователя: если истёк или истекает (<5 мин) —
 * обновляется через refresh_token и сохраняется в базу.
 * Возвращает [токен, expires_at, был_ли_refresh, текст_ошибки|null].
 */
function flint_disk_ensure_token(PDO $db, int $uid): array {
    $st = $db->prepare('SELECT refresh_token, access_token, token_expires_at FROM users WHERE uid = ?');
    $st->execute([$uid]);
    $u = $st->fetch();
    if (!$u || (string) $u['refresh_token'] === '') {
        return [null, null, false, 'no_user'];
    }
    if ((string) $u['access_token'] !== '' && (int) $u['token_expires_at'] > time() + 300) {
        return [$u['access_token'], (int) $u['token_expires_at'], false, null];
    }
    [$status, $tok] = flint_http_post_form('https://oauth.yandex.ru/token', [
        'grant_type'    => 'refresh_token',
        'refresh_token' => (string) $u['refresh_token'],
        'client_id'     => FLINT_CLIENT_ID,
        'client_secret' => FLINT_CLIENT_SECRET,
    ]);
    if ($status !== 200 || empty($tok['access_token'])) {
        $desc = $tok['error_description'] ?? ($tok['error'] ?? ('HTTP ' . $status));
        return [null, null, false, (string) $desc];
    }
    $now       = time();
    $expiresAt = $now + (int) ($tok['expires_in'] ?? 0) - 60;
    // Яндекс может выдать и новый refresh_token — тогда сохраняем оба
    $newRefresh = (string) ($tok['refresh_token'] ?? '');
    if ($newRefresh !== '') {
        $db->prepare('UPDATE users SET access_token = ?, refresh_token = ?, token_expires_at = ?, updated_at = ? WHERE uid = ?')
           ->execute([(string) $tok['access_token'], $newRefresh, $expiresAt, $now, $uid]);
    } else {
        $db->prepare('UPDATE users SET access_token = ?, token_expires_at = ?, updated_at = ? WHERE uid = ?')
           ->execute([(string) $tok['access_token'], $expiresAt, $now, $uid]);
    }
    return [(string) $tok['access_token'], $expiresAt, true, null];
}

/**
 * Метаданные файла журнала на Диске (для «последняя синхронизация»).
 * Возвращает [статус, массив meta|null, описание_ошибки|null].
 */
function flint_disk_meta(string $token): array {
    $url = flint_disk_api_base() . '/v1/disk/resources?path=' . rawurlencode(flint_disk_path())
         . '&fields=size,modified_at';
    [$st, $d] = flint_http_request('GET', $url, ['headers' => ['Authorization: OAuth ' . $token]]);
    if ($st !== 200 && $st !== 404) {
        return [$st, null, flint_disk_error($st, $d)];
    }
    return [$st, is_array($d) ? $d : null, null];
}

/**
 * Загрузка файла на Диск в два шага: запросить href → PUT туда тело.
 * Возвращает [true, null] или [false, описание_ошибки].
 */
function flint_disk_upload(string $token, string $content): array {
    $url = flint_disk_api_base() . '/v1/disk/resources/upload?path='
         . rawurlencode(flint_disk_path()) . '&overwrite=true';
    [$st, $d] = flint_http_request('GET', $url, [
        'headers' => ['Authorization: OAuth ' . $token],
        'timeout' => 30,
    ]);
    if ($st !== 200 || empty($d['href'])) {
        return [false, flint_disk_error($st, $d)];
    }
    [$pst] = flint_http_request('PUT', (string) $d['href'], [
        'post'    => $content,
        'headers' => ['Content-Type: application/octet-stream'],
        'timeout' => 120,
        'raw'     => true,
    ]);
    if ($pst >= 200 && $pst < 300) {
        return [true, null];
    }
    return [false, 'Диск не принял файл (HTTP ' . $pst . ')'];
}

/**
 * Скачивание файла журнала с Диска (href ведёт на хранилище через редирект).
 * Возвращает [true, содержимое|null, описание_ошибки|null]; содержимое null — файла нет.
 */
function flint_disk_download(string $token): array {
    $url = flint_disk_api_base() . '/v1/disk/resources/download?path='
         . rawurlencode(flint_disk_path());
    [$st, $d] = flint_http_request('GET', $url, [
        'headers' => ['Authorization: OAuth ' . $token],
        'timeout' => 30,
    ]);
    if ($st === 404) {
        return [true, null, null];
    }
    if ($st !== 200 || empty($d['href'])) {
        return [false, null, flint_disk_error($st, $d)];
    }
    [$gst, $raw] = flint_http_request('GET', (string) $d['href'], ['timeout' => 60, 'raw' => true]);
    if ($gst !== 200) {
        return [false, null, 'Диск отдал файл с ошибкой (HTTP ' . $gst . ')'];
    }
    return [true, (string) $raw, null];
}

/** Понятное описание ошибки API Диска по коду и телу ответа. */
function flint_disk_error(int $st, $d): string {
    $desc = is_array($d) ? (string) ($d['description'] ?? ($d['message'] ?? '')) : '';
    if ($st === 401) {
        return 'Токен Диска отклонён (401) — выйдите и войдите заново';
    }
    if ($st === 403) {
        return 'Токен без права «Доступ к папке приложения» (403): в oauth.yandex.ru → ваше приложение → «Права доступа» → раздел «Яндекс Диск» включите «Доступ к папке приложения на Диске» (cloud_api:disk.app_folder); затем отзовите доступ приложения на id.yandex.ru/apps и в приложении нажмите «Выйти» и войдите заново, не снимая галочку на экране согласия';
    }
    if ($st === 0) {
        return 'Нет связи с Диском с сервера хостинга';
    }
    return 'Диск ответил HTTP ' . $st . ($desc !== '' ? ': ' . $desc : '');
}
