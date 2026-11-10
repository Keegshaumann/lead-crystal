<?php
// GET /api/whitepaper.php?e=<expiry>&t=<signature>
// Streams the TCO whitepaper for a signed link issued by contact.php (valid 24 hours).

declare(strict_types=1);
require __DIR__ . '/lib.php';

$e = (int) ($_GET['e'] ?? 0);
$t = (string) ($_GET['t'] ?? '');
$expected = hash_hmac('sha256', 'whitepaper|' . $e, lc_config()['secret']);
if ($e < time() || !hash_equals($expected, $t)) {
    header('Location: /lead-crystal-tco-whitepaper/?expired=1', true, 302);
    exit;
}
// Preferred: leadcrystal-private/whitepaper.pdf beside public_html (the repo is public, so the PDF is not in git).
$file = dirname(__DIR__, 2) . '/leadcrystal-private/whitepaper.pdf';
if (!is_file($file)) {
    $file = __DIR__ . '/private/whitepaper.pdf';
}
if (!is_file($file)) {
    http_response_code(404);
    exit('Whitepaper not found.');
}
header('Content-Type: application/pdf');
header('Content-Length: ' . filesize($file));
header('Content-Disposition: attachment; filename="Leadcrystal_TCO_White_Paper_v3.1_June2026.pdf"');
header('Cache-Control: private, no-store');
header('X-Robots-Tag: noindex');
readfile($file);
