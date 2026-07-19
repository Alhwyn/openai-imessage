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
  && apt-get purge -y firefox \
  && sed -i \
    -e '\|ln -sf $HOME/Uploads $HOME/Desktop/Uploads|d' \
    -e '\|ln -sf $HOME/Downloads $HOME/Desktop/Downloads|d' \
    /dockerstartup/kasm_default_profile.sh \
  && rm -f \
    /home/kasm-default-profile/Desktop/firefox.desktop \
    /home/kasm-user/Desktop/firefox.desktop \
    /home/kasm-default-profile/Desktop/Downloads \
    /home/kasm-default-profile/Desktop/Uploads \
    /home/kasm-user/Desktop/Downloads \
    /home/kasm-user/Desktop/Uploads \
    /usr/share/applications/firefox.desktop \
  && convert -size 1x1 xc:none /usr/share/extra/icons/icon_default.png \
  && for panel_config in \
    /home/kasm-default-profile/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml \
    /home/kasm-user/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml; do \
      if [ -f "$panel_config" ]; then \
        sed -i '/name="button-icon"/a\      <property name="show-button-title" type="bool" value="true"/>\\n      <property name="button-title" type="string" value="Computer Use"/>' "$panel_config"; \
      fi; \
    done \
  && rm -rf /var/lib/apt/lists/*

COPY --chmod=755 scripts/ /opt/computer-agent/bin/
COPY --chown=1000:0 assets/harbor-wallpaper.png /usr/share/backgrounds/computer-agent-harbor.png
RUN cp /usr/share/backgrounds/computer-agent-harbor.png /usr/share/backgrounds/bg_default.png
# Force fixed desktop geometry after session start (Kasm defaults to 1024x768).
COPY --chmod=755 scripts/kasm_post_run_user.sh /dockerstartup/kasm_post_run_user.sh

USER 1000
