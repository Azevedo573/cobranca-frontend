ALTER TABLE `condominios` MODIFY COLUMN `address` varchar(255);--> statement-breakpoint
ALTER TABLE `condominios` ADD `addressNumber` varchar(20);--> statement-breakpoint
ALTER TABLE `condominios` ADD `addressComplement` varchar(100);--> statement-breakpoint
ALTER TABLE `condominios` ADD `neighborhood` varchar(100);