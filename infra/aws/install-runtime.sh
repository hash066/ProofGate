#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_URL="${1:?Usage: install-runtime.sh REPOSITORY_URL REPOSITORY_COMMIT}"
REPOSITORY_COMMIT="${2:?Usage: install-runtime.sh REPOSITORY_URL REPOSITORY_COMMIT}"

if [[ "${EUID}" -ne 0 ]]; then
  echo "install-runtime.sh must run as root" >&2
  exit 2
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

hermes_config=/home/proofgate/.hermes/config.yaml
if ! grep -q '^model:' "${hermes_config}" 2>/dev/null; then
  hermes_config_temp="$(mktemp)"
  cat /opt/proofgate/ProofGate/infra/aws/hermes-config.yaml > "${hermes_config_temp}"
  if [[ -s "${hermes_config}" ]]; then
    printf '\n' >> "${hermes_config_temp}"
    cat "${hermes_config}" >> "${hermes_config_temp}"
  fi
  install -m 0600 -o proofgate -g proofgate "${hermes_config_temp}" "${hermes_config}"
  rm -f "${hermes_config_temp}"
fi

install -d -m 0750 -o root -g proofgate /etc/proofgate
if [[ ! -e /etc/proofgate/origin.env ]]; then
  install -m 0640 -o root -g proofgate /dev/null /etc/proofgate/origin.env
fi
if [[ ! -e /etc/proofgate/hermes.env ]]; then
  install -m 0640 -o root -g proofgate /dev/null /etc/proofgate/hermes.env
fi
if [[ ! -e /etc/proofgate/relay.env ]]; then
  install -m 0640 -o root -g proofgate /dev/null /etc/proofgate/relay.env
fi
install -m 0644 /opt/proofgate/ProofGate/infra/aws/systemd/proofgate-hermes-gateway.service /etc/systemd/system/proofgate-hermes-gateway.service
install -m 0644 /opt/proofgate/ProofGate/infra/aws/systemd/proofgate-hermes-origin.service /etc/systemd/system/proofgate-hermes-origin.service
install -m 0644 /opt/proofgate/ProofGate/infra/aws/systemd/proofgate-cloudflared.service /etc/systemd/system/proofgate-cloudflared.service
install -m 0644 /opt/proofgate/ProofGate/infra/aws/systemd/proofgate-cloudflared-quick.service /etc/systemd/system/proofgate-cloudflared-quick.service
install -m 0644 /opt/proofgate/ProofGate/infra/aws/systemd/proofgate-hermes-relay.service /etc/systemd/system/proofgate-hermes-relay.service
systemctl daemon-reload
systemctl enable proofgate-hermes-gateway.service
systemctl enable proofgate-hermes-origin.service
systemctl enable proofgate-cloudflared.service
systemctl enable proofgate-hermes-relay.service

echo "Runtime installed. Add the operator secrets, configure Hermes and the named-tunnel route, then start services."
