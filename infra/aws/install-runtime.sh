#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_URL="${1:?Usage: install-runtime.sh REPOSITORY_URL REPOSITORY_COMMIT}"
REPOSITORY_COMMIT="${2:?Usage: install-runtime.sh REPOSITORY_URL REPOSITORY_COMMIT}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "install-runtime.sh must run as root" >&2
  exit 2
fi

if ! id -u axcasbridge >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin axcasbridge
fi
if ! id -u axcasguardian >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin axcasguardian
fi
if [[ ! "${REPOSITORY_URL}" =~ ^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(\.git)?$ ]]; then
  echo "repository URL must be an explicit HTTPS GitHub repository" >&2
  exit 2
fi
if [[ ! "${REPOSITORY_COMMIT}" =~ ^[a-f0-9]{40}$ ]]; then
  echo "repository commit must be a full 40-character SHA" >&2
  exit 2
fi

install -d -o proofgate -g proofgate /opt/proofgate
if [[ ! -d /opt/proofgate/ProofGate/.git ]]; then
  sudo -u proofgate git clone --filter=blob:none "${REPOSITORY_URL}" /opt/proofgate/ProofGate
fi

sudo -u proofgate git -C /opt/proofgate/ProofGate fetch --depth 1 origin "${REPOSITORY_COMMIT}"
sudo -u proofgate git -C /opt/proofgate/ProofGate checkout --detach "${REPOSITORY_COMMIT}"
test "$(sudo -u proofgate git -C /opt/proofgate/ProofGate rev-parse HEAD)" = "${REPOSITORY_COMMIT}"
sudo -H -u proofgate env HOME=/home/proofgate npm --prefix /opt/proofgate/ProofGate ci --ignore-scripts
(
  cd /opt/proofgate/ProofGate
  sudo -H -u proofgate env HOME=/home/proofgate npm exec -- remotion browser ensure
)

test -x /opt/proofgate/hermes-agent/venv/bin/pip
(
  cd /opt/proofgate/hermes-agent
  sudo -u proofgate venv/bin/pip install -e ".[messaging]"
)

install -d -m 0750 -o proofgate -g proofgate /home/proofgate/.hermes /home/proofgate/.hermes/logs
install -d -o proofgate -g proofgate /home/proofgate/.hermes/skills
ln -sfn /opt/proofgate/ProofGate/hermes/skills/proofgate /home/proofgate/.hermes/skills/proofgate
install -d -o proofgate -g proofgate /home/proofgate/.hermes/plugins
ln -sfn /opt/proofgate/ProofGate/hermes/plugins/axcas /home/proofgate/.hermes/plugins/axcas

hermes_config=/home/proofgate/.hermes/config.yaml
hermes_config_temp="$(mktemp)"
cat /opt/proofgate/ProofGate/infra/aws/hermes-config.yaml > "${hermes_config_temp}"
install -m 0600 -o proofgate -g proofgate "${hermes_config_temp}" "${hermes_config}"
rm -f "${hermes_config_temp}"

install -d -m 0750 -o root -g proofgate /etc/proofgate
if [[ ! -e /etc/proofgate/origin.env ]]; then
  install -m 0640 -o root -g proofgate /dev/null /etc/proofgate/origin.env
fi
if [[ ! -e /etc/proofgate/hermes.env ]]; then
  install -m 0600 -o root -g root /dev/null /etc/proofgate/hermes.env
fi
chown root:root /etc/proofgate/hermes.env
chmod 0600 /etc/proofgate/hermes.env
if [[ ! -e /etc/proofgate/hermes-gateway.env ]]; then
  install -m 0640 -o root -g proofgate /dev/null /etc/proofgate/hermes-gateway.env
fi
if [[ ! -e /etc/proofgate/axcas-tool-bridge.env ]]; then
  install -m 0600 -o root -g root /dev/null /etc/proofgate/axcas-tool-bridge.env
fi
if [[ ! -e /etc/proofgate/relay.env ]]; then
  install -m 0640 -o root -g proofgate /dev/null /etc/proofgate/relay.env
fi
install -m 0644 /opt/proofgate/ProofGate/infra/aws/systemd/proofgate-hermes-gateway.service /etc/systemd/system/proofgate-hermes-gateway.service
install -m 0644 /opt/proofgate/ProofGate/infra/aws/systemd/proofgate-hermes-origin.service /etc/systemd/system/proofgate-hermes-origin.service
install -m 0644 /opt/proofgate/ProofGate/infra/aws/systemd/proofgate-cloudflared.service /etc/systemd/system/proofgate-cloudflared.service
install -m 0644 /opt/proofgate/ProofGate/infra/aws/systemd/proofgate-cloudflared-quick.service /etc/systemd/system/proofgate-cloudflared-quick.service
install -m 0644 /opt/proofgate/ProofGate/infra/aws/systemd/proofgate-hermes-relay.service /etc/systemd/system/proofgate-hermes-relay.service
install -m 0644 /opt/proofgate/ProofGate/infra/aws/systemd/axcas-tool-bridge.service /etc/systemd/system/axcas-tool-bridge.service
install -m 0644 /opt/proofgate/ProofGate/infra/aws/systemd/axcas-reel-guardian.service /etc/systemd/system/axcas-reel-guardian.service
install -m 0644 /opt/proofgate/ProofGate/infra/aws/systemd/axcas-call-guardian.service /etc/systemd/system/axcas-call-guardian.service
systemctl daemon-reload
systemctl enable proofgate-hermes-gateway.service
systemctl enable proofgate-hermes-origin.service
systemctl enable proofgate-cloudflared.service
systemctl enable proofgate-hermes-relay.service
systemctl enable axcas-tool-bridge.service
systemctl enable axcas-reel-guardian.service
systemctl enable axcas-call-guardian.service

echo "Runtime installed. Add the operator secrets, configure Hermes and the named-tunnel route, then start services."
