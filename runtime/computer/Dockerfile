FROM kasmweb/desktop:1.18.0@sha256:9a94316372b8858d0238134ba507812e867fcb903d0db599c8cfd9ff8bcd0bfb

USER root

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    imagemagick \
    jq \
    maim \
    pulseaudio-utils \
    xdotool \
    x11-utils \
    x11-xserver-utils \
  && rm -rf /var/lib/apt/lists/*

COPY --chmod=755 scripts/ /opt/computer-agent/bin/

USER 1000
