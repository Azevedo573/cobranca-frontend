CREATE TABLE `btgContaRecebedoraCondominios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`btgIntegracaoId` int NOT NULL,
	`condominioId` int NOT NULL,
	`btgContaRecebedoraId` int NOT NULL,
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `btgContaRecebedoraCondominios_id` PRIMARY KEY(`id`),
	CONSTRAINT `btgContaRecebedoraCondominios_integracao_condominio_unique` UNIQUE(`btgIntegracaoId`,`condominioId`)
);
--> statement-breakpoint
CREATE TABLE `btgContasRecebedoras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`btgIntegracaoId` int NOT NULL,
	`accountId` varchar(150) NOT NULL,
	`agencia` varchar(30) NOT NULL,
	`numero` varchar(50) NOT NULL,
	`documentoBeneficiario` varchar(20),
	`nomeBeneficiario` varchar(255),
	`rotulo` varchar(255),
	`ativo` int NOT NULL DEFAULT 1,
	`ultimaSincronizacaoEm` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `btgContasRecebedoras_id` PRIMARY KEY(`id`),
	CONSTRAINT `btgContasRecebedoras_integracao_account_unique` UNIQUE(`btgIntegracaoId`,`accountId`)
);
--> statement-breakpoint
CREATE TABLE `btgIntegracoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ambiente` enum('sandbox','producao') NOT NULL,
	`companyId` varchar(50) NOT NULL,
	`ativo` int NOT NULL DEFAULT 0,
	`emissaoHabilitada` int NOT NULL DEFAULT 0,
	`ultimaConsultaContasEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `btgIntegracoes_id` PRIMARY KEY(`id`),
	CONSTRAINT `btgIntegracoes_ambiente_unique` UNIQUE(`ambiente`)
);
--> statement-breakpoint
CREATE INDEX `btgContaRecebedoraCondominios_conta_idx` ON `btgContaRecebedoraCondominios` (`btgContaRecebedoraId`);--> statement-breakpoint
CREATE INDEX `btgContasRecebedoras_integracao_ativo_idx` ON `btgContasRecebedoras` (`btgIntegracaoId`,`ativo`);