-- 说明：该 SQL 用于关系型数据库（MySQL 8+）场景。
-- 当前项目的 uniCloud 实际落库以 schema 为准：
-- uniCloud-alipay/database/gw-ancient-favorites.schema.json

CREATE TABLE IF NOT EXISTS `gw_ancient_favorites` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `user_id` VARCHAR(64) NOT NULL COMMENT '收藏者ID',
  `text_id` VARCHAR(64) NOT NULL COMMENT '古文ID',
  `text_title` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '古文标题',
  `text_author` VARCHAR(128) NOT NULL DEFAULT '' COMMENT '古文作者',
  `text_dynasty` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '古文朝代',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '收藏时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_text` (`user_id`, `text_id`),
  KEY `idx_user_created_at` (`user_id`, `created_at`),
  KEY `idx_text_id` (`text_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='古文收藏表';
