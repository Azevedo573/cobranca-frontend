CREATE TABLE `custasJudiciais` (
	`id` int AUTO_INCREMENT NOT NULL,
	`devedorId` int NOT NULL,
	`condominioId` int NOT NULL,
	`descricao` varchar(255) NOT NULL,
	`valor` int NOT NULL,
	`data` timestamp NOT NULL,
	`tipoCusta` enum('distribuicao','citacao','pericia','honorarios_periciais','diligencia','outros') NOT NULL DEFAULT 'outros',
	`observacoes` text,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `custasJudiciais_id` PRIMARY KEY(`id`)
);
