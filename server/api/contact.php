<?php
// POST /api/contact.php: contact enquiries, newsletter sign-ups and whitepaper requests.
// Every submission is logged (data_dir/submissions.jsonl) before the email goes out,
// so a lead is never lost if mail delivery fails.

declare(strict_types=1);
require __DIR__ . '/lib.php';

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    header('Allow: POST');
    lc_json(405, ['ok' => false, 'error' => 'Method not allowed']);
}

$type = lc_field('type', 20);
if (!in_array($type, ['contact', 'newsletter', 'whitepaper'], true)) {
    lc_json(400, ['ok' => false, 'error' => 'Unknown form.']);
}

$fail = function (string $msg, int $status = 422) use ($type): never {
    if (lc_wants_json()) {
        lc_json($status, ['ok' => false, 'error' => $msg]);
    }
    http_response_code($status);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Leadcrystal</title>'
        . '<body style="font-family:sans-serif;background:#08080a;color:#eee;padding:40px"><p>' . htmlspecialchars($msg)
        . '</p><p><a style="color:#bec9ff" href="javascript:history.back()">Go back</a></p>';
    exit;
};

// --- spam checks: honeypot, fill-time, rate limit ---------------------------------------
$fields = [];
$honeypot = lc_field('website');
$ts = (int) lc_field('ts', 20);
$tooFast = $ts > 0 && (int) (microtime(true) * 1000) - $ts < 2500;
if ($honeypot !== '' || $tooFast) {
    lc_log($type, ['email' => lc_field('email', 160)], 'spam');
    // Pretend success so bots learn nothing.
    lc_json(200, ['ok' => true] + ($type === 'whitepaper' ? ['download' => '/'] : []));
}
if (lc_rate_limited()) {
    $fail('Too many submissions from your connection. Please try again in a few minutes.', 429);
}

// --- validate ---------------------------------------------------------------------------
$email = lc_field('email', 160);
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $fail('Please enter a valid email address.');
}
$fields['email'] = $email;

if ($type === 'contact') {
    $fields['name'] = lc_one_line(lc_field('name', 120));
    $fields['company'] = lc_one_line(lc_field('company', 160));
    $fields['phone'] = lc_one_line(lc_field('phone', 40));
    $fields['model'] = lc_one_line(lc_field('model', 60));
    $fields['message'] = lc_field('message', 5000);
    if ($fields['name'] === '' || $fields['message'] === '') {
        $fail('Please fill in your name and message.');
    }
    $subject = 'Website enquiry: ' . $fields['name'] . ($fields['company'] ? " ({$fields['company']})" : '')
        . ($fields['model'] ? " re {$fields['model']}" : '');
    $body = "New enquiry from leadcrystal.co\n\n"
        . "Name:     {$fields['name']}\n"
        . "Email:    {$email}\n"
        . "Company:  " . ($fields['company'] ?: '-') . "\n"
        . "Phone:    " . ($fields['phone'] ?: '-') . "\n"
        . "Model:    " . ($fields['model'] ?: '-') . "\n\n"
        . "Message:\n{$fields['message']}\n";
    $replyName = $fields['name'];
} elseif ($type === 'whitepaper') {
    $fields['first_name'] = lc_one_line(lc_field('first_name', 80));
    $fields['last_name'] = lc_one_line(lc_field('last_name', 80));
    $fields['company'] = lc_one_line(lc_field('company', 160));
    if ($fields['first_name'] === '' || $fields['last_name'] === '') {
        $fail('Please fill in your first and last name.');
    }
    $name = $fields['first_name'] . ' ' . $fields['last_name'];
    $subject = "Whitepaper download: {$name}" . ($fields['company'] ? " ({$fields['company']})" : '');
    $body = "Someone downloaded the TCO whitepaper from leadcrystal.co\n\n"
        . "Name:     {$name}\nEmail:    {$email}\nCompany:  " . ($fields['company'] ?: '-') . "\n";
    $replyName = $name;
} else {
    $subject = "Newsletter sign-up: {$email}";
    $body = "New newsletter sign-up on leadcrystal.co\n\nEmail: {$email}\n";
    $replyName = '';
}
$body .= "\n--\nSent from " . lc_one_line((string) ($_SERVER['HTTP_REFERER'] ?? 'leadcrystal.co')) . ' at ' . date('Y-m-d H:i T') . "\n";

// --- log first, then email --------------------------------------------------------------
$err = lc_send_mail($subject, $body, $email, $replyName);
lc_log($type, $fields, $err === '' ? 'sent' : 'logged-only: ' . $err);
if ($err !== '') {
    error_log('[leadcrystal form] ' . $err);
}

$extra = $type === 'whitepaper' ? ['download' => lc_whitepaper_link()] : [];
if (lc_wants_json()) {
    lc_json(200, ['ok' => true] + $extra);
}
// No-JavaScript fallback
if ($type === 'whitepaper') {
    header('Location: ' . $extra['download'], true, 303);
} else {
    header('Location: ' . ($type === 'contact' ? '/contact/?sent=1#enquiry' : '/?subscribed=1'), true, 303);
}
exit;
