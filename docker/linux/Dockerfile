# The shell every student gets. Deliberately busybox-based (like the buildroot
# image the in-browser v86 VM used) so lesson commands behave the same.
FROM alpine:3.20

RUN apk add --no-cache bash nano tree less \
    && adduser -D -s /bin/sh -h /home/student student \
    && printf 'export PS1="\\w # "\nexport HOME=/home/student\ncd ~\n' > /etc/profile.d/devora.sh

USER student
WORKDIR /home/student
ENV ENV=/etc/profile.d/devora.sh TERM=xterm-256color LANG=C.UTF-8

CMD ["/bin/sh"]
