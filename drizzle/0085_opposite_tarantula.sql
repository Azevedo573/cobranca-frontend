CREATE TABLE `retornoExcecaoRevisoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`retornoItemId` int NOT NULL,
	`acaoRevisaoRetorno` enum('em_revisao','ignorada','demanda_criada') NOT NULL,
	`justificativa` text NOT NULL,
	`demandaId` int,
	`decididoPorId` int NOT NULL,
	`decididoPorNome` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `retornoExcecaoRevisoes_id` PRIMARY KEY(`id`)
);
