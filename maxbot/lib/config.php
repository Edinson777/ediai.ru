<?php
// Конфигурация бота: значения по умолчанию + config.inc.php + переменные окружения MAXBOT_*

function maxbot_config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }

    $defaults = [
        // --- MAX ---
        'max_token'      => '',
        'max_api_url'    => 'https://platform-api2.max.ru',
        // --- Z.ai / GLM ---
        'zai_key'        => '',
        'zai_api_url'    => 'https://api.z.ai/api/paas/v4/chat/completions',
        'model'          => 'glm-4.5-flash',
        'system_prompt'  => 'Ты — дружелюбный и полезный ИИ-ассистент в мессенджере MAX. Отвечай на русском языке, если пользователь не просит иначе. Отвечай кратко и по делу, обычно 2–6 предложений. Если вопрос неясен — задай уточняющий вопрос.',
        'glm_thinking'   => 'disabled', // disabled | enabled | auto (не передавать параметр)
        'glm_temperature' => 0.7,
        'glm_max_tokens' => 1024,
        'glm_timeout_ms' => 120000,
        // --- Режим и вебхук ---
        'mode'           => 'webhook',  // webhook | polling (для cron-запуска run.php)
        'webhook_secret' => '',         // секрет заголовка X-Max-Bot-Api-Secret
        // --- Поведение ---
        'memory_limit'   => 12,         // сколько последних сообщений диалога помнить
        'chat_whitelist' => [],         // chat_id (строки/числа); пусто — отвечать во всех чатах
        'group_trigger'  => 'all',      // all | mentions
        'send_format'    => 'markdown', // markdown | html | plain
        // --- Хранилище ---
        'storage'        => 'mysql',    // mysql (как на AdminVPS) | files (data/*.json)
        'data_dir'       => null,       // для files; null => ../data
        'db'             => [
            'host'    => 'localhost',
            'port'    => 3306,
            'name'    => '',
            'user'    => '',
            'pass'    => '',
            'charset' => 'utf8mb4',
            'prefix'  => 'maxbot_',
            'socket'  => '',            // если задан — подключение через unix-socket
        ],
        // --- Файлы и служебное ---
        'log_file'       => null,       // null => ../logs/bot.log
        'setup_key'      => '',         // ключ доступа к install.php из веба
        'ca_bundle'      => '',         // свой CA-бандл для cURL (пусто — авто: система + certs/)
    ];

    $file = dirname(__DIR__) . '/config.inc.php';
    $user = [];
    if (is_file($file)) {
        $loaded = require $file;
        if (is_array($loaded)) {
            $user = $loaded;
        }
    }
    $cfg = array_merge($defaults, $user);
    $cfg['db'] = array_merge($defaults['db'], isset($user['db']) && is_array($user['db']) ? $user['db'] : []);

    // Переменные окружения MAXBOT_* — для CLI-тестов и нестандартных сценариев
    foreach (array_keys($defaults) as $key) {
        $env = getenv('MAXBOT_' . strtoupper($key));
        if ($env === false || $env === '') {
            continue;
        }
        if ($key === 'db') {
            continue;
        }
        if ($key === 'chat_whitelist') {
            $decoded = json_decode($env, true);
            $cfg[$key] = is_array($decoded)
                ? $decoded
                : array_values(array_filter(array_map('trim', explode(',', $env)), function ($s) { return $s !== ''; }));
            continue;
        }
        if (in_array($key, ['memory_limit', 'glm_max_tokens', 'glm_timeout_ms'], true)) {
            $cfg[$key] = (int)$env;
            continue;
        }
        if ($key === 'glm_temperature') {
            $cfg[$key] = (float)$env;
            continue;
        }
        $cfg[$key] = $env;
    }
    // MAXBOT_DB_* — для интеграционных тестов
    foreach (['host', 'port', 'name', 'user', 'pass', 'charset', 'prefix', 'socket'] as $dbKey) {
        $env = getenv('MAXBOT_DB_' . strtoupper($dbKey));
        if ($env !== false && $env !== '') {
            $cfg['db'][$dbKey] = $dbKey === 'port' ? (int)$env : $env;
        }
    }

    // Пути по умолчанию
    if (empty($cfg['log_file'])) {
        $cfg['log_file'] = dirname(__DIR__) . '/logs/bot.log';
    }
    if (empty($cfg['data_dir'])) {
        $cfg['data_dir'] = dirname(__DIR__) . '/data';
    }

    return $cfg;
}

function cfg(string $key, $default = null)
{
    $cfg = maxbot_config();
    return array_key_exists($key, $cfg) ? $cfg[$key] : $default;
}

// Создать приватную папку (logs/, data/) и закрыть её от веб-доступа через .htaccess
function ensure_private_dir(string $dir): bool
{
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    if (!is_dir($dir)) {
        return false;
    }
    $ht = $dir . '/.htaccess';
    if (!is_file($ht)) {
        @file_put_contents($ht, "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order deny,allow\n  Deny from all\n</IfModule>\n");
    }
    return true;
}

// Проверка обязательных настроек: список проблем (пустой список = всё в порядке)
function config_problems(): array
{
    $problems = [];
    if (!cfg('max_token')) {
        $problems[] = 'max_token — токен бота из MAX (создайте бота через @masterbot)';
    }
    if (!cfg('zai_key')) {
        $problems[] = 'zai_key — ключ API Z.ai (https://z.ai → Open Platform → API Keys)';
    }
    if (cfg('storage') === 'mysql') {
        $db = (array)cfg('db');
        if (empty($db['name']) || empty($db['user'])) {
            $problems[] = "db['name'] и db['user'] — база MySQL (создайте её в панели AdminVPS → Базы данных)";
        }
    }
    return $problems;
}
