import logging


logger = logging.getLogger(__name__)


class DevMagicLinkDelivery:
    def deliver(self, login_url: str) -> str:
        logger.warning("Development magic link generated: %s", login_url)
        return login_url

