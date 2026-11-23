<?php
// Клиент Z.ai GLM: POST {zai_api_url} (по умолчанию https://api.z.ai/api/paas/v4/chat/completions)
// Ретраи при 429/5xx и сетевых сбоях; 4xx (неверный ключ и т.п.) — сразу ошибка

class GlmException extends RuntimeException
{
}

class GlmRetryableException extends GlmException
{
}

function glm_chat_complete(array $messages): array
{
    $body = [
        'model'       => (string)cfg('model'),
        'messages'    => $messages,
        'stream'      => false,
        'temperature' => (float)cfg('glm_temperature'),
        'max_tokens'  => (int)cfg('glm_max_tokens'),
    ];
    // GLM-4.5 поддерживает гибридное мышление; для быстрых ответов в чате по умолчанию отключено
    $thinking = strtolower((string)cfg('glm_thinking'));
    if ($thinking === 'enabled' || $thinking === 'disabled') {
        $body['thinking'] = ['type' => $thinking];
    }

    $lastError = null;
    for ($attempt = 1; $attempt <= 2; $attempt++) {
        $res = http_request(
            'POST',
            (string)cfg('zai_api_url'),
            [
                'Authorization: Bearer ' . (string)cfg('zai_key'),
                'Content-Type: application/json',
            ],
            json_encode($body, JSON_UNESCAPED_UNICODE),
            (int)cfg('glm_timeout_ms')
        );
        if (!empty($res['error'])) {
            $lastError = new GlmRetryableException('GLM (сеть): ' . $res['error']);
        } else {
            $data = json_decode($res['body'], true);
            $detail = is_array($data)
                ? ($data['error']['message'] ?? $data['message'] ?? mb_substr($res['body'], 0, 300))
                : mb_substr($res['body'], 0, 300);
            if ($res['status'] === 429 || $res['status'] >= 500) {
                $lastError = new GlmRetryableException("GLM HTTP {$res['status']}: {$detail}");
            } elseif ($res['status'] >= 300) {
                throw new GlmException("GLM HTTP {$res['status']}: {$detail}");
            } else {
                $content = trim((string)($data['choices'][0]['message']['content'] ?? ''));
                if ($content === '') {
                    throw new GlmException('GLM вернул пустой ответ');
                }
                return [
                    'content' => $content,
                    'usage'   => isset($data['usage']) && is_array($data['usage']) ? $data['usage'] : null,
                ];
            }
        }
        if ($attempt < 2) {
            sleep(1); // пауза перед повтором
        }
    }
    throw $lastError;
}
