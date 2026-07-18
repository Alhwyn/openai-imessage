ARG KASM_TAG=1.18.0
FROM kasmweb/desktop:${KASM_TAG}

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
