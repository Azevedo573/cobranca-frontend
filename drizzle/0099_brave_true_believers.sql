ALTER TABLE `btgContasRecebedoras` MODIFY COLUMN `origemCadastro` enum('api','manual_sandbox','manual_producao') NOT NULL DEFAULT 'api';--> statement-breakpoint
ALTER TABLE `btgContasRecebedoras` ADD `confirmadoPorId` int;--> statement-breakpoint
ALTER TABLE `btgContasRecebedoras` ADD `confirmadoEm` timestamp;