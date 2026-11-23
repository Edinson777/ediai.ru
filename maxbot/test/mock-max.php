<?php
// Мок Bot API MAX для smoke-теста. Запуск: php -S 127.0.0.1:18082 test/mock-max.php
// Состояние держит в JSON-файле (MOCK_STATE), тест его читает и пишет.

$stateFile = getenv('MOCK_STATE') ?: (sys_get_temp_dir() . '/maxbot-mock-state.json');

function mock_read(string $f): array
{
    $raw = @file_get_contents($f);
    $data = json_decode((string)$raw, true);
    return is_array($data) ? $data : [];
}

function mock_write(string $f, array $data): void
{
    file_put_contents($f, json_encode($data, JSON_UNESCAPED_UNICODE), LOCK_EX);
}

$state = mock_read($stateFile);
$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$raw = (string)file_get_contents('php://input');

header('Content-Type: application/json');

// Авторизация заголовком Authorization — как в реальном MAX API
$auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
if ($auth !== '' && !in_array($auth, array_map('strval', $state['auth_seen'] ?? []), true)) {
    $state['auth_seen'][] = $auth;
    mock_write($stateFile, $state);
}

if ($method === 'GET' && $uri === '/me') {
    echo json_encode(['user_id' => 999, 'name' => 'MockBot', 'username' => 'mockbot', 'is_bot' => true]);
    exit;
}

if ($method === 'POST' && $uri === '/messages') {
    parse_str($_SERVER['QUERY_STRING'] ?? '', $q);
    $body = json_decode($raw, true);
    $state['sent_messages'][] = [
        'chat_id' => (int)($q['chat_id'] ?? 0),
        'text'    => (string)($body['text'] ?? ''),
        'format'  => $body['format'] ?? null,
    ];
    mock_write($stateFile, $state);
    echo json_encode(['message' => ['body' => ['mid' => 'mock' . count($state['sent_messages'])]]]);
    exit;
}

if ($method === 'POST' && $uri === '/subscriptions') {
    $state['subscriptions'][] = json_decode($raw, true);
    mock_write($stateFile, $state);
    echo '{"success":true}';
    exit;
}

if ($method === 'DELETE' && $uri === '/subscriptions') {
    $state['unsubscribed'] = ($state['unsubscribed'] ?? 0) + 1;
    mock_write($stateFile, $state);
    echo '{"success":true}';
    exit;
}

if ($method === 'POST' && preg_match('#^/chats/\d+/actions$#', (string)$uri)) {
    echo '{}';
    exit;
}

if ($method === 'PATCH' && $uri === '/bots') {
    echo '{}';
    exit;
}

if ($method === 'GET' && $uri === '/updates') {
    // очередь событий лежит в pending.json — тест её наполняет
    $pendingFile = dirname($stateFile) . '/pending.json';
    $pending = mock_read($pendingFile);
    if ($pending) {
        $updates = array_splice($pending, 0);
        mock_write($pendingFile, $pending);
        $state['marker'] = ($state['marker'] ?? 0) + 1;
        $state['updates_served'] = ($state['updates_served'] ?? 0) + count($updates);
        mock_write($stateFile, $state);
        echo json_encode(['updates' => $updates, 'marker' => $state['marker']]);
        exit;
    }
    usleep(150000); // «висим» как настоящий long polling
    echo json_encode(['updates' => [], 'marker' => $state['marker'] ?? 0]);
    exit;
}

http_response_code(404);
echo '{}';
