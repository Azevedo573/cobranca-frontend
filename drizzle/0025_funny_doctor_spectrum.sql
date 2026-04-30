ALTER TABLE `parcelasAcordo` ADD `nossoNumero` varchar(30);--> statement-breakpoint
ALTER TABLE `parcelasAcordo` ADD `statusRemessa` enum('nao_enviado','remessa_gerada','enviado','retorno_recebido') DEFAULT 'nao_enviado';--> statement-breakpoint
ALTER TABLE `parcelasAcordo` ADD `remessaId` int;