CREATE TABLE `monitoramentosPublicacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`advogadoNome` varchar(255) NOT NULL,
	`oab` varchar(30),
	`uf` varchar(2),
	`palavrasChave` text,
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `monitoramentosPublicacoes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `publicacoes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`monitoramentoId` int,
	`tribunal` varchar(100),
	`comarca` varchar(100),
	`vara` varchar(150),
	`dataPublicacao` timestamp,
	`tipoPublicacao` enum('intimacao','sentenca','despacho','audiencia','decisao','outro') NOT NULL DEFAULT 'outro',
	`textoCompleto` text NOT NULL,
	`numeroCNJ` varchar(30),
	`encontradoPor` varchar(50),
	`statusPublicacao` enum('nova','analisando','aguardando_providencia','providenciada','arquivada') NOT NULL DEFAULT 'nova',
	`lida` int NOT NULL DEFAULT 0,
	`observacoes` text,
	`responsavelNome` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `publicacoes_id` PRIMARY KEY(`id`)
);
