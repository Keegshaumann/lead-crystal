<?php
// Shared helpers for the Leadcrystal form endpoints. No third-party libraries.
//
// Configuration is read from the first file that exists:
//   1. ../../leadcrystal-private/config.php   (beside public_html, never web-reachable: preferred)
//   2. ./config.local.php                      (inside api/, blocked by .htaccess)
// See config.example.php for the keys.

declare(strict_types=1);

if (PHP_SAPI !== 'cli' && basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'lib.php') {
    http_response_code(404);
    exit;
}

function lc_config(): array
{
    static $cfg = null;
    if ($cfg !== null) {
        return $cfg;
    }
    $defaults = [
        'to' => [],                 // recipients for website enquiries
        'from' => 'website@leadcrystal.co',
        'from_name' => 'Leadcrystal website',
        'smtp' => null,             // ['host'=>'', 'port'=>465, 'secure'=>'ssl'|'tls', 'user'=>'', 'pass'=>'']
        'secret' => '',             // signs whitepaper download links; auto-generated if empty
        'data_dir' => '',           // where submissions are logged; defaults below
    ];
    $paths = [dirname(__DIR__, 2) . '/leadcrystal-private/config.php', __DIR__ . '/config.local.php'];
    $loaded = [];
    foreach ($paths as $p) {
        if (is_file($p)) {
            $loaded = require $p;
            $loaded['_path'] = $p;
            break;
        }
    }
    $cfg = array_merge($defaults, is_array($loaded) ? $loaded : []);
    if ($cfg['data_dir'] === '') {
        $cfg['data_dir'] = isset($cfg['_path']) && str_contains($cfg['_path'], 'leadcrystal-private')
            ? dirname($cfg['_path']) . '/data'
            : __DIR__ . '/private/data';
    }
    if (!is_dir($cfg['data_dir'])) {
        @mkdir($cfg['data_dir'], 0750, true);
    }
    if ($cfg['secret'] === '') {
        $f = $cfg['data_dir'] . '/.secret';
        if (!is_file($f)) {
            @file_put_contents($f, bin2hex(random_bytes(32)), LOCK_EX);
            @chmod($f, 0600);
        }
        $cfg['secret'] = trim((string) @file_get_contents($f)) ?: 'lc-fallback-' . __DIR__;
    }
    return $cfg;
}

function lc_wants_json(): bool
{
    return str_contains($_SERVER['HTTP_ACCEPT'] ?? '', 'application/json');
}

function lc_json(int $status, array $data): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function lc_field(string $name, int $max = 200): string
{
    $v = $_POST[$name] ?? '';
    if (!is_string($v)) {
        return '';
    }
    $v = str_replace(["\r\n", "\r"], "\n", $v);
    $v = preg_replace('/[^\P{C}\n\t]/u', '', $v) ?? '';   // strip control chars except newline/tab
    return mb_substr(trim($v), 0, $max);
}

function lc_one_line(string $v): string
{
    return trim(preg_replace('/\s+/', ' ', $v) ?? '');
}

function lc_client_ip(): string
{
    return $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

// Max $limit submissions per IP per $window seconds.
function lc_rate_limited(int $limit = 6, int $window = 600): bool
{
    $dir = lc_config()['data_dir'] . '/rate';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    $f = $dir . '/' . hash('sha256', lc_client_ip()) . '.json';
    $now = time();
    $hits = is_file($f) ? (json_decode((string) file_get_contents($f), true) ?: []) : [];
    $hits = array_values(array_filter($hits, fn($t) => is_int($t) && $t > $now - $window));
    if (count($hits) >= $limit) {
        return true;
    }
    $hits[] = $now;
    @file_put_contents($f, json_encode($hits), LOCK_EX);
    return false;
}

function lc_log(string $type, array $fields, string $status): void
{
    $row = ['at' => date('c'), 'type' => $type, 'status' => $status, 'ip' => lc_client_ip(),
            'page' => lc_one_line((string) ($_SERVER['HTTP_REFERER'] ?? '')), 'fields' => $fields];
    @file_put_contents(lc_config()['data_dir'] . '/submissions.jsonl',
        json_encode($row, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);
}

function lc_whitepaper_link(): string
{
    $exp = time() + 86400;
    $sig = hash_hmac('sha256', 'whitepaper|' . $exp, lc_config()['secret']);
    return '/api/whitepaper.php?e=' . $exp . '&t=' . $sig;
}

function lc_header_value(string $v): string
{
    return str_replace(["\r", "\n"], '', $v);
}

/** Sends a plain-text email. Returns '' on success or an error string. */
function lc_send_mail(string $subject, string $body, string $replyTo = '', string $replyName = ''): string
{
    $cfg = lc_config();
    $to = array_values(array_filter((array) $cfg['to'], fn($a) => filter_var($a, FILTER_VALIDATE_EMAIL)));
    if (!$to) {
        return 'no recipients configured';
    }
    $from = lc_header_value((string) $cfg['from']);
    $fromName = lc_header_value((string) $cfg['from_name']);
    $enc = fn(string $s) => '=?UTF-8?B?' . base64_encode($s) . '?=';
    $headers = [
        'Date: ' . date('r'),
        'From: ' . $enc($fromName) . " <{$from}>",
        'To: ' . implode(', ', $to),
        'Subject: ' . $enc(lc_header_value($subject)),
        'Message-ID: <' . bin2hex(random_bytes(12)) . '@' . (explode('@', $from)[1] ?? 'leadcrystal.co') . '>',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ];
    if ($replyTo && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
        $headers[] = 'Reply-To: ' . ($replyName ? $enc(lc_header_value($replyName)) . ' ' : '') . "<{$replyTo}>";
    }
    $encodedBody = rtrim(chunk_split(base64_encode($body), 76, "\r\n"));

    if (!empty($cfg['smtp']['host'])) {
        return lc_smtp_send($cfg['smtp'], $from, $to, implode("\r\n", $headers) . "\r\n\r\n" . $encodedBody . "\r\n");
    }
    // Fallback: the host's local mailer.
    $mailHeaders = array_filter($headers, fn($h) => !str_starts_with($h, 'To: ') && !str_starts_with($h, 'Subject: '));
    $ok = @mail(implode(', ', $to), $enc(lc_header_value($subject)), $encodedBody, implode("\r\n", $mailHeaders), '-f' . $from);
    return $ok ? '' : 'mail() failed';
}

/** Minimal SMTP client: implicit TLS (465), STARTTLS (587) or 'none' for a local relay; AUTH LOGIN. */
function lc_smtp_send(array $s, string $from, array $to, string $data): string
{
    $secure = $s['secure'] ?? 'ssl';
    $host = (string) $s['host'];
    $port = (int) ($s['port'] ?? ($secure === 'ssl' ? 465 : ($secure === 'none' ? 25 : 587)));
    $ctx = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'SNI_enabled' => true]]);
    $fp = @stream_socket_client(($secure === 'ssl' ? 'ssl://' : 'tcp://') . "{$host}:{$port}", $errno, $errstr, 15,
        STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) {
        return "smtp connect failed: {$errstr}";
    }
    stream_set_timeout($fp, 20);
    $read = function () use ($fp): string {
        $out = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $out .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        return $out;
    };
    $cmd = function (?string $c, array $ok) use ($fp, $read): string {
        if ($c !== null) {
            fwrite($fp, $c . "\r\n");
        }
        $r = $read();
        if (!in_array((int) substr($r, 0, 3), $ok, true)) {
            throw new RuntimeException(trim(($c !== null && str_starts_with($c, 'AUTH') ? 'AUTH' : (string) $c) . ' -> ' . $r));
        }
        return $r;
    };
    try {
        $cmd(null, [220]);
        $ehlo = 'EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'leadcrystal.co');
        $cmd($ehlo, [250]);
        if ($secure === 'tls') {
            $cmd('STARTTLS', [220]);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLSv1_2_CLIENT | STREAM_CRYPTO_METHOD_TLSv1_3_CLIENT)) {
                throw new RuntimeException('STARTTLS failed');
            }
            $cmd($ehlo, [250]);
        }
        if (!empty($s['user'])) {
            $cmd('AUTH LOGIN', [334]);
            $cmd(base64_encode((string) $s['user']), [334]);
            $cmd(base64_encode((string) $s['pass']), [235]);
        }
        $cmd("MAIL FROM:<{$from}>", [250]);
        foreach ($to as $rcpt) {
            $cmd("RCPT TO:<{$rcpt}>", [250, 251]);
        }
        $cmd('DATA', [354]);
        $data = preg_replace('/^\./m', '..', $data);   // dot-stuffing
        $cmd($data . '.', [250]);
        $cmd('QUIT', [221]);
        fclose($fp);
        return '';
    } catch (Throwable $e) {
        @fclose($fp);
        return 'smtp: ' . $e->getMessage();
    }
}
