<?php
// Copy to  ../../leadcrystal-private/config.php  (one level ABOVE public_html) and fill in.
// Never commit the real file.
return [
    // Who receives website enquiries, newsletter sign-ups and whitepaper downloads.
    'to' => ['sales@leadcrystal.co'],

    // Sender address. Must be a mailbox on a domain whose SPF/DKIM allow this server or SMTP host.
    'from' => 'website@leadcrystal.co',
    'from_name' => 'Leadcrystal website',

    // Recommended: send through a real mailbox instead of PHP mail().
    // Implicit TLS: port 465 + 'ssl'. STARTTLS: port 587 + 'tls'.
    'smtp' => [
        'host' => 'smtp.example.com',
        'port' => 465,
        'secure' => 'ssl',
        'user' => 'website@leadcrystal.co',
        'pass' => 'CHANGE-ME',
    ],

    // Optional. Signs whitepaper download links. Auto-generated into data_dir if left empty.
    'secret' => '',

    // Optional. Where submissions.jsonl is written. Defaults to leadcrystal-private/data.
    'data_dir' => '',
];
