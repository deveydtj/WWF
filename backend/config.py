"""
Production configuration validation and environment variable management.
"""
import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


class ConfigError(Exception):
    """Raised when a required configuration is missing or invalid."""
    pass


def validate_production_config():
    """Validate that all required production configuration is present."""
    errors = []
    warnings = []
    
    # Check Flask environment
    flask_env = os.environ.get("FLASK_ENV", "development")
    is_production = flask_env == "production"
    
    if is_production:
        logger.info("Running in production mode, validating configuration...")
        
        # Required environment variables for production
        required_vars = [
            "SECRET_KEY",
            # Add other required production vars here
        ]
        
        for var in required_vars:
            if not os.environ.get(var):
                errors.append(f"Missing required environment variable: {var}")
        
        # Validate secret key is not the default
        secret_key = os.environ.get("SECRET_KEY")
        if secret_key == "dev_key_for_local_testing_only":
            errors.append("SECRET_KEY must be changed from default value for production")
        
        # Validate secret key strength (basic check)
        if secret_key and len(secret_key) < 32:
            warnings.append("SECRET_KEY should be at least 32 characters long")
        
        # Check Redis configuration if URL is provided
        redis_url = os.environ.get("REDIS_URL")
        if redis_url:
            if not redis_url.startswith(("redis://", "rediss://")):
                warnings.append("REDIS_URL should use redis:// or rediss:// scheme")
        
        # File path validations
        word_list_path = os.environ.get("WORD_LIST_PATH")
        if word_list_path:
            if not Path(word_list_path).exists():
                errors.append(f"WORD_LIST_PATH points to non-existent file: {word_list_path}")
        
        defn_cache_path = os.environ.get("DEFN_CACHE_PATH")
        if defn_cache_path:
            if not Path(defn_cache_path).exists():
                errors.append(f"DEFN_CACHE_PATH points to non-existent file: {defn_cache_path}")
    
    else:
        logger.info("Running in development mode")
    
    # Log warnings
    for warning in warnings:
        logger.warning(f"Configuration warning: {warning}")
    
    # Raise errors
    if errors:
        error_msg = "Configuration validation failed:\n" + "\n".join(f"  - {err}" for err in errors)
        logger.error(error_msg)
        raise ConfigError(error_msg)
    
    logger.info("Configuration validation passed")


def get_config_summary():
    """Return a summary of current configuration for debugging."""
    return {
        "flask_env": os.environ.get("FLASK_ENV", "development"),
        "secret_key_set": bool(os.environ.get("SECRET_KEY")),
        "redis_url_set": bool(os.environ.get("REDIS_URL")),
        "word_list_path": os.environ.get("WORD_LIST_PATH"),
        "defn_cache_path": os.environ.get("DEFN_CACHE_PATH"),
        "game_file": os.environ.get("GAME_FILE"),
        "lobbies_file": os.environ.get("LOBBIES_FILE"),
    }