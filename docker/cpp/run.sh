#!/bin/sh
# run.sh for C++
g++ -O2 -o /tmp/out /code/main.cpp
if [ $? -ne 0 ]; then
    exit 1
fi

/tmp/out
