<?php
// PDO MySQL: подключение, именованные блокировки (GET_LOCK), таблица state

function db(): PDO
{
    static $pdo = null;
    if ($pdo !== null) {
        return $pdo;
    }
    $db = (array)cfg('db');
    if (empty($db['name']) || empty($db['user'])) {
        throw new RuntimeException('Не настроена база MySQL (db.name, db.user). Заполните config.inc.php — см. README.');
    }
    $charset = $db['charset'] ?: 'utf8mb4';
    if (!empty($db['socket'])) {
        $dsn = "mysql:unix_socket={$db['socket']};dbname={$db['name']};charset={$charset}";
    } else {
        $dsn = "mysql:host={$db['host']};port=" . ((int)$db['port']) . ";dbname={$db['name']};charset={$charset}";
    }
    $pdo = new PDO($dsn, $db['user'], $db['pass'], [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT            => 15,
        PDO::MYSQL_ATTR_USE_BUFFERED_QUERY => true,
    ]);
    return $pdo;
}

function db_prefix(): string
{
    $db = (array)cfg('db');
    return (string)($db['prefix'] ?: 'maxbot_');
}

function db_table(string $name): string
{
    return '`' . str_replace('`', '', db_prefix() . $name) . '`';
}

// Именованная блокировка MySQL: true = получили, false = занята другим процессом
function db_get_lock(string $name, int $timeoutSec = 0): bool
{
    $stmt = db()->prepare('SELECT GET_LOCK(?, ?)');
    $stmt->execute([$name, $timeoutSec]);
    return (int)$stmt->fetchColumn() === 1;
}

function db_release_lock(string $name): void
{
    try {
        $stmt = db()->prepare('SELECT RELEASE_LOCK(?)');
        $stmt->execute([$name]);
    } catch (Throwable $e) {
        // разблокировка не критична: соединение закроется и так
    }
}

function db_state_get(string $name): ?string
{
    $t = db_table('state');
    $stmt = db()->prepare("SELECT value FROM {$t} WHERE name = ?");
    $stmt->execute([$name]);
    $value = $stmt->fetchColumn();
    $stmt->closeCursor();
    return $value === false ? null : (string)$value;
}

function db_state_set(string $name, ?string $value): void
{
    $t = db_table('state');
    $stmt = db()->prepare("INSERT INTO {$t} (name, value) VALUES (?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)");
    $stmt->execute([$name, $value]);
}
