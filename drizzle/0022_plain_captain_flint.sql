CREATE TABLE `boletosUpload` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cobrancaId` int NOT NULL,
	`condominioId` int NOT NULL,
	`nomeArquivo` varchar(255) NOT NULL,
	`urlS3` text NOT NULL,
	`fileKey` varchar(500) NOT NULL,
	`tamanhoBytes` int DEFAULT 0,
	`mimeType` varchar(100) DEFAULT 'application/pdf',
	`uploadedBy` int NOT NULL,
	`uploadedByName` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `boletosUpload_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `cobrancas` ADD `statusRemessa` enum('nao_enviado','enviado','retorno_recebido') DEFAULT 'nao_enviado';--> statement-breakpoint
ALTER TABLE `cobrancas` ADD `remessaId` int;