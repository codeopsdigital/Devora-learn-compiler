#!/bin/sh
# run.sh for Go
go build -o /tmp/out /code/main.go
if [ $? -ne 0 ]; then
    exit 1
fi

/tmp/out
