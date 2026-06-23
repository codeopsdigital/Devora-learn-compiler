#!/bin/sh
# run.sh for Java
javac /code/Main.java -d /tmp
if [ $? -ne 0 ]; then
    exit 1
fi

java -cp /tmp Main
