CREATE TABLE `acordos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`devedorId` int NOT NULL,
	`condominioId` int NOT NULL,
	`totalAmount` int NOT NULL,
	`agreedAmount` int NOT NULL,
	`installments` int NOT NULL,
	`firstPaymentDate` timestamp NOT NULL,
	`paymentFrequency` enum('mensal','semanal','quinzenal') NOT NULL DEFAULT 'mensal',
	`status` enum('ativo','pago','cancelado') NOT NULL DEFAULT 'ativo',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `acordos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `cobrancas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`devedorId` int NOT NULL,
	`condominioId` int NOT NULL,
	`description` text,
	`amount` int NOT NULL,
	`dueDate` timestamp,
	`monthReference` varchar(20),
	`status` enum('pendente','em_cobranca','pago','acordo') NOT NULL DEFAULT 'pendente',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `cobrancas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `condominios` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`cnpj` varchar(18),
	`address` text,
	`city` varchar(100),
	`state` varchar(2),
	`zipCode` varchar(10),
	`phone` varchar(20),
	`email` varchar(320),
	`managerName` varchar(255),
	`managerEmail` varchar(320),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `condominios_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `devedores` (
	`id` int AUTO_INCREMENT NOT NULL,
	`condominioId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`unitNumber` varchar(50) NOT NULL,
	`email` varchar(320),
	`phone` varchar(20),
	`totalDue` int NOT NULL DEFAULT 0,
	`status` enum('ativo','pago','acordo') NOT NULL DEFAULT 'ativo',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `devedores_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `parcelasAcordo` (
	`id` int AUTO_INCREMENT NOT NULL,
	`acordoId` int NOT NULL,
	`installmentNumber` int NOT NULL,
	`amount` int NOT NULL,
	`dueDate` timestamp NOT NULL,
	`paymentDate` timestamp,
	`status` enum('pendente','pago','atrasado') NOT NULL DEFAULT 'pendente',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `parcelasAcordo_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tentativasCobranca` (
	`id` int AUTO_INCREMENT NOT NULL,
	`cobrancaId` int NOT NULL,
	`devedorId` int NOT NULL,
	`condominioId` int NOT NULL,
	`userId` int NOT NULL,
	`contactType` enum('telefone','email','pessoal','whatsapp') NOT NULL,
	`notes` text,
	`result` enum('sem_resposta','promessa_pagamento','recusa','outro'),
	`attemptDate` timestamp NOT NULL DEFAULT (now()),
	`nextAttemptDate` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tentativasCobranca_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('admin','sindico','cobrador') NOT NULL DEFAULT 'cobrador';--> statement-breakpoint
ALTER TABLE `users` ADD `condominioId` int;--> statement-breakpoint
ALTER TABLE `users` ADD `isActive` int DEFAULT 1 NOT NULL;