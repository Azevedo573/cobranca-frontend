CREATE TABLE `emailConfig` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` varchar(255) NOT NULL,
	`clientId` varchar(255) NOT NULL,
	`clientSecret` text NOT NULL,
	`emailRemetente` varchar(255) NOT NULL,
	`nomeRemetente` varchar(255) NOT NULL DEFAULT 'Sistema de Cobranças',
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `emailConfig_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `emailsEnviados` (
	`id` int AUTO_INCREMENT NOT NULL,
	`devedorId` int NOT NULL,
	`condominioId` int,
	`enviadoPorId` int,
	`destinatario` varchar(255) NOT NULL,
	`assunto` varchar(500) NOT NULL,
	`corpo` text NOT NULL,
	`modeloId` int,
	`status` enum('enviado','erro','pendente') NOT NULL DEFAULT 'pendente',
	`erro` text,
	`enviadoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `emailsEnviados_id` PRIMARY KEY(`id`)
);
