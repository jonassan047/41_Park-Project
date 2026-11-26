<?php file_put_contents(__DIR__.'/mail-'.hrtime(true).'.eml', stream_get_contents(STDIN));
