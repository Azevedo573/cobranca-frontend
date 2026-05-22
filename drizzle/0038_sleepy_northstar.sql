CREATE TABLE `juridico_mensagens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ticketId` int NOT NULL,
	`autorId` int NOT NULL,
	`conteudo` text NOT NULL,
	`tipoAutor` enum('cliente','escritorio') NOT NULL,
	`anexos` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `juridico_mensagens_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `juridico_tickets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`condominioId` int NOT NULL,
	`titulo` varchar(255) NOT NULL,
	`descricao` text NOT NULL,
	`categoria` enum('consultoria','notificacao','acao_judicial','cobranca_judicial','assembleia','contrato','outro') NOT NULL DEFAULT 'outro',
	`prioridade` enum('baixa','media','alta','urgente') NOT NULL DEFAULT 'media',
	`status` enum('aberto','em_andamento','aguardando_cliente','resolvido','cancelado') NOT NULL DEFAULT 'aberto',
	`responsavelId` int,
	`criadoPorId` int NOT NULL,
	`resolvidoEm` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `juridico_tickets_id` PRIMARY KEY(`id`)
);
