<?php
/**
 * Flint — база данных (MySQL или SQLite/PDO). Этап 2, версия 3.
 *
 * По умолчанию — SQLite: файл вне корня сайта (папка flint-data рядом с корнем),
 * чтобы FTP-деплой его не удалял; если родительская папка недоступна для записи —
 * flint/data/ внутри приложения (закрыта .htaccess; в этом варианте очередной
 * FTP-деплой может удалить файл базы — см. инструкцию).
 *
 * Если на хостинге SQLite недоступен (расширения pdo_sqlite нет и панель не даёт
 * включить), заполните FLINT_MYSQL_* в secrets.php — данные будут храниться в
 * MySQL, который есть практически на любом виртуальном хостинге. Остальной код
 * приложения одинаков для обоих драйверов.
 */

/** Режим MySQL включён: в secrets.php заполнены FLINT_MYSQL_* (не заглушки). */
function flint_mysql_enabled(): bool {
    foreach (['FLINT_MYSQL_DB', 'FLINT_MYSQL_USER', 'FLINT_MYSQL_PASS'] as $k) {
        if (!defined($k) || constant($k) === '') {
            return false;
        }
        if (strncmp((string) constant($k), 'ВАШ', 6) === 0) {
            return false; // заглушка из шаблона не заменена
        }
    }
    return true;
}

/** Текущий драйвер: 'mysql' или 'sqlite'. */
function flint_driver(): string {
    return flint_mysql_enabled() ? 'mysql' : 'sqlite';
}

/** Подключение PDO (одиночка) + схема. */
function flint_db(): PDO {
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $pdo = flint_driver() === 'mysql' ? flint_connect_mysql() : flint_connect_sqlite();
    flint_migrate($pdo);
    return $pdo;
}

/** PDO MySQL: база, пользователь и пароль — из secrets.php (FLINT_MYSQL_*). */
function flint_connect_mysql(): PDO {
    $host = FLINT_MYSQL_HOST !== '' ? FLINT_MYSQL_HOST : 'localhost';
    $port = (int) FLINT_MYSQL_PORT > 0 ? (int) FLINT_MYSQL_PORT : 3306;
    $dsn  = "mysql:host={$host};port={$port};dbname=" . FLINT_MYSQL_DB . ';charset=utf8mb4';
    return new PDO($dsn, FLINT_MYSQL_USER, FLINT_MYSQL_PASS, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES   => false,
    ]);
}

/** PDO SQLite: файл в первой доступной для записи папке-кандидате. */
function flint_connect_sqlite(): PDO {
    $dir = flint_resolve_data_dir();
    $pdo = new PDO('sqlite:' . $dir . '/flint.sqlite', null, null, [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);
    // WAL ускоряет чтение при записи; на части файловых систем недоступен —
    // тогда остаётся обычный DELETE-журнал, это не ошибка.
    try { $pdo->exec('PRAGMA journal_mode = WAL'); } catch (Throwable $e) { /* пропускаем */ }
    try { $pdo->exec('PRAGMA busy_timeout = 5000'); } catch (Throwable $e) { /* пропускаем */ }
    return $pdo;
}

/** Создание таблиц (схема одинакова по смыслу для обоих драйверов). */
function flint_migrate(PDO $pdo): void {
    if (flint_driver() === 'mysql') {
        // uid/token/state всегда вставляются приложением, поэтому
        // AUTO_INCREMENT не нужен; время — unix-время (BIGINT).
        // COLLATE bin у строковых ключей: сравнение точное, без регистрозависимых сюрпризов.
        $ddl = [
            "CREATE TABLE IF NOT EXISTS users (
                uid              BIGINT UNSIGNED PRIMARY KEY,
                login            VARCHAR(255) NOT NULL DEFAULT '',
                display_name     VARCHAR(255) NOT NULL DEFAULT '',
                refresh_token    TEXT NOT NULL,
                access_token     TEXT NOT NULL,
                token_expires_at BIGINT NOT NULL DEFAULT 0,
                created_at       BIGINT NOT NULL,
                updated_at       BIGINT NOT NULL
            ) DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS sessions (
                token      VARCHAR(64) COLLATE utf8mb4_bin PRIMARY KEY,
                uid        BIGINT UNSIGNED NOT NULL,
                created_at BIGINT NOT NULL,
                last_seen  BIGINT NOT NULL
            ) DEFAULT CHARSET=utf8mb4",
            "CREATE TABLE IF NOT EXISTS oauth_states (
                state      VARCHAR(64) COLLATE utf8mb4_bin PRIMARY KEY,
                created_at BIGINT NOT NULL
            ) DEFAULT CHARSET=utf8mb4",
        ];
        foreach ($ddl as $sql) {
            try {
                $pdo->exec($sql);
            } catch (Throwable $e) {
                // очень старый MySQL без utf8mb4 — повторяем на utf8
                $pdo->exec(str_replace('utf8mb4', 'utf8', $sql));
            }
        }
        return;
    }
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            uid             INTEGER PRIMARY KEY,
            login           TEXT DEFAULT '',
            display_name    TEXT DEFAULT '',
            refresh_token   TEXT NOT NULL,
            access_token    TEXT DEFAULT '',
            token_expires_at INTEGER DEFAULT 0,
            created_at      INTEGER NOT NULL,
            updated_at      INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token      TEXT PRIMARY KEY,
            uid        INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            last_seen  INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS oauth_states (
            state      TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL
        );
    ");
}

/** Кандидаты папки данных в порядке приоритета (для выбора и диагностики). */
function flint_data_candidates(): array {
    $c = [];
    if (defined('FLINT_DATA_DIR') && FLINT_DATA_DIR !== '') {
        $c['переопределение FLINT_DATA_DIR'] = FLINT_DATA_DIR;
    }
    if (!empty($_SERVER['DOCUMENT_ROOT'])) {
        $c['рядом с корнем сайта (вне деплоя)'] = dirname($_SERVER['DOCUMENT_ROOT']) . '/flint-data';
    }
    $c['рядом с кодом (вне деплоя)']   = dirname(__DIR__, 2) . '/flint-data';
    $c['внутри приложения flint/data'] = __DIR__ . '/../data';
    $c['временный каталог PHP']        = sys_get_temp_dir() . '/flint-data';
    return $c;
}

/** Метка выигравшего кандидата (set при выборе, get — для check.php). */
function flint_chosen_label(?string $set = null): string {
    static $label = '';
    if ($set !== null) {
        $label = $set;
    }
    return $label;
}

/** Резолв папки данных: первая доступная для записи из кандидатов. */
function flint_resolve_data_dir(): string {
    static $dir = null;
    if ($dir !== null) {
        return $dir;
    }
    foreach (flint_data_candidates() as $label => $c) {
        if (!@is_dir($c) && !@mkdir($c, 0700, true) && !@is_dir($c)) {
            continue;
        }
        if (@is_writable($c)) {
            flint_chosen_label($label);
            return $dir = $c;
        }
    }
    flint_chosen_label('временный каталог PHP (все кандидаты недоступны)');
    return $dir = sys_get_temp_dir() . '/flint-data'; // последний рубеж
}

/** Данные текущей сессии (cookie flint_session) или null. */
function flint_current_session(PDO $db): ?array {
    $t = $_COOKIE['flint_session'] ?? '';
    if ($t === '' || !preg_match('/^[a-f0-9]{64}$/', $t)) {
        return null;
    }
    $st = $db->prepare(
        'SELECT s.token, s.uid, u.login, u.display_name
         FROM sessions s JOIN users u ON u.uid = s.uid
         WHERE s.token = ?'
    );
    $st->execute([$t]);
    $row = $st->fetch();
    if (!$row) {
        return null;
    }
    $db->prepare('UPDATE sessions SET last_seen = ? WHERE token = ?')
       ->execute([time(), $t]);
    return $row;
}

/** Установка cookie сессии. */
function flint_set_session_cookie(string $token, int $expires): void {
    setcookie('flint_session', $token, [
        'expires'  => $expires,
        'path'     => '/',
        'secure'   => flint_current_scheme() === 'https',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}

/** Очистка cookie сессии. */
function flint_clear_session_cookie(): void {
    setcookie('flint_session', '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'secure'   => flint_current_scheme() === 'https',
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
}
