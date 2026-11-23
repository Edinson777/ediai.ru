<?php
// Клиент Bot API MAX (https://dev.max.ru/docs-api) на cURL:
// сообщения, «печатает…», getMe, команды бота, подписка на вебхук, long polling

class MaxApiException extends RuntimeException
{
}

// Поиск CA-бандла для проверки HTTPS-сертификатов.
// MAX API использует российский сертификат Минцифры (Russian Trusted CA), а Z.ai — международный,
// поэтому составляем общий бандл: системные корни + certs/russian_trusted_root_ca.pem из проекта.
function http_ca_bundle(): ?string
{
    static $resolved = false;
    if ($resolved !== false) {
        return $resolved;
    }

    // Явная настройка в конфиге имеет приоритет
    $configured = (string)cfg('ca_bundle');
    if ($configured !== '' && is_file($configured)) {
        $resolved = $configured;
        return $resolved;
    }

    // Системный бандл (php.ini, типовые пути Linux)
    $system = null;
    foreach ([
        (string)ini_get('curl.cainfo'),
        (string)ini_get('openssl.cafile'),
        '/etc/ssl/certs/ca-certificates.crt',
        '/etc/pki/tls/certs/ca-bundle.crt',
        '/usr/local/share/certs/ca-root-nss.crt',
        '/etc/ssl/cert.pem',
    ] as $c) {
        if ($c !== '' && is_file($c)) {
            $system = $c;
            break;
        }
    }

    $shipped = dirname(__DIR__) . '/certs/russian_trusted_root_ca.pem';
    if ($system !== null && !is_file($shipped)) {
        $resolved = $system;
        return $resolved;
    }
    if ($system === null && !is_file($shipped)) {
        $resolved = null;
        return $resolved;
    }

    // Составной бандл: системные корни + российский корень (кэшируется в data/)
    $dir = (string)cfg('data_dir');
    if (!is_dir($dir)) {
        @mkdir($dir, 0775, true);
    }
    $combined = $dir . '/ca-bundle-combined.pem';
    $needRebuild = !is_file($combined)
        || ($system !== null && filemtime($combined) < filemtime($system))
        || (is_file($shipped) && filemtime($combined) < filemtime($shipped));
    if ($needRebuild) {
        $content = $system !== null ? (string)@file_get_contents($system) : '';
        $content .= "\n" . (is_file($shipped) ? (string)@file_get_contents($shipped) : '');
        @file_put_contents($combined, $content, LOCK_EX);
    }
    $resolved = is_file($combined) ? $combined : ($system ?? $shipped);
    return $resolved;
}

// Универсальный HTTP-запрос: возвращает ['status' => int, 'body' => string, 'error' => ?string]
function http_request(string $method, string $url, array $headers = [], ?string $body = null, int $timeoutMs = 30000): array
{
    $ch = curl_init($url);
    $opts = [
        CURLOPT_CUSTOMREQUEST     => $method,
        CURLOPT_RETURNTRANSFER    => true,
        CURLOPT_TIMEOUT_MS        => $timeoutMs,
        CURLOPT_CONNECTTIMEOUT_MS => 10000,
        CURLOPT_HTTPHEADER        => $headers,
        CURLOPT_FOLLOWLOCATION    => true,
    ];
    if ($body !== null) {
        $opts[CURLOPT_POSTFIELDS] = $body;
    }
    $ca = http_ca_bundle();
    if ($ca !== null) {
        $opts[CURLOPT_CAINFO] = $ca;
    }
    curl_setopt_array($ch, $opts);
    $resp = curl_exec($ch);
    if ($resp === false) {
        $err = curl_error($ch);
        curl_close($ch);
        return ['status' => 0, 'body' => '', 'error' => $err];
    }
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return ['status' => $status, 'body' => (string)$resp, 'error' => null];
}

function max_api_call(string $method, array $opts = []): ?array
{
    // $opts: http_method, query (значение-массив превращается в повторяющиеся параметры), body, timeout_ms
    $httpMethod = $opts['http_method'] ?? 'GET';
    $query = $opts['query'] ?? [];
    $parts = [];
    foreach ($query as $k => $v) {
        if ($v === null) {
            continue;
        }
        if (is_array($v)) {
            foreach ($v as $item) {
                $parts[] = urlencode($k) . '=' . urlencode((string)$item);
            }
        } else {
            $parts[] = urlencode($k) . '=' . urlencode((string)$v);
        }
    }
    $url = rtrim((string)cfg('max_api_url'), '/') . $method . ($parts ? '?' . implode('&', $parts) : '');
    $headers = ['Authorization: ' . (string)cfg('max_token')];
    $body = null;
    if (isset($opts['body'])) {
        $body = json_encode($opts['body'], JSON_UNESCAPED_UNICODE);
        $headers[] = 'Content-Type: application/json';
    }
    $res = http_request($httpMethod, $url, $headers, $body, (int)($opts['timeout_ms'] ?? 30000));
    if (!empty($res['error'])) {
        throw new MaxApiException('MAX API (сеть): ' . $res['error']);
    }
    $data = json_decode($res['body'], true);
    if (is_array($data) && isset($data['success']) && $data['success'] === false) {
        throw new MaxApiException('MAX API ' . $res['status'] . ' (' . ($data['code'] ?? '') . '): ' . ($data['message'] ?? 'ошибка'));
    }
    if ($res['status'] >= 300) {
        throw new MaxApiException('MAX API ' . $res['status'] . ': ' . mb_substr($res['body'], 0, 300));
    }
    return $data;
}

// --- Отправка сообщений (лимиты MAX: 4000 символов, 2 сообщения/сек на чат) ---

function max_split_text(string $text, int $maxLen): array
{
    if (mb_strlen($text) <= $maxLen) {
        return [$text];
    }
    $parts = [];
    $rest = $text;
    while (mb_strlen($rest) > $maxLen) {
        $window = mb_substr($rest, 0, $maxLen);
        $nl = mb_strrpos($window, "\n");
        $sp = mb_strrpos($window, ' ');
        if ($nl !== false && $nl >= $maxLen * 0.5) {
            $cut = $nl;
        } elseif ($sp !== false && $sp >= $maxLen * 0.5) {
            $cut = $sp;
        } else {
            $cut = $maxLen;
        }
        $parts[] = mb_substr($rest, 0, $cut);
        $rest = ltrim((string)mb_substr($rest, $cut));
    }
    if ($rest !== '') {
        $parts[] = $rest;
    }
    return $parts;
}

function max_send_message(string $chatId, string $text): array
{
    if ($text === '') {
        return [];
    }
    $chunks = max_split_text($text, 3900);
    $mids = [];
    $format = (string)cfg('send_format');
    foreach ($chunks as $i => $chunk) {
        if ($i > 0) {
            usleep(600000); // пауза между частями: лимит MAX 2 сообщения/сек на чат
        }
        $body = ['text' => $chunk];
        if ($format === 'markdown' || $format === 'html') {
            $body['format'] = $format;
        }
        $data = max_api_call('/messages', [
            'http_method' => 'POST',
            'query'       => ['chat_id' => $chatId],
            'body'        => $body,
        ]);
        $mids[] = $data['message']['body']['mid'] ?? null;
    }
    return $mids;
}

function max_send_typing(string $chatId): void
{
    try {
        max_api_call('/chats/' . urlencode($chatId) . '/actions', [
            'http_method' => 'POST',
            'query'       => ['body' => 'TypingAction'],
            'timeout_ms'  => 10000,
        ]);
    } catch (MaxApiException $e) {
        bot_log('WARN', 'Не удалось отправить «печатает…»: ' . $e->getMessage());
    }
}

function max_get_me(): ?array
{
    return max_api_call('/me', ['timeout_ms' => 15000]);
}

// Регистрация команд бота (кнопка «меню» в интерфейсе MAX) — необязательная косметика
function max_register_commands(string $botName): void
{
    $commands = [
        ['name' => 'start', 'description' => 'Приветствие и возможности'],
        ['name' => 'reset', 'description' => 'Очистить память диалога'],
        ['name' => 'stats', 'description' => 'Статистика запросов и токенов'],
        ['name' => 'help',  'description' => 'Помощь'],
    ];
    max_api_call('/bots', [
        'http_method' => 'PATCH',
        'query'       => ['name' => $botName],
        'body'        => ['commands' => $commands],
        'timeout_ms'  => 15000,
    ]);
}

// --- Вебхук ---

function max_subscribe(string $url, string $secret = ''): ?array
{
    $body = ['url' => $url, 'update_types' => ['message_created', 'bot_started']];
    if ($secret !== '') {
        $body['secret'] = $secret;
    }
    return max_api_call('/subscriptions', ['http_method' => 'POST', 'body' => $body, 'timeout_ms' => 20000]);
}

function max_unsubscribe(): ?array
{
    return max_api_call('/subscriptions', ['http_method' => 'DELETE', 'timeout_ms' => 20000]);
}

// Текущая подписка на вебхук (для диагностики в install.php)
function max_get_subscriptions(): ?array
{
    return max_api_call('/subscriptions', ['timeout_ms' => 15000]);
}

// --- Long polling ---

function max_get_updates(?int $marker, int $timeoutSec = 30): ?array
{
    return max_api_call('/updates', [
        'query' => [
            'marker'  => $marker,
            'limit'   => 100,
            'types'   => ['message_created', 'bot_started'],
            'timeout' => $timeoutSec,
        ],
        'timeout_ms' => ($timeoutSec + 10) * 1000,
    ]);
}
