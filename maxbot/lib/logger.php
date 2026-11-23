<?php
// Логгер: строка в файл (cfg 'log_file') + эхо в консоль при CLI-запуске

function bot_log(string $level, string $message): void
{
    $line = '[' . gmdate('Y-m-d\TH:i:s\Z') . '] ' . $level . ' ' . $message;
    if (PHP_SAPI === 'cli') {
        echo $line . PHP_EOL;
    }
    $file = (string)cfg('log_file');
    if ($file !== '') {
        $dir = dirname($file);
        if (!is_dir($dir)) {
            ensure_private_dir($dir);
        }
        @file_put_contents($file, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}
