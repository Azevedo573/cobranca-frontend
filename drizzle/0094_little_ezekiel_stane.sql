CREATE TABLE `userCondominios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`condominioId` int NOT NULL,
	`isActive` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `userCondominios_id` PRIMARY KEY(`id`),
	CONSTRAINT `userCondominios_user_condominio_unique` UNIQUE(`userId`,`condominioId`)
);
--> statement-breakpoint
CREATE INDEX `userCondominios_user_active_idx` ON `userCondominios` (`userId`,`isActive`);--> statement-breakpoint
CREATE INDEX `userCondominios_condominio_active_idx` ON `userCondominios` (`condominioId`,`isActive`);--> statement-breakpoint
INSERT INTO `userCondominios` (`userId`, `condominioId`, `isActive`)
SELECT `id`, `condominioId`, 1
FROM `users`
WHERE `condominioId` IS NOT NULL
ON DUPLICATE KEY UPDATE `isActive` = 1;
