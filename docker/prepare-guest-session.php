<?php

// Recording-only setup for the Legacy guest path. The pinned application can
// read a `user_guest` session but its issue-creation method is absent at the
// fixed commit, so a synthetic guest session must be prepared out of band.
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

if (count($argv) !== 3 || !ctype_digit($argv[1])) {
    fwrite(STDERR, "Expected issue ID and encrypted session cookie\n");
    exit(1);
}

$issue = Illuminate\Support\Facades\DB::table('service_issues')->where('id', (int) $argv[1])->first();
if (!$issue || $issue->issueable_type !== App\Models\UserGuest::class) {
    fwrite(STDERR, "Issue must belong to a synthetic guest\n");
    exit(1);
}
$guest = Illuminate\Support\Facades\DB::table('user_guests')->where('id', $issue->issueable_id)->first();
if (!$guest || !str_starts_with($guest->account, 'synthetic_guest_')) {
    fwrite(STDERR, "Synthetic guest is missing\n");
    exit(1);
}

try {
    $value = $app['encrypter']->decrypt(rawurldecode($argv[2]), false);
    $sessionId = Illuminate\Cookie\CookieValuePrefix::remove($value);
    if (!is_string($sessionId) || $sessionId === '') {
        throw new RuntimeException('Empty session ID');
    }
    $session = $app['session']->driver();
    $session->setId($sessionId);
    $session->start();
    $session->put('user_guest', $guest->account);
    $session->save();
} catch (Throwable $error) {
    fwrite(STDERR, "Could not prepare guest session: {$error->getMessage()}\n");
    exit(1);
}

echo "ready\n";
