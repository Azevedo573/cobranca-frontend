CREATE TABLE `whatsappConversas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`instanciaId` int NOT NULL,
	`telefone` varchar(30) NOT NULL,
	`nomeContato` varchar(255),
	`devedorId` int,
	`ultimaMensagem` text,
	`ultimaMensagemEm` timestamp,
	`naoLidas` int NOT NULL DEFAULT 0,
	`status` enum('aberta','fechada','aguardando') NOT NULL DEFAULT 'aberta',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappConversas_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsappInstancias` (
	`id` int AUTO_INCREMENT NOT NULL,
	`nome` varchar(100) NOT NULL,
	`setor` enum('cobranca','juridico','geral') NOT NULL DEFAULT 'geral',
	`instanceId` varchar(255) NOT NULL,
	`token` varchar(500) NOT NULL,
	`clientToken` varchar(500) NOT NULL,
	`webhookUrl` varchar(500),
	`ativo` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappInstancias_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsappMensagens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversaId` int NOT NULL,
	`instanciaId` int NOT NULL,
	`direction` enum('in','out') NOT NULL,
	`tipo` enum('text','image','document','audio','video','sticker') NOT NULL DEFAULT 'text',
	`conteudo` text,
	`mediaUrl` varchar(1000),
	`nomeArquivo` varchar(255),
	`status` enum('enviada','entregue','lida','erro') NOT NULL DEFAULT 'enviada',
	`zApiMessageId` varchar(255),
	`enviadoPorId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsappMensagens_id` PRIMARY KEY(`id`)
);
