<?php

namespace App\Support;

use Exception;

class LegacyApiException extends Exception
{
    public function __construct(string $message, protected int $status = 500)
    {
        parent::__construct($message);
    }

    public function status(): int
    {
        return $this->status;
    }
}
