CREATE TABLE `btgWebhookEntregas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`btgIntegracaoId` int NOT NULL,
	`providerEventId` varchar(150),
	`payloadHash` varchar(64) NOT NULL,
	`evento` varchar(100) NOT NULL,
	`btgCollectionId` varchar(150),
	`assinaturaValida` int NOT NULL DEFAULT 0,
	`statusProcessamento` enum('recebido','processado','ignorado','falha') NOT NULL DEFAULT 'recebido',
	`erroCodigo` varchar(100),
	`recebidoEm` timestamp NOT NULL DEFAULT (now()),
	`processadoEm` timestamp,
	CONSTRAINT `btgWebhookEntregas_id` PRIMARY KEY(`id`),
	CONSTRAINT `btgWebhookEntregas_integracao_payloadHash_unique` UNIQUE(`btgIntegracaoId`,`payloadHash`)
);
--> statement-breakpoint
CREATE INDEX `btgWebhookEntregas_integracao_collection_idx` ON `btgWebhookEntregas` (`btgIntegracaoId`,`btgCollectionId`);--> statement-breakpoint
CREATE INDEX `btgWebhookEntregas_recebidoEm_idx` ON `btgWebhookEntregas` (`recebidoEm`);