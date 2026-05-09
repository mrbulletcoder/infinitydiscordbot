-- Infinity Bot Database Schema
-- Run this once before starting the bot, and again safely after updates.
-- Uses CREATE TABLE IF NOT EXISTS so it will not delete existing data.

CREATE TABLE IF NOT EXISTS guild_settings (
  guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
  case_number INT NOT NULL DEFAULT 0,
  report_case_number INT NOT NULL DEFAULT 0,
  mod_logs VARCHAR(32) NULL,
  report_cooldown_seconds INT NOT NULL DEFAULT 120,
  welcome_enabled TINYINT(1) NOT NULL DEFAULT 0,
  welcome_channel VARCHAR(32) NULL,
  welcome_message TEXT NULL,
  welcome_title VARCHAR(255) NULL,
  welcome_color VARCHAR(16) NULL DEFAULT '#00bfff',
  welcome_rules_channel VARCHAR(32) NULL,
  welcome_chat_channel VARCHAR(32) NULL,
  welcome_auto_role VARCHAR(32) NULL,
  updated_at BIGINT NULL
);

CREATE TABLE IF NOT EXISTS cases (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  case_number INT NOT NULL,
  action VARCHAR(100) NOT NULL,
  user_id VARCHAR(32) NULL,
  moderator_id VARCHAR(32) NULL,
  reason TEXT NULL,
  created_at BIGINT NOT NULL,
  UNIQUE KEY unique_guild_case (guild_id, case_number),
  INDEX idx_cases_user (guild_id, user_id),
  INDEX idx_cases_moderator (guild_id, moderator_id)
);

CREATE TABLE IF NOT EXISTS case_notes (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  case_number INT NOT NULL,
  author_id VARCHAR(32) NOT NULL,
  note TEXT NOT NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_case_notes (guild_id, case_number)
);

CREATE TABLE IF NOT EXISTS warnings (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  moderator_id VARCHAR(32) NULL,
  reason TEXT NULL,
  created_at BIGINT NOT NULL,
  INDEX idx_warnings_user (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS ticket_settings (
  guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
  category_id VARCHAR(32) NULL,
  panel_channel_id VARCHAR(32) NULL,
  transcript_channel_id VARCHAR(32) NULL,
  support_role_id VARCHAR(32) NULL,
  appeal_category_id VARCHAR(32) NULL,
  appeal_role_id VARCHAR(32) NULL,
  updated_at BIGINT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  creator_id VARCHAR(32) NOT NULL,
  claimed_by VARCHAR(32) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  created_at BIGINT NOT NULL,
  closed_at BIGINT NULL,
  closed_by VARCHAR(32) NULL,
  INDEX idx_tickets_guild_user_status (guild_id, creator_id, status),
  INDEX idx_tickets_channel (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS appeals (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  case_number INT NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  moderator_id VARCHAR(32) NULL,
  reason TEXT NOT NULL,
  claimed_by VARCHAR(32) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  decision_reason TEXT NULL,
  decided_by VARCHAR(32) NULL,
  created_at BIGINT NOT NULL,
  decided_at BIGINT NULL,
  INDEX idx_appeals_case (guild_id, case_number, user_id),
  INDEX idx_appeals_status (guild_id, status)
);

CREATE TABLE IF NOT EXISTS application_settings (
  guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
  panel_channel_id VARCHAR(32) NULL,
  review_channel_id VARCHAR(32) NULL,
  application_cooldown_hours INT NOT NULL DEFAULT 24,
  updated_at BIGINT NULL
);

CREATE TABLE IF NOT EXISTS application_positions (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  role_id VARCHAR(32) NULL,
  emoji VARCHAR(100) NULL,
  questions_json JSON NULL,
  created_at BIGINT NULL,
  updated_at BIGINT NULL,
  UNIQUE KEY unique_application_position (guild_id, name)
);

CREATE TABLE IF NOT EXISTS applications (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  position_id INT NOT NULL,
  answers_json JSON NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  reviewed_by VARCHAR(32) NULL,
  review_reason TEXT NULL,
  created_at BIGINT NOT NULL,
  reviewed_at BIGINT NULL,
  INDEX idx_applications_user (guild_id, user_id),
  INDEX idx_applications_status (guild_id, status)
);

CREATE TABLE IF NOT EXISTS reports (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  case_number INT NOT NULL,
  reporter_id VARCHAR(32) NOT NULL,
  reported_user_id VARCHAR(32) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'open',
  claimed_by VARCHAR(32) NULL,
  resolved_by VARCHAR(32) NULL,
  resolution_reason TEXT NULL,
  created_at BIGINT NOT NULL,
  resolved_at BIGINT NULL,
  UNIQUE KEY unique_report_case (guild_id, case_number),
  INDEX idx_reports_reporter (guild_id, reporter_id),
  INDEX idx_reports_status (guild_id, status)
);

CREATE TABLE IF NOT EXISTS automod_config (
  guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
  spam_enabled TINYINT(1) NOT NULL DEFAULT 0,
  links_enabled TINYINT(1) NOT NULL DEFAULT 0,
  invites_enabled TINYINT(1) NOT NULL DEFAULT 0,
  caps_enabled TINYINT(1) NOT NULL DEFAULT 0,
  filter_enabled TINYINT(1) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS automod_offenses (
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  offense_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS automod_punishments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  type VARCHAR(32) NOT NULL,
  offense_number INT NOT NULL,
  punishment VARCHAR(32) NOT NULL DEFAULT 'warn',
  UNIQUE KEY unique_automod_punishment (guild_id, type, offense_number)
);

CREATE TABLE IF NOT EXISTS automod_whitelist_roles (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  role_id VARCHAR(32) NOT NULL,
  UNIQUE KEY unique_automod_role (guild_id, role_id)
);

CREATE TABLE IF NOT EXISTS automod_whitelist_users (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  UNIQUE KEY unique_automod_user (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS automod_whitelist_channels (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  UNIQUE KEY unique_automod_channel (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS reaction_role_categories (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NULL,
  mode VARCHAR(32) NOT NULL DEFAULT 'normal',
  created_at BIGINT NULL,
  UNIQUE KEY unique_rr_category (guild_id, name)
);

CREATE TABLE IF NOT EXISTS reaction_role_items (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  category_id INT NOT NULL,
  role_id VARCHAR(32) NOT NULL,
  emoji_key VARCHAR(100) NOT NULL,
  emoji_display VARCHAR(100) NULL,
  label VARCHAR(100) NULL,
  description TEXT NULL,
  INDEX idx_rr_items_category (guild_id, category_id),
  UNIQUE KEY unique_rr_item_role (guild_id, category_id, role_id),
  UNIQUE KEY unique_rr_item_emoji (guild_id, category_id, emoji_key)
);

CREATE TABLE IF NOT EXISTS reaction_role_messages (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  category_id INT NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  message_id VARCHAR(32) NOT NULL,
  UNIQUE KEY unique_rr_message (guild_id, message_id),
  INDEX idx_rr_messages_category (guild_id, category_id)
);

CREATE TABLE IF NOT EXISTS rank_settings (
  guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  mode VARCHAR(32) NOT NULL DEFAULT 'all_whitelisted',
  xp_min INT NOT NULL DEFAULT 15,
  xp_max INT NOT NULL DEFAULT 25,
  xp_cooldown_seconds INT NOT NULL DEFAULT 60
);

CREATE TABLE IF NOT EXISTS rank_users (
  guild_id VARCHAR(32) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  xp BIGINT NOT NULL DEFAULT 0,
  level INT NOT NULL DEFAULT 0,
  messages BIGINT NOT NULL DEFAULT 0,
  last_xp_at BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (guild_id, user_id),
  INDEX idx_rank_leaderboard (guild_id, xp, messages)
);

CREATE TABLE IF NOT EXISTS rank_whitelist_channels (
  guild_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS rank_blacklist_channels (
  guild_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  PRIMARY KEY (guild_id, channel_id)
);

CREATE TABLE IF NOT EXISTS giveaways (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  guild_id VARCHAR(32) NOT NULL,
  channel_id VARCHAR(32) NOT NULL,
  message_id VARCHAR(32) NOT NULL,
  host_id VARCHAR(32) NOT NULL,
  prize VARCHAR(255) NOT NULL,
  description TEXT NULL,
  winner_count INT NOT NULL DEFAULT 1,
  entries_json JSON NULL,
  ended TINYINT(1) NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL,
  end_at BIGINT NOT NULL,
  required_role_id VARCHAR(32) NULL,
  blacklist_role_id VARCHAR(32) NULL,
  min_account_age_days INT NULL,
  min_join_age_days INT NULL,
  UNIQUE KEY unique_giveaway_message (message_id),
  INDEX idx_giveaways_active (ended, end_at),
  INDEX idx_giveaways_guild (guild_id)
);

CREATE TABLE IF NOT EXISTS infinity_log_settings (
  guild_id VARCHAR(32) NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  moderation_channel_id VARCHAR(32) NULL,
  message_channel_id VARCHAR(32) NULL,
  member_channel_id VARCHAR(32) NULL,
  channel_channel_id VARCHAR(32) NULL,
  role_channel_id VARCHAR(32) NULL,
  ban_channel_id VARCHAR(32) NULL,
  ignored_channels TEXT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS afk_users (
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS economy_users (
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    wallet BIGINT DEFAULT 0,
    bank BIGINT DEFAULT 0,
    daily_streak INT DEFAULT 0,
    last_daily BIGINT DEFAULT 0,
    last_work BIGINT DEFAULT 0,
    last_beg BIGINT DEFAULT 0,
    last_crime BIGINT DEFAULT 0,
    last_slots BIGINT DEFAULT 0,
    last_rob BIGINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (guild_id, user_id)
);

CREATE TABLE IF NOT EXISTS economy_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    type VARCHAR(50) NOT NULL,
    amount BIGINT NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS economy_inventory (
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    item_id VARCHAR(100) NOT NULL,
    quantity INT DEFAULT 1,
    PRIMARY KEY (guild_id, user_id, item_id)
);