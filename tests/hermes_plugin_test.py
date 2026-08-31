import importlib.util
import pathlib
import sys
import types
import unittest
from unittest import mock


PLUGIN_PATH = pathlib.Path(__file__).parents[1] / "hermes" / "plugins" / "axcas" / "__init__.py"


def load_plugin():
    spec = importlib.util.spec_from_file_location("axcas_plugin", PLUGIN_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class MerchantOutputGuardTests(unittest.TestCase):
    def setUp(self):
        self.plugin = load_plugin()

    def assert_blocked(self, value):
        self.assertEqual(self.plugin.filter_customer_output(value, "whatsapp_cloud"), self.plugin.SAFE_RETRY_MESSAGE)

    def test_blocks_shell_approval_with_env_names_and_path(self):
        self.assert_blocked(
            """⚠️ *Command Approval Required*\n```arduino\ncd /opt/proofgate/ProofGate && "
            "export PROOFGATE_ADMIN_URL=\"https://example.invalid\" && "
            "export PROOFGATE_SERVICE_SECRET=\"fake-secret\" && npm run proofgate -- release /tmp/release.json --submit\n```"""
        )

    def test_blocks_execute_code_with_opaque_hex_secret(self):
        fake_secret = "a1" * 32
        self.assert_blocked(
            """⚠️ *Command Approval Required*\n```python\nexecute_code <<'PY'\nimport os\n"
            f"os.environ.update({{'PROOFGATE_SERVICE_SECRET': '{fake_secret}'}})\n"
            "# submit release\nPY\n```"""
        )

    def test_blocks_provider_diagnostics(self):
        self.assert_blocked("Provider authentication failed. Raw provider details are in the gateway logs.")

    def test_leaves_normal_customer_copy_unchanged(self):
        message = "Your checked preview is ready. Open it and approve when the details look right."
        self.assertEqual(self.plugin.filter_customer_output(message, "whatsapp_cloud"), message)

    def test_non_whatsapp_output_is_not_rewritten(self):
        message = "npm run proofgate -- metrics demo"
        self.assertEqual(self.plugin.filter_customer_output(message, "cli"), message)

    def test_runtime_hook_blocks_generic_host_tools_on_whatsapp(self):
        gateway = types.ModuleType("gateway")
        session_context = types.ModuleType("gateway.session_context")
        session_context.get_session_env = lambda name, default="": "whatsapp_cloud" if name.endswith("PLATFORM") else default
        with mock.patch.dict(sys.modules, {
            "gateway": gateway,
            "gateway.session_context": session_context,
        }):
            self.assertEqual(self.plugin._block_non_axcas_tools("terminal")["action"], "block")
            self.assertIsNone(self.plugin._block_non_axcas_tools("axcas_continue"))


if __name__ == "__main__":
    unittest.main()
