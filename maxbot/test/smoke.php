<?php
// Сквозной smoke-тест PHP-версии бота.
//   php test/smoke.php                      — моки MAX/GLM, режимы polling и webhook (файловое хранилище)
//   MAXBOT_TEST_MYSQL=1 php test/smoke.php  — плюс интеграционная фаза на реальном MySQL
//                                            (перед запуском: MAXBOT_DB_SOCKET, MAXBOT_DB_NAME, MAXBOT_DB_USER, MAXBOT_DB_PASS)

const PHP_BIN = '/home/z/my-project/tools/php-static/php';

$failures = 0;
function check(string $name, bool $cond, string $extra = ''): void
{
    global $failures;
    if ($cond) {
        echo "  ✅ {$name}\n";
    } else {
        $failures++;
        echo "  ❌ {$name} {$extra}\n";
    }
}

function sleep_ms(int $ms): void
{
    usleep($ms * 1000);
}

function wait_for(callable $fn, int $timeoutMs, int $stepMs = 150): bool
{
    $deadline = microtime(true) + $timeoutMs / 1000;
    while (true) {
        if ($fn()) {
            return true;
        }
        if (microtime(true) > $deadline) {
            return false;
        }
        usleep($stepMs * 1000);
    }
}

function http_req(string $method, string $url, array $headers = [], ?string $body = null, int $timeoutMs = 15000): array
{
    $ch = curl_init($url);
    $opts = [
        CURLOPT_CUSTOMREQUEST    => $method,
        CURLOPT_RETURNTRANSFER   => true,
        CURLOPT_TIMEOUT_MS       => $timeoutMs,
        CURLOPT_CONNECTTIMEOUT_MS => 5000,
        CURLOPT_HTTPHEADER       => $headers,
    ];
    if ($body !== null) {
        $opts[CURLOPT_POSTFIELDS] = $body;
    }
    curl_setopt_array($ch, $opts);
    $resp = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return ['status' => $status, 'body' => (string)$resp, 'ok' => $resp !== false];
}

function proc_start(array $cmd, array $env, string $cwd): array
{
    $spec = [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
    $proc = proc_open($cmd, $spec, $pipes, $cwd, $env);
    if (!is_resource($proc)) {
        fwrite(STDERR, "Не удалось запустить процесс: " . implode(' ', $cmd) . "\n");
        exit(1);
    }
    return ['proc' => $proc, 'pipes' => $pipes];
}

function proc_stop(array $p): void
{
    if (is_resource($p['proc'])) {
        proc_terminate($p['proc']);
        usleep(200000);
        if (is_resource($p['proc'])) {
            proc_terminate($p['proc'], 9); // SIGKILL, если SIGTERM не помог
        }
        proc_close($p['proc']);
    }
}

function read_state(string $file): array
{
    $raw = @file_get_contents($file);
    $data = json_decode((string)$raw, true);
    return is_array($data) ? $data : [];
}

function write_state(string $file, array $data): void
{
    file_put_contents($file, json_encode($data, JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function message_created(int $chatId, string $text): array
{
    $ts = (int)round(microtime(true) * 1000);
    return [
        'update_type' => 'message_created',
        'timestamp'   => $ts,
        'payload'     => ['message' => [
            'sender'    => ['user_id' => 42, 'name' => 'Тестер', 'is_bot' => false],
            'recipient' => ['chat_id' => $chatId, 'chat_type' => 'dialog'],
            'body'      => ['mid' => 'in' . mt_rand(), 'seq' => 1, 'text' => $text, 'attachments' => []],
            'timestamp' => $ts,
        ]],
    ];
}

// ---------- подготовка окружения ----------

$projectDir = dirname(__DIR__);
$tmp = sys_get_temp_dir() . '/maxbot-smoke-' . getmypid();
@mkdir($tmp . '/data', 0777, true);
@mkdir($tmp . '/logs', 0777, true);
$stateFile = $tmp . '/mock-state.json';
$pendingFile = $tmp . '/pending.json';

$baseEnv = array_merge(getenv(), [
    'MAXBOT_STORAGE'        => 'files',
    'MAXBOT_DATA_DIR'       => $tmp . '/data',
    'MAXBOT_LOG_FILE'       => $tmp . '/logs/bot.log',
    'MAXBOT_MAX_API_URL'    => 'http://127.0.0.1:18082',
    'MAXBOT_ZAI_API_URL'    => 'http://127.0.0.1:18081/v4/chat/completions',
    'MAXBOT_MAX_TOKEN'      => 'test-token',
    'MAXBOT_ZAI_KEY'        => 'test-key',
    'MAXBOT_MODEL'          => 'glm-4.5-flash',
    'MAXBOT_CHAT_WHITELIST' => '111',
    'MAXBOT_GROUP_TRIGGER'  => 'all',
    'MAXBOT_SEND_FORMAT'    => 'markdown',
    'MAXBOT_WEBHOOK_SECRET' => 'sec-123',
    'MAXBOT_MEMORY_LIMIT'   => '12',
    'MOCK_STATE'            => $stateFile,
]);

// Запуск моков
$maxMock = proc_start([PHP_BIN, '-S', '127.0.0.1:18082', __DIR__ . '/mock-max.php'], $baseEnv, $projectDir);
$glmMock = proc_start([PHP_BIN, '-S', '127.0.0.1:18081', __DIR__ . '/mock-glm.php'], $baseEnv, $projectDir);
check('моки запущены', wait_for(fn() => http_req('GET', 'http://127.0.0.1:18082/me', [], null, 2000)['status'] === 200, 10000)
    && wait_for(fn() => http_req('POST', 'http://127.0.0.1:18081/v4/chat/completions', ['Content-Type: application/json'], '{}', 2000)['status'] === 200, 10000));

// ================= Фаза 1: режим polling =================
echo "\n=== Фаза 1: polling (php run.php --once) ===\n";

write_state($stateFile, []);
write_state($pendingFile, [
    ['update_type' => 'bot_started', 'timestamp' => 1, 'chat_id' => 111, 'payload' => ['chat_id' => 111]],
    message_created(111, '/start'),
    message_created(111, 'Привет'),
    message_created(111, 'Вопрос 2'),
    message_created(111, '/stats'),
    message_created(111, '/reset'),
    message_created(111, 'Вопрос 3'),
    message_created(111, 'Ответь LONG'),
    message_created(222, 'Привет из чужого чата'),
]);

$runner = proc_start([PHP_BIN, 'run.php', '--once', '--seconds=40'], $baseEnv, $projectDir);

$sent = fn() => read_state($stateFile)['sent_messages'] ?? [];
$sentTo = fn(int $chatId) => array_values(array_filter($sent(), fn($m) => ($m['chat_id'] ?? 0) === $chatId));
$glm = fn() => read_state($stateFile)['glm_requests'] ?? [];

check('bot_started → приветствие отправлено', wait_for(fn() => count($sentTo(111)) >= 2, 20000) && strpos($sentTo(111)[0]['text'], 'Привет') !== false, json_encode($sentTo(111), JSON_UNESCAPED_UNICODE));
check('/start → приветствие с командами', strpos($sentTo(111)[1]['text'] ?? '', '/reset') !== false);
check('сообщение → ответ от GLM', wait_for(fn() => count($glm()) >= 1 && count($sentTo(111)) >= 3, 20000) && ($sentTo(111)[2]['text'] ?? '') === 'Эхо: Привет');
check('GLM: системный промпт первым', ($glm()[0]['messages'][0]['role'] ?? '') === 'system' && mb_strlen($glm()[0]['messages'][0]['content'] ?? '') > 10);
check('GLM: модель glm-4.5-flash', ($glm()[0]['model'] ?? '') === 'glm-4.5-flash');
$msgs2 = $glm()[1]['messages'] ?? [];
$lastMsg2 = end($msgs2);
check('память: история передана в GLM (2-й запрос)', count($glm()) >= 2
    && count(array_filter($msgs2, fn($m) => ($m['role'] ?? '') === 'user' && ($m['content'] ?? '') === 'Привет')) === 1
    && count(array_filter($msgs2, fn($m) => ($m['role'] ?? '') === 'assistant' && ($m['content'] ?? '') === 'Эхо: Привет')) === 1);
check('память: новый вопрос — последнее сообщение', ($lastMsg2['content'] ?? '') === 'Вопрос 2');
check('/stats → статистика токенов', wait_for(fn() => count($sentTo(111)) >= 5, 20000) && strpos($sentTo(111)[4]['text'] ?? '', 'Токены') !== false);
check('/reset → подтверждение', wait_for(fn() => count($sentTo(111)) >= 6, 20000) && strpos($sentTo(111)[5]['text'] ?? '', 'очищена') !== false);
check('память: после /reset история пуста', count($glm()) >= 3 && (function () use ($glm) {
    $msgs3 = $glm()[2]['messages'] ?? [];
    $last3 = end($msgs3);
    return count(array_filter($msgs3, fn($m) => ($m['role'] ?? '') !== 'system')) === 1 && ($last3['content'] ?? '') === 'Вопрос 3';
})());
check('длинный ответ разбит на 2 части ≤4000', wait_for(fn() => count($sentTo(111)) >= 9, 25000) && count($sentTo(111)) >= 9
    && mb_strlen($sentTo(111)[7]['text'] ?? '') <= 4000 && mb_strlen($sentTo(111)[8]['text'] ?? '') <= 4000
    && mb_strlen(($sentTo(111)[7]['text'] ?? '') . ($sentTo(111)[8]['text'] ?? '')) >= 4500,
    'частей=' . count($sentTo(111)) . ': ' . json_encode(array_map(fn($m) => mb_strlen($m['text']), $sentTo(111))));
check('белый список: диалогу 222 отправлено уведомление', wait_for(fn() => count($sentTo(222)) >= 1, 15000)
    && strpos($sentTo(222)[0]['text'] ?? '', 'не в белом списке') !== false, json_encode($sentTo(222), JSON_UNESCAPED_UNICODE));
check('белый список: GLM для чужого чата не вызывался', count(array_filter($glm(), fn($r) => array_filter($r['messages'], fn($m) => strpos((string)($m['content'] ?? ''), 'чужого чата') !== false))) === 0);
check('MAX: авторизация заголовком Authorization', in_array('test-token', array_map('strval', read_state($stateFile)['auth_seen'] ?? []), true));
check('формат: markdown передан в POST /messages', ($sentTo(111)[2]['format'] ?? null) === 'markdown');
check('маркер: позиция polling сохранена', state_marker_check($tmp) !== null && (int)state_marker_check($tmp) >= 1);
check('логи: строка с токенами присутствует', strpos((string)@file_get_contents($tmp . '/logs/bot.log'), 'токены prompt=') !== false);

proc_stop($runner);

// ================= Фаза 2: режим webhook =================
echo "\n=== Фаза 2: webhook (php -S … index.php) ===\n";

// чистое состояние для второй фазы
$k111Before = count($sentTo(111));
$glmBefore = count($glm());
$hookEnv = array_merge($baseEnv, ['PHP_CLI_SERVER_WORKERS' => '4']);
$hook = proc_start([PHP_BIN, '-S', '127.0.0.1:18090', 'index.php'], $hookEnv, $projectDir);

check('вебхук-сервер поднялся', wait_for(fn() => http_req('GET', 'http://127.0.0.1:18090/health', [], null, 2000)['status'] === 200, 15000));

$t0 = microtime(true);
$resp = http_req('POST', 'http://127.0.0.1:18090/index.php', [
    'Content-Type: application/json',
    'X-Max-Bot-Api-Secret: sec-123',
], json_encode(message_created(111, 'Привет по вебхуку'), JSON_UNESCAPED_UNICODE), 20000);
$hookMs = (int)round((microtime(true) - $t0) * 1000);
check('вебхук: HTTP 200 и быстрый ответ', $resp['status'] === 200 && strpos($resp['body'], 'success') !== false, "status={$resp['status']} body={$resp['body']} за {$hookMs} мс");
$hookGot = wait_for(fn() => count($sentTo(111)) >= $k111Before + 1, 20000);
check('вебхук: ответ ушёл в MAX', $hookGot, "k111Before={$k111Before} всего=" . count($sent()) . ' к111=' . count($sentTo(111)));
check('вебхук: ответ корректный', ($sentTo(111)[count($sentTo(111)) - 1]['text'] ?? '') === 'Эхо: Привет по вебхуку');

$resp2 = http_req('POST', 'http://127.0.0.1:18090/index.php', [
    'Content-Type: application/json',
    'X-Max-Bot-Api-Secret: wrong-secret',
], json_encode(message_created(111, 'x'), JSON_UNESCAPED_UNICODE), 20000);
check('вебхук: HTTP 403 на неверный секрет', $resp2['status'] === 403, "status={$resp2['status']}");

$resp3 = http_req('GET', 'http://127.0.0.1:18090/health', [], null, 2000);
check('вебхук: /health отвечает 200', $resp3['status'] === 200 && $resp3['body'] === 'ok');

proc_stop($hook);

// ================= Фаза 3: реальный MySQL (опционально) =================
if (getenv('MAXBOT_TEST_MYSQL') === '1') {
    echo "\n=== Фаза 3: MySQL (storage=mysql) ===\n";
    // мок-серверы общие: пишут в тот же state-файл, считаем сообщения «с добавкой»
    $baseBefore = count($sent());
    $mysqlEnv = array_merge($baseEnv, ['MAXBOT_STORAGE' => 'mysql']);

    // свежая база под тест
    try {
        $root = new PDO(
            'mysql:unix_socket=' . getenv('MAXBOT_DB_SOCKET') . ';charset=utf8mb4',
            (string)getenv('MAXBOT_DB_USER'),
            (string)getenv('MAXBOT_DB_PASS')
        );
        $root->exec('DROP DATABASE IF EXISTS `' . getenv('MAXBOT_DB_NAME') . '`');
        $root->exec('CREATE DATABASE `' . getenv('MAXBOT_DB_NAME') . '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        check('MySQL: тестовая база создана', true);
    } catch (Throwable $e) {
        check('MySQL: тестовая база создана', false, $e->getMessage());
    }

    // создаем таблицы через install.php (CLI)
    $inst = proc_start([PHP_BIN, 'install.php', 'tables'], $mysqlEnv, $projectDir);
    $instOut = stream_get_contents($inst['pipes'][1]);
    fclose($inst['pipes'][0]);
    fclose($inst['pipes'][1]);
    fclose($inst['pipes'][2]);
    proc_close($inst['proc']);
    check('MySQL: таблицы созданы (install.php tables)', strpos((string)$instOut, '✅') !== false, (string)$instOut);

    // событие → ответ через polling (чат 111 — в белом списке)
    write_state($tmp . '/pending.json', [
        ['update_type' => 'bot_started', 'timestamp' => 1, 'chat_id' => 111, 'payload' => ['chat_id' => 111]],
        message_created(111, 'Привет в MySQL'),
    ]);
    $runner2 = proc_start([PHP_BIN, 'run.php', '--once', '--seconds=10'], $mysqlEnv, $projectDir);
    check('MySQL: ответ отправлен', wait_for(fn() => count($sent()) >= $baseBefore + 2, 25000));
    proc_stop($runner2);

    // данные реально в MySQL: проверяем напрямую через PDO
    try {
        $pdo = new PDO('mysql:unix_socket=' . getenv('MAXBOT_DB_SOCKET') . ';dbname=' . getenv('MAXBOT_DB_NAME') . ';charset=utf8mb4', (string)getenv('MAXBOT_DB_USER'), (string)getenv('MAXBOT_DB_PASS'));
        $mem = $pdo->query("SELECT history FROM maxbot_memory WHERE chat_id = 111")->fetchColumn();
        check('MySQL: история диалога сохранена', is_string($mem) && strpos($mem, 'Привет в MySQL') !== false, (string)$mem);
        $st = $pdo->query("SELECT requests, total_tokens FROM maxbot_stats WHERE day = CURDATE()")->fetch(PDO::FETCH_ASSOC);
        check('MySQL: статистика токенов записана', is_array($st) && (int)$st['requests'] >= 1 && (int)$st['total_tokens'] > 0, print_r($st, true));
        $mk = $pdo->query("SELECT value FROM maxbot_state WHERE name = 'updates_marker'")->fetchColumn();
        check('MySQL: маркер polling сохранён', is_string($mk) && (int)$mk >= 1, (string)$mk);
    } catch (Throwable $e) {
        check('MySQL: подключение из теста', false, $e->getMessage());
    }
} else {
    echo "\n=== Фаза 3: MySQL пропущена (запустите с MAXBOT_TEST_MYSQL=1) ===\n";
}

// ---------- завершение ----------
proc_stop($maxMock);
proc_stop($glmMock);
@unlink($pendingFile);

echo $failures === 0 ? "\n🟢 Все проверки пройдены\n" : "\n🔴 Провалено проверок: {$failures}\n";
exit($failures === 0 ? 0 : 1);

// вспомогательная: маркер из state-файла files-хранилища
function state_marker_check(string $tmp): ?string
{
    $raw = @file_get_contents($tmp . '/data/state.json');
    $data = json_decode((string)$raw, true);
    return is_array($data) && isset($data['updates_marker']) ? (string)$data['updates_marker'] : null;
}
