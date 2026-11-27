<?php
/**
 * Flint — конфигурация OAuth (этап 2).
 *
 * СЕКРЕТЫ НЕ ДОЛЖНЫ ПОПАДАТЬ В GIT. Два способа задать ClientID/ClientSecret:
 *  1) РЕКОМЕНДУЕТСЯ: файл secrets.php вне корня сайта (папка flint-data рядом
 *     с корнем) или в папке oauth/ — он живёт только на сервере и FTP-деплой
 *     его не трогает, если он вне корня сайта. Шаблон — secrets-template.php
 *     из материалов этапа 2.
 *  2) Вписать значения в константы ниже ПОСЛЕ деплоя прямо на хостинге
 *     (учтите: следующий FTP-деплой перезапишет этот файл версией из репо).
 */

/** Схема текущего запроса (учитывает прокси с X-Forwarded-Proto). */
function flint_current_scheme(): string {
    if (!empty($_SERVER['HTTP_X_FORWARDED_PROTO'])) {
        $parts = explode(',', $_SERVER['HTTP_X_FORWARDED_PROTO']);
        return trim($parts[0]) === 'https' ? 'https' : 'http';
    }
    return (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
}

/** Redirect URI приложения: совпадает с зарегистрированным в oauth.yandex.ru. */
function flint_redirect_uri(): string {
    if (defined('FLINT_REDIRECT_URI') && FLINT_REDIRECT_URI !== '') {
        return FLINT_REDIRECT_URI;
    }
    $scheme = flint_current_scheme();
    $host   = $_SERVER['HTTP_HOST'] ?? 'localhost';
    $dir    = rtrim(dirname($_SERVER['SCRIPT_NAME'] ?? '/flint/oauth/callback.php'), '/');
    return $scheme . '://' . $host . $dir . '/callback.php';
}

// ВАЖНО: секреты загружаются ДО определения значений по умолчанию,
// иначе defaults '' перебьют константы из secrets.php.
$__flint_secret_candidates = [];
if (!empty($_SERVER['DOCUMENT_ROOT'])) {
    $__flint_secret_candidates[] = dirname($_SERVER['DOCUMENT_ROOT']) . '/flint-data/secrets.php';
}
$__flint_secret_candidates[] = dirname(__DIR__, 2) . '/flint-data/secrets.php'; // рядом с корнем сайта
$__flint_secret_candidates[] = __DIR__ . '/secrets.php';                        // рядом с кодом
foreach ($__flint_secret_candidates as $__flint_secret) {
    if (@is_file($__flint_secret) && @is_readable($__flint_secret)) {
        require_once $__flint_secret;
        define('FLINT_SECRETS_FILE', $__flint_secret); // путь — для диагностики check.php
        break;
    }
}
if (!defined('FLINT_SECRETS_FILE')) define('FLINT_SECRETS_FILE', '');

if (!defined('FLINT_CLIENT_ID'))     define('FLINT_CLIENT_ID', '');
if (!defined('FLINT_CLIENT_SECRET')) define('FLINT_CLIENT_SECRET', '');
if (!defined('FLINT_REDIRECT_URI'))  define('FLINT_REDIRECT_URI', '');

// MySQL (если SQLite на хостинге недоступен): заполненные значения в secrets.php
// включают режим MySQL вместо SQLite. По умолчанию — выключено (SQLite).
if (!defined('FLINT_MYSQL_HOST')) define('FLINT_MYSQL_HOST', 'localhost');
if (!defined('FLINT_MYSQL_PORT')) define('FLINT_MYSQL_PORT', 3306);
if (!defined('FLINT_MYSQL_DB'))   define('FLINT_MYSQL_DB', '');
if (!defined('FLINT_MYSQL_USER')) define('FLINT_MYSQL_USER', '');
if (!defined('FLINT_MYSQL_PASS')) define('FLINT_MYSQL_PASS', '');
