CREATE TABLE `btgRemessaItens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`btgRemessaId` int NOT NULL,
	`parcelaAcordoId` int NOT NULL,
	`btgCobrancaEmitidaId` int,
	`installmentNumber` int NOT NULL,
	`valorCentavos` int NOT NULL,
	`resultado` enum('pendente','emitida','ja_existia','falha') NOT NULL DEFAULT 'pendente',
	`mensagem` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `btgRemessaItens_id` PRIMARY KEY(`id`),
	CONSTRAINT `btgRemessaItens_remessa_parcela_unique` UNIQUE(`btgRemessaId`,`parcelaAcordoId`)
);
--> statement-breakpoint
CREATE TABLE `btgRemessas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`btgIntegracaoId` int NOT NULL,
	`btgContaRecebedoraId` int NOT NULL,
	`condominioId` int NOT NULL,
	`status` enum('rascunho','enviando','processada','processada_parcialmente','falha','cancelada') NOT NULL DEFAULT 'rascunho',
	`totalSelecionado` int NOT NULL DEFAULT 0,
	`totalEmitido` int NOT NULL DEFAULT 0,
	`totalFalha` int NOT NULL DEFAULT 0,
	`valorTotalCentavos` int NOT NULL DEFAULT 0,
	`usuarioCriadorId` int NOT NULL,
	`observacao` varchar(500),
	`erroResumo` varchar(500),
	`criadaEm` timestamp NOT NULL DEFAULT (now()),
	`iniciadaEm` timestamp,
	`finalizadaEm` timestamp,
	`canceladaEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `btgRemessas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `btgCobrancasEmitidas` ADD `btgRemessaId` int;--> statement-breakpoint
CREATE INDEX `btgRemessaItens_emissao_idx` ON `btgRemessaItens` (`btgCobrancaEmitidaId`);--> statement-breakpoint
CREATE INDEX `btgRemessas_integracao_condominio_status_idx` ON `btgRemessas` (`btgIntegracaoId`,`condominioId`,`status`,`criadaEm`);--> statement-breakpoint
CREATE INDEX `btgCobrancasEmitidas_remessa_idx` ON `btgCobrancasEmitidas` (`btgRemessaId`);