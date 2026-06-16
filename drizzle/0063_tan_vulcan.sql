ALTER TABLE `movimentacoesProcesso` ADD `complementosJson` text;--> statement-breakpoint
ALTER TABLE `movimentacoesProcesso` ADD `nomeOrgao` varchar(255);--> statement-breakpoint
ALTER TABLE `movimentacoesProcesso` ADD `tipoComunicacao` varchar(100);--> statement-breakpoint
ALTER TABLE `movimentacoesProcesso` ADD `meioPublicacao` varchar(100);--> statement-breakpoint
ALTER TABLE `partesProcesso` ADD `advogadosJson` text;