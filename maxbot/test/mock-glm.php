<?php
// Мок Z.ai GLM для smoke-теста. Запуск: php -S 127.0.0.1:18081 test/mock-glm.php
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

$raw = (string)file_get_contents('php://input');
$body = json_decode($raw, true) ?: [];
$messages = $body['messages'] ?? [];

$lastUser = '';
for ($i = count($messages) - 1; $i >= 0; $i--) {
    if (($messages[$i]['role'] ?? '') === 'user') {
        $lastUser = (string)$messages[$i]['content'];
        break;
    }
}

$state = mock_read($stateFile);
$state['glm_requests'][] = ['model' => (string)($body['model'] ?? ''), 'messages' => $messages];
mock_write($stateFile, $state);

// Текст с 'LONG' → длинный ответ 4500 символов (проверка разбивки на части)
$content = strpos($lastUser, 'LONG') !== false ? str_repeat('Д', 4500) : ('Эхо: ' . $lastUser);

header('Content-Type: application/json');
echo json_encode([
    'choices' => [['message' => ['role' => 'assistant', 'content' => $content]]],
    'usage'   => [
        'prompt_tokens'     => 10 + count($messages) * 5,
        'completion_tokens' => 7,
        'total_tokens'      => 17 + count($messages) * 5,
    ],
]);
