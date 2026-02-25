CREATE TABLE `indicesBCB` (
	`id` int AUTO_INCREMENT NOT NULL,
	`indice` enum('IPCA','IGP-M','INPC','IGP-DI') NOT NULL,
	`mesReferencia` varchar(10) NOT NULL,
	`valor` decimal(10,4) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `indicesBCB_id` PRIMARY KEY(`id`)
);
