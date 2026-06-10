ALTER TABLE `acordos` MODIFY COLUMN `status` enum('ativo','pago','cancelado','inadimplente') NOT NULL DEFAULT 'ativo';--> statement-breakpoint
ALTER TABLE `parcelasAcordo` MODIFY COLUMN `status` enum('pendente','pago','atrasado','cancelado') NOT NULL DEFAULT 'pendente';--> statement-breakpoint
ALTER TABLE `acordos` ADD `motivoQuebra` text;--> statement-breakpoint
ALTER TABLE `acordos` ADD `dataQuebra` timestamp;--> statement-breakpoint
ALTER TABLE `acordos` ADD `valorPagoAcordo` int DEFAULT 0;