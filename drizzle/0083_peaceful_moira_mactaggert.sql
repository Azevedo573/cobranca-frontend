CREATE TABLE `pje_publicacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`pje_id` int NOT NULL,
	`data_disponibilizacao` varchar(10) NOT NULL,
	`sigla_tribunal` varchar(20) NOT NULL,
	`tipo_comunicacao` varchar(100),
	`nome_orgao` varchar(255),
	`numero_processo` varchar(50),
	`numero_processo_mascara` varchar(60),
	`tipo_documento` varchar(100),
	`nome_classe` varchar(100),
	`texto` text,
	`link` text,
	`meio` varchar(5),
	`meio_completo` varchar(100),
	`destinatarios_json` text,
	`monitoramento_id` int,
	`lida` int NOT NULL DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `pje_publicacoes_id` PRIMARY KEY(`id`),
	CONSTRAINT `pje_publicacoes_pje_id_unique` UNIQUE(`pje_id`)
);
--> statement-breakpoint
ALTER TABLE `movimentacoesProcesso` MODIFY COLUMN `origemMovimentacao` enum('manual','datajud','tjrj') NOT NULL DEFAULT 'manual';--> statement-breakpoint
ALTER TABLE `movimentacoesProcesso` ADD `tjrjOrdem` int;