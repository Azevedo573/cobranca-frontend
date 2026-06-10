CREATE TABLE `btgConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`condominioId` int NOT NULL,
	`clientId` varchar(255) NOT NULL,
	`clientSecret` text NOT NULL,
	`companyId` varchar(50) NOT NULL,
	`webhookSecret` varchar(255),
	`accessToken` text,
	`tokenExpiresAt` timestamp,
	`diasVencimentoPadrao` int NOT NULL DEFAULT 30,
	`diasLimitePagamento` int NOT NULL DEFAULT 60,
	`instrucoes` text,
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `btgConfig_id` PRIMARY KEY(`id`),
	CONSTRAINT `btgConfig_condominioId_unique` UNIQUE(`condominioId`)
);
--> statement-breakpoint
ALTER TABLE `cobrancas` ADD `btgCollectionId` varchar(100);--> statement-breakpoint
ALTER TABLE `cobrancas` ADD `btgBankSlipUrl` text;--> statement-breakpoint
ALTER TABLE `cobrancas` ADD `btgPixQrCode` text;--> statement-breakpoint
ALTER TABLE `cobrancas` ADD `btgPixCopiaECola` text;--> statement-breakpoint
ALTER TABLE `cobrancas` ADD `btgStatus` varchar(30);--> statement-breakpoint
ALTER TABLE `cobrancas` ADD `btgEmitidoEm` timestamp;--> statement-breakpoint
ALTER TABLE `devedores` ADD `address` varchar(255);--> statement-breakpoint
ALTER TABLE `devedores` ADD `addressNumber` varchar(20);--> statement-breakpoint
ALTER TABLE `devedores` ADD `addressComplement` varchar(100);--> statement-breakpoint
ALTER TABLE `devedores` ADD `neighborhood` varchar(100);--> statement-breakpoint
ALTER TABLE `devedores` ADD `city` varchar(100);--> statement-breakpoint
ALTER TABLE `devedores` ADD `state` varchar(2);--> statement-breakpoint
ALTER TABLE `devedores` ADD `zipCode` varchar(10);--> statement-breakpoint
ALTER TABLE `parcelasAcordo` ADD `btgCollectionId` varchar(100);--> statement-breakpoint
ALTER TABLE `parcelasAcordo` ADD `btgBankSlipUrl` text;--> statement-breakpoint
ALTER TABLE `parcelasAcordo` ADD `btgPixQrCode` text;--> statement-breakpoint
ALTER TABLE `parcelasAcordo` ADD `btgPixCopiaECola` text;--> statement-breakpoint
ALTER TABLE `parcelasAcordo` ADD `btgStatus` varchar(30);--> statement-breakpoint
ALTER TABLE `parcelasAcordo` ADD `btgEmitidoEm` timestamp;