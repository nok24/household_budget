-- overrides テーブルを (source_file_id, mf_row_id) 複合 PK に作り直す。
--
-- 旧 schema は `transaction_id` (transactions.id surrogate FK) を PK にしていたが、
-- 取引同期 (functions/routes/sync.ts の deleteFileTransactions + INSERT) で surrogate id が
-- 変わるたびに override が孤立する構造的バグを内包していた。CSV 側の MF Row ID は安定して
-- いるので、`(source_file_id, mf_row_id)` 複合キーで再リンクが効く形に変更する。
--
-- 本番 D1 / ローカル D1 ともに overrides 行ゼロ前提で drop & recreate。既存ローカルで手動投入
-- していた行は失われる (Phase 3-F 着手前の dev データ)。
DROP TABLE `overrides`;--> statement-breakpoint
CREATE TABLE `overrides` (
	`source_file_id` text NOT NULL,
	`mf_row_id` text NOT NULL,
	`large_category` text,
	`mid_category` text,
	`memo` text,
	`is_transfer_override` integer,
	`excluded` integer,
	`updated_by` text,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`source_file_id`, `mf_row_id`),
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
