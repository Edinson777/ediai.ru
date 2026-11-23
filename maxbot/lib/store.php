<?php
// Хранилище с единым интерфейсом: MySQL (по умолчанию — как на AdminVPS) или файлы (data/*.json)
// Здесь: память диалогов, дневная статистика токенов, служебный state

function storage_files(): string
{
    $dir = (string)cfg('data_dir');
    if (!is_dir($dir)) {
        ensure_private_dir($dir);
    }
    return $dir;
}

function storage_read_json(string $file, $fallback)
{
    $path = storage_files() . '/' . $file;
    if (!is_file($path)) {
        return $fallback;
    }
    $raw = @file_get_contents($path);
    if ($raw === false || $raw === '') {
        return $fallback;
    }
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $fallback;
}

function storage_write_json(string $file, $data): void
{
    $path = storage_files() . '/' . $file;
    @file_put_contents($path, json_encode($data, JSON_UNESCAPED_UNICODE), LOCK_EX);
}

// --- Память диалогов: chat_id -> [{role, content}, ...] ---

function memory_get_history(string $chatId): array
{
    if (cfg('storage') === 'mysql') {
        $t = db_table('memory');
        $stmt = db()->prepare("SELECT history FROM {$t} WHERE chat_id = ?");
        $stmt->execute([$chatId]);
        $row = $stmt->fetch();
        if (!$row) {
            return [];
        }
        $data = json_decode((string)$row['history'], true);
        return is_array($data) ? $data : [];
    }
    $all = storage_read_json('memory.json', []);
    return isset($all[$chatId]) && is_array($all[$chatId]) ? $all[$chatId] : [];
}

function memory_add_turn(string $chatId, string $userText, string $assistantText): void
{
    $clamp = static function (string $s): string {
        return mb_strlen($s) > 4000 ? mb_substr($s, 0, 4000) : $s;
    };
    $history = memory_get_history($chatId);
    $history[] = ['role' => 'user', 'content' => $clamp($userText)];
    $history[] = ['role' => 'assistant', 'content' => $clamp($assistantText)];
    $limit = max(2, (int)cfg('memory_limit'));
    if (count($history) > $limit) {
        $history = array_slice($history, count($history) - $limit);
    }

    if (cfg('storage') === 'mysql') {
        $t = db_table('memory');
        $stmt = db()->prepare("INSERT INTO {$t} (chat_id, history) VALUES (?, ?) ON DUPLICATE KEY UPDATE history = VALUES(history)");
        $stmt->execute([$chatId, json_encode($history, JSON_UNESCAPED_UNICODE)]);
        return;
    }
    $all = storage_read_json('memory.json', []);
    $all[$chatId] = $history;
    storage_write_json('memory.json', $all);
}

function memory_reset(string $chatId): void
{
    if (cfg('storage') === 'mysql') {
        $t = db_table('memory');
        $stmt = db()->prepare("DELETE FROM {$t} WHERE chat_id = ?");
        $stmt->execute([$chatId]);
        return;
    }
    $all = storage_read_json('memory.json', []);
    unset($all[$chatId]);
    storage_write_json('memory.json', $all);
}

// --- Учёт токенов за день ---

function usage_record(?array $usage): void
{
    if (!$usage) {
        return;
    }
    $prompt = (int)($usage['prompt_tokens'] ?? 0);
    $completion = (int)($usage['completion_tokens'] ?? 0);
    $total = (int)($usage['total_tokens'] ?? 0) ?: ($prompt + $completion);
    $day = date('Y-m-d');

    if (cfg('storage') === 'mysql') {
        $t = db_table('stats');
        $stmt = db()->prepare(
            "INSERT INTO {$t} (day, requests, prompt_tokens, completion_tokens, total_tokens)
             VALUES (?, 1, ?, ?, ?)
             ON DUPLICATE KEY UPDATE requests = requests + 1, prompt_tokens = prompt_tokens + ?,
               completion_tokens = completion_tokens + ?, total_tokens = total_tokens + ?"
        );
        $stmt->execute([$day, $prompt, $completion, $total, $prompt, $completion, $total]);
        return;
    }
    $all = storage_read_json('stats.json', []);
    if (($all['day'] ?? '') !== $day) {
        $all = ['day' => $day, 'requests' => 0, 'prompt_tokens' => 0, 'completion_tokens' => 0, 'total_tokens' => 0];
    }
    $all['requests']++;
    $all['prompt_tokens'] += $prompt;
    $all['completion_tokens'] += $completion;
    $all['total_tokens'] += $total;
    storage_write_json('stats.json', $all);
}

function usage_summary(): string
{
    if (cfg('storage') === 'mysql') {
        $t = db_table('stats');
        $stmt = db()->prepare("SELECT requests, prompt_tokens, completion_tokens, total_tokens FROM {$t} WHERE day = ?");
        $stmt->execute([date('Y-m-d')]);
        $row = $stmt->fetch() ?: ['requests' => 0, 'prompt_tokens' => 0, 'completion_tokens' => 0, 'total_tokens' => 0];
    } else {
        $all = storage_read_json('stats.json', []);
        if (($all['day'] ?? '') !== date('Y-m-d')) {
            $all = ['requests' => 0, 'prompt_tokens' => 0, 'completion_tokens' => 0, 'total_tokens' => 0];
        }
        $row = $all;
    }
    return 'Токены за ' . date('Y-m-d')
        . ": запросов {$row['requests']}, prompt {$row['prompt_tokens']}, completion {$row['completion_tokens']}, всего {$row['total_tokens']}";
}

// --- Служебный state (маркер polling, отметки «уже уведомили» и т.п.) ---

function state_get(string $name): ?string
{
    if (cfg('storage') === 'mysql') {
        return db_state_get($name);
    }
    $all = storage_read_json('state.json', []);
    return isset($all[$name]) ? (string)$all[$name] : null;
}

function state_set(string $name, ?string $value): void
{
    if (cfg('storage') === 'mysql') {
        db_state_set($name, $value);
        return;
    }
    $all = storage_read_json('state.json', []);
    if ($value === null) {
        unset($all[$name]);
    } else {
        $all[$name] = $value;
    }
    storage_write_json('state.json', $all);
}
