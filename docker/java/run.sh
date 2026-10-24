#!/bin/sh
# run.sh for Java
# Tiered-compilation cap + serial GC cut JVM startup/compile time on 1 CPU.
javac -J-XX:TieredStopAtLevel=1 -J-XX:+UseSerialGC -J-Xshare:auto -J-Xmx128m /code/Main.java -d /tmp
if [ $? -ne 0 ]; then
    exit 1
fi

java -XX:TieredStopAtLevel=1 -XX:+UseSerialGC -Xshare:auto -Xmx128m -cp /tmp Main
