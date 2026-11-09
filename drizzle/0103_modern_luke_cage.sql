CREATE TABLE `btgBoletoSnapshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`btgCobrancaEmitidaId` int NOT NULL,
	`btgIntegracaoId` int NOT NULL,
	`parcelaAcordoId` int NOT NULL,
	`condominioId` int NOT NULL,
	`revisao` int NOT NULL,
	`diagnosticoId` int,
	`usuarioId` int NOT NULL,
	`estado` enum('completo','incompleto') NOT NULL,
	`dadosCifrados` mediumtext,
	`dadosSha256` varchar(64),
	`payloadSha256` varchar(64) NOT NULL,
	`criadoEm` timestamp NOT NULL,
	CONSTRAINT `btgBoletoSnapshots_id` PRIMARY KEY(`id`),
	CONSTRAINT `btgBoletoSnapshots_emissao_unique` UNIQUE(`btgCobrancaEmitidaId`)
);
--> statement-breakpoint
CREATE TABLE `btgCancelamentos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chaveOperacao` varchar(36) NOT NULL,
	`btgCobrancaEmitidaId` int NOT NULL,
	`parcelaAcordoId` int NOT NULL,
	`btgIntegracaoId` int NOT NULL,
	`condominioId` int NOT NULL,
	`usuarioId` int NOT NULL,
	`estado` enum('preparada','solicitada','em_confirmacao','recusada','cancelada','conflito_pagamento') NOT NULL,
	`contextoHash` varchar(64) NOT NULL,
	`consultaCifrada` mediumtext,
	`motivoCifrado` text,
	`criadaEm` timestamp NOT NULL,
	`expiraEm` timestamp NOT NULL,
	`solicitadaEm` timestamp,
	`confirmadaEm` timestamp,
	`httpStatus` int,
	`codigo` varchar(80),
	`updatedAt` timestamp NOT NULL,
	CONSTRAINT `btgCancelamentos_id` PRIMARY KEY(`id`),
	CONSTRAINT `btgCancelamentos_chave_unique` UNIQUE(`chaveOperacao`)
);
--> statement-breakpoint
CREATE INDEX `btgBoletoSnapshots_parcela_idx` ON `btgBoletoSnapshots` (`parcelaAcordoId`,`revisao`);--> statement-breakpoint
CREATE INDEX `btgCancelamentos_emissao_idx` ON `btgCancelamentos` (`btgCobrancaEmitidaId`,`id`);