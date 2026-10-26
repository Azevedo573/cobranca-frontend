ALTER TABLE `btgRemessas` ADD `correlationId` varchar(64);--> statement-breakpoint
ALTER TABLE `btgRemessas` ADD CONSTRAINT `btgRemessas_correlationId_unique` UNIQUE(`correlationId`);