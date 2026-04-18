ALTER TABLE `cobrancas` MODIFY COLUMN `status` enum('pendente','em_cobranca','pago','acordo','em_acordo','acordo_atrasado','em_negociacao','suspenso','judicial','cancelado') NOT NULL DEFAULT 'pendente';--> statement-breakpoint
ALTER TABLE `cobrancas` ADD `paidAt` timestamp;--> statement-breakpoint
ALTER TABLE `cobrancas` ADD `paidAmount` int;--> statement-breakpoint
ALTER TABLE `cobrancas` ADD `nossoNumero` varchar(30);