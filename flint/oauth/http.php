<?php
/**
 * Flint — HTTP-клиент для запросов к API Яндекса. Этапы 2–3.
 * Основной путь — curl; запасной — stream-контексты.
 * Возвращает [код_ответа, массив_данных] (JSON декодируется; при ошибке сети код 0).
 * Опция 'raw' => true — вернуть тело как строку (файл журнала с Диска),
 * опция 'timeout' — секунды. Редиректы переходятся (href Диска ведёт на хранилище).
 */
function flint_http_request(string $method, string $url, array $opts = []): array {
    $timeout = $opts['timeout'] ?? 15;
    $post    = $opts['post'] ?? null;      // готовая form-encoded строка или null
    $headers = $opts['headers'] ?? [];     // массив строк заголовков
    $raw     = !empty($opts['raw']);       // не декодировать JSON

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST  => $method,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_CONNECTTIMEOUT => $timeout,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 5,
            CURLOPT_USERAGENT      => 'flint-pwa/1.3',
        ]);
        if ($post !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $post);
        }
        $body   = curl_exec($ch);
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        $err    = curl_error($ch);
        curl_close($ch);
        if ($body === false) {
            return [0, ['error' => 'network', 'error_description' => (string) $err]];
        }
        if ($raw) {
            return [$status, (string) $body];
        }
        $data = json_decode($body, true);
        return [$status, is_array($data) ? $data : ['_raw' => (string) $body]];
    }

    // запасной вариант — stream-контексты (file_get_contents ходит по редиректам сам)
    $ctxOpts = [
        'http' => [
            'method'        => $method,
            'timeout'       => $timeout,
            'header'        => implode("\r\n", $headers),
            'ignore_errors' => true,
        ],
        'ssl' => ['verify_peer' => true, 'verify_peer_name' => true],
    ];
    if ($post !== null) {
        $ctxOpts['http']['content'] = $post;
    }
    $ctx  = stream_context_create($ctxOpts);
    $body = @file_get_contents($url, false, $ctx);
    $status = 0;
    foreach (($http_response_header ?? []) as $h) {
        if (preg_match('#^HTTP/\S+\s+(\d+)#', $h, $m)) {
            $status = (int) $m[1];
        }
    }
    if ($body === false) {
        return [0, ['error' => 'network', 'error_description' => 'нет соединения']];
    }
    if ($raw) {
        return [$status, (string) $body];
    }
    $data = json_decode($body, true);
    return [$status, is_array($data) ? $data : ['_raw' => (string) $body]];
}

/** POST с form-urlencoded телом (эндпоинт токенов oauth.yandex.ru). */
function flint_http_post_form(string $url, array $params): array {
    return flint_http_request('POST', $url, [
        'post'    => http_build_query($params),
        'headers' => ['Content-Type: application/x-www-form-urlencoded'],
    ]);
}

/** GET с заголовками (профиль login.yandex.ru/info). */
function flint_http_get_json(string $url, array $headers = []): array {
    return flint_http_request('GET', $url, ['headers' => $headers]);
}
