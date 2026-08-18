from app.config import get_settings
from app.services.magic_link_delivery_dev import DevMagicLinkDelivery


class MagicLinkDelivery:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.dev_delivery = DevMagicLinkDelivery()

    def deliver(self, email: str, signed_token: str) -> str:
        del email

        login_url = (
            f"{self.settings.magic_link_base_url.rstrip('/')}/staff/magic-link"
            f"?token={signed_token}"
        )

        if self.settings.app_env == "development" or self.settings.dev_magic_link_mode == "response":
            return self.dev_delivery.deliver(login_url)

        raise NotImplementedError("Production email delivery is not configured yet.")
