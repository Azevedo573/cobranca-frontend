ALTER TABLE `devedores` ADD `prioridade` enum('alta','media','baixa') DEFAULT 'media';--> statement-breakpoint
ALTER TABLE `devedores` ADD `score` int DEFAULT 0;--> statement-breakpoint
ALTER TABLE `devedores` ADD `ultimaAtualizacaoScore` timestamp;