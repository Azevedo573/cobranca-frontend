CREATE TABLE `loginRateLimits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`keyHash` varchar(64) NOT NULL,
	`attempts` int NOT NULL DEFAULT 0,
	`windowStartedAt` timestamp NOT NULL DEFAULT (now()),
	`blockedUntil` timestamp,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `loginRateLimits_id` PRIMARY KEY(`id`),
	CONSTRAINT `loginRateLimits_keyHash_unique` UNIQUE(`keyHash`)
);
