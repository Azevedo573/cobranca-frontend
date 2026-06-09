CREATE TABLE `botFluxos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(100) NOT NULL,
	`descricao` text,
	`ativo` boolean NOT NULL DEFAULT true,
	`instanciaId` int,
	`gatilho` varchar(20) NOT NULL DEFAULT 'primeira_mensagem',
	`palavraChave` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `botFluxos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `botNos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fluxoId` int NOT NULL,
	`tipo` varchar(30) NOT NULL,
	`titulo` varchar(100) NOT NULL,
	`conteudo` json NOT NULL,
	`ordem` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `botNos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `botSessoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversaId` int NOT NULL,
	`fluxoId` int NOT NULL,
	`noAtualId` int,
	`status` varchar(20) NOT NULL DEFAULT 'ativa',
	`dados` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `botSessoes_id` PRIMARY KEY(`id`)
);
