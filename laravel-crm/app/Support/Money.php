<?php

namespace App\Support;

class Money
{
    /** Group a number in the Indian numbering system: 1234567 -> "12,34,567". */
    public static function group($n): string
    {
        $n = (float) $n;
        $neg = $n < 0;
        $num = (string) round(abs($n));
        if (strlen($num) > 3) {
            $last3 = substr($num, -3);
            $rest = substr($num, 0, -3);
            $rest = preg_replace('/\B(?=(\d\d)+(?!\d))/', ',', $rest);
            $num = $rest.','.$last3;
        }

        return ($neg ? '-' : '').$num;
    }

    /** Indian-formatted amount prefixed with the rupee sign: "₹12,34,567". */
    public static function inr($n): string
    {
        return '₹'.self::group($n);
    }
}
