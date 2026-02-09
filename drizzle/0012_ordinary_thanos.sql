CREATE TABLE `acordoCobrancas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`acordoId` int NOT NULL,
	`cobrancaId` int NOT NULL,
	`valorOriginal` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `acordoCobrancas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `acordos` DROP COLUMN `cobrancaId`;