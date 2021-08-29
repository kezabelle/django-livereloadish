from .apps import LiveReloadishConfig

from .middleware import LivereloadishMiddleware


__all__ = ["LiveReloadishConfig", "LivereloadishMiddleware"]
default_app_config = "livereloadish.apps.LiveReloadishConfig"
