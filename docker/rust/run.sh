#!/bin/sh
# run.sh for Rust
rustc /code/main.rs -o /tmp/out
if [ $? -ne 0 ]; then
    exit 1
fi

/tmp/out
