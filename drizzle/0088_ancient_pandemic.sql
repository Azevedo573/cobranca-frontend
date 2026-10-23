CREATE TABLE `btgOauthEstados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`stateHash` varchar(64) NOT NULL,
	`adminUserId` int NOT NULL,
	`ambiente` enum('sandbox','producao') NOT NULL,
	`redirectUri` varchar(500) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`errorCode` varchar(80),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `btgOauthEstados_id` PRIMARY KEY(`id`),
	CONSTRAINT `btgOauthEstados_stateHash_unique` UNIQUE(`stateHash`)
);
--> statement-breakpoint
CREATE TABLE `btgOauthTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ambiente` enum('sandbox','producao') NOT NULL,
	`accessTokenCifrado` text NOT NULL,
	`refreshTokenCifrado` text NOT NULL,
	`tokenExpiresAt` timestamp NOT NULL,
	`scopes` varchar(1000),
	`companyId` varchar(50) NOT NULL,
	`status` enum('conectado','requer_reconexao') NOT NULL DEFAULT 'conectado',
	`lastErrorCode` varchar(80),
	`connectedAt` timestamp NOT NULL DEFAULT (now()),
	`refreshedAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `btgOauthTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `btgOauthTokens_ambiente_unique` UNIQUE(`ambiente`)
);
--> statement-breakpoint
CREATE INDEX `btgOauthEstados_expiresAt_idx` ON `btgOauthEstados` (`expiresAt`);