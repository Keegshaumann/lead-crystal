<?php
// Local preview only: php -S 127.0.0.1:8787 -t dist scripts/php-router.php
// Mimics the Apache rules that matter (private folder blocked, trailing slashes, 404 page).
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$root = $_SERVER['DOCUMENT_ROOT'];
if (preg_match('#^/api/(private/|lib\.php|config)#', $path)) {
    http_response_code(403);
    exit('Forbidden');
}
$file = $root . $path;
if (is_file($file)) {
    return false;
}
if (is_dir($file)) {
    if (substr($path, -1) !== '/') {
        header('Location: ' . $path . '/', true, 301);
        exit;
    }
    if (is_file($file . 'index.html')) {
        return false;
    }
}
http_response_code(404);
readfile($root . '/404.html');
