#!/bin/sh
set -eu

cp -a /opt/legacy-vendor/. /var/www/html/vendor/

# The recording image has PHP OpenSSL but no openssl CLI. Generate a local-only
# self-signed certificate for the pinned GatewayWorker SSL listener.
php -r '
  $key = openssl_pkey_new(["private_key_bits" => 2048, "private_key_type" => OPENSSL_KEYTYPE_RSA]);
  if ($key === false) { exit(1); }
  $csr = openssl_csr_new(["commonName" => "localhost"], $key, ["digest_alg" => "sha256"]);
  if ($csr === false) { exit(1); }
  $certificate = openssl_csr_sign($csr, null, $key, 1, ["digest_alg" => "sha256"]);
  if ($certificate === false || !openssl_x509_export($certificate, $certPem) || !openssl_pkey_export($key, $keyPem)) { exit(1); }
  file_put_contents("/tmp/hubcontract-gateway.crt", $certPem);
  file_put_contents("/tmp/hubcontract-gateway.key", $keyPem);
'

exec php artisan gateway-worker push start
